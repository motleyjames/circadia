"""
Where dissents come from, and what gets probed for them.

Covers the council's dissent extraction (the arbiter's DISSENTS: section, which
used to be discarded outright) and the LLM probe synthesizer's handling of the
answers a model can give - including the two kinds of "no probe" that must not
be confused with each other.
"""

import json

import pytest

from council.meeseeks_council import _extract_dissents
from core.meeseeks_data_classes import ProbeType


class TestDissentExtraction:
    def test_bulleted_dissents_are_pulled_out(self):
        synthesis = ("The council agrees the retry logic is sound.\n\n"
                     "DISSENTS:\n"
                     "- TRANSIENT_EXCEPTIONS omits bare OSError, so a generic socket error "
                     "fails fast instead of retrying\n"
                     "- The 30/60 second backoff runs unmocked in the tests\n")
        got = _extract_dissents(synthesis)
        assert len(got) == 2
        assert got[0].startswith("TRANSIENT_EXCEPTIONS")

    def test_none_yields_nothing(self):
        assert _extract_dissents("All fine.\n\n**DISSENTS:**\n* none\n") == []

    def test_numbered_lists_work_and_stubs_are_dropped(self):
        s = ("text\n\nDissents:\n"
             "1. The webhook path has no validation at all and accepts anything\n"
             "2. hi\n")
        assert len(_extract_dissents(s)) == 1

    def test_extraction_stops_at_the_first_blank_line(self):
        s = ("a\n\nDISSENTS:\n- One real concern about the unguarded delete path\n\n"
             "Appendix: unrelated prose\n")
        assert len(_extract_dissents(s)) == 1

    @pytest.mark.parametrize("bad", ["", None, "no section at all", "DISSENTS:"])
    def test_missing_or_empty_sections_are_safe(self, bad):
        assert _extract_dissents(bad) == []


class TestProbeSynthesis:
    def _synth(self, repo):
        from probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
        return LLMProbeSynthesizer(repo_root=str(repo),
                                   task="Verify the claims against src/delivery.py.")

    def test_a_valid_spec_becomes_a_probe(self, repo, stub_synth_model):
        stub_synth_model["reply"] = json.dumps({
            "probe_type": "check_exists", "target": "send email",
            "parameters": {"identifier": "send_email", "in_file": "src/delivery.py"},
            "a_hit_means": "concern_is_unfounded", "would_settle": "whether it exists"})
        p = self._synth(repo).synthesize("does send_email exist at all in this module")
        assert p is not None
        assert p.probe_type is ProbeType.CHECK_EXISTS
        assert p.parameters["_polarity"] == "unfounded"

    def test_a_declined_concern_is_recorded_as_a_judgement_call(self, repo, stub_synth_model):
        stub_synth_model["reply"] = json.dumps(
            {"probe_type": None, "rationale": "this is a design opinion"})
        s = self._synth(repo)
        assert s.synthesize("whether this design is tasteful is a matter of opinion") is None
        assert s.skipped[-1]["kind"] == "judgement"

    def test_the_string_null_means_the_same_thing(self, repo, stub_synth_model):
        """Models asked for JSON emit "null" as often as a real null."""
        stub_synth_model["reply"] = json.dumps(
            {"probe_type": "null", "rationale": "opinion, not a fact in the source"})
        s = self._synth(repo)
        assert s.synthesize("another judgement call about the architecture here") is None
        assert s.skipped[-1]["kind"] == "judgement"

    def test_an_unimplemented_probe_type_is_a_harness_gap_not_a_judgement_call(
            self, repo, stub_synth_model):
        stub_synth_model["reply"] = json.dumps(
            {"probe_type": "read_the_policy_document", "rationale": "needs a doc"})
        s = self._synth(repo)
        assert s.synthesize("does this comply with the retention policy we published") is None
        assert s.skipped[-1]["kind"] == "harness_gap", \
            "blaming the question for a hole in the tool hides the hole"

    def test_probe_names_do_not_collide_across_dissents(self, repo, stub_synth_model):
        stub_synth_model["reply"] = json.dumps({
            "probe_type": "check_exists", "target": "send email",
            "parameters": {"identifier": "send_email"}, "a_hit_means": "concern_is_unfounded"})
        s = self._synth(repo)
        a = s.synthesize("first concern about send_email and how it behaves")
        b = s.synthesize("a different concern about send_email entirely, unrelated")
        assert a.name != b.name, "probe name is the id everything downstream keys on"

    def test_unparseable_output_yields_no_probe(self, repo, stub_synth_model):
        stub_synth_model["reply"] = "I think you should look at the retry logic."
        assert self._synth(repo).synthesize("some concern about the retry logic") is None

    def test_the_prompt_names_the_file_under_review(self, repo):
        s = self._synth(repo)
        assert "src/delivery.py" in s._under_review()

    def test_no_file_in_the_task_says_so_plainly(self, repo):
        from probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
        s = LLMProbeSynthesizer(repo_root=str(repo), task="make the agent better")
        assert "does not name a file" in s._under_review()


class TestRepoFacts:
    """The inventory the council is shown must look like the tree, or say it failed."""

    def test_a_typescript_tree_is_not_one_python_script(self, tmp_path):
        (tmp_path / "src").mkdir()
        (tmp_path / "scripts").mkdir()
        (tmp_path / "src" / "app.ts").write_text("export const x = 1\n")
        (tmp_path / "tsconfig.json").write_text("{}\n")
        (tmp_path / "scripts" / "render-voice.py").write_text("def main():\n    pass\n")
        from probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
        facts = LLMProbeSynthesizer(repo_root=str(tmp_path))._repo_facts()
        assert "app.ts" in facts
        assert "tsconfig.json" in facts
        assert "Modules (1):" not in facts
        assert "scripts/render-voice.py" in facts

    def test_starvation_guard_fires_on_a_ts_tree_filtered_to_python(self, tmp_path, monkeypatch):
        """Circadia: hundreds of .ts files, suffixes still {'.py'} → refuse the 1-module view.

        Suffixes now include .ts, so this pins the FILTER, not today's list: a
        Python-only suffix set against a TypeScript tree must not silently
        look like a one-file repo.
        """
        import probes.meeseeks_code_probe_executor as exe
        monkeypatch.setattr(exe, "SOURCE_SUFFIXES", {".py"})
        src = tmp_path / "src"
        src.mkdir()
        for i in range(30):
            (src / f"mod_{i}.ts").write_text(f"export const n{i} = {i}\n")
        from probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
        facts = LLMProbeSynthesizer(repo_root=str(tmp_path))._repo_facts()
        assert "INVENTORY STARVED" in facts
        assert ".py" in facts
        assert "suffixes_applied" in facts
        assert "files_on_disk=30" in facts
        assert "matched_modules=0" in facts

    def test_starvation_guard_does_not_fire_on_a_two_file_repo(self, tmp_path):
        src = tmp_path / "src"
        src.mkdir()
        (src / "a.py").write_text("def a():\n    return 1\n")
        (src / "b.py").write_text("def b():\n    return 2\n")
        from probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
        facts = LLMProbeSynthesizer(repo_root=str(tmp_path))._repo_facts()
        assert "INVENTORY STARVED" not in facts
        assert "a.py" in facts
        assert "b.py" in facts
