#!/usr/bin/env python3
"""
opencode_probe.py — Non-hanging OpenCode API/SSE probe
======================================================

Goal:
- Probe OpenCode server endpoints WITHOUT hanging Cursor.
- Use strict timeouts for every network call.
- Write a timestamped report into recursive-self-intelligence-tools/traces/.

This script intentionally avoids triggering long-running LLM calls by default.
It can optionally attempt a short /session/:id/message call (with a very short timeout)
to capture response shape / error behavior.

Usage:
  python3 recursive-self-intelligence-tools/opencode_probe.py

Optional env vars:
  OPENCODE_URL=http://localhost:4096
  OPENCODE_DIRECTORY=/workspace
  OPENCODE_ACTIVE_TIMEOUT_SEC=2.0   # timeout for the optional "active" message call
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


BASE_URL = os.environ.get("OPENCODE_URL", "http://localhost:4096").rstrip("/")
DIRECTORY = os.environ.get("OPENCODE_DIRECTORY", "/workspace")
ACTIVE_TIMEOUT_SEC = float(os.environ.get("OPENCODE_ACTIVE_TIMEOUT_SEC", "2.0"))


def _now_iso() -> str:
    return _dt.datetime.now().astimezone().isoformat()


def _safe_json_loads(text: str) -> Any:
    try:
        return json.loads(text)
    except Exception:
        return {"_raw": text}


def _redact(obj: Any) -> Any:
    """
    Best-effort redaction so we don't accidentally write secrets into traces.
    """
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if "api_key" in lk or (lk.endswith("key") and len(lk) <= 32) or "secret" in lk or "token" in lk:
                out[k] = "***REDACTED***"
            else:
                out[k] = _redact(v)
        return out
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    return obj


def http_request(
    method: str,
    path: str,
    *,
    json_body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 5.0,
) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    data: Optional[bytes] = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=req_headers, method=method.upper())
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            text = raw.decode("utf-8", errors="replace")
            elapsed_ms = int((time.time() - started) * 1000)
            return {
                "ok": True,
                "url": url,
                "status": resp.getcode(),
                "headers": dict(resp.headers.items()),
                "elapsedMs": elapsed_ms,
                "text": text,
                "json": _safe_json_loads(text),
            }
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "ok": False,
            "url": url,
            "status": int(getattr(e, "code", 0) or 0),
            "reason": str(getattr(e, "reason", "")),
            "elapsedMs": elapsed_ms,
            "text": body,
            "json": _safe_json_loads(body),
        }
    except socket.timeout:
        elapsed_ms = int((time.time() - started) * 1000)
        return {"ok": False, "url": url, "error": "timeout", "elapsedMs": elapsed_ms}
    except Exception as e:
        elapsed_ms = int((time.time() - started) * 1000)
        return {"ok": False, "url": url, "error": repr(e), "elapsedMs": elapsed_ms}


def sse_collect(path: str, *, max_events: int = 5, timeout: float = 3.0) -> Dict[str, Any]:
    """
    Collect a few SSE events and then stop. Uses socket timeouts so it won't hang.
    """
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, headers={"Accept": "text/event-stream"}, method="GET")
    started = time.time()
    events: List[Any] = []
    buf: List[str] = []

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            # Read line-by-line until we have enough events or timeout trips.
            while len(events) < max_events:
                try:
                    line_b = resp.readline()
                except socket.timeout:
                    break
                if not line_b:
                    break
                line = line_b.decode("utf-8", errors="replace").rstrip("\r\n")
                if not line:
                    if buf:
                        data_str = "\n".join(buf)
                        buf = []
                        events.append(_safe_json_loads(data_str))
                    continue
                if line.startswith("data:"):
                    buf.append(line[len("data:") :].lstrip())
                # ignore: event:, id:, retry:
    except socket.timeout:
        pass
    except Exception as e:
        return {"ok": False, "url": url, "error": repr(e), "events": events}

    elapsed_ms = int((time.time() - started) * 1000)
    return {"ok": True, "url": url, "elapsedMs": elapsed_ms, "events": events}


def write_reports(payload: Dict[str, Any]) -> Tuple[Path, Path]:
    traces_dir = Path(__file__).parent / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)

    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = traces_dir / f"opencode_probe_{stamp}.json"
    md_path = traces_dir / f"opencode_probe_{stamp}.md"

    safe = _redact(payload)
    json_path.write_text(json.dumps(safe, indent=2, sort_keys=False), encoding="utf-8")

    # Compact markdown summary
    cfg = safe.get("config", {})
    cfg_model = None
    if isinstance(cfg, dict):
        cfg_model = cfg.get("json", {}).get("model") if isinstance(cfg.get("json"), dict) else None

    md_lines = [
        "# OpenCode Probe",
        "",
        f"- Timestamp: `{safe.get('timestamp')}`",
        f"- Base URL: `{safe.get('baseUrl')}`",
        f"- Directory: `{safe.get('directory')}`",
        "",
        "## Key Findings",
        f"- `/config` ok: `{cfg.get('ok')}` status: `{cfg.get('status')}`",
        f"- Config default model: `{cfg_model}`",
        f"- Created sessionId: `{(safe.get('session', {}).get('json') or {}).get('id')}`",
        "",
        "## Endpoint Status",
        "",
        "```json",
        json.dumps(
            {
                "GET /event": safe.get("eventSse", {}).get("ok"),
                "GET /mcp": safe.get("mcp", {}).get("status"),
                "POST /session": safe.get("session", {}).get("status"),
                "POST /session/:id/message (noReply)": safe.get("message_noReply", {}).get("status"),
                "POST /session/:id/message (active short timeout)": safe.get("message_active", {}).get("status")
                if isinstance(safe.get("message_active"), dict)
                else None,
            },
            indent=2,
        ),
        "```",
        "",
        "## SSE Sample (first events)",
        "",
        "```json",
        json.dumps(safe.get("eventSse", {}).get("events", []), indent=2)[:6000],
        "```",
        "",
    ]
    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    report: Dict[str, Any] = {
        "timestamp": _now_iso(),
        "baseUrl": BASE_URL,
        "directory": DIRECTORY,
    }

    report["config"] = http_request("GET", "/config", timeout=3.0)
    report["mcp"] = http_request("GET", "/mcp", timeout=3.0)

    # SSE connect (grab a few events and stop)
    report["eventSse"] = sse_collect(f"/event?directory={urllib.request.quote(DIRECTORY)}", max_events=5, timeout=3.0)

    # Create a session
    sess = http_request("POST", "/session", json_body={"title": "meeseeks opencode_probe"}, timeout=3.0)
    report["session"] = sess

    session_id = None
    try:
        if isinstance(sess.get("json"), dict):
            session_id = sess["json"].get("id")
    except Exception:
        session_id = None

    # Probe message endpoint safely (noReply=true => should not call LLM)
    if session_id:
        report["message_noReply"] = http_request(
            "POST",
            f"/session/{session_id}/message",
            json_body={
                "noReply": True,
                "parts": [{"type": "text", "text": "probe: noReply=true (should be fast)"}],
            },
            timeout=3.0,
        )

        # Optional: attempt an "active" call with a VERY short timeout to capture error shape quickly.
        # This may still fail fast if the model/provider isn't configured, which is useful diagnostic data.
        report["message_active"] = http_request(
            "POST",
            f"/session/{session_id}/message",
            json_body={
                "parts": [{"type": "text", "text": "probe: active call (short timeout)"}],
            },
            timeout=ACTIVE_TIMEOUT_SEC,
        )

        # Fetch messages list (fast)
        report["messages_list"] = http_request("GET", f"/session/{session_id}/message?limit=5", timeout=3.0)

    json_path, md_path = write_reports(report)
    print(str(json_path))
    print(str(md_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


