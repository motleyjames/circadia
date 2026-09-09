#!/usr/bin/env python3
"""
CodeContextResolver - lets SRDE actually find the probe evidence.

Filling the ProbeExecutor slot is necessary but not sufficient. SRDE's built-in
_probe_relates_to_dissent() matches on ten hardcoded keyword pairs - insert,
update, delete, row, count, empty, range, valid, format, type - every one of them
Excel vocabulary. A code dissent like "does send_email handle SMTP timeouts"
matches none of them, so the cross-reference silently never fires and SRDE falls
through to the regex resolvers that assert rather than check.

SRDE consults its context_resolver FIRST, before that cross-reference. So this
class does the matching with code-domain vocabulary and cites the real probe.

This fills the slot named in ContextResolver's own docstring:
    "CodeContextResolver (uses CodebaseMentalModel)"

Honesty rules, which are the whole point:

  probe verified            -> RESOLVED, carrying the probe's evidence
  probe refuted the claim   -> NEEDS_HUMAN. A dissent the evidence CONFIRMS is a
                               real problem, not a resolved one. Never RESOLVED.
  probe returned UNVERIFIED -> declines, so SRDE moves on rather than being told
                               something false.

Usage:
    from tools_core.reasoning import create_srde
    from tools_core.probes import CodeProbeExecutor
    from tools_core.reasoning import CodeContextResolver

    results = factory.execute_probes(probes, context={"repo_root": REPO})

    srde = create_srde()
    resolver = CodeContextResolver()
    for r in results:
        resolver.add_probe(r)
        srde.register_probe_result(r.probe_id, r)
    srde.set_context_resolver(resolver)
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

try:
    from ..core.meeseeks_data_classes import (
        ProbeResult, ProbeType, ResolutionAttempt, ResolutionStatus,
    )
    from .meeseeks_srde import ContextResolver
except ImportError:
    from core.meeseeks_data_classes import (
        ProbeResult, ProbeType, ResolutionAttempt, ResolutionStatus,
    )
    from reasoning.meeseeks_srde import ContextResolver


SUITE_WORDS = {
    "test", "tests", "suite", "pass", "passes", "passing", "fail", "failing",
    "regress", "regression", "break", "breaks", "broken", "invariant",
}

IDENT = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b")
QUOTED = re.compile(r"[\"'`]([^\"'`]{2,})[\"'`]")
PATHLIKE = re.compile(r"\b([\w./-]+\.(?:py|ts|tsx|js|cjs|json|sql|md))\b")

STOPWORDS = {
    "the", "and", "that", "this", "with", "will", "does", "have", "has", "are",
    "was", "were", "for", "from", "not", "but", "can", "could", "should", "would",
    "there", "their", "what", "when", "which", "who", "how", "any", "all", "may",
    "before", "after", "into", "than", "then", "them", "some", "such", "only",
}


class CodeContextResolver(ContextResolver):
    """Resolves dissents by citing probe results, matched with code vocabulary."""

    def __init__(self, probes: Optional[List[ProbeResult]] = None):
        self._probes: List[ProbeResult] = list(probes or [])
        # SRDE now returns PARTIALLY_RESOLVED and NEEDS_HUMAN from a context
        # resolver as well as RESOLVED, so refutations do reach the loop. This
        # ledger is kept because it survives the whole session, while the loop
        # only logs each refutation as it happens.
        self.refutations: List[ResolutionAttempt] = []
        # A probe answers at most one dissent. Without this the highest-scoring
        # probe wins every match and one piece of evidence closes several
        # unrelated concerns, double-counting its confidence.
        self._spent: set = set()
        # probe_id -> the dissent text the probe was synthesized FROM.
        # Keyword scoring alone re-derives a link the caller already knows for
        # certain, and re-derives it badly: a probe searching for "encryption"
        # scores zero against the dissent "the database is unencrypted", because
        # "unencrypted" neither equals nor contains "encryption". The probe then
        # matches nothing and the dissent it was built to settle comes back
        # "no_resolver". Provenance is exact; keywords are the fallback.
        self._origin: Dict[str, str] = {}
        # probe_id -> what a HIT means for the dissent: "real" (finding it means
        # the concern is justified) or "unfounded" (finding it means the concern
        # does not apply). Without this the direction has to be guessed, and the
        # old code always guessed that a probe which did not verify meant the
        # concern stood - so a probe looking for a SAFEGUARD, failing to find it
        # in the paths it searched, reported working code as a real problem.
        self._polarity: Dict[str, str] = {}

    def reset(self) -> None:
        """Clear per-loop state.

        _spent, _origin and _probes are keyed by probe id, and probe ids are
        derived from dissent text - so a dissent the council repeats in a later
        loop produces the SAME id. Without a reset, the fresh probe is filtered
        out as already spent and its evidence is never cited. refutations is
        kept: it is a report for the whole session, not one loop.
        """
        self._probes.clear()
        self._spent.clear()
        self._origin.clear()
        self._polarity.clear()

    def evidence_strength(self, probe: ProbeResult) -> str:
        """"strong" or "weak" - how much a verdict from this probe is worth.

        Public because the semantic bridge grades LINK strength (is this probe
        about this dissent?) and never evidence strength (did it establish
        anything?), so the loop needs this to grade what the bridge hands back.
        """
        return self._strength(probe)

    def add_probe(self, result: ProbeResult, origin_dissent: Optional[str] = None,
                  polarity: Optional[str] = None) -> None:
        self._probes.append(result)
        if origin_dissent:
            self._origin[result.probe_id] = origin_dissent.strip()
        if polarity in ("real", "unfounded"):
            self._polarity[result.probe_id] = polarity

    def add_probes(self, results: List[ProbeResult]) -> None:
        self._probes.extend(results)

    # ------------------------------------------------------------ interface

    def can_resolve(self, dissent_content: str) -> bool:
        return self._best_match(dissent_content) is not None

    def resolve(
        self,
        dissent_id: str,
        dissent_content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> ResolutionAttempt:
        probe = self._best_match(dissent_content)

        if probe is None:
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.CANNOT_RESOLVE, method="code_context",
                evidence="No probe result addresses this dissent.",
                confidence_impact=0.0,
            )

        if probe.result and isinstance(probe.result, dict) \
                and probe.result.get("status") == "UNVERIFIED":
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.CANNOT_RESOLVE, method="code_context",
                evidence=f"Probe '{probe.probe_id}' ran but established nothing: {probe.evidence}",
                confidence_impact=0.0, tool_used=probe.probe_id,
            )

        self._spent.add(probe.probe_id)
        polarity = self._polarity.get(probe.probe_id)
        res = probe.result if isinstance(probe.result, dict) else {}
        magnitude = abs(probe.confidence_impact)

        # "hit" must mean THE THING WAS FOUND, not "the probe's assertion held".
        # For count_items those differ: a probe expecting 0 occurrences and
        # measuring 0 is verified, but what it found is ABSENCE. Reading that as
        # a hit reported "there are no set_debuglevel calls" as confirmation of
        # a concern about set_debuglevel leaking credentials.
        if probe.probe_type is ProbeType.COUNT_ITEMS:
            hit = (res.get("count") or 0) > 0
        elif probe.probe_type is ProbeType.CHECK_VALUE:
            hit = (res.get("matches") or 0) > 0
        else:
            hit = bool(probe.verified)

        # A search that found nothing is only evidence if the search was
        # exhaustive over a place we actually read. A repo-wide miss has too
        # many innocent explanations - a name spelled differently, a symbol
        # imported from elsewhere, search paths that did not cover the file -
        # and reading those as confirmed defects is what turned three sound
        # pieces of code into "needs a person".
        SEARCH_PROBES = (ProbeType.CHECK_EXISTS, ProbeType.CHECK_VALUE,
                         ProbeType.COUNT_ITEMS)
        if (not hit and probe.probe_type in SEARCH_PROBES
                and not res.get("conclusive")):
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.PARTIALLY_RESOLVED, method="code_probe_inconclusive",
                evidence=(f"Probe '{probe.probe_id}' found nothing, but the search was not "
                          f"scoped to a file it read in full, so absence is not established: "
                          f"{probe.evidence}"),
                confidence_impact=0.0, tool_used=probe.probe_id,
            )

        if polarity is None:
            # We do not know which way to read this result. Report the evidence
            # and claim no verdict - guessing is how sound code got reported as
            # a confirmed problem.
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.PARTIALLY_RESOLVED, method="code_probe_undirected",
                evidence=(f"Probe '{probe.probe_id}' ran ({'found what it looked for' if hit else 'did not find it'}): "
                          f"{probe.evidence} The probe did not state whether that supports or "
                          f"undermines the concern, so no verdict is claimed."),
                confidence_impact=0.0, tool_used=probe.probe_id,
            )

        concern_is_real = (hit and polarity == "real") or (not hit and polarity == "unfounded")

        # ASYMMETRY, and it is the important rule in this file.
        #
        # A MISS may SETTLE a concern but may never CONFIRM one. Not finding a
        # dangerous construct is reliable good news: if `set_debuglevel` or
        # `except Exception` were in the file, the search would have matched it.
        # Not finding a SAFEGUARD is not bad news, because a safeguard can be
        # written many ways - the last run concluded there was no backoff
        # because it searched for an exponential expression and this code backs
        # off with RETRY_BACKOFF = (30, 60) instead. You cannot conclude code is
        # broken from a string you did not find. Confirming a concern requires a
        # positive finding, or a suite that actually went red.
        if concern_is_real and not hit and probe.probe_type is not ProbeType.CHECK_INVARIANT:
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.PARTIALLY_RESOLVED, method="code_probe_absent_safeguard",
                evidence=(f"Probe '{probe.probe_id}' did not find what it looked for: "
                          f"{probe.evidence} That does not establish the concern - the thing "
                          f"it searched for may simply be written another way. Confirming this "
                          f"needs a positive finding or a failing test."),
                confidence_impact=0.0, tool_used=probe.probe_id,
            )

        if concern_is_real:
            refutation = ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.NEEDS_HUMAN, method="code_probe_evidence",
                evidence=(f"Probe '{probe.probe_id}' CONFIRMS this concern: {probe.evidence} "
                          f"The dissent stands and needs a person."),
                confidence_impact=-magnitude, tool_used=probe.probe_id,
            )
            self.refutations.append(refutation)
            return refutation

        # The evidence says the concern does not apply.
        strength = self._strength(probe)
        if strength == "strong":
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.RESOLVED, method="code_probe_evidence",
                evidence=(f"Probe '{probe.probe_id}' settles this against the repository: "
                          f"{probe.evidence}"),
                confidence_impact=magnitude, tool_used=probe.probe_id,
            )
        return ResolutionAttempt(
            dissent_id=dissent_id, dissent_content=dissent_content,
            status=ResolutionStatus.PARTIALLY_RESOLVED, method="code_probe_weak",
            evidence=(f"Probe '{probe.probe_id}' points away from this concern but cannot "
                      f"settle it: {probe.evidence} A literal match is not an answer to a "
                      f"design question."),
            confidence_impact=magnitude * 0.5, tool_used=probe.probe_id,
        )

    # -------------------------------------------------------------- matching

    STRONG = {ProbeType.CHECK_INVARIANT, ProbeType.COMPARE_BEFORE_AFTER}

    def _strength(self, probe: ProbeResult) -> str:
        """How much a verdict from this probe is worth."""
        # loop_runner registers hypothesis test results as ProbeResults so the
        # semantic bridge can cross-reference them. Nothing executed for those -
        # they are a model's assessment - so they never count as strong evidence
        # however they are typed.
        if str(probe.probe_id).startswith("hypothesis_"):
            return "weak"
        if probe.probe_type in self.STRONG:
            return "strong"
        res = probe.result if isinstance(probe.result, dict) else {}
        # A search scoped to one file that was read in full is as good an answer
        # as finding the thing - it settles the question either way.
        if res.get("conclusive"):
            return "strong"
        if probe.probe_type is ProbeType.CHECK_EXISTS and res.get("kind") in ("file", "symbol"):
            return "strong"
        if probe.probe_type is ProbeType.COUNT_ITEMS and "expected" in res:
            return "strong"
        # Text matches, bare counts: real evidence, but it cannot fail for any
        # plausible identifier, so it does not get to close a concern.
        return "weak"

    def _best_match(self, dissent: str, exclude_spent: bool = True) -> Optional[ProbeResult]:
        """Highest-scoring probe that plausibly addresses this dissent, or None."""
        pool = [p for p in self._probes
                if not (exclude_spent and p.probe_id in self._spent)]
        scored = [(self._score(p, dissent), p) for p in pool]
        scored = [(s, p) for s, p in scored if s > 0]
        if not scored:
            return None
        scored.sort(key=lambda sp: sp[0], reverse=True)
        return scored[0][1]

    def _score(self, probe: ProbeResult, dissent: str) -> int:
        low = dissent.lower()
        target = (probe.target or "").lower()
        score = 0

        # Provenance beats inference. This probe was built to settle this exact
        # dissent, so no keyword score should be able to outrank it.
        if self._is_origin(probe, dissent):
            return 100

        # Word-boundary, not containment. `target in low` matched "delete"
        # inside "soft-deleted, never removed" and let an unrelated probe win
        # the match and be spent on it - the same substring mistake the module
        # docstring above says this class exists to fix.
        if target and len(target) > 2 and re.search(
                rf"(?<![a-z0-9_]){re.escape(target)}(?![a-z0-9_])", low):
            score += 10

        for tok in self._tokens(dissent):
            if tok and tok.lower() == target:
                score += 10
            elif tok and target and tok.lower() in target:
                score += 3

        for path in PATHLIKE.findall(dissent):
            if path.lower() in str(probe.result).lower() or path.lower() in target:
                score += 6

        if probe.probe_type in (ProbeType.CHECK_INVARIANT, ProbeType.COMPARE_BEFORE_AFTER):
            if any(w in low for w in SUITE_WORDS):
                score += 8

        if probe.probe_type is ProbeType.COUNT_ITEMS and "count" in low:
            score += 4

        return score

    def _is_origin(self, probe: ProbeResult, dissent: str) -> bool:
        """Was this probe synthesized from this dissent?"""
        origin = self._origin.get(probe.probe_id)
        if not origin:
            return False
        a = " ".join(origin.lower().split())
        b = " ".join(dissent.lower().split())
        if a == b:
            return True
        # Synthesizers truncate the dissent they record, so one may be a prefix
        # of the other. Require a real span, not a shared opening clause.
        # One is a truncation of the other: the shorter must prefix the longer.
        shortest = min(len(a), len(b))
        return shortest >= 40 and (a[:shortest] == b[:shortest])

    @staticmethod
    def _tokens(text: str) -> List[str]:
        toks = list(QUOTED.findall(text)) + list(PATHLIKE.findall(text))
        toks += [t for t in IDENT.findall(text)
                 if t.lower() not in STOPWORDS and ("_" in t or len(t) > 5)]
        return toks


    # --------------------------------------------------------------- reporting

    def refutation_report(self) -> str:
        """Dissents that probe evidence actively contradicted, for the whole session."""
        if not self.refutations:
            return "No dissent was contradicted by probe evidence."
        lines = [f"{len(self.refutations)} dissent(s) CONFIRMED as real problems by probe evidence:"]
        for r in self.refutations:
            lines.append(f"  [{r.dissent_id}] {r.dissent_content}")
            lines.append(f"      {r.evidence}")
        return "\n".join(lines)


def create_code_context_resolver(**kwargs) -> CodeContextResolver:
    return CodeContextResolver(**kwargs)
