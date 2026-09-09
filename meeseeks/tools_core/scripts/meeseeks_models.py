#!/usr/bin/env python3
"""
Which models are actually reachable from this install?

The loop degrades quietly when a provider is down or unconfigured: a council
member that fails contributes an Opinion with confidence 0 and no
considerations, which is indistinguishable from a member who simply agreed. So
a three-model council can silently be a one-model council. This says which is
which, with one tiny call per role.

    ./tools_core/scripts/meeseeks_models.py           # roles the loop uses
    ./tools_core/scripts/meeseeks_models.py --all     # every configured model
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.meeseeks_llm_caller import (  # noqa: E402
    load_env, load_router_config, get_default_model, get_default_models, call_model,
)

KEY_FOR = {"anthropic": "ANTHROPIC_API_KEY", "google": "GOOGLE_API_KEY", "openai": "OPENAI_API_KEY"}
# Roles the RSI loop actually reaches for.
LOOP_ROLES = ["anthropic_top", "anthropic_balanced", "google_top", "openai_top"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Check which models this install can reach")
    ap.add_argument("--all", action="store_true", help="Test every model in the router config")
    args = ap.parse_args()

    env = load_env()
    cfg = load_router_config()

    print("KEYS")
    for provider, var in KEY_FOR.items():
        val = env.get(var) or (env.get("GEMINI_API_KEY") if provider == "google" else None)
        print(f"  {var:20} {'set (%d chars)' % len(val) if val else 'MISSING'}")

    council = get_default_models("council_default")
    print(f"\nCOUNCIL (council_default): {', '.join(council)}")

    targets = sorted(cfg.get("models", {})) if args.all else []
    if not targets:
        for role in LOOP_ROLES:
            try:
                targets.append(get_default_model(role))
            except Exception:
                print(f"  role {role} is not defined in model_roles")
        targets += [m for m in council if m not in targets]

    print("\nLIVE CHECK (one small call each)")
    working, broken = [], []
    for model in dict.fromkeys(targets):
        try:
            call_model(model, "Reply with the single word: ok", max_tokens=5)
            print(f"  {model:30} OK")
            working.append(model)
        except Exception as exc:
            msg = str(exc).replace("\n", " ")[:80]
            print(f"  {model:30} FAILS  {type(exc).__name__}: {msg}")
            broken.append(model)

    print(f"\n{len(working)} reachable, {len(broken)} not.")
    dead_seats = [m for m in council if m in broken]
    if dead_seats:
        print(f"WARNING: {len(dead_seats)} of {len(council)} council seats are dead "
              f"({', '.join(dead_seats)}). Those members contribute no dissents, and a "
              f"silent member looks exactly like one who agreed.")
    return 0 if not broken else 1


if __name__ == "__main__":
    sys.exit(main())
