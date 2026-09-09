#!/usr/bin/env python3
"""
LLMProbeSynthesizer - turns a council dissent into a probe that can actually run.

The stock synthesizer matches dissents against six regexes and pulls parameters
out with more regex. On real architectural prose that fails badly. Measured on a
live council run against Coeus: 5 of 5 dissents produced a probe, and 0 of 5
produced usable evidence. One example of the mechanism -

    "Archive (IMAP COPY + flag/move) is a semantically different action from delete"

matched the pattern `chang|diff|before|after|compar` on the substring "diff"
inside "different", and became a before/after comparison probe.

This asks a model instead: here is a concern, here is what the repository
actually contains, emit a probe specification that would settle it. The model
picks the probe type and fills the parameters the executor needs.

Falls back to the caller's regex path when no model is available or the response
cannot be validated - degrading to the old behaviour rather than to nothing.

Usage:
    from tools_core.probes import create_probe_factory
    from tools_core.probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer

    factory = create_probe_factory()
    factory.set_synthesizer(LLMProbeSynthesizer(repo_root="/Users/you/personal-agent"))
    factory.set_executor(CodeProbeExecutor())

    probes = factory.synthesize_from_council(votes)
"""

from __future__ import annotations

import ast
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from ..core.meeseeks_data_classes import ProbeType, SynthesizedProbe
    from ..core.meeseeks_llm_caller import call_model, get_default_model
except ImportError:
    from core.meeseeks_data_classes import ProbeType, SynthesizedProbe
    from core.meeseeks_llm_caller import call_model, get_default_model

logger = logging.getLogger(__name__)

SUPPORTED = {
    "check_exists":         ProbeType.CHECK_EXISTS,
    "check_value":          ProbeType.CHECK_VALUE,
    "count_items":          ProbeType.COUNT_ITEMS,
    "check_invariant":      ProbeType.CHECK_INVARIANT,
    "compare_before_after": ProbeType.COMPARE_BEFORE_AFTER,
}

PROMPT = """You turn a code-review concern into ONE probe that a program can run
against a repository to settle it. You do not answer the concern yourself.

## The concern
{dissent}

## What the repository actually contains
{facts}

## Probe types available
- check_exists   params: {{"identifier": "<function, class, or file name>"}}
                 Answers: is this actually defined in the codebase?
- check_value    params: {{"expected": "<exact literal string>"}}
                 Answers: does this exact text appear in the source?
- count_items    params: {{"target_type": "tests" | "lines" | "occurrences",
                           "identifier": "<file path when counting lines, or the
                                          string to look for when counting
                                          occurrences; omit for tests>",
                           "expected_count": <int - OMIT unless you genuinely
                                              expect one specific number>}}
                 Answers: how many tests are collected, how many lines a file has,
                 or how many times something appears. Use "lines" with a real file
                 path to check whether a module has grown too large.
- check_invariant params: {{}}
                 Answers: does the test suite still pass?
- compare_before_after params: {{}}
                 Answers: did the suite regress against a baseline?

## Rules
- Prefer a probe that CAN FAIL. check_invariant and compare_before_after run the
  test suite and can come back red; count_items with an expected_count can be
  wrong. check_value almost always finds something for any plausible string, so
  it proves very little - reach for it last.
- Pick the ONE probe that would most reduce uncertainty about this concern.
- Identifiers and literals MUST be things that plausibly exist in this repo.
  Use names from the facts above. Never invent a symbol to check for.
- If no probe could settle it - the concern is a judgement call about design
  taste, or about code that does not exist yet - return {{"probe_type": null}}
  and say why. That is a valid and useful answer.

## Output
Return ONLY this JSON:
{{"probe_type": "<one of the five, or null>",
  "parameters": {{...}},
  "target": "<what is being checked, in three words>",
  "a_hit_means": "<REQUIRED: 'concern_is_real' if the probe FINDING what it looks
                   for means the concern is justified; 'concern_is_unfounded' if
                   finding it means the concern does not apply>",
  "would_settle": "<what a pass and a fail would each tell us>",
  "rationale": "<one sentence>"}}

Think carefully about a_hit_means - it is the difference between reporting a real
problem and inventing one. Example: for the concern "retries use a fixed delay
instead of backing off", a probe that looks for an increasing-delay constant has
a_hit_means "concern_is_unfounded", because finding it means the code DOES back
off. A probe that looks for a hardcoded single sleep value has a_hit_means
"concern_is_real"."""


