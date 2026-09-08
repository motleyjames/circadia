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
- count_items    params: {{"target_type": "tests"}} or {{"expected_count": <int>}}
                 Answers: how many tests are collected / how many occurrences?
- check_invariant params: {{}}
                 Answers: does the test suite still pass?
- compare_before_after params: {{}}
                 Answers: did the suite regress against a baseline?

## Rules
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
  "would_settle": "<what a pass and a fail would each tell us>",
  "rationale": "<one sentence>"}}"""


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
        self.search_paths = search_paths or ["src", "tests"]
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
            logger.warning("LLM synthesis returned unparseable JSON")
            return None

        kind = spec.get("probe_type")
        if kind is None:
            self.skipped.append({
                "dissent": dissent[:160],
                "why": spec.get("rationale", "model judged it unverifiable by probe"),
            })
            logger.info("LLM declined to synthesize a probe - concern is not checkable")
            return None

        ptype = SUPPORTED.get(str(kind).lower())
        if ptype is None:
            logger.warning(f"LLM proposed unsupported probe type: {kind}")
            return None

        params = spec.get("parameters") or {}
        if not isinstance(params, dict):
            params = {}

        target = str(spec.get("target", kind))[:40]
        slug = re.sub(r"[^a-z0-9]+", "_", target.lower()).strip("_") or str(kind)
        return SynthesizedProbe(
            name=f"{kind}__{slug}"[:60],
            probe_type=ptype,
            description=str(spec.get("would_settle", ""))[:300],
            code="",
            parameters=params,
            generated_by=f"{generated_by}:{model}",
            from_dissent=dissent[:200],
        )

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
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start < 0 or end <= start:
            return None
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            return None


def create_llm_synthesizer(**kwargs) -> LLMProbeSynthesizer:
    return LLMProbeSynthesizer(**kwargs)
