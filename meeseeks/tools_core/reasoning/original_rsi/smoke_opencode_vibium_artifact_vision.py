#!/usr/bin/env python3
"""
smoke_opencode_vibium_artifact_vision.py — OpenCode-driven browsing + highlight→artifact + vision verify
=====================================================================================================

This smoke test proves the OpenCode orchestration pattern WITHOUT requiring the Electron UserBrowser bridge.

End-to-end:
  OpenCode → (tool calls) → session-service /mcp (AgenticBrowser) → highlight screenshot → artifact file → vision subagent verifies

It is designed to be NON-HANGING:
- strict timeouts on every request
- writes timestamped traces into recursive-self-intelligence-tools/traces/

Prereqs:
- session-service running on :9009
- opencode running on :4096

This uses local OpenCode tools (loaded from /workspace/.opencode/tool):
- vibium_navigate
- vibium_highlight_to_artifact
- vision_verify_artifact

Env vars:
  OPENCODE_URL=http://localhost:4096
  SESSION_SERVICE_URL=http://localhost:9009
  TIMEOUT_SEC=90
  SMOKE_NAVIGATE_URL=https://example.com
  SMOKE_HIGHLIGHT_SELECTOR=h1
  SMOKE_HIGHLIGHT_COLOR=#ff2cff

Vision options:
  SMOKE_SKIP_VISION=1
  SMOKE_REQUIRE_VISION=1
  SMOKE_VISION_MODEL=anthropic/claude-opus-4-6
"""

from __future__ import annotations

import datetime as _dt
import hashlib
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
TIMEOUT_SEC = float(os.environ.get("TIMEOUT_SEC", "90"))

NAV_URL = os.environ.get("SMOKE_NAVIGATE_URL", "https://example.com").strip() or "https://example.com"
HIGHLIGHT_SELECTOR = os.environ.get("SMOKE_HIGHLIGHT_SELECTOR", "h1").strip() or "h1"
HIGHLIGHT_COLOR = os.environ.get("SMOKE_HIGHLIGHT_COLOR", "#ff2cff").strip() or "#ff2cff"

SKIP_VISION = os.environ.get("SMOKE_SKIP_VISION", "").strip() == "1"
REQUIRE_VISION = os.environ.get("SMOKE_REQUIRE_VISION", "").strip() == "1"
VISION_MODEL = os.environ.get("SMOKE_VISION_MODEL", "anthropic/claude-opus-4-6").strip()


def _now_iso() -> str:
    return _dt.datetime.now().astimezone().isoformat()


def _safe_json_loads(text: str) -> Any:
    try:
        return json.loads(text)
    except Exception:
        return {"_raw": text}


