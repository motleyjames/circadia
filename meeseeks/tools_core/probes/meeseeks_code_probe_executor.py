#!/usr/bin/env python3
"""
CodeProbeExecutor - makes Meeseeks verification touch reality.

The MetacognitiveProbeFactory synthesizes probes from council dissents, then
calls executor.execute() on each one. Without a registered executor,
execute_probes() logs "No executor set" and returns [] - every probe is
discarded, the Semantic Bridge stays empty, and SRDE falls through to regex
resolvers that assert rather than check.

This fills the slot named in ProbeExecutor's own docstring:
    "CodeProbeExecutor (executes against AST)"

Two deliberate departures from the Excel reference implementation:

1. It never exec()s probe.code. That field holds model-generated Python, and
   this runs against a real repository with real credentials. Dispatch is by
   probe_type against a fixed set of read-only operations instead.

2. It reports UNVERIFIED honestly. A probe that cannot establish its claim
   returns verified=False with confidence_impact 0.0 and evidence saying what
   it could and could not determine. Granting confidence for nothing is the
   exact failure mode this class exists to fix.

Usage:
    from tools_core.probes import create_probe_factory
    from tools_core.probes import CodeProbeExecutor

    factory = create_probe_factory()
    factory.set_executor(CodeProbeExecutor())

    probes  = factory.synthesize_from_council(decision.votes)
    results = factory.execute_probes(probes, context={"repo_root": "/Users/you/personal-agent"})
"""

from __future__ import annotations

import ast
import re
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    from ..core.meeseeks_data_classes import (
        ProbeResult, ProbeType, SynthesizedProbe,
    )
    from .meeseeks_probe_factory import ProbeExecutor
except ImportError:
    from core.meeseeks_data_classes import (
        ProbeResult, ProbeType, SynthesizedProbe,
    )
    from probes.meeseeks_probe_factory import ProbeExecutor


DEFAULT_TEST_COMMAND: List[str] = ["venv/bin/pytest", "-q", "--no-header"]
DEFAULT_SEARCH_PATHS: List[str] = ["src", "tests"]
def discover_search_paths(root) -> "List[str]":
    """Directories worth searching in this repo.

    The default was a hardcoded ["src", "tests"]. In a repo that keeps its code
    anywhere else, every file and symbol lookup came back empty - and an empty
    lookup is reported as "does not exist", which the resolver escalates as
    evidence CONTRADICTING the concern. A whole run of confident refutations,
    all of them false, from a directory name.
    """
    from pathlib import Path as _P
    root = _P(root)
    known = [d for d in ("src", "tests", "test", "lib", "app", "pkg", "scripts")
             if (root / d).is_dir()]
    if known:
        return known
    skip = {".git", ".venv", "venv", "node_modules", "__pycache__", "build",
            "dist", ".mypy_cache", ".pytest_cache", "meeseeks"}
    found = [d.name for d in root.iterdir()
             if d.is_dir() and not d.name.startswith(".") and d.name not in skip]
    return found or ["."]

DEFAULT_TIMEOUT: int = 300
SOURCE_SUFFIXES = {".py"}

_PYTEST_TALLY = re.compile(r"(\d+)\s+(passed|failed|error|errors|skipped)")


