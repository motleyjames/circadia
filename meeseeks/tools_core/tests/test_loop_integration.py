"""
The loop and the spin, end to end, with every model call stubbed.

These are the tests that would have caught the two worst regressions this
harness has had: a crash in the bridge-answer path that aborted whole runs, and
a confidence number that climbed on nothing but a model's say-so.
"""

import json

import pytest

from core.meeseeks_data_classes import ProbeType, SynthesizedProbe


class _Opinion:
    def __init__(self, model, considerations):
        self.model, self.considerations = model, considerations
        self.position, self.reasoning, self.confidence = "p", "r", 0.8


class _Decision:
    def __init__(self, dissents):
        self.opinions = [_Opinion("stub-model", [])]
        self.dissenting_points = list(dissents)
        self.final_decision = self.synthesis = "synthesis"
        self.agreement_level = 0.8


CONCERNS = [
    "The retry loop may not bound its attempts, so a persistent failure could spin forever",
    "Credentials may reach the returned error text through the raw exception object",
]

HYPOTHESES = json.dumps({
    "hypotheses": [{"id": "H1", "hypothesis": "a hypothesis long enough to validate",
                    "test_method": "a test method long enough", "expected_outcome": "an outcome",
                    "priority": "high"}],
    "result": "INCONCLUSIVE", "evidence": "nothing executed", "confidence_impact": 0.0})


@pytest.fixture
def stub_loop(monkeypatch):
    """Council and reasoning stubbed; probes still execute for real."""
    import reasoning.loop_runner as lr
    seen = {"prompts": []}

    def fake_reason(prompt, system=None):
        seen["prompts"].append(prompt)
        return HYPOTHESES

    monkeypatch.setattr(lr, "council_vote", lambda **kw: _Decision(CONCERNS))
    monkeypatch.setattr(lr, "_call_reasoning", fake_reason)
    return seen


class _Synth:
    """Emits a real, runnable probe for each concern - no model involved."""
    skipped = []

    def __init__(self, polarity="real", in_file="src/delivery.py"):
        self.polarity, self.in_file = polarity, in_file

    def synthesize(self, dissent, generated_by="llm"):
        needle = "RETRY_ATTEMPTS" if "bound its attempts" in dissent else "shutil.rmtree"
        return SynthesizedProbe(
            name=f"check_value__{abs(hash(dissent)) % 9999}",
            probe_type=ProbeType.CHECK_VALUE, description="", code="",
            parameters={"expected": needle, "in_file": self.in_file,
                        "_polarity": self.polarity},
            generated_by="stub", from_dissent=dissent)

    def invalidate_facts(self):
        pass


def _runner(repo, tmp_path, **kw):
    from reasoning.loop_runner import MeeseeksLoopRunner
    r = MeeseeksLoopRunner(prime_directive="Verify the claims against src/delivery.py.",
                           output_dir=tmp_path / "sessions", repo_root=repo,
                           max_probes_per_loop=5, **kw)
    r.MAX_LOOPS = 1
    return r


class TestEvidenceGate:
    def test_a_run_with_no_evidence_cannot_reach_the_execute_band(
            self, repo, tmp_path, stub_loop):
        """Hypothesis verdicts are opinion. Three of them must not mean 'ship it'."""
        r = _runner(repo, tmp_path, verify=False)
        r.MAX_LOOPS = 3
        r.run()
        assert r._verified_probes == 0
        assert r.confidence < r.monitor_threshold, "opinion alone may not clear the gate"

    def test_conclusive_evidence_lifts_the_ceiling(self, repo, tmp_path, stub_loop):
        r = _runner(repo, tmp_path, verify=True)
        r.probe_factory.set_synthesizer(_Synth(polarity="real"))
        r.run()
        assert r._verified_probes >= 1
        assert r.confidence > 0.5, "proving the danger absent should raise confidence"


