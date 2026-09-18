#!/usr/bin/env python3
"""
smoke_userbrowser_bridge.py — Safe smoke test (OpenCode-style HTTP ⇄ session-service ⇄ UserBrowser WS bridge ⇄ Electron)
===============================================================================================================

This validates the NEW "User Browser" surface that drives Electron WebContentsView tabs by `viewId` via:

  HTTP (POST /api/userbrowser/*) -> session-service -> WS bridge (/userbrowser-bridge) -> Electron main -> WebContentsView(viewId)

It is designed to be NON-DESTRUCTIVE by default:
- does NOT navigate unless you explicitly set USERBROWSER_SMOKE_NAVIGATE_URL
- does NOT click or type into arbitrary pages unless you explicitly set flags

Preconditions:
- session-service running on :9009 (Docker service name: session-service)
- Electron app running (desktop) with the UserBrowser bridge client enabled
- At least one User Browser tab exists (a WebContentsView was created), e.g. via Playground "Open User Browser"

Env vars:
  SESSION_SERVICE_URL=http://localhost:9009
  USERBROWSER_API_TOKEN=...               # optional (sent as x-legion-userbrowser-token)
  USERBROWSER_VIEW_ID=view-1              # optional override
  USERBROWSER_SMOKE_NAVIGATE_URL=https://example.com  # optional, runs /navigate
  TIMEOUT_SEC=20
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


SESSION_SERVICE_URL = os.environ.get("SESSION_SERVICE_URL", "http://localhost:9009").rstrip("/")
TOKEN = os.environ.get("USERBROWSER_API_TOKEN", "")
TIMEOUT_SEC = float(os.environ.get("TIMEOUT_SEC", "20"))
VIEW_ID_OVERRIDE = os.environ.get("USERBROWSER_VIEW_ID", "").strip()
NAV_URL = os.environ.get("USERBROWSER_SMOKE_NAVIGATE_URL", "").strip()


def _now_iso() -> str:
    return _dt.datetime.now().astimezone().isoformat()


def _safe_json_loads(text: str) -> Any:
    try:
        return json.loads(text)
    except Exception:
        return {"_raw": text}


def _redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if "api_key" in lk or "secret" in lk or "token" in lk:
                out[k] = "***REDACTED***"
                continue
            # avoid huge base64 screenshots
            if lk in ("data", "database64", "image", "png") and isinstance(v, str) and len(v) > 200:
                out[k] = f"<redacted len={len(v)}>"
                continue
            out[k] = _redact(v)
        return out
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    return obj


def http_json(
    method: str, url: str, body: Optional[Dict[str, Any]] = None, timeout: float = 10.0
) -> Dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if TOKEN:
        headers["x-legion-userbrowser-token"] = TOKEN
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            text_full = raw.decode("utf-8", errors="replace")
            return {
                "ok": True,
                "status": resp.getcode(),
                "elapsedMs": int((time.time() - started) * 1000),
                "json": _safe_json_loads(text_full),
                "text": text_full[:2000],
            }
    except urllib.error.HTTPError as e:
        try:
            text_full = e.read().decode("utf-8", errors="replace")
        except Exception:
            text_full = ""
        return {
            "ok": False,
            "status": int(getattr(e, "code", 0) or 0),
            "elapsedMs": int((time.time() - started) * 1000),
            "json": _safe_json_loads(text_full),
            "text": text_full[:2000],
        }
    except socket.timeout:
        return {"ok": False, "error": "timeout", "elapsedMs": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "error": repr(e), "elapsedMs": int((time.time() - started) * 1000)}


def write_trace(payload: Dict[str, Any]) -> Tuple[Path, Path]:
    traces_dir = Path(__file__).parent / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = traces_dir / f"smoke_userbrowser_bridge_{stamp}.json"
    md_path = traces_dir / f"smoke_userbrowser_bridge_{stamp}.md"

    safe = _redact(payload)
    json_path.write_text(json.dumps(safe, indent=2), encoding="utf-8")

    failures = safe.get("failures", [])
    if not isinstance(failures, list):
        failures = []

    view_id = safe.get("viewId")
    api = safe.get("api", {})

    md_lines = [
        "# Smoke Test — UserBrowser Bridge (HTTP ⇄ WS ⇄ Electron)",
        "",
        f"- Timestamp: `{safe.get('timestamp')}`",
        f"- Session Service: `{SESSION_SERVICE_URL}`",
        f"- ViewId: `{view_id}`",
        f"- Failures: `{len(failures)}`",
        "",
        "## Results",
        f"- /health: `{(safe.get('health', {}) or {}).get('status')}` ok=`{(safe.get('health', {}) or {}).get('ok')}`",
        f"- list_views: `{(api.get('listViews', {}) or {}).get('status')}` ok=`{(api.get('listViews', {}) or {}).get('ok')}`",
        f"- get_page_info: `{(api.get('getPageInfo', {}) or {}).get('status')}` ok=`{(api.get('getPageInfo', {}) or {}).get('ok')}`",
        f"- screenshot: `{(api.get('screenshot', {}) or {}).get('status')}` ok=`{(api.get('screenshot', {}) or {}).get('ok')}`",
        f"- wait_for(body): `{(api.get('waitForBody', {}) or {}).get('status')}` ok=`{(api.get('waitForBody', {}) or {}).get('ok')}`",
        f"- find(body): `{(api.get('findBody', {}) or {}).get('status')}` ok=`{(api.get('findBody', {}) or {}).get('ok')}`",
    ]

    if NAV_URL:
        md_lines.append(
            f"- navigate: `{(api.get('navigate', {}) or {}).get('status')}` ok=`{(api.get('navigate', {}) or {}).get('ok')}`"
        )

    md_lines.extend(["", "## Notes", ""])
    if failures:
        md_lines.extend(["## Failures", "", "```", "\n".join(str(x) for x in failures)[:9000], "```", ""])
    else:
        md_lines.append("All checks passed.")

    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    report: Dict[str, Any] = {"timestamp": _now_iso()}
    failures: List[str] = []

    # Health check
    health = http_json("GET", f"{SESSION_SERVICE_URL}/health", timeout=5.0)
    report["health"] = health
    if not health.get("ok"):
        failures.append("session-service /health failed")

    # list_views (requires Electron bridge)
    list_views = http_json("POST", f"{SESSION_SERVICE_URL}/api/userbrowser/list_views", body={}, timeout=10.0)
    report["api"] = {"listViews": list_views}

    view_ids: List[str] = []
    if list_views.get("ok") and isinstance(list_views.get("json"), dict):
        v = list_views["json"].get("viewIds")
        if isinstance(v, list):
            view_ids = [x for x in v if isinstance(x, str)]
    report["viewIds"] = view_ids

    if not list_views.get("ok"):
        # Most common cause: Electron not running / bridge not connected.
        j = list_views.get("json")
        if isinstance(j, dict) and isinstance(j.get("error"), str) and "bridge not connected" in j["error"].lower():
            failures.append(
                "Desktop bridge not connected. Start the Electron app and ensure it logs a UserBrowserBridge connection."
            )
        else:
            failures.append("POST /api/userbrowser/list_views failed")
    elif not view_ids:
        failures.append(
            "No User Browser tabs found. Open a User Browser tab in Electron (Playground → Open User Browser)."
        )

    # Choose viewId
    chosen = VIEW_ID_OVERRIDE or (view_ids[0] if view_ids else "")
    report["viewId"] = chosen
    if VIEW_ID_OVERRIDE and VIEW_ID_OVERRIDE not in view_ids:
        failures.append(f"USERBROWSER_VIEW_ID={VIEW_ID_OVERRIDE} not found in list_views")

    # If we don't have a viewId, stop here (but still write trace)
    if not chosen:
        report["failures"] = failures
        jp, mp = write_trace(report)
        print(str(jp))
        print(str(mp))
        return 2

    # get_page_info
    gpi = http_json(
        "POST", f"{SESSION_SERVICE_URL}/api/userbrowser/get_page_info", body={"viewId": chosen}, timeout=10.0
    )
    report["api"]["getPageInfo"] = gpi
    if not gpi.get("ok"):
        failures.append("get_page_info failed (bridge may be disconnected or viewId invalid)")

    # screenshot
    shot = http_json("POST", f"{SESSION_SERVICE_URL}/api/userbrowser/screenshot", body={"viewId": chosen}, timeout=20.0)
    report["api"]["screenshot"] = shot
    if not shot.get("ok"):
        failures.append("screenshot failed")

    # wait_for body visible
    wait_body = http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/api/userbrowser/wait_for",
        body={"viewId": chosen, "selector": "body", "state": "visible", "timeoutMs": 8000},
        timeout=15.0,
    )
    report["api"]["waitForBody"] = wait_body
    if not wait_body.get("ok"):
        failures.append("wait_for(body) failed")

    # find body
    find_body = http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/api/userbrowser/find",
        body={"viewId": chosen, "selector": "body", "limit": 1, "visibleOnly": True, "timeoutMs": 3000},
        timeout=10.0,
    )
    report["api"]["findBody"] = find_body
    if not find_body.get("ok"):
        failures.append("find(body) failed")

    # Optional navigation (explicitly opt-in)
    if NAV_URL:
        nav = http_json(
            "POST",
            f"{SESSION_SERVICE_URL}/api/userbrowser/navigate",
            body={"viewId": chosen, "url": NAV_URL},
            timeout=TIMEOUT_SEC,
        )
        report["api"]["navigate"] = nav
        if not nav.get("ok"):
            failures.append("navigate failed")

    report["failures"] = failures
    jp, mp = write_trace(report)
    print(str(jp))
    print(str(mp))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())


