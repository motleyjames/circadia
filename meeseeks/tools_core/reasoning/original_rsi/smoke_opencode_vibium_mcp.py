#!/usr/bin/env python3
"""
smoke_opencode_vibium_mcp.py — Safe end-to-end smoke test (OpenCode ⇄ Remote MCP ⇄ Session-Service ⇄ Vibium)
==========================================================================================================

This is a NON-HANGING smoke test:
- strict timeouts on every request
- writes a timestamped trace into recursive-self-intelligence-tools/traces/

It validates:
1) OpenCode can call the remote MCP server ("vibium") successfully
2) session-service receives the tool call and executes it against a real browser session
3) The model completes with a short text summary (we instruct it explicitly)
4) Direct session-service MCP (/mcp) responds to tools/list + tools/call (including a missing-sessionId negative test)
5) Tool calls actually executed (verified via /api/sessions/:id/history)

Env vars:
  OPENCODE_URL=http://localhost:4096
  SESSION_SERVICE_URL=http://localhost:9009
  TIMEOUT_SEC=30
  SMOKE_MAX_TEXT_CHARS=20000   # truncate large HTTP bodies in traces
  SMOKE_MAX_STR_CHARS=4000     # truncate large strings in traces (e.g., screenshot base64)
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


OPENCODE_URL = os.environ.get("OPENCODE_URL", "http://localhost:4096").rstrip("/")
SESSION_SERVICE_URL = os.environ.get("SESSION_SERVICE_URL", "http://localhost:9009").rstrip("/")
TIMEOUT_SEC = float(os.environ.get("TIMEOUT_SEC", "30"))
MAX_TEXT_CHARS = int(os.environ.get("SMOKE_MAX_TEXT_CHARS", "20000"))
MAX_STR_CHARS = int(os.environ.get("SMOKE_MAX_STR_CHARS", "4000"))


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
            # Secrets
            if "api_key" in lk or "secret" in lk or "token" in lk:
                out[k] = "***REDACTED***"
                continue
            # Huge base64 blobs (screenshots)
            if lk == "data" and isinstance(v, str) and len(v) > 200:
                out[k] = f"<redacted data len={len(v)}>"
                continue
            else:
                out[k] = _redact(v)
        return out
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    if isinstance(obj, str) and len(obj) > MAX_STR_CHARS:
        head = obj[: max(200, MAX_STR_CHARS // 2)]
        tail = obj[-max(80, MAX_STR_CHARS // 4) :]
        return f"{head}...<TRUNCATED len={len(obj)}>...{tail}"
    return obj


def http_json(method: str, url: str, body: Optional[Dict[str, Any]] = None, timeout: float = 10.0) -> Dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            text_full = raw.decode("utf-8", errors="replace")
            text = text_full if len(text_full) <= MAX_TEXT_CHARS else (text_full[:MAX_TEXT_CHARS] + f"...<TRUNCATED len={len(text_full)}>")
            return {
                "ok": True,
                "status": resp.getcode(),
                "elapsedMs": int((time.time() - started) * 1000),
                "json": _safe_json_loads(text_full),
                "text": text,
            }
    except urllib.error.HTTPError as e:
        try:
            text_full = e.read().decode("utf-8", errors="replace")
        except Exception:
            text_full = ""
        text = text_full if len(text_full) <= MAX_TEXT_CHARS else (text_full[:MAX_TEXT_CHARS] + f"...<TRUNCATED len={len(text_full)}>")
        return {
            "ok": False,
            "status": int(getattr(e, "code", 0) or 0),
            "elapsedMs": int((time.time() - started) * 1000),
            "json": _safe_json_loads(text_full),
            "text": text,
        }
    except socket.timeout:
        return {"ok": False, "error": "timeout", "elapsedMs": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "error": repr(e), "elapsedMs": int((time.time() - started) * 1000)}


def _jsonrpc(method: str, *, rpc_id: int, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params}


def mcp_tools_list(timeout: float = 10.0) -> Dict[str, Any]:
    return http_json("POST", f"{SESSION_SERVICE_URL}/mcp", body=_jsonrpc("tools/list", rpc_id=1, params={}), timeout=timeout)


def mcp_tool_call(name: str, arguments: Dict[str, Any], *, rpc_id: int, timeout: float = 30.0) -> Dict[str, Any]:
    return http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/mcp",
        body=_jsonrpc("tools/call", rpc_id=rpc_id, params={"name": name, "arguments": arguments}),
        timeout=timeout,
    )


def summarize_tool_result(tool_call_resp: Dict[str, Any]) -> Dict[str, Any]:
    """
    Summarize an MCP JSON-RPC tools/call response into a compact, stable shape
    (avoids huge screenshot base64 in traces).
    """
    out: Dict[str, Any] = {"ok": tool_call_resp.get("ok"), "status": tool_call_resp.get("status")}
    j = tool_call_resp.get("json")
    if not isinstance(j, dict):
        out["error"] = "non_object_json"
        return out

    result = j.get("result")
    if not isinstance(result, dict):
        out["error"] = "missing_result"
        out["resultType"] = type(result).__name__
        return out

    content = result.get("content", [])
    out["isError"] = bool(result.get("isError", False))
    out["contentTypes"] = []
    out["text"] = None
    out["imageDataLen"] = None

    if isinstance(content, list):
        types: List[str] = []
        for c in content:
            if not isinstance(c, dict):
                continue
            t = c.get("type")
            if isinstance(t, str):
                types.append(t)
            if c.get("type") == "text" and out["text"] is None and isinstance(c.get("text"), str):
                out["text"] = c.get("text")[:500]
            if c.get("type") == "image" and isinstance(c.get("data"), str):
                out["imageDataLen"] = len(c["data"])
        out["contentTypes"] = types
    return out


def _as_int_ms(v: Any) -> Optional[int]:
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit():
            try:
                return int(s)
            except Exception:
                return None
    return None


def write_trace(payload: Dict[str, Any]) -> Tuple[Path, Path]:
    traces_dir = Path(__file__).parent / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = traces_dir / f"smoke_opencode_vibium_mcp_{stamp}.json"
    md_path = traces_dir / f"smoke_opencode_vibium_mcp_{stamp}.md"

    safe = _redact(payload)
    json_path.write_text(json.dumps(safe, indent=2), encoding="utf-8")

    oc = safe.get("opencode", {})
    ss = safe.get("sessionService", {})
    failures = safe.get("failures", [])
    if not isinstance(failures, list):
        failures = []
    md = [
        "# Smoke Test — OpenCode ⇄ Vibium MCP",
        "",
        f"- Timestamp: `{safe.get('timestamp')}`",
        f"- OpenCode: `{OPENCODE_URL}`",
        f"- Session Service: `{SESSION_SERVICE_URL}`",
        "",
        "## IDs",
        f"- Browser sessionId: `{safe.get('browserSessionId')}`",
        f"- OpenCode sessionId: `{safe.get('opencodeSessionId')}`",
        "",
        "## Results",
        f"- Create browser session: `{ss.get('createSession', {}).get('status')}` ok=`{ss.get('createSession', {}).get('ok')}`",
        f"- Session-service MCP tools/list: `{(ss.get('mcpToolsList', {}) or {}).get('status')}` ok=`{(ss.get('mcpToolsList', {}) or {}).get('ok')}`",
        f"- Session-service MCP missing-sessionId negative: ok=`{(ss.get('mcpMissingSessionId', {}) or {}).get('ok')}` isError=`{(ss.get('mcpMissingSessionIdSummary', {}) or {}).get('isError')}`",
        f"- Direct MCP get_page_info: isError=`{(ss.get('mcpDirectGetPageInfoSummary', {}) or {}).get('isError')}`",
        f"- OpenCode tool execution verified via /history: ok=`{(ss.get('historySummary', {}) or {}).get('ok')}` typesSinceMessage=`{(ss.get('historySummary', {}) or {}).get('typesSinceMessage')}`",
        f"- MCP screenshot: isError=`{(ss.get('mcpScreenshotSummary', {}) or {}).get('isError')}` imageLen=`{(ss.get('mcpScreenshotSummary', {}) or {}).get('imageDataLen')}`",
        f"- MCP highlight: isError=`{(ss.get('mcpHighlightSummary', {}) or {}).get('isError')}` imageLen=`{(ss.get('mcpHighlightSummary', {}) or {}).get('imageDataLen')}`",
        f"- MCP quit(pause): isError=`{(ss.get('mcpQuitSummary', {}) or {}).get('isError')}`",
        f"- MCP post-quit auto-resume: isError=`{(ss.get('mcpPostQuitGetPageInfoSummary', {}) or {}).get('isError')}`",
        f"- Create OpenCode session: `{oc.get('createSession', {}).get('status')}` ok=`{oc.get('createSession', {}).get('ok')}`",
        f"- Send OpenCode message: `{oc.get('message', {}).get('status')}` ok=`{oc.get('message', {}).get('ok')}`",
        f"- Failures: `{len(failures)}`",
        "",
        "## OpenCode response (trimmed)",
        "",
        "```json",
        json.dumps(oc.get("message", {}).get("json", {}), indent=2)[:9000],
        "```",
        "",
    ]
    if failures:
        md.extend([
            "## Failures",
            "",
            "```",
            "\n".join(str(x) for x in failures)[:9000],
            "```",
            "",
        ])
    md_path.write_text("\n".join(md), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    report: Dict[str, Any] = {"timestamp": _now_iso()}
    failures: List[str] = []

    # Health checks (fast signal when docker isn't up)
    report["health"] = {
        "sessionService": http_json("GET", f"{SESSION_SERVICE_URL}/health", timeout=5.0),
        "opencodeConfig": http_json("GET", f"{OPENCODE_URL}/config", timeout=5.0),
    }
    if not report["health"]["sessionService"].get("ok"):
        failures.append("session-service /health failed")
    if not report["health"]["opencodeConfig"].get("ok"):
        failures.append("opencode /config failed")

    # 1) Create a Vibium browser session (real session-service)
    create_browser = http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/api/sessions",
        body={"name": "smoke-opencode-vibium-mcp"},
        timeout=10.0,
    )
    report["sessionService"] = {"createSession": create_browser}
    browser_session_id = None
    if create_browser.get("ok") and isinstance(create_browser.get("json"), dict):
        browser_session_id = create_browser["json"].get("sessionId")
    report["browserSessionId"] = browser_session_id

    # 1b) Direct MCP sanity (tools/list) + missing-sessionId negative test.
    tl = mcp_tools_list(timeout=10.0)
    report["sessionService"]["mcpToolsList"] = tl
    tool_names: List[str] = []
    if tl.get("ok") and isinstance(tl.get("json"), dict):
        tools = ((tl["json"].get("result") or {}) if isinstance(tl["json"].get("result"), dict) else {}).get("tools", [])
        if isinstance(tools, list):
            for t in tools:
                if isinstance(t, dict) and isinstance(t.get("name"), str):
                    tool_names.append(t["name"])
    report["sessionService"]["mcpToolNames"] = tool_names
    expected_tools = {"browser_get_page_info", "browser_scroll", "browser_find", "browser_highlight", "browser_screenshot"}
    missing = sorted([t for t in expected_tools if t not in set(tool_names)])
    report["sessionService"]["mcpExpectedMissing"] = missing
    if not tl.get("ok"):
        failures.append("session-service /mcp tools/list failed")
    if missing:
        failures.append(f"session-service /mcp missing expected tools: {missing}")

    missing_sid = mcp_tool_call("browser_get_page_info", {}, rpc_id=2, timeout=10.0)
    report["sessionService"]["mcpMissingSessionId"] = missing_sid
    report["sessionService"]["mcpMissingSessionIdSummary"] = summarize_tool_result(missing_sid)
    if not report["sessionService"]["mcpMissingSessionIdSummary"].get("isError"):
        failures.append("mcp missing-sessionId test did not return isError=true")

    # 1c) Direct MCP positive sanity: call a tool with a real sessionId.
    if browser_session_id:
        direct_info = mcp_tool_call("browser_get_page_info", {"sessionId": browser_session_id}, rpc_id=3, timeout=15.0)
        report["sessionService"]["mcpDirectGetPageInfo"] = direct_info
        report["sessionService"]["mcpDirectGetPageInfoSummary"] = summarize_tool_result(direct_info)
        if report["sessionService"]["mcpDirectGetPageInfoSummary"].get("isError"):
            failures.append("mcp direct browser_get_page_info returned isError=true")

    # 2) Create an OpenCode session
    create_oc = http_json("POST", f"{OPENCODE_URL}/session", body={"title": "smoke-opencode-vibium-mcp"}, timeout=10.0)
    report["opencode"] = {"createSession": create_oc}
    oc_session_id = None
    if create_oc.get("ok") and isinstance(create_oc.get("json"), dict):
        oc_session_id = create_oc["json"].get("id")
    report["opencodeSessionId"] = oc_session_id

    # If we couldn't create IDs, write trace and exit early.
    if not browser_session_id or not oc_session_id:
        report["failures"] = failures
        jp, mp = write_trace(report)
        print(str(jp))
        print(str(mp))
        return 2

    # 3) Send a message that forces vibium MCP tools and requires a final text summary.
    system = f"""
