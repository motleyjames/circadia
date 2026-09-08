#!/usr/bin/env python3
"""
Concatenate multiple repository files into a single "mega prompt" file.

Why:
- Gemini reviews are strongest when given full docs + full code in one context.
- We keep all run artifacts under meeseeks/logs/** per repo rules.

Usage:
  python meeseeks/tools_spawned/concat_prompt/concat_prompt.py \
    --out meeseeks/logs/agent_runs/<RUN_ID>/mega_prompt.md \
    --file XX/thesys-c1-llm.md \
    --file apps/api/src/routes/ai-materials.ts
"""

from __future__ import annotations

import argparse
from pathlib import Path


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Concatenate files into a mega prompt.")
    ap.add_argument("--out", required=True, help="Output file path")
    ap.add_argument(
        "--root",
        default=".",
        help="Root directory used to display relative file paths (default: .)",
    )
    ap.add_argument("--file", action="append", default=[], help="Input file path (repeatable)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    out = Path(args.out).resolve()
    files = [Path(p).resolve() for p in (args.file or [])]

    if not files:
        raise SystemExit("No --file inputs provided")

    parts: list[str] = []
    parts.append("# Mega prompt: docs + code (full contents)\n")
    parts.append(
        "Instructions for the reviewer model:\n"
        "- All files below are included in FULL.\n"
        "- Treat them as the source of truth.\n"
        "- If you refer to line numbers, use the original file names + approximate sections.\n\n"
    )

    for p in files:
        try:
            rel = str(p.relative_to(root))
        except Exception:
            rel = str(p)

        parts.append("\n\n" + ("=" * 80) + "\n")
        parts.append(f"BEGIN FILE: {rel}\n")
        parts.append(("=" * 80) + "\n\n")
        parts.append(_read_text(p))
        if not parts[-1].endswith("\n"):
            parts.append("\n")
        parts.append("\n" + ("=" * 80) + "\n")
        parts.append(f"END FILE: {rel}\n")
        parts.append(("=" * 80) + "\n")

    _write_text(out, "".join(parts))
    print(f"Wrote mega prompt: {out}")
    print(f"Files included: {len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