class LLMProbeSynthesizer:
    """Synthesizes probes by asking a model, grounded in real repository facts."""

    def __init__(
        self,
        repo_root: Optional[str] = None,
        model: Optional[str] = None,
        search_paths: Optional[List[str]] = None,
        max_symbols: int = 120,
    ):
        self.repo_root = Path(repo_root).resolve() if repo_root else None
        self.model = model
        self._explicit_paths = list(search_paths) if search_paths else None
        self.search_paths = self._explicit_paths or ["src", "tests"]
        self.max_symbols = max_symbols
        self._facts: Optional[str] = None
        self.skipped: List[Dict[str, str]] = []

    # ------------------------------------------------------------------ API

    def synthesize(self, dissent: str, generated_by: str = "llm") -> Optional[SynthesizedProbe]:
        try:
            model = self.model or get_default_model("anthropic_balanced")
            raw = call_model(
                model,
                PROMPT.format(dissent=dissent.strip()[:1200], facts=self._repo_facts()),
                system="You design verification probes. Return only valid JSON.",
                max_tokens=700,
                temperature=0.0,
            )
        except Exception as exc:
            logger.warning(f"LLM synthesis failed, caller should fall back: {exc}")
            return None

        spec = self._parse(raw)
        if not spec:
            logger.warning(f"LLM synthesis returned unparseable JSON: {raw.strip()[:160]!r}")
            return None

        kind = spec.get("probe_type")
        # A model asked for JSON emits the string "null" about as often as a
        # real null. Both mean the same thing - it judged the concern
        # unverifiable by probe - so both belong in skipped_report(), where a
        # person will see them, not in a warning about an unsupported type.
        if kind is None or str(kind).strip().lower() in ("null", "none", "n/a", ""):
            self._skip(dissent, spec.get("rationale") or "model judged it unverifiable by probe",
                       kind="judgement")
            logger.info("LLM declined to synthesize a probe - concern is not checkable")
            return None

        ptype = SUPPORTED.get(str(kind).strip().lower())
        if ptype is None:
            # Also a dissent nothing checked it. Log it as the bug it is, but
            # still surface the concern rather than dropping it silently.
            logger.warning(f"LLM proposed unsupported probe type: {kind!r}")
            self._skip(dissent, f"model proposed probe type {kind!r}, which no executor implements",
                       kind="harness_gap")
            return None

        params = spec.get("parameters") or {}
        if not isinstance(params, dict):
            params = {}

        # What a positive result MEANS for the concern. Without this the
        # consumer has to guess, and the old code always guessed the same way -
        # that a probe which did not verify meant the concern was justified.
        # For a probe looking for a safeguard, that is exactly backwards, and it
        # reported sound code as a confirmed problem.
        polarity = str(spec.get("a_hit_means", "")).strip().lower()
        if polarity in ("concern_is_real", "real", "supports", "supports_the_concern"):
            params["_polarity"] = "real"
        elif polarity in ("concern_is_unfounded", "unfounded", "refutes",
                          "refutes_the_concern"):
            params["_polarity"] = "unfounded"
        else:
            logger.info(f"probe for {str(spec.get('target', kind))[:40]!r}: model did not "
                        f"state what a hit means; "
                        f"its result will be reported without a verdict")

        target = str(spec.get("target", kind))[:40]
        slug = re.sub(r"[^a-z0-9]+", "_", target.lower()).strip("_") or str(kind)
        # A probe's name is its probe_id, and everything downstream keys on it:
        # the resolver's spent-set and provenance map, the semantic bridge. Two
        # dissents about the same subject produce the same slug, and the second
        # probe would silently take the first one's identity.
        suffix = f"{abs(hash(dissent.strip())) % 10000:04d}"
        return SynthesizedProbe(
            name=f"{kind}__{slug}"[:55] + f"_{suffix}",
            probe_type=ptype,
            description=str(spec.get("would_settle", ""))[:300],
            code="",
            parameters=params,
            generated_by=f"{generated_by}:{model}",
            from_dissent=dissent[:200],
        )

    def _skip(self, dissent: str, why: str, kind: str = "judgement") -> None:
        """Record a dissent no probe was built for.

        kind distinguishes the two very different reasons: "judgement" means a
        model read the concern and said no probe can settle it; "harness_gap"
        means it wanted a probe type nothing here implements. Reporting the
        second as the first would hide a gap in this tool behind a claim about
        the question.
        """
        self.skipped.append({"dissent": dissent[:160], "why": str(why)[:200], "kind": kind})

    def invalidate_facts(self) -> None:
        """Drop the cached repo snapshot.

        _repo_facts() is what stops the model inventing identifiers, and it is
        computed once. After a loop changes the repository, a stale snapshot
        makes the model probe for symbols that no longer exist - which the
        executor reports as a refutation.
        """
        self._facts = None

    def skipped_report(self) -> str:
        """Concerns the model judged unverifiable. These need a person, not a probe."""
        if not self.skipped:
            return "Every dissent yielded a probe."
        lines = [f"{len(self.skipped)} concern(s) no probe can settle - judgement calls:"]
        for s in self.skipped:
            lines.append(f"  - {s['dissent']}")
            lines.append(f"      {s['why']}")
        return "\n".join(lines)

    # -------------------------------------------------------------- grounding

    def _repo_facts(self) -> str:
        """Real symbol and file names, so the model cannot invent things to check."""
        if self._facts is not None:
            return self._facts
        if not self.repo_root or not self.repo_root.is_dir():
            self._facts = "(repository contents unavailable - do not guess identifiers)"
            return self._facts

        if not self._explicit_paths:
            # Same reason as the executor: grounding the model in an empty tree
            # makes it invent identifiers, which then come back "does not exist".
            try:
                from .meeseeks_code_probe_executor import discover_search_paths
            except ImportError:
                from probes.meeseeks_code_probe_executor import discover_search_paths
            self.search_paths = discover_search_paths(self.repo_root)

        modules: List[str] = []
        symbols: List[str] = []
        for rel in self.search_paths:
            base = self.repo_root / rel
            if not base.is_dir():
                continue
            for f in sorted(base.rglob("*.py")):
                if "__pycache__" in f.parts:
                    continue
                modules.append(str(f.relative_to(self.repo_root)))
                if len(symbols) >= self.max_symbols:
                    continue
                try:
                    tree = ast.parse(f.read_text(encoding="utf-8", errors="replace"))
                except (SyntaxError, OSError):
                    continue
                for node in tree.body:
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        if not node.name.startswith("_"):
                            symbols.append(node.name)

        self._facts = (
            f"Modules ({len(modules)}):\n  " + "\n  ".join(modules[:60])
            + f"\n\nTop-level functions and classes ({len(symbols)} shown):\n  "
            + ", ".join(sorted(set(symbols))[: self.max_symbols])
        )
        return self._facts

    @staticmethod
    def _parse(raw: str) -> Optional[Dict[str, Any]]:
        """Tolerate markdown fences and trailing prose around the JSON object."""
        text = re.sub(r"^\s*```(?:json)?|```\s*$", "", raw.strip(), flags=re.M)
        start = text.find("{")
        if start < 0:
            return None
        # Walk to the matching close brace rather than the last one in the string,
        # so trailing commentary containing braces does not break the parse.
        depth, in_str, esc = 0, False, False
        for i, ch in enumerate(text[start:], start):
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        return None
        return None


def create_llm_synthesizer(**kwargs) -> LLMProbeSynthesizer:
    return LLMProbeSynthesizer(**kwargs)