You are an automation agent running inside OpenCode.

CRITICAL:
- Use ONLY vibium MCP tools (names start with vibium_browser_).
- Every vibium tool call MUST include sessionId = \"{browser_session_id}\" exactly.
- Do NOT create a new browser session.
- Always end with a short user-facing summary of what happened.

Task:
1) Call vibium_browser_get_page_info.
2) Call vibium_browser_scroll with deltaY=600.
3) Call vibium_browser_get_page_info again.
4) Reply with a short text summary including the before/after URL (if present).
""".strip()

    msg_started_ms = int(time.time() * 1000)
    report["opencode"]["messageStartedMs"] = msg_started_ms
    msg = http_json(
        "POST",
        f"{OPENCODE_URL}/session/{oc_session_id}/message",
        body={
            "system": system,
            "parts": [{"type": "text", "text": "Run the smoke test now."}],
        },
        timeout=TIMEOUT_SEC,
    )
    report["opencode"]["message"] = msg

    # 4) Verify tool execution actually happened by checking session history types.
    hist = http_json("GET", f"{SESSION_SERVICE_URL}/api/sessions/{browser_session_id}/history", timeout=10.0)
    report["sessionService"]["history"] = hist
    types: List[str] = []
    filtered_types: List[str] = []
    if hist.get("ok"):
        j = hist.get("json")
        if isinstance(j, list):
            for row in j:
                if isinstance(row, dict) and isinstance(row.get("type"), str):
                    types.append(row["type"])
                    ts = _as_int_ms(row.get("timestamp"))
                    if ts is not None and ts >= msg_started_ms:
                        filtered_types.append(row["type"])
    types_set = sorted(set(types))
    filtered_set = sorted(set(filtered_types))
    report["sessionService"]["historySummary"] = {
        "ok": bool(hist.get("ok")),
        "count": len(types),
        "types": types_set,
        "countSinceMessage": len(filtered_types),
        "typesSinceMessage": filtered_set,
    }
    if "scroll" not in filtered_set:
        failures.append("expected 'scroll' in /history typesSinceMessage (OpenCode tool execution not observed)")
    if "getPageInfo" not in filtered_set:
        failures.append("expected 'getPageInfo' in /history typesSinceMessage (OpenCode tool execution not observed)")

    # 5) Post-flight MCP feature spot-checks (kept after /history to avoid huge DB fetches).
    # Screenshot (ensures BiDi captureScreenshot path works end-to-end through MCP).
    shot = mcp_tool_call("browser_screenshot", {"sessionId": browser_session_id}, rpc_id=4, timeout=30.0)
    report["sessionService"]["mcpScreenshot"] = shot
    report["sessionService"]["mcpScreenshotSummary"] = summarize_tool_result(shot)
    if report["sessionService"]["mcpScreenshotSummary"].get("isError"):
        failures.append("mcp browser_screenshot returned isError=true")

    # Highlight (ensures evaluate + screenshot sequence works). Use 'body' which exists even on about:blank.
    hl = mcp_tool_call("browser_highlight", {"sessionId": browser_session_id, "selector": "body"}, rpc_id=5, timeout=30.0)
    report["sessionService"]["mcpHighlight"] = hl
    report["sessionService"]["mcpHighlightSummary"] = summarize_tool_result(hl)
    if report["sessionService"]["mcpHighlightSummary"].get("isError"):
        failures.append("mcp browser_highlight returned isError=true")

    # Quit/pause semantics (non-destructive), then auto-resume on next tool call.
    quit_res = mcp_tool_call("browser_quit", {"sessionId": browser_session_id}, rpc_id=6, timeout=30.0)
    report["sessionService"]["mcpQuit"] = quit_res
    report["sessionService"]["mcpQuitSummary"] = summarize_tool_result(quit_res)
    # We don't hard-fail on pause errors (cookie APIs can be finicky), but we record.

    sess_after_quit = http_json("GET", f"{SESSION_SERVICE_URL}/api/sessions/{browser_session_id}", timeout=10.0)
    report["sessionService"]["sessionAfterQuit"] = sess_after_quit

    # Auto-resume check: calling get_page_info should resume if paused.
    resume_info = mcp_tool_call("browser_get_page_info", {"sessionId": browser_session_id}, rpc_id=7, timeout=30.0)
    report["sessionService"]["mcpPostQuitGetPageInfo"] = resume_info
    report["sessionService"]["mcpPostQuitGetPageInfoSummary"] = summarize_tool_result(resume_info)
    if report["sessionService"]["mcpPostQuitGetPageInfoSummary"].get("isError"):
        failures.append("mcp browser_get_page_info failed after browser_quit (auto-resume may be broken)")

    sess_after_resume = http_json("GET", f"{SESSION_SERVICE_URL}/api/sessions/{browser_session_id}", timeout=10.0)
    report["sessionService"]["sessionAfterResume"] = sess_after_resume

    report["failures"] = failures

    jp, mp = write_trace(report)
    print(str(jp))
    print(str(mp))
    if failures:
        return 1
    return 0 if msg.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())


