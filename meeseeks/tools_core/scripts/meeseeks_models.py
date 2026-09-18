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


def discover(env, cfg) -> int:
    """What can these keys actually reach, according to the providers themselves?

    A 404 from a chat endpoint is ambiguous: the model may not exist, or it may
    exist and simply not be served there. Listing the account's real models
    tells the two apart, which is the difference between renaming a seat and
    changing an endpoint.
    """
    import httpx

    configured = set(cfg.get("models", {}))

    key = env.get("OPENAI_API_KEY")
    print("OPENAI")
    if not key:
        print("  OPENAI_API_KEY not set")
    else:
        try:
            r = httpx.get("https://api.openai.com/v1/models",
                          headers={"Authorization": f"Bearer {key}"}, timeout=60.0)
            if r.status_code == 401:
                print("  401 - the key itself is rejected. Regenerate it.")
            else:
                r.raise_for_status()
                ids = sorted(m["id"] for m in r.json().get("data", []))
                chat = [i for i in ids if i.startswith(("gpt-", "o1", "o3", "o4", "chatgpt"))
                        and not any(x in i for x in ("audio", "realtime", "image", "tts",
                                                     "whisper", "embedding", "moderation"))]
                print(f"  {len(ids)} models on this key; {len(chat)} usable for text:")
                for i in chat:
                    mark = "  <- in your router config" if i in configured else ""
                    print(f"    {i}{mark}")
                stale = [m for m, v in cfg.get("models", {}).items()
                         if v.get("provider") == "openai" and m not in ids]
                if stale:
                    print(f"  CONFIGURED BUT NOT ON THIS ACCOUNT: {', '.join(stale)}")
        except Exception as exc:
            print(f"  could not list: {type(exc).__name__}: {str(exc)[:120]}")

    gkey = env.get("GOOGLE_API_KEY") or env.get("GEMINI_API_KEY")
    print("\nGOOGLE")
    if not gkey:
        print("  GOOGLE_API_KEY not set")
    else:
        try:
            r = httpx.get("https://generativelanguage.googleapis.com/v1beta/models",
                          headers={"x-goog-api-key": gkey}, timeout=60.0)
            if r.status_code == 429:
                print("  429 on ListModels - the key is valid but the project is rate limited.")
                print("  That is the free tier (5 requests/minute). Billing is not active yet")
                print("  on the project this key belongs to.")
            else:
                r.raise_for_status()
                names = [m["name"].split("/")[-1] for m in r.json().get("models", [])
                         if "generateContent" in m.get("supportedGenerationMethods", [])]
                print(f"  {len(names)} models support generateContent. Flash/Pro entries:")
                for nme in sorted(n2 for n2 in names if "flash" in n2 or "pro" in n2):
                    mark = "  <- in your router config" if nme in configured else ""
                    print(f"    {nme}{mark}")
                print("  ListModels succeeded, so the key is valid. If generateContent still")
                print("  429s, it is a quota limit on the project, not the key.")
        except Exception as exc:
            print(f"  could not list: {type(exc).__name__}: {str(exc)[:120]}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Check which models this install can reach")
    ap.add_argument("--all", action="store_true", help="Test every model in the router config")
    ap.add_argument("--discover", action="store_true",
                    help="Ask each provider what models this key can actually use. "
                         "Model names in the router config go stale; this shows the truth.")
    args = ap.parse_args()

    env = load_env()
    cfg = load_router_config()

    if args.discover:
        return discover(env, cfg)

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
            call_model(model, "Reply with the single word: ok", max_tokens=256)
            print(f"  {model:30} OK")
            working.append(model)
        except Exception as exc:
            # Providers name the exact quota or parameter at fault; truncating
            # to 80 characters cut off the only part worth reading.
            msg = " ".join(str(exc).split())[:300]
            print(f"  {model:30} FAILS")
            print(f"  {'':30} {msg}")
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