class TestBridgeAnswersAreGraded:
    def test_a_pre_seeded_bridge_answer_does_not_crash_the_loop(
            self, repo, tmp_path, stub_loop):
        """Regression: the bridge stores a payload, not a ProbeResult."""
        from core.meeseeks_data_classes import ProbeResult
        r = _runner(repo, tmp_path, verify=False)
        r.semantic_bridge.register_probe("seed", ProbeResult(
            probe_type=ProbeType.CHECK_VALUE, probe_id="seed", target="retry attempts bound",
            result={"matches": 3}, verified=True, confidence_impact=0.08,
            evidence="found 3 occurrences"))
        result = r.run()
        assert result.status.value != "failed"


class TestFindingsReport:
    def test_the_report_is_written_and_names_every_concern(self, repo, tmp_path, stub_loop):
        r = _runner(repo, tmp_path, verify=True)
        r.probe_factory.set_synthesizer(_Synth(polarity="real"))
        r.run()
        report = tmp_path / "sessions" / r.session_id / "findings.md"
        assert report.exists(), "the report is the deliverable"
        text = report.read_text()
        assert "settled by evidence" in text
        for concern in CONCERNS:
            assert concern[:40] in text

    def test_the_report_is_listed_as_an_artifact(self, repo, tmp_path, stub_loop):
        r = _runner(repo, tmp_path, verify=True)
        r.probe_factory.set_synthesizer(_Synth(polarity="real"))
        r.run()
        arts = r.session_manager.get_session_artifacts(r.session_id)
        assert any(a.endswith("findings.md") for a in arts)


class TestSpinConvergence:
    def test_confidence_carries_between_loops(self, repo, tmp_path, stub_loop, monkeypatch):
        """Spin built a fresh runner each loop, so confidence reset to 0.5 forever."""
        import reasoning.spinning_meeseeks as sm

        original = sm.MeeseeksLoopRunner

        class _Runner(original):
            def __init__(self, *a, **k):
                super().__init__(*a, **k)
                if self.probe_factory:
                    self.probe_factory.set_synthesizer(_Synth(polarity="real"))

        monkeypatch.setattr(sm, "MeeseeksLoopRunner", _Runner)
        spin = sm.SpinningMeeseeks(
            prime_directive="Verify the claims against src/delivery.py.",
            output_dir=tmp_path / "spin", max_loops=3, repo_root=str(repo),
            verify=True, max_probes_per_loop=5)
        spin.spin()

        logs = sorted((tmp_path / "spin").rglob("loop_*.json"))
        assert logs, "spin bypasses run(), so it must save its own reasoning logs"
        path = [json.loads(p.read_text())["confidence_trajectory"]["final"] for p in logs]
        assert path[0] > 0.5
        if len(path) > 1:
            assert path[1] > path[0], "later loops must build on earlier ones"
        assert (tmp_path / "spin" / spin.session_id / "findings.md").exists()

    def test_the_arbiter_measures_this_loop_not_the_session(
            self, repo, tmp_path, stub_loop, monkeypatch):
        """Per-loop delta, not cumulative from 0.5.

        The ConfidenceCalculator seeds its trajectory at construction. Spin
        builds a fresh runner each loop, so without reseeding it, loop 3 of a
        run at 0.65 reported "50% -> 65% (+15%)" and every loop scored as
        productive - the arbiter could never decide to pivot.
        """
        import reasoning.spinning_meeseeks as sm

        spin = sm.SpinningMeeseeks(
            prime_directive="Verify the claims.", output_dir=tmp_path / "spin3",
            max_loops=1, repo_root=str(repo), verify=False)
        spin.confidence = 0.65
        spin.current_loop = 3
        log = spin._run_single_loop()
        assert log["confidence_trajectory"]["initial"] == pytest.approx(0.65), \
            "the loop must be measured from where it actually started"

    def test_earlier_loops_reach_the_prompt(self, repo, tmp_path, stub_loop, monkeypatch):
        import reasoning.spinning_meeseeks as sm
        spin = sm.SpinningMeeseeks(
            prime_directive="Verify the claims.", output_dir=tmp_path / "spin2",
            max_loops=2, repo_root=str(repo), verify=False)
        spin.confidence = 0.75
        spin.current_loop = 2
        spin.accumulated_learnings = ["loop 1 established the retry bound"]
        text = spin._context_text()
        assert "75%" in text
        assert "retry bound" in text
