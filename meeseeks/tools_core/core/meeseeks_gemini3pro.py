#!/usr/bin/env python3
"""
meeseeks_gemini3pro.py - Standalone Gemini 3 Pro Preview Caller (Meeseeks)

Calls the top Google model (resolved from model_roles) via the canonical
Meeseeks LLM router configuration in `box/00_llm_router_config.json`.

Usage:
    python -m tools_core.core.meeseeks_gemini3pro "Your prompt here"
    python -m tools_core.core.meeseeks_gemini3pro --file path/to/file.txt
    echo "prompt" | python -m tools_core.core.meeseeks_gemini3pro --stdin

Or (direct execution):
    python tools_core/core/meeseeks_gemini3pro.py "Your prompt here"
"""

import sys
import argparse
from pathlib import Path
from typing import Optional

try:
    # Preferred when imported/run as a package module
    from .meeseeks_llm_caller import call_model, get_default_model
except ImportError:  # pragma: no cover
    # Fallback for direct execution: `python tools_core/core/meeseeks_gemini3pro.py ...`
    from meeseeks_llm_caller import call_model, get_default_model


def _get_model_name() -> str:
    """Resolve at call time, not import time, so cache invalidation works."""
    return get_default_model("google_top")


def call_gemini3(prompt: str, system: Optional[str] = None, max_tokens: int = 8000) -> str:
    """
    Call the top Google model (resolved from model_roles["google_top"]).

    DO NOT REGRESS TO 2.5 OR ANY OTHER VERSION!
    """
    return call_model(_get_model_name(), prompt, system, max_tokens)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=f"Call {_get_model_name()} (2M context) - Top Google Model"
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="The prompt to send to the model",
    )
    parser.add_argument(
        "--file",
        "-f",
        type=str,
        help="Read prompt from a file",
    )
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Read prompt from stdin",
    )
    parser.add_argument(
        "--system",
        "-s",
        type=str,
        help="System prompt",
    )
    parser.add_argument(
        "--max-tokens",
        "-m",
        type=int,
        default=8000,
        help="Maximum output tokens (default: 8000)",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Just print the model name being used (for verification)",
    )

    args = parser.parse_args()

    # Verification mode - just print model name
    if args.verify:
        print(f"Model configured: {_get_model_name()}")
        return

    # Get prompt from various sources
    prompt: Optional[str] = None

    if args.stdin:
        prompt = sys.stdin.read().strip()
    elif args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            raise SystemExit(1)
        prompt = file_path.read_text()
    elif args.prompt:
        prompt = args.prompt
    else:
        parser.print_help()
        raise SystemExit(1)

    if not prompt:
        print("Error: Empty prompt", file=sys.stderr)
        raise SystemExit(1)

    try:
        response = call_gemini3(prompt, args.system, args.max_tokens)
        print(response)
    except Exception as e:
        print(f"Error calling {_get_model_name()}: {e}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

