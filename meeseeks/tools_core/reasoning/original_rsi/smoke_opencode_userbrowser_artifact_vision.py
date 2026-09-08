#!/usr/bin/env python3
"""
smoke_opencode_userbrowser_artifact_vision.py — Windows95-of-Agents smoke test
============================================================================

Validates the "artifact screenshot → vision subagent verifies → main session stays tiny" pipeline:

  Electron UserBrowser tab exists
    ↕ (WS bridge)
  session-service /api/userbrowser/*
    ↕ (HTTP)
  OpenCode custom tool `userbrowser_screenshot_to_artifact` writes PNG into /workspace/artifacts/*
    ↕ (file:// artifact handle)
  OpenCode custom tool `vision_verify_artifact` spawns a child OpenCode session and runs a vision model

This smoke test is designed to be NON-HANGING:
- strict timeouts for every HTTP request
- writes timestamped traces into recursive-self-intelligence-tools/traces/

Prereqs:
- session-service running on localhost:9009
- OpenCode running on localhost:4096
- Electron desktop running and UserBrowser bridge connected
- At least one UserBrowser tab exists (a WebContentsView was created)

Env vars:
  OPENCODE_URL=http://localhost:4096
  SESSION_SERVICE_URL=http://localhost:9009
  USERBROWSER_API_TOKEN=...         # optional (sent as x-legion-userbrowser-token)
  USERBROWSER_VIEW_ID=view-1        # optional override
  TIMEOUT_SEC=90

Vision options:
  SMOKE_SKIP_VISION=1               # skip the vision model call (still validates file jail negative test)
  SMOKE_REQUIRE_VISION=1            # if set, fail if vision is skipped (e.g. provider not connected)
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
TOKEN = os.environ.get("USERBROWSER_API_TOKEN", "")
VIEW_ID_OVERRIDE = os.environ.get("USERBROWSER_VIEW_ID", "").strip()
TIMEOUT_SEC = float(os.environ.get("TIMEOUT_SEC", "90"))

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


def _truncate_str(s: str, max_len: int = 8000) -> str:
    if len(s) <= max_len:
        return s
    head = s[: max(200, max_len // 2)]
    tail = s[-max(200, max_len // 3) :]
    return f"{head}...<TRUNCATED len={len(s)}>...{tail}"


def _redact(obj: Any) -> Any:
    """
    Best-effort redaction so we don't accidentally write secrets into traces.
    Also truncates very large strings.
    """
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if "api_key" in lk or "secret" in lk or "token" in lk:
                out[k] = "***REDACTED***"
                continue
            out[k] = _redact(v)
        return out
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    if isinstance(obj, str):
        return _truncate_str(obj, 8000)
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
    # repo_root/.../recursive-self-intelligence-tools/this_script.py
    repo_root = Path(__file__).resolve().parent.parent
    return repo_root / "docker" / "legion-workspace"


def _workspace_path_to_host(p: str) -> Optional[Path]:
    """
    Convert an in-container /workspace/... path to a host path in docker/legion-workspace/...
    """
    if not isinstance(p, str):
        return None
    prefix = "/workspace/"
    if not p.startswith(prefix):
        return None
    rel = p[len(prefix) :]
    return _workspace_root_host() / rel


def _extract_smoke_json(output: str) -> Optional[Dict[str, Any]]:
    marker = "__SMOKE_JSON__="
    for line in (output or "").splitlines():
        if line.startswith(marker):
            payload = line[len(marker) :].strip()
            try:
                j = json.loads(payload)
                return j if isinstance(j, dict) else None
            except Exception:
                return None
    return None


def write_trace(payload: Dict[str, Any]) -> Tuple[Path, Path]:
    traces_dir = Path(__file__).parent / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = traces_dir / f"smoke_opencode_userbrowser_artifact_vision_{stamp}.json"
    md_path = traces_dir / f"smoke_opencode_userbrowser_artifact_vision_{stamp}.md"

    safe = _redact(payload)
    json_path.write_text(json.dumps(safe, indent=2), encoding="utf-8")

    failures = safe.get("failures", [])
    if not isinstance(failures, list):
        failures = []

    oc = safe.get("opencode", {}) if isinstance(safe.get("opencode"), dict) else {}
    ss = safe.get("sessionService", {}) if isinstance(safe.get("sessionService"), dict) else {}

    md_lines = [
        "# Smoke Test — OpenCode UserBrowser Artifact + Vision Pipeline",
        "",
        f"- Timestamp: `{safe.get('timestamp')}`",
        f"- OpenCode: `{OPENCODE_URL}`",
        f"- Session Service: `{SESSION_SERVICE_URL}`",
        f"- ViewId: `{safe.get('viewId')}`",
        f"- OpenCode sessionId: `{safe.get('opencodeSessionId')}`",
        f"- Failures: `{len(failures)}`",
        "",
        "## Results",
        f"- session-service /health: `{(safe.get('health', {}) or {}).get('sessionService', {}).get('status')}` ok=`{(safe.get('health', {}) or {}).get('sessionService', {}).get('ok')}`",
        f"- opencode /config: `{(safe.get('health', {}) or {}).get('opencodeConfig', {}).get('status')}` ok=`{(safe.get('health', {}) or {}).get('opencodeConfig', {}).get('ok')}`",
        f"- opencode tools include userbrowser_screenshot_to_artifact: `{oc.get('hasScreenshotToArtifact')}`",
        f"- opencode tools include vision_verify_artifact: `{oc.get('hasVisionVerifyArtifact')}`",
        f"- userbrowser list_views: `{(ss.get('listViews', {}) or {}).get('status')}` ok=`{(ss.get('listViews', {}) or {}).get('ok')}`",
        f"- highlight(body): `{(ss.get('highlightBody', {}) or {}).get('status')}` ok=`{(ss.get('highlightBody', {}) or {}).get('ok')}`",
        f"- tool-call userbrowser_screenshot_to_artifact: `{(oc.get('msgScreenshotToArtifact', {}) or {}).get('status')}` ok=`{(oc.get('msgScreenshotToArtifact', {}) or {}).get('ok')}`",
        f"- artifact file exists: `{(safe.get('artifact', {}) or {}).get('exists')}` bytes=`{(safe.get('artifact', {}) or {}).get('bytes')}`",
        f"- security: artifactDir traversal rejected: `{(safe.get('security', {}) or {}).get('artifactDirTraversalRejected')}`",
        f"- security: vision fileUrl jail rejected: `{(safe.get('security', {}) or {}).get('visionFileUrlJailRejected')}`",
        f"- vision step skipped: `{(safe.get('vision', {}) or {}).get('skipped')}`",
        f"- tool-call vision_verify_artifact: `{(safe.get('vision', {}) or {}).get('msgVisionVerify', {}).get('status')}` ok=`{(safe.get('vision', {}) or {}).get('msgVisionVerify', {}).get('ok')}`",
        "",
    ]

    if failures:
        md_lines.extend(["## Failures", "", "```", "\n".join(str(x) for x in failures)[:9000], "```", ""])
    else:
        md_lines.append("All checks passed.")

    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    report: Dict[str, Any] = {"timestamp": _now_iso()}
    failures: List[str] = []

    # 1) Health checks
    report["health"] = {
        "sessionService": http_json("GET", f"{SESSION_SERVICE_URL}/health", timeout=5.0),
        "opencodeConfig": http_json("GET", f"{OPENCODE_URL}/config", timeout=5.0),
    }
    if not report["health"]["sessionService"].get("ok"):
        failures.append("session-service /health failed")
    if not report["health"]["opencodeConfig"].get("ok"):
        failures.append("opencode /config failed")

    # 2) Ensure tools are loaded in OpenCode registry
    tool_ids = http_json("GET", f"{OPENCODE_URL}/experimental/tool/ids", timeout=8.0)
    report["opencode"] = {"toolIds": tool_ids}
    all_tool_ids: List[str] = []
    if tool_ids.get("ok") and isinstance(tool_ids.get("json"), list):
        all_tool_ids = [x for x in tool_ids["json"] if isinstance(x, str)]
    report["opencode"]["hasScreenshotToArtifact"] = "userbrowser_screenshot_to_artifact" in all_tool_ids
    report["opencode"]["hasVisionVerifyArtifact"] = "vision_verify_artifact" in all_tool_ids
    if "userbrowser_screenshot_to_artifact" not in all_tool_ids:
        failures.append("OpenCode missing tool: userbrowser_screenshot_to_artifact")
    if "vision_verify_artifact" not in all_tool_ids:
        failures.append("OpenCode missing tool: vision_verify_artifact")

    def tools_allow_only(allowed: List[str]) -> Dict[str, bool]:
        # Default-deny: allow only the tools we explicitly list.
        m = {tid: False for tid in all_tool_ids}
        for a in allowed:
            if a in m:
                m[a] = True
        return m

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

    # 3) Create an OpenCode session (parent)
    oc_create = http_json(
        "POST",
        f"{OPENCODE_URL}/session",
        body={"title": f"smoke_opencode_userbrowser_artifact_vision { _now_iso() }"},
        timeout=10.0,
    )
    report["opencode"]["createSession"] = oc_create
    oc_session_id = None
    if oc_create.get("ok") and isinstance(oc_create.get("json"), dict):
        oc_session_id = oc_create["json"].get("id")
    report["opencodeSessionId"] = oc_session_id
    if not oc_session_id:
        failures.append("Failed to create OpenCode session")
        report["failures"] = failures
        jp, mp = write_trace(report)
        print(str(jp))
        print(str(mp))
        return 2

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

    def oc_list_messages(*, limit: int = 30) -> List[Dict[str, Any]]:
        resp = http_json("GET", f"{OPENCODE_URL}/session/{oc_session_id}/message?limit={limit}", timeout=10.0)
        if resp.get("ok") and isinstance(resp.get("json"), list):
            return [x for x in resp["json"] if isinstance(x, dict)]
        return []

    def find_tool_part_for_parent(parent_id: Optional[str], tool_id: str) -> Optional[Dict[str, Any]]:
        if not parent_id:
            return None
        msgs = oc_list_messages(limit=50)
        # Search newest-first.
        for msg in reversed(msgs):
            info = msg.get("info")
            if not isinstance(info, dict):
                continue
            if info.get("role") != "assistant":
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

    # 4) Security negative tests (via OpenCode tool calling; requires provider connection)
    report["security"] = {}

    # 4a) artifactDir traversal must be rejected
    sys_artifact_trav = (
        "You are running a security smoke test.\n"
        "You MUST call the tool `userbrowser_screenshot_to_artifact` exactly once with these args:\n"
        '{"viewId":"view-1","artifactDir":"../../..","filenamePrefix":"smoke"}\n'
        "This call MUST fail with a Security violation.\n"
        "After the tool call, reply with exactly: DONE\n"
    )
    msg_trav = oc_message(
        system=sys_artifact_trav,
        tools=tools_allow_only(["userbrowser_screenshot_to_artifact"]),
        text="Run security test: artifactDir traversal jail.",
        timeout=min(TIMEOUT_SEC, 60.0),
    )
    report["opencode"]["msgSecurityArtifactDirTraversal"] = msg_trav
    part_trav = find_tool_part_for_parent(msg_parent_id(msg_trav), "userbrowser_screenshot_to_artifact")
    out_trav = tool_part_output(part_trav)
    report["security"]["artifactDirTraversal"] = {
        "toolPartFound": bool(part_trav),
        "output": _truncate_str(out_trav, 2000),
    }
    report["security"]["artifactDirTraversalRejected"] = bool(out_trav and "security violation" in out_trav.lower())
    if not report["security"]["artifactDirTraversalRejected"]:
        failures.append("Security regression: artifactDir traversal was NOT rejected")

    # 4b) vision fileUrl jail must be rejected
    sys_vision_lfi = (
        "You are running a security smoke test.\n"
        "You MUST call the tool `vision_verify_artifact` exactly once with these args:\n"
        '{"fileUrl":"file:///etc/passwd","model":"'
        + VISION_MODEL
        + '","prompt":"Return ONLY JSON."}\n'
        "This call MUST fail with a Security violation.\n"
        "After the tool call, reply with exactly: DONE\n"
    )
    msg_lfi = oc_message(
        system=sys_vision_lfi,
        tools=tools_allow_only(["vision_verify_artifact"]),
        text="Run security test: vision fileUrl jail.",
        timeout=min(TIMEOUT_SEC, 60.0),
    )
    report["opencode"]["msgSecurityVisionFileUrlJail"] = msg_lfi
    part_lfi = find_tool_part_for_parent(msg_parent_id(msg_lfi), "vision_verify_artifact")
    out_lfi = tool_part_output(part_lfi)
    report["security"]["visionFileUrlJail"] = {
        "toolPartFound": bool(part_lfi),
        "output": _truncate_str(out_lfi, 2000),
    }
    report["security"]["visionFileUrlJailRejected"] = bool(out_lfi and "security violation" in out_lfi.lower())
    if not report["security"]["visionFileUrlJailRejected"]:
        failures.append("Security regression: vision fileUrl jail was NOT enforced")

    # 5) Pick a viewId (requires Electron bridge)
    ss_headers = {"x-legion-userbrowser-token": TOKEN} if TOKEN else None
    list_views = http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/api/userbrowser/list_views",
        body={},
        headers=ss_headers,
        timeout=10.0,
    )
    report["sessionService"] = {"listViews": list_views}
    view_ids: List[str] = []
    if list_views.get("ok") and isinstance(list_views.get("json"), dict):
        v = list_views["json"].get("viewIds")
        if isinstance(v, list):
            view_ids = [x for x in v if isinstance(x, str)]
    report["viewIds"] = view_ids

    chosen = VIEW_ID_OVERRIDE or (view_ids[0] if view_ids else "")
    report["viewId"] = chosen

    if not list_views.get("ok"):
        j = list_views.get("json")
        if isinstance(j, dict) and isinstance(j.get("error"), str) and "bridge not connected" in j["error"].lower():
            failures.append("Desktop bridge not connected. Start Electron app and ensure UserBrowser bridge is connected.")
        else:
            failures.append("POST /api/userbrowser/list_views failed")
    elif not view_ids:
        failures.append("No UserBrowser views found. Open a UserBrowser tab in Electron first.")

    if VIEW_ID_OVERRIDE and VIEW_ID_OVERRIDE not in view_ids:
        failures.append(f"USERBROWSER_VIEW_ID={VIEW_ID_OVERRIDE} not found in list_views")

    # If we don't have a viewId, we can't exercise the screenshot→artifact→vision pipeline.
    if not chosen:
        report["artifact"] = {"skipped": True, "reason": "missing viewId (bridge not connected / no userbrowser tab)"}
        report["vision"] = {"skipped": True, "reason": "missing artifact (no viewId)"}
        report["failures"] = failures
        jp, mp = write_trace(report)
        print(str(jp))
        print(str(mp))
        return 2

    # 6) Highlight body (best-effort, non-destructive) to make the vision check meaningful
    highlight = http_json(
        "POST",
        f"{SESSION_SERVICE_URL}/api/userbrowser/highlight",
        body={"viewId": chosen, "selector": "body", "durationMs": 12000, "color": "#ff2cff", "thickness": 4},
        headers=ss_headers,
        timeout=10.0,
    )
    report["sessionService"]["highlightBody"] = highlight

    # 7) Call `userbrowser_screenshot_to_artifact` via OpenCode tool calling
    sys_shot = (
        "You are running a smoke test.\n"
        "You MUST call the tool `userbrowser_screenshot_to_artifact` exactly once with these args:\n"
        + json.dumps({"viewId": chosen})
        + "\n"
        "After the tool call, reply with exactly: DONE\n"
    )
    msg_shot = oc_message(
        system=sys_shot,
        tools=tools_allow_only(["userbrowser_screenshot_to_artifact"]),
        text="Run: userbrowser_screenshot_to_artifact",
        timeout=TIMEOUT_SEC,
    )
    report["opencode"]["msgScreenshotToArtifact"] = msg_shot
    part_shot = find_tool_part_for_parent(msg_parent_id(msg_shot), "userbrowser_screenshot_to_artifact")
    out_shot = tool_part_output(part_shot).strip()
    if not out_shot:
        failures.append("userbrowser_screenshot_to_artifact tool call produced no output")
        artifact_handle = None
    else:
        try:
            artifact_handle = json.loads(out_shot)
        except Exception:
            artifact_handle = None
            failures.append("userbrowser_screenshot_to_artifact output was not valid JSON")

    report["artifact"] = {"handle": artifact_handle}

    # Validate artifact file exists on host
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

    # 8) Vision subagent verification (optional)
    report["vision"] = {"skipped": False}
    if SKIP_VISION:
        report["vision"]["skipped"] = True
    else:
        file_url = artifact_handle.get("fileUrl") if isinstance(artifact_handle, dict) else None
        if not isinstance(file_url, str) or not file_url.startswith("file://"):
            failures.append("Missing artifact fileUrl from userbrowser_screenshot_to_artifact")
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
                sys_vis = (
                    "You are running a smoke test.\n"
                    "You MUST call the tool `vision_verify_artifact` exactly once with these args:\n"
                    + json.dumps(
                        {
                            "fileUrl": file_url,
                            "model": VISION_MODEL,
                            "prompt": (
                                "You are a visual verifier. Return ONLY valid JSON.\n\n"
                                "Task: confirm whether there is a visible magenta/purple highlight rectangle overlay (a box) around the page/body.\n"
                                'Return schema: {"highlightVisible": boolean, "confidence": number, "evidence": string}\n'
                            ),
                        }
                    )
                    + "\n"
                    "After the tool call, reply with exactly: DONE\n"
                )
                msg_vis = oc_message(
                    system=sys_vis,
                    tools=tools_allow_only(["vision_verify_artifact"]),
                    text="Run: vision_verify_artifact",
                    timeout=max(60.0, TIMEOUT_SEC),
                )
                report["vision"]["msgVisionVerify"] = msg_vis
                part_vis = find_tool_part_for_parent(msg_parent_id(msg_vis), "vision_verify_artifact")
                out_vis = tool_part_output(part_vis).strip()
                if not out_vis:
                    failures.append("vision_verify_artifact tool call produced no output")
                else:
                    try:
                        report["vision"]["result"] = json.loads(out_vis)
                    except Exception:
                        failures.append("vision_verify_artifact output was not valid JSON")
                        report["vision"]["resultRaw"] = _truncate_str(out_vis, 3000)

    report["failures"] = failures
    jp, mp = write_trace(report)
    print(str(jp))
    print(str(mp))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())