class CodeProbeExecutor(ProbeExecutor):
    """Executes synthesized probes against a Python repository, read-only."""

    def __init__(
        self,
        repo_root: Optional[str] = None,
        test_command: Optional[List[str]] = None,
        search_paths: Optional[List[str]] = None,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.repo_root = Path(repo_root).resolve() if repo_root else None
        self.test_command = test_command or list(DEFAULT_TEST_COMMAND)
        self._explicit_paths = list(search_paths) if search_paths else None
        self._discovered = None
        self.search_paths = self._explicit_paths or list(DEFAULT_SEARCH_PATHS)
        self.timeout = timeout

        self._handlers: Dict[ProbeType, Callable] = {
            ProbeType.CHECK_EXISTS:         self._check_exists,
            ProbeType.CHECK_VALUE:          self._check_value,
            ProbeType.COUNT_ITEMS:          self._count_items,
            ProbeType.CHECK_INVARIANT:      self._check_invariant,
            ProbeType.COMPARE_BEFORE_AFTER: self._compare_before_after,
        }

    # ------------------------------------------------------------------ API

    def execute(self, probe: SynthesizedProbe, context: Dict[str, Any]) -> ProbeResult:
        handler = self._handlers.get(probe.probe_type)
        if handler is None:
            return self._unverified(
                probe,
                f"{probe.probe_type.value} is not something this executor can check "
                f"against a codebase. Verify by hand or write a probe type for it.",
            )
        try:
            return handler(probe, context)
        except subprocess.TimeoutExpired as exc:
            # Report the limit that actually applied, not the executor default.
            # context["timeout"] overrides self.timeout in every handler, so
            # naming self.timeout here sends you tuning the wrong number.
            limit = exc.timeout or context.get("timeout", self.timeout)
            cmd = exc.cmd if isinstance(exc.cmd, str) else " ".join(map(str, exc.cmd or []))
            return self._unverified(
                probe,
                f"`{cmd}` exceeded {limit}s and was killed. Either the command is "
                f"slower than the probe budget or it is waiting on something.",
            )
        except Exception as exc:
            return self._unverified(probe, f"Probe raised {type(exc).__name__}: {exc}")

    # ------------------------------------------------------------- handlers

    def _check_exists(self, probe, context) -> ProbeResult:
        """Does a named file, symbol, or literal exist in the repo?"""
        root = self._root(context)
        needle = probe.parameters.get("identifier") or self._needle_from_dissent(probe)
        if not needle:
            return self._unverified(probe, "No identifier could be extracted from the dissent.")

        as_path = self._safe_path(root, needle)
        if as_path and as_path.exists():
            return self._verified(
                probe, needle, {"kind": "file", "path": str(as_path.relative_to(root))},
                f"File exists: {as_path.relative_to(root)}", 0.10,
            )

        symbols = self._find_symbol(root, context, needle)
        if symbols:
            where = ", ".join(f"{p}:{ln}" for p, ln in symbols[:3])
            return self._verified(
                probe, needle, {"kind": "symbol", "locations": symbols},
                f"Defined at {where}" + (f" (+{len(symbols) - 3} more)" if len(symbols) > 3 else ""),
                0.10,
            )

        hits = self._grep(root, context, needle, limit=3)
        if hits:
            where = ", ".join(f"{p}:{ln}" for p, ln, _ in hits)
            return self._verified(
                probe, needle, {"kind": "text", "locations": [(p, ln) for p, ln, _ in hits]},
                f"Appears as text at {where}", 0.06,
            )

        return ProbeResult(
            probe_type=probe.probe_type, probe_id=probe.name, target=needle,
            result={"found": False}, verified=False, confidence_impact=-0.05,
            evidence=f"'{needle}' does not exist as a file, a symbol, or literal text under "
                     f"{', '.join(self._paths(context))}.",
        )

    def _check_value(self, probe, context) -> ProbeResult:
        """Does an expected literal appear in the source?"""
        root = self._root(context)
        expected = probe.parameters.get("expected") or self._needle_from_dissent(probe)
        if not expected:
            return self._unverified(probe, "No expected value could be extracted from the dissent.")

        hits = self._grep(root, context, expected, limit=5)
        if not hits:
            return ProbeResult(
                probe_type=probe.probe_type, probe_id=probe.name, target=expected,
                result={"matches": 0}, verified=False, confidence_impact=-0.05,
                evidence=f"Value '{expected}' appears nowhere in the searched source.",
            )
        lines = "; ".join(f"{p}:{ln} {txt.strip()[:60]}" for p, ln, txt in hits[:3])
        return self._verified(
            probe, expected, {"matches": len(hits)},
            f"{len(hits)} occurrence(s). {lines}", 0.08,
        )

    def _count_items(self, probe, context) -> ProbeResult:
        """Count tests or occurrences, and compare against an expected count."""
        root = self._root(context)
        target_type = (probe.parameters.get("target_type") or "").lower()
        expected = probe.parameters.get("expected_count")

        # Only count what was actually asked for. Sniffing the dissent for the
        # word "test" made a requested line-count return a test count and report
        # the mismatch as a refutation - a confident answer to a question nobody
        # asked. If the target is not supported, say so.
        if target_type in ("test", "tests"):
            count, detail = self._collect_tests(root, context)
            target = "tests"
        elif target_type in ("line", "lines"):
            needle = probe.parameters.get("identifier") or self._needle_from_dissent(probe)
            path = self._safe_path(root, needle) if needle else None
            if not path or not path.is_file():
                return self._unverified(
                    probe, f"Line count requested for '{needle}', which is not a file in the repo.")
            count = len(path.read_text(encoding="utf-8", errors="replace").splitlines())
            detail = f"lines in {path.relative_to(root)}"
            target = str(path.relative_to(root))
        elif target_type in ("occurrence", "occurrences", "match", "matches", ""):
            needle = probe.parameters.get("identifier") or self._needle_from_dissent(probe)
            if not needle:
                return self._unverified(probe, "Nothing identifiable to count in the dissent.")
            count = len(self._grep(root, context, needle, limit=100000))
            detail = f"occurrences of '{needle}'"
            target = needle
        else:
            return self._unverified(
                probe, f"Cannot count '{target_type}' - this executor counts tests, "
                       f"lines, or occurrences.")

        if count is None:
            return self._unverified(probe, f"Could not count {detail}.")

        if expected is None:
            # A count with nothing to compare against cannot come out wrong, so
            # it establishes nothing. This used to return verified=True at +0.05
            # - and `verified` is the flag the bridge, SRDE and the confidence
            # calculation all key on, so an unfalsifiable measurement was
            # closing dissents.
            return self._unverified(
                probe, f"Counted {count} {detail}, but no expected count was stated. "
                       f"A measurement with nothing to compare against verifies nothing.")

        if expected == 0 and count > 0 and target_type not in ("line", "lines"):
            # An expected count of zero against a live measurement is almost
            # always the model failing to fill the field, not a real assertion.
            return self._unverified(
                probe, f"Measured {count} {detail}, but the expected count was 0 - "
                       f"treating that as unset rather than as a failed assertion.")
        # expected arrives from LLM JSON and is routinely a string. Comparing
        # 42 == "42" is False, which turned a correct measurement into a
        # fabricated refutation.
        try:
            expected = int(str(expected).strip())
        except (TypeError, ValueError):
            return self._unverified(
                probe, f"Measured {count} {detail}, but the expected count "
                       f"{expected!r} is not a number.")
        matched = count == expected
        return ProbeResult(
            probe_type=probe.probe_type, probe_id=probe.name, target=target,
            result={"count": count, "expected": expected}, verified=matched,
            confidence_impact=0.12 if matched else -0.08,
            evidence=f"Counted {count} {detail}; expected {expected}. "
                     f"{'Match.' if matched else 'MISMATCH.'}",
        )

    def _check_invariant(self, probe, context) -> ProbeResult:
        """Run the test suite. This is the probe with real teeth."""
        root = self._root(context)
        cmd = context.get("test_command") or self.test_command

        # Preflight. A test command that cannot even collect - a missing venv,
        # an import that hangs, a wrong path - used to consume the entire probe
        # timeout and come back as a bare "exceeded Ns", which says nothing
        # about why. Collection is fast when it works, so cap it hard and
        # report what actually went wrong.
        collect = [c for c in cmd if c not in ("-q", "--no-header")] + ["--collect-only", "-q"]
        try:
            pre = subprocess.run(collect, cwd=str(root), capture_output=True,
                                 text=True, timeout=min(45, context.get("timeout", self.timeout)))
        except subprocess.TimeoutExpired:
            return self._unverified(
                probe,
                f"`{' '.join(cmd)}` could not even COLLECT tests within 45s - something in "
                f"the import path is hanging (a module doing network or I/O at import time is "
                f"the usual cause). Nothing was checked.")
        except (OSError, subprocess.SubprocessError) as exc:
            return self._unverified(
                probe, f"`{' '.join(cmd)}` could not be run: {type(exc).__name__}: {exc}")
        if pre.returncode != 0 and "collected" not in (pre.stdout + pre.stderr):
            return self._unverified(
                probe,
                f"`{' '.join(cmd)}` failed at collection (exit {pre.returncode}), so no test "
                f"ever ran: {(pre.stderr or pre.stdout)[-200:].strip()}")

        proc = subprocess.run(
            cmd, cwd=str(root), capture_output=True, text=True,
            timeout=context.get("timeout", self.timeout),
        )
        tally = self._parse_pytest(proc.stdout + proc.stderr)
        # pytest exit codes: 2 interrupted, 3 internal error, 4 usage error,
        # 5 no tests collected. None of those mean the invariant broke - they
        # mean the check did not run. Reporting them as BROKEN cost -0.15 for a
        # bad command line.
        if proc.returncode in (2, 3, 4, 5) and not tally:
            return self._unverified(
                probe,
                f"`{' '.join(cmd)}` exited {proc.returncode} without collecting or running "
                f"tests, so nothing was checked. {(proc.stderr or proc.stdout)[-160:].strip()}")
        passed = proc.returncode == 0
        summary = ", ".join(f"{n} {k}" for k, n in tally.items()) or "no tally parsed"
        return ProbeResult(
            probe_type=probe.probe_type, probe_id=probe.name, target=" ".join(cmd),
            result={"returncode": proc.returncode, "tally": tally},
            verified=passed,
            confidence_impact=0.15 if passed else -0.15,
            evidence=(f"`{' '.join(cmd)}` exited {proc.returncode} ({summary}). "
                      f"{'Invariant holds.' if passed else 'Invariant BROKEN.'}"),
        )

    def _compare_before_after(self, probe, context) -> ProbeResult:
        """Compare the current suite against a baseline tally from context."""
        baseline = context.get("baseline")
        if not baseline:
            return self._unverified(
                probe,
                "No baseline in context. Pass context['baseline'] = executor.snapshot(root) "
                "taken before the change for this probe to mean anything.",
            )
        root = self._root(context)
        current = self.snapshot(str(root), context.get("test_command"),
                                context.get("timeout"))
        regressed = [k for k in ("failed", "error", "errors")
                     if current.get(k, 0) > baseline.get(k, 0)]
        lost = baseline.get("passed", 0) - current.get("passed", 0)
        ok = not regressed and lost <= 0
        return ProbeResult(
            probe_type=probe.probe_type, probe_id=probe.name, target="test suite",
            result={"before": baseline, "after": current}, verified=ok,
            confidence_impact=0.15 if ok else -0.15,
            evidence=(f"Before {baseline} -> after {current}. "
                      + ("No regression." if ok else
                         f"REGRESSION: {'new ' + '/'.join(regressed) if regressed else ''}"
                         f"{f' {lost} fewer passing' if lost > 0 else ''}.")),
        )

    # -------------------------------------------------------------- helpers

    def snapshot(self, repo_root: str, test_command: Optional[List[str]] = None,
                 timeout: Optional[int] = None) -> Dict[str, int]:
        """Run the suite and return its tally. Use before a change as a baseline."""
        proc = subprocess.run(
            test_command or self.test_command, cwd=repo_root,
            capture_output=True, text=True, timeout=timeout or self.timeout,
        )
        return self._parse_pytest(proc.stdout + proc.stderr)

    def _root(self, context: Dict[str, Any]) -> Path:
        root = context.get("repo_root") or self.repo_root
        if not root:
            raise ValueError("context['repo_root'] is required")
        p = Path(root).resolve()
        if not p.is_dir():
            raise ValueError(f"repo_root is not a directory: {p}")
        return p

    def _paths(self, context: Dict[str, Any]) -> List[str]:
        explicit = context.get("search_paths") or self._explicit_paths
        if explicit:
            return explicit
        root = context.get("repo_root") or self.repo_root
        if root and self._discovered is None:
            self._discovered = discover_search_paths(root)
        return self._discovered or list(DEFAULT_SEARCH_PATHS)

    def _safe_path(self, root: Path, candidate: str) -> Optional[Path]:
        """Resolve candidate under root, refusing anything that escapes it."""
        if not candidate or candidate.startswith(("/", "~")):
            return None
        try:
            p = (root / candidate).resolve()
        except (OSError, RuntimeError):
            return None
        # startswith() on the string form lets "../repo-evil" pass when root is
        # ".../repo": the sibling path shares the prefix. Compare path parts.
        try:
            p.relative_to(root.resolve())
        except ValueError:
            return None
        return p

    def _iter_sources(self, root: Path, context: Dict[str, Any]):
        for rel in self._paths(context):
            base = self._safe_path(root, rel)
            if not base or not base.exists():
                continue
            for f in base.rglob("*"):
                if f.suffix in SOURCE_SUFFIXES and "__pycache__" not in f.parts:
                    yield f

    def _find_symbol(self, root: Path, context, name: str) -> List[Tuple[str, int]]:
        """Locate function/class/assignment definitions by name, via AST."""
        found: List[Tuple[str, int]] = []
        for f in self._iter_sources(root, context):
            try:
                tree = ast.parse(f.read_text(encoding="utf-8", errors="replace"))
            except (SyntaxError, OSError):
                continue
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    if node.name == name:
                        found.append((str(f.relative_to(root)), node.lineno))
                elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                    if node.id == name:
                        found.append((str(f.relative_to(root)), node.lineno))
        return found

    def _grep(self, root: Path, context, needle: str, limit: int) -> List[Tuple[str, int, str]]:
        hits: List[Tuple[str, int, str]] = []
        for f in self._iter_sources(root, context):
            try:
                for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    if needle in line:
                        hits.append((str(f.relative_to(root)), i, line))
                        if len(hits) >= limit:
                            return hits
            except OSError:
                continue
        return hits

    def _collect_tests(self, root: Path, context) -> Tuple[Optional[int], str]:
        cmd = list(context.get("test_command") or self.test_command)
        cmd = [c for c in cmd if c not in ("-q", "--no-header")] + ["--collect-only", "-q"]
        try:
            proc = subprocess.run(cmd, cwd=str(root), capture_output=True,
                                  text=True,
                                  timeout=context.get("timeout", self.timeout))
        except (OSError, subprocess.SubprocessError):
            return None, "collected tests"
        m = re.search(r"(\d+)\s+tests?\s+collected", proc.stdout)
        if m:
            return int(m.group(1)), "collected tests"
        lines = [l for l in proc.stdout.splitlines() if "::" in l]
        return (len(lines), "collected tests") if lines else (None, "collected tests")

    @staticmethod
    def _parse_pytest(output: str) -> Dict[str, int]:
        tally: Dict[str, int] = {}
        for n, kind in _PYTEST_TALLY.findall(output):
            key = "error" if kind.startswith("error") else kind
            tally[key] = tally.get(key, 0) + int(n)
        return tally

    NEEDLE_SHAPE = re.compile(r"^[A-Za-z0-9_./:@#$-]{2,80}$")

    @classmethod
    def _needle_from_dissent(cls, probe: SynthesizedProbe) -> Optional[str]:
        """Pull a quoted or code-shaped token out of the originating dissent.

        Every candidate must LOOK like something you could find in source: no
        whitespace, no sentence punctuation. Without that check the apostrophes
        in "doesn't ... that's" read as a quoted span and the harness grepped
        for "t handle SMTP timeouts, that" - found nothing, naturally, and
        reported that as evidence contradicting the concern.
        """
        text = probe.from_dissent or probe.description or ""
        for pattern in (r'"([^"\n]{2,80})"',
                        r"'([^'\n]{2,80})'",
                        r'`([^`\n]{2,80})`',
                        r'\b([a-zA-Z_][a-zA-Z0-9_]{2,}(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)\b',
                        r'\b([a-z_][a-z0-9_]{3,}_[a-z0-9_]+)\b'):
            for m in re.finditer(pattern, text):
                candidate = m.group(1).strip()
                if cls.NEEDLE_SHAPE.match(candidate) and not candidate.isdigit():
                    return candidate
        return None

    def _verified(self, probe, target, result, evidence, impact) -> ProbeResult:
        return ProbeResult(
            probe_type=probe.probe_type, probe_id=probe.name, target=str(target),
            result=result, verified=True, confidence_impact=impact, evidence=evidence,
        )

    def _unverified(self, probe, why: str) -> ProbeResult:
        """Could not establish the claim. Zero confidence, either direction."""
        return ProbeResult(
            probe_type=probe.probe_type, probe_id=probe.name,
            target=probe.parameters.get("identifier", probe.name),
            result={"status": "UNVERIFIED"}, verified=False, confidence_impact=0.0,
            evidence=f"UNVERIFIED: {why}",
        )


def create_code_probe_executor(**kwargs) -> CodeProbeExecutor:
    return CodeProbeExecutor(**kwargs)
