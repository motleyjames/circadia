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
        # SRDE accepts only RESOLVED from a context resolver (meeseeks_srde.py:209).
        # A refutation - evidence that a dissent's premise is FALSE - is therefore
        # discarded by the engine and flattened into "no_resolver". That is real
        # information, so it is kept here for the caller to read after the pass.
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

    def add_probe(self, result: ProbeResult, origin_dissent: Optional[str] = None) -> None:
        self._probes.append(result)
        if origin_dissent:
            self._origin[result.probe_id] = origin_dissent.strip()

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

        if probe.verified:
            self._spent.add(probe.probe_id)
            strength = self._strength(probe)
            if strength == "strong":
                return ResolutionAttempt(
                    dissent_id=dissent_id, dissent_content=dissent_content,
                    status=ResolutionStatus.RESOLVED, method="code_probe_evidence",
                    evidence=f"Probe '{probe.probe_id}' verified against the repository: {probe.evidence}",
                    confidence_impact=probe.confidence_impact, tool_used=probe.probe_id,
                )
            return ResolutionAttempt(
                dissent_id=dissent_id, dissent_content=dissent_content,
                status=ResolutionStatus.PARTIALLY_RESOLVED, method="code_probe_weak",
                evidence=(f"Probe '{probe.probe_id}' found supporting text but cannot settle "
                          f"this: {probe.evidence} A literal match is not an answer to a "
                          f"design question."),
                confidence_impact=probe.confidence_impact * 0.5, tool_used=probe.probe_id,
            )

        self._spent.add(probe.probe_id)
        refutation = ResolutionAttempt(
            dissent_id=dissent_id, dissent_content=dissent_content,
            status=ResolutionStatus.NEEDS_HUMAN, method="code_probe_evidence",
            evidence=(f"Probe '{probe.probe_id}' CONTRADICTS this concern's premise: "
                      f"{probe.evidence} The dissent stands and needs a person."),
            confidence_impact=probe.confidence_impact, tool_used=probe.probe_id,
        )
        self.refutations.append(refutation)
        return refutation

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

        if target and len(target) > 2 and target in low:
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
        shortest = min(len(a), len(b))
        return shortest >= 40 and (a.startswith(b[:shortest]) or b.startswith(a[:shortest]))

    @staticmethod
    def _tokens(text: str) -> List[str]:
        toks = list(QUOTED.findall(text)) + list(PATHLIKE.findall(text))
        toks += [t for t in IDENT.findall(text)
                 if t.lower() not in STOPWORDS and ("_" in t or len(t) > 5)]
        return toks


    # --------------------------------------------------------------- reporting

    def refutation_report(self) -> str:
        """Dissents that probes actively contradicted. SRDE cannot surface these."""
        if not self.refutations:
            return "No dissent was contradicted by probe evidence."
        lines = [f"{len(self.refutations)} dissent(s) CONFIRMED as real problems by probe evidence:"]
        for r in self.refutations:
            lines.append(f"  [{r.dissent_id}] {r.dissent_content}")
            lines.append(f"      {r.evidence}")
        return "\n".join(lines)


def create_code_context_resolver(**kwargs) -> CodeContextResolver:
    return CodeContextResolver(**kwargs)