def _truncate_str(s: str, max_len: int = 12000) -> str:
    if len(s) <= max_len:
        return s
    head = s[: max(200, max_len // 2)]
    tail = s[-max(200, max_len // 3) :]
    return f"{head}...<TRUNCATED len={len(s)}>...{tail}"


def _redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if "api_key" in lk or "secret" in lk or "token" in lk:
                out[k] = "***REDACTED***"
            else:
                out[k] = _redact(v)
        return out
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    if isinstance(obj, str):
        return _truncate_str(obj, 12000)
    return obj


def http_json(
    method: str,
    url: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    timeout: float = 10.0,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method.upper())

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
                "text": _truncate_str(text_full, 20000),
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
            "text": _truncate_str(text_full, 20000),
        }
    except socket.timeout:
        return {"ok": False, "error": "timeout", "elapsedMs": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "error": repr(e), "elapsedMs": int((time.time() - started) * 1000)}


def _workspace_root_host() -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    return repo_root / "docker" / "legion-workspace"


def _workspace_path_to_host(p: str) -> Optional[Path]:
    if not isinstance(p, str):
        return None
    prefix = "/workspace/"
    if not p.startswith(prefix):
        return None
    rel = p[len(prefix) :]
    return _workspace_root_host() / rel


def write_trace(payload: Dict[str, Any]) -> Tuple[Path, Path]:
    traces_dir = Path(__file__).parent / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = traces_dir / f"smoke_opencode_vibium_artifact_vision_{stamp}.json"
    md_path = traces_dir / f"smoke_opencode_vibium_artifact_vision_{stamp}.md"

    safe = _redact(payload)
    json_path.write_text(json.dumps(safe, indent=2), encoding="utf-8")

    failures = safe.get("failures", [])
    if not isinstance(failures, list):
        failures = []

    md_lines = [
        "# Smoke Test — OpenCode Vibium Browse + Highlight→Artifact + Vision",
        "",
        f"- Timestamp: `{safe.get('timestamp')}`",
        f"- OpenCode: `{OPENCODE_URL}`",
        f"- Session Service: `{SESSION_SERVICE_URL}`",
        f"- Browser sessionId: `{safe.get('browserSessionId')}`",
        f"- OpenCode sessionId: `{safe.get('opencodeSessionId')}`",
        f"- Navigate URL: `{safe.get('navigateUrl')}`",
        f"- Highlight selector: `{safe.get('highlightSelector')}`",
        f"- Failures: `{len(failures)}`",
        "",
        "## Results",
        f"- /health session-service: `{(safe.get('health', {}) or {}).get('sessionService', {}).get('status')}` ok=`{(safe.get('health', {}) or {}).get('sessionService', {}).get('ok')}`",
        f"- /config opencode: `{(safe.get('health', {}) or {}).get('opencodeConfig', {}).get('status')}` ok=`{(safe.get('health', {}) or {}).get('opencodeConfig', {}).get('ok')}`",
        f"- tools loaded: vibium_highlight_to_artifact: `{(safe.get('opencode', {}) or {}).get('hasVibiumHighlightToArtifact')}`",
        f"- tools loaded: vision_verify_artifact: `{(safe.get('opencode', {}) or {}).get('hasVisionVerifyArtifact')}`",
        f"- security artifactDir traversal rejected: `{(safe.get('security', {}) or {}).get('artifactDirTraversalRejected')}`",
        f"- security vision fileUrl jail rejected: `{(safe.get('security', {}) or {}).get('visionFileUrlJailRejected')}`",
        f"- navigate tool ok: `{(safe.get('steps', {}) or {}).get('navigate', {}).get('ok')}`",
        f"- highlight→artifact tool ok: `{(safe.get('steps', {}) or {}).get('highlightToArtifact', {}).get('ok')}`",
        f"- artifact exists: `{(safe.get('artifact', {}) or {}).get('exists')}` bytes=`{(safe.get('artifact', {}) or {}).get('bytes')}`",
        f"- vision skipped: `{(safe.get('vision', {}) or {}).get('skipped')}`",
        "",
    ]

    if failures:
        md_lines.extend(["## Failures", "", "```", "\n".join(str(x) for x in failures)[:9000], "```", ""])
    else:
        md_lines.append("All checks passed.")

    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    report: Dict[str, Any] = {"timestamp": _now_iso(), "navigateUrl": NAV_URL, "highlightSelector": HIGHLIGHT_SELECTOR}
    failures: List[str] = []

    # Health checks
    report["health"] = {
        "sessionService": http_json("GET", f"{SESSION_SERVICE_URL}/health", timeout=5.0),
        "opencodeConfig": http_json("GET", f"{OPENCODE_URL}/config", timeout=5.0),
    }
    if not report["health"]["sessionService"].get("ok"):
        failures.append("session-service /health failed")
    if not report["health"]["opencodeConfig"].get("ok"):
        failures.append("opencode /config failed")

    # Create a vibium/session-service AgenticBrowser session
    create_browser = http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/api/sessions",
        body={"name": "smoke-opencode-vibium-artifact-vision"},
        timeout=10.0,
    )
    report["sessionService"] = {"createSession": create_browser}
    browser_session_id = None
    if create_browser.get("ok") and isinstance(create_browser.get("json"), dict):
        browser_session_id = create_browser["json"].get("sessionId")
    report["browserSessionId"] = browser_session_id
    if not browser_session_id:
        failures.append("Failed to create session-service browser session")

    # OpenCode tool registry: ensure our tools are present
    tool_ids = http_json("GET", f"{OPENCODE_URL}/experimental/tool/ids", timeout=10.0)
    report["opencode"] = {"toolIds": tool_ids}
    ids: List[str] = []
    if tool_ids.get("ok") and isinstance(tool_ids.get("json"), list):
        ids = [x for x in tool_ids["json"] if isinstance(x, str)]
    report["opencode"]["hasVibiumHighlightToArtifact"] = "vibium_highlight_to_artifact" in ids
    report["opencode"]["hasVibiumNavigate"] = "vibium_navigate" in ids
    report["opencode"]["hasVisionVerifyArtifact"] = "vision_verify_artifact" in ids
    if "vibium_highlight_to_artifact" not in ids:
        failures.append("OpenCode missing tool: vibium_highlight_to_artifact (restart opencode?)")
    if "vibium_navigate" not in ids:
        failures.append("OpenCode missing tool: vibium_navigate (restart opencode?)")
    if "vision_verify_artifact" not in ids:
        failures.append("OpenCode missing tool: vision_verify_artifact")

    # Create OpenCode session
    create_oc = http_json("POST", f"{OPENCODE_URL}/session", body={"title": "smoke-opencode-vibium-artifact-vision"}, timeout=10.0)
    report["opencode"]["createSession"] = create_oc
    oc_session_id = None
    if create_oc.get("ok") and isinstance(create_oc.get("json"), dict):
        oc_session_id = create_oc["json"].get("id")
    report["opencodeSessionId"] = oc_session_id
    if not oc_session_id:
        failures.append("Failed to create OpenCode session")

    if failures or not browser_session_id or not oc_session_id:
        report["failures"] = failures
        jp, mp = write_trace(report)
        print(str(jp))
        print(str(mp))
        return 2

    def tools_allow_only(allowed: List[str]) -> Dict[str, bool]:
        m = {tid: False for tid in ids}
        for a in allowed:
            if a in m:
                m[a] = True
        return m

    def oc_message(*, system: str, tools: Dict[str, bool], text: str, timeout: float) -> Dict[str, Any]:
        return http_json(
            "POST",
            f"{OPENCODE_URL}/session/{oc_session_id}/message",
            body={
                "system": system,
                "tools": tools,
                "parts": [{"type": "text", "text": text}],
            },
            timeout=timeout,
        )

    def msg_parent_id(msg_resp: Dict[str, Any]) -> Optional[str]:
        j = msg_resp.get("json")
        if not isinstance(j, dict):
            return None
        info = j.get("info")
        if not isinstance(info, dict):
            return None
        pid = info.get("parentID")
        return pid if isinstance(pid, str) and pid.strip() else None

    def oc_list_messages(*, limit: int = 50) -> List[Dict[str, Any]]:
        resp = http_json("GET", f"{OPENCODE_URL}/session/{oc_session_id}/message?limit={limit}", timeout=10.0)
        if resp.get("ok") and isinstance(resp.get("json"), list):
            return [x for x in resp["json"] if isinstance(x, dict)]
        return []

    def find_tool_part_for_parent(parent_id: Optional[str], tool_id: str) -> Optional[Dict[str, Any]]:
        if not parent_id:
            return None
        msgs = oc_list_messages(limit=80)
        for msg in reversed(msgs):
            info = msg.get("info")
            if not isinstance(info, dict) or info.get("role") != "assistant":
                continue
            if info.get("parentID") != parent_id:
                continue
            parts = msg.get("parts")
            if not isinstance(parts, list):
                continue
            for p in parts:
                if isinstance(p, dict) and p.get("type") == "tool" and p.get("tool") == tool_id:
                    return p
        return None

    def tool_part_output(part: Optional[Dict[str, Any]]) -> str:
        if not isinstance(part, dict):
            return ""
        state = part.get("state") if isinstance(part.get("state"), dict) else {}
        out = state.get("output")
        if isinstance(out, str) and out.strip():
            return out
        err = state.get("error")
        if isinstance(err, str) and err.strip():
            return err
        meta = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
        out2 = meta.get("output")
        return out2 if isinstance(out2, str) else ""

    report["steps"] = {}

    # Security negative tests (no browsing needed)
    report["security"] = {}

    sys_trav = (
        "You are running a security smoke test.\n"
        "You MUST call tool `vibium_highlight_to_artifact` exactly once with args:\n"
        + json.dumps({"sessionId": browser_session_id, "selector": "body", "artifactDir": "../../.."})
        + "\nThis MUST fail with a Security violation.\n"
        "After the tool call, reply with exactly: DONE\n"
    )
    msg_trav = oc_message(
        system=sys_trav,
        tools=tools_allow_only(["vibium_highlight_to_artifact"]),
        text="Run security test: artifactDir traversal jail.",
        timeout=min(TIMEOUT_SEC, 60.0),
    )
    report["opencode"]["msgSecurityArtifactDirTraversal"] = msg_trav
    part_trav = find_tool_part_for_parent(msg_parent_id(msg_trav), "vibium_highlight_to_artifact")
    out_trav = tool_part_output(part_trav)
    report["security"]["artifactDirTraversalRejected"] = bool(out_trav and "security violation" in out_trav.lower())
    if not report["security"]["artifactDirTraversalRejected"]:
        failures.append("Security regression: vibium artifactDir traversal was NOT rejected")

    sys_lfi = (
        "You are running a security smoke test.\n"
        "You MUST call tool `vision_verify_artifact` exactly once with args:\n"
        + json.dumps({"fileUrl": "file:///etc/passwd", "model": VISION_MODEL, "prompt": "Return ONLY JSON."})
        + "\nThis MUST fail with a Security violation.\n"
        "After the tool call, reply with exactly: DONE\n"
    )
    msg_lfi = oc_message(
        system=sys_lfi,
        tools=tools_allow_only(["vision_verify_artifact"]),
        text="Run security test: vision fileUrl jail.",
        timeout=min(TIMEOUT_SEC, 60.0),
    )
    report["opencode"]["msgSecurityVisionFileUrlJail"] = msg_lfi
    part_lfi = find_tool_part_for_parent(msg_parent_id(msg_lfi), "vision_verify_artifact")
    out_lfi = tool_part_output(part_lfi)
    report["security"]["visionFileUrlJailRejected"] = bool(out_lfi and "security violation" in out_lfi.lower())
    if not report["security"]["visionFileUrlJailRejected"]:
        failures.append("Security regression: vision fileUrl jail was NOT enforced")

    # Navigate (OpenCode tool call)
    sys_nav = (
        "You are running a smoke test.\n"
        "You MUST call tool `vibium_navigate` exactly once with args:\n"
        + json.dumps({"sessionId": browser_session_id, "url": NAV_URL})
        + "\nAfter the tool call, reply with exactly: DONE\n"
    )
    msg_nav = oc_message(
        system=sys_nav,
        tools=tools_allow_only(["vibium_navigate"]),
        text="Navigate now.",
        timeout=TIMEOUT_SEC,
    )
    report["steps"]["navigate"] = msg_nav
    part_nav = find_tool_part_for_parent(msg_parent_id(msg_nav), "vibium_navigate")
    out_nav = tool_part_output(part_nav)
    if not out_nav:
        failures.append("Navigate tool produced no output")

    # Highlight → artifact (OpenCode tool call)
    sys_hl = (
        "You are running a smoke test.\n"
        "You MUST call tool `vibium_highlight_to_artifact` exactly once with args:\n"
        + json.dumps(
            {
                "sessionId": browser_session_id,
                "selector": HIGHLIGHT_SELECTOR,
                "color": HIGHLIGHT_COLOR,
                "durationMs": 2000,
                "thickness": 4,
                "padding": 4,
            }
        )
        + "\nAfter the tool call, reply with exactly: DONE\n"
    )
    msg_hl = oc_message(
        system=sys_hl,
        tools=tools_allow_only(["vibium_highlight_to_artifact"]),
        text="Highlight + write artifact now.",
        timeout=TIMEOUT_SEC,
    )
    report["steps"]["highlightToArtifact"] = msg_hl
    part_hl = find_tool_part_for_parent(msg_parent_id(msg_hl), "vibium_highlight_to_artifact")
    out_hl = tool_part_output(part_hl).strip()
    if not out_hl:
        failures.append("vibium_highlight_to_artifact produced no output")
        artifact_handle = None
    else:
        try:
            artifact_handle = json.loads(out_hl)
        except Exception:
            artifact_handle = None
            failures.append("vibium_highlight_to_artifact output was not valid JSON")
    report["artifact"] = {"handle": artifact_handle}

    # Validate artifact exists on host and sha matches
    artifact_ok = False
    if isinstance(artifact_handle, dict):
        file_path = artifact_handle.get("filePath")
        sha256 = artifact_handle.get("sha256")
        if isinstance(file_path, str) and file_path.startswith("/workspace/"):
            host_path = _workspace_path_to_host(file_path)
            if host_path:
                exists = host_path.exists()
                size = host_path.stat().st_size if exists else 0
                report["artifact"]["hostPath"] = str(host_path)
                report["artifact"]["exists"] = exists
                report["artifact"]["bytes"] = size
                if exists and size > 0:
                    digest = hashlib.sha256(host_path.read_bytes()).hexdigest()
                    report["artifact"]["sha256Host"] = digest
                    report["artifact"]["sha256Matches"] = (isinstance(sha256, str) and sha256 == digest)
                    artifact_ok = bool(report["artifact"]["sha256Matches"])
    if not artifact_ok:
        failures.append("Artifact file missing or sha256 mismatch (expected under docker/legion-workspace/artifacts/...)")

    # Vision verify (optional)
    report["vision"] = {"skipped": False}
    if SKIP_VISION:
        report["vision"]["skipped"] = True
    else:
        # Ensure provider looks connected; skip unless REQUIRE_VISION=1
        prov = http_json("GET", f"{OPENCODE_URL}/provider", timeout=8.0)
        report["opencode"]["provider"] = prov
        connected = []
        if prov.get("ok") and isinstance(prov.get("json"), dict):
            c = prov["json"].get("connected")
            if isinstance(c, list):
                connected = [x for x in c if isinstance(x, str)]
        report["vision"]["connectedProviders"] = connected
        provider_id = VISION_MODEL.split("/", 1)[0] if "/" in VISION_MODEL else ""
        if provider_id and provider_id not in connected:
            report["vision"]["skipped"] = True
            if REQUIRE_VISION:
                failures.append(f"Vision provider not connected: {provider_id} (set keys or set SMOKE_SKIP_VISION=1)")
        else:
            file_url = artifact_handle.get("fileUrl") if isinstance(artifact_handle, dict) else None
            if not isinstance(file_url, str) or not file_url.startswith("file://"):
                failures.append("Missing artifact fileUrl (cannot run vision)")
                report["vision"]["skipped"] = True
            else:
                sys_vis = (
                    "You are running a smoke test.\n"
                    "You MUST call tool `vision_verify_artifact` exactly once with args:\n"
                    + json.dumps(
                        {
                            "fileUrl": file_url,
                            "model": VISION_MODEL,
                            "prompt": (
                                "You are a visual verifier. Return ONLY valid JSON.\n\n"
                                "Task: confirm whether there is a visible magenta/purple highlight rectangle overlay (a box) around a UI element.\n"
                                'Return schema: {"highlightVisible": boolean, "confidence": number, "evidence": string}\n'
                            ),
                        }
                    )
                    + "\nAfter the tool call, reply with exactly: DONE\n"
                )
                msg_vis = oc_message(
                    system=sys_vis,
                    tools=tools_allow_only(["vision_verify_artifact"]),
                    text="Vision verify now.",
                    timeout=max(60.0, TIMEOUT_SEC),
                )
                report["vision"]["msgVisionVerify"] = msg_vis
                part_vis = find_tool_part_for_parent(msg_parent_id(msg_vis), "vision_verify_artifact")
                out_vis = tool_part_output(part_vis).strip()
                if not out_vis:
                    failures.append("vision_verify_artifact produced no output")
                else:
                    try:
                        report["vision"]["result"] = json.loads(out_vis)
                    except Exception:
                        failures.append("vision_verify_artifact output was not valid JSON")
                        report["vision"]["resultRaw"] = _truncate_str(out_vis, 4000)

    report["failures"] = failures
    jp, mp = write_trace(report)
    print(str(jp))
    print(str(mp))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())


