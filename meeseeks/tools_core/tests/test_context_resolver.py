"""
CodeContextResolver: turning a probe result into a verdict on a dissent.

Three rules, each of which was once wrong and produced a false finding against
working code:
  1. A probe answers the dissent it was BUILT FOR (provenance beats keywords).
  2. Direction comes from the probe's stated polarity, never from a guess.
  3. A miss may SETTLE a concern but may never CONFIRM one.
"""

import pytest

from core.meeseeks_data_classes import ProbeResult, ProbeType, ResolutionStatus
from reasoning.meeseeks_code_context_resolver import CodeContextResolver

DISSENT = ("The retry loop may use a fixed delay rather than backing off, which would "
           "violate the with-backoff claim in the docstring.")


def result(probe_type=ProbeType.CHECK_EXISTS, verified=True, impact=0.10,
           res=None, probe_id="p1", target="retry backoff"):
    return ProbeResult(probe_type=probe_type, probe_id=probe_id, target=target,
                       result=res if res is not None else {"kind": "symbol"},
                       verified=verified, confidence_impact=impact,
                       evidence="RETRY_BACKOFF = (30, 60) at src/delivery.py:11")


def resolve(pr, polarity=None, dissent=DISSENT):
    r = CodeContextResolver()
    r.add_probe(pr, origin_dissent=dissent, polarity=polarity)
    return r, r.resolve("d1", dissent)


CONCLUSIVE_MISS = {"found": False, "conclusive": True, "searched_file": "src/delivery.py"}
OPEN_MISS = {"found": False, "conclusive": False}


class TestPolarity:
    def test_found_the_safeguard_settles_the_concern(self):
        _, a = resolve(result(), polarity="unfounded")
        assert a.status is ResolutionStatus.RESOLVED
        assert a.confidence_impact > 0

    def test_found_the_danger_confirms_the_concern(self):
        _, a = resolve(result(), polarity="real")
        assert a.status is ResolutionStatus.NEEDS_HUMAN
        assert a.confidence_impact < 0

    def test_danger_absent_settles_the_concern(self):
        _, a = resolve(result(verified=False, impact=-0.10, res=CONCLUSIVE_MISS),
                       polarity="real")
        assert a.status is ResolutionStatus.RESOLVED
        assert a.confidence_impact > 0

    def test_no_polarity_claims_no_verdict(self):
        _, a = resolve(result(verified=False, impact=-0.10, res=CONCLUSIVE_MISS))
        assert a.status is ResolutionStatus.PARTIALLY_RESOLVED
        assert a.confidence_impact == 0.0


class TestAMissMayNotCondemn:
    """You cannot conclude code is broken from a string you did not find."""

    def test_missing_safeguard_does_not_confirm(self):
        _, a = resolve(result(verified=False, impact=-0.10, res=CONCLUSIVE_MISS),
                       polarity="unfounded")
        assert a.status is not ResolutionStatus.NEEDS_HUMAN
        assert a.confidence_impact == 0.0

    def test_unscoped_miss_settles_nothing_either_way(self):
        _, a = resolve(result(verified=False, impact=0.0, res=OPEN_MISS), polarity="real")
        assert a.status is ResolutionStatus.PARTIALLY_RESOLVED
        assert a.confidence_impact == 0.0

    def test_a_failing_suite_may_still_confirm(self):
        pr = result(probe_type=ProbeType.CHECK_INVARIANT, verified=False, impact=-0.15,
                    res={"returncode": 1})
        _, a = resolve(pr, polarity="unfounded")
        assert a.status is ResolutionStatus.NEEDS_HUMAN, "a red suite is real evidence"
        assert a.confidence_impact < 0


class TestCountSemantics:
    def test_a_count_of_zero_is_absence_not_a_hit(self):
        """Expecting 0 and measuring 0 verifies - but what it FOUND is nothing."""
        pr = result(probe_type=ProbeType.COUNT_ITEMS, verified=True, impact=0.12,
                    res={"count": 0, "expected": 0, "conclusive": True})
        _, a = resolve(pr, polarity="real")
        assert a.status is ResolutionStatus.RESOLVED, "zero occurrences settles the concern"


class TestEvidenceStrength:
    @pytest.mark.parametrize("ptype,res,want", [
        (ProbeType.CHECK_VALUE, {"matches": 5}, "weak"),
        (ProbeType.CHECK_EXISTS, {"kind": "file"}, "strong"),
        (ProbeType.CHECK_EXISTS, {"kind": "literal"}, "weak"),
        (ProbeType.CHECK_INVARIANT, {"returncode": 0}, "strong"),
        (ProbeType.COUNT_ITEMS, {"expected": 3}, "strong"),
        (ProbeType.COUNT_ITEMS, {}, "weak"),
        (ProbeType.CHECK_VALUE, {"conclusive": True}, "strong"),
        (ProbeType.READ_CODE, {"kind": "code_reading"}, "strong"),
    ])
    def test_grading(self, ptype, res, want):
        r = CodeContextResolver()
        assert r.evidence_strength(result(probe_type=ptype, res=res)) == want

    def test_a_hypothesis_verdict_is_never_strong(self):
        """Nothing executed to produce it, however it is typed."""
        r = CodeContextResolver()
        pr = result(probe_type=ProbeType.CHECK_INVARIANT, probe_id="hypothesis_H1", res={})
        assert r.evidence_strength(pr) == "weak"


class TestProvenanceAndState:
    def test_the_probe_answers_the_dissent_it_was_built_for(self):
        r = CodeContextResolver()
        pr = result(target="encryption", res=CONCLUSIVE_MISS, verified=False, impact=-0.10)
        r.add_probe(pr, origin_dissent=DISSENT, polarity="real")
        assert r.can_resolve(DISSENT), "keyword overlap is not required for its own dissent"

    def test_it_does_not_answer_an_unrelated_one(self):
        r = CodeContextResolver()
        r.add_probe(result(target="encryption"), origin_dissent=DISSENT, polarity="real")
        assert not r.can_resolve("Is the dashboard fast enough on a cold start?")

    def test_word_boundaries_not_substrings(self):
        r = CodeContextResolver()
        r.add_probe(result(target="delete", res={"kind": "symbol"}))
        assert not r.can_resolve("rows are soft-deleted, never removed from the table")

    def test_one_probe_answers_at_most_one_dissent(self):
        r = CodeContextResolver()
        r.add_probe(result(), origin_dissent=DISSENT, polarity="unfounded")
        r.resolve("d1", DISSENT)
        assert not r.can_resolve(DISSENT), "a spent probe may not be reused"

    def test_reset_clears_per_loop_state(self):
        r = CodeContextResolver()
        r.add_probe(result(), origin_dissent=DISSENT, polarity="unfounded")
        r.resolve("d1", DISSENT)
        r.reset()
        assert (len(r._probes), len(r._spent), len(r._origin), len(r._polarity)) == (0, 0, 0, 0)

    def test_refutations_are_kept_for_the_session(self):
        r = CodeContextResolver()
        r.add_probe(result(), origin_dissent=DISSENT, polarity="real")
        r.resolve("d1", DISSENT)
        assert len(r.refutations) == 1
        r.reset()
        assert len(r.refutations) == 1, "the ledger spans the session, not one loop"
