#!/usr/bin/env python3
"""
session.py - Session Management for RSI Loops

Manages session directories, reasoning logs, and traces.

Session Structure:
    logs/sessions/{session_id}/
    ├── manifest.json           # Session metadata, status, timestamps
    ├── reasoning/
    │   ├── loop_1.json         # First loop with 3 hypotheses
    │   ├── loop_2.json         # Tests loop_1 hypotheses, adds 3 more
    │   └── loop_3.json         # Final convergence/spawn decision
    └── semantic_traces/
        ├── README.md           # Human-readable summary
        ├── execution_log.md    # Append-only timeline
        └── {nn}_{phase}.md     # Individual decision traces
"""

import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import asdict
import logging

logger = logging.getLogger(__name__)

# Optional JSON schema validation (recommended). If unavailable, logs will still be written.
try:
    import jsonschema  # type: ignore
except Exception:  # pragma: no cover
    jsonschema = None

# Schema directory lives in the repository root: box/templates/
SCHEMA_DIR = Path(__file__).parent.parent.parent / "box" / "templates"


class SessionManager:
    """
    Manages Meeseeks RSI sessions.
    
    Creates and maintains the session directory structure,
    saves/loads reasoning logs, and tracks session state.
    """
    
    def __init__(self, base_dir: Optional[Path] = None):
        """
        Initialize session manager.
        
        Args:
            base_dir: Base directory for sessions (default: logs/sessions)
        """
        self.base_dir = Path(base_dir) if base_dir else Path("logs/sessions")
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    def create_session(
        self,
        session_id: str,
        prime_directive: str,
        config: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        spawned_from: Optional[str] = None
    ) -> Path:
        """
        Create a new session directory structure.
        
        Args:
            session_id: Unique session identifier
            prime_directive: The task to complete
            config: Session configuration
            tags: Optional tags for categorization
            spawned_from: Parent session ID if spawned
        
        Returns:
            Path to session directory
        """
        session_dir = self.base_dir / session_id
        
        # Create directory structure per AGENTS.md spec:
        # logs/sessions/{session_id}/
        #   ├── manifest.json
        #   ├── reasoning/           # Loop logs (loop_1.json, loop_2.json, etc.)
        #   └── semantic_traces/     # Human-readable traces
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / "reasoning").mkdir(exist_ok=True)
        (session_dir / "semantic_traces").mkdir(exist_ok=True)
        
        # Create / register a Meeseeks identity for this session (required by session_manifest schema)
        meeseeks_guid = self._ensure_meeseeks_identity(prime_directive)
        
        # Create manifest
        manifest = {
            "session_id": session_id,
            "meeseeks_guid": meeseeks_guid,
            "prime_directive": prime_directive,
            "status": "running",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "completed_at": None,
            "loops_completed": 0,
            "final_confidence": None,
            # Must be an object if present (schema does not allow null here)
            "final_outcome": {},
            "spawned_from": spawned_from,
            "spawned_tools": [],
            "config": config or {
                "max_loops": 3,
                "execute_threshold": 0.85,
                "monitor_threshold": 0.70,
                "spawn_threshold": 0.50,
            },
            "metrics": {
                "total_duration_seconds": 0.0,
                "total_model_calls": 0,
                "total_tokens_used": 0,
                "hypotheses_tested": 0,
                "hypotheses_confirmed": 0,
                "probes_executed": 0
            },
            "tags": tags or []
        }
        
        self._save_manifest(session_id, manifest)
        
        # Create initial traces
        self._create_initial_traces(session_dir, session_id, prime_directive)
        
        logger.info(f"Created session: {session_dir}")
        return session_dir
    
    def _create_initial_traces(
        self,
        session_dir: Path,
        session_id: str,
        prime_directive: str
    ):
        """Create initial trace files"""
        traces_dir = session_dir / "semantic_traces"
        
        # Create README
        readme = f"""# Meeseeks Session: {session_id}

**Prime Directive:** {prime_directive}

**Created:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Status
Running...

## Loops
- Loop 1: Pending
- Loop 2: Pending
- Loop 3: Pending

## Traces
See individual trace files for detailed reasoning.
"""
        (traces_dir / "README.md").write_text(readme)
        
        # Create execution log
        exec_log = f"""# Execution Log - Session {session_id}

## Timeline

### {datetime.now().strftime("%H:%M:%S")} - Session Started
Prime directive: {prime_directive}

---
"""
        (traces_dir / "execution_log.md").write_text(exec_log)
    
    def save_reasoning_log(
        self,
        session_id: str,
        loop_number: int,
        reasoning_log: Any
    ) -> Path:
        """
        Save a reasoning log for a loop.
        
        Args:
            session_id: Session identifier
            loop_number: Loop number (1, 2, or 3)
            reasoning_log: ReasoningLog dataclass or dict
        
        Returns:
            Path to saved file
        """
        session_dir = self.base_dir / session_id
        reasoning_dir = session_dir / "reasoning"
        reasoning_dir.mkdir(parents=True, exist_ok=True)
        
        # Convert to dict if dataclass
        if hasattr(reasoning_log, '__dataclass_fields__'):
            log_dict = self._dataclass_to_dict(reasoning_log)
        else:
            log_dict = reasoning_log
        
        # Validate against schema (best-effort)
        self._validate_against_schema("reasoning_log.schema.json", log_dict)
        
        # Save JSON
        filepath = reasoning_dir / f"loop_{loop_number}.json"
        with open(filepath, 'w') as f:
            json.dump(log_dict, f, indent=2, default=str)
        
        # Update manifest
        manifest = self._load_manifest(session_id)
        manifest["loops_completed"] = loop_number
        manifest["updated_at"] = datetime.now().isoformat()
        if "confidence_trajectory" in log_dict:
            ct = log_dict["confidence_trajectory"]
            if isinstance(ct, dict) and "final" in ct:
                manifest["final_confidence"] = ct["final"]
            elif isinstance(ct, list) and ct:
                # Backward compatibility with older list-style trajectories
                manifest["final_confidence"] = ct[-1]
        self._save_manifest(session_id, manifest)
        
        # Append to execution log
        self._append_to_execution_log(session_id, loop_number, log_dict)
        
        logger.info(f"Saved reasoning log: {filepath}")
        return filepath
    
    def _dataclass_to_dict(self, obj: Any) -> Dict[str, Any]:
        """Recursively convert dataclass to dict"""
        if hasattr(obj, '__dataclass_fields__'):
            result = {}
            for field_name in obj.__dataclass_fields__:
                value = getattr(obj, field_name)
                # Omit None values so optional fields don't violate schemas
                if value is None:
                    continue
                result[field_name] = self._dataclass_to_dict(value)
            return result
        elif isinstance(obj, list):
            return [self._dataclass_to_dict(item) for item in obj]
        elif isinstance(obj, dict):
            return {k: self._dataclass_to_dict(v) for k, v in obj.items()}
        elif hasattr(obj, 'value'):  # Enum
            return obj.value
        else:
            return obj
    
    def _append_to_execution_log(
        self,
        session_id: str,
        loop_number: int,
        log_dict: Dict[str, Any]
    ):
        """Append loop summary to execution log"""
        session_dir = self.base_dir / session_id
        exec_log_path = session_dir / "semantic_traces" / "execution_log.md"
        
        decision = log_dict.get("decision", {})
        hypotheses = log_dict.get("hypotheses_for_next_loop", [])
        confidence = decision.get("confidence", 0)
        self_reflection = log_dict.get("self_reflection", {})
        
        entry = f"""
### {datetime.now().strftime("%H:%M:%S")} - Loop {loop_number} Complete

**Decision:** {decision.get("action", "N/A")}
**Confidence:** {confidence:.0%}
**Rationale:** {decision.get("rationale", "N/A")[:200]}...

**Hypotheses for next loop:** {len(hypotheses)}
"""
        for h in hypotheses[:3]:
            if isinstance(h, dict):
                entry += f"- {h.get('id', '?')}: {h.get('hypothesis', 'N/A')[:80]}...\n"
            else:
                entry += f"- {h.id}: {h.hypothesis[:80]}...\n"
        
        # Add self-reflection summary
        if self_reflection:
            entry += "\n**🔮 Self-Reflection:**\n"
            
            hints = self_reflection.get("future_hints", [])
            if hints:
                for hint in hints[:2]:  # Top 2 hints
                    importance = hint.get("importance", "useful")
                    emoji = "🚨" if importance == "critical" else "💡"
                    entry += f"{emoji} {hint.get('hint', '')[:100]}...\n"
            
            warnings = self_reflection.get("warnings", [])
            if warnings:
                entry += f"⚠️ Warnings: {len(warnings)} noted\n"
            
            incomplete = self_reflection.get("incomplete_work", [])
            if incomplete:
                entry += f"📋 Incomplete work: {len(incomplete)} items\n"
        
        entry += "\n---\n"
        
        exec_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(exec_log_path, 'a') as f:
            f.write(entry)
    
    def load_reasoning_log(
        self,
        session_id: str,
        loop_number: int
    ) -> Optional[Dict[str, Any]]:
        """
        Load a reasoning log for a loop.
        
        Args:
            session_id: Session identifier
            loop_number: Loop number
        
        Returns:
            Dict with reasoning log or None if not found
        """
        filepath = self.base_dir / session_id / "reasoning" / f"loop_{loop_number}.json"
        
        if not filepath.exists():
            return None
        
        with open(filepath, 'r') as f:
            return json.load(f)
    
    def complete_session(
        self,
        session_id: str,
        status: str,
        final_confidence: float,
        spawned_tool: Optional[Dict[str, Any]] = None,
        artifacts: Optional[List[str]] = None
    ):
        """
        Mark a session as complete.
        
        Args:
            session_id: Session identifier
            status: Final status (completed, spawned, escalated, failed)
            final_confidence: Final confidence score
            spawned_tool: Info about spawned tool if any
            artifacts: List of artifact paths
        """
        manifest = self._load_manifest(session_id)
        
        manifest["status"] = self._map_status_to_manifest(status)
        manifest["completed_at"] = datetime.now().isoformat()
        manifest["updated_at"] = datetime.now().isoformat()
        manifest["final_confidence"] = final_confidence
        manifest["final_outcome"] = {
            "decision": self._map_status_to_outcome_decision(status),
            "message": self._get_status_message(status),
            "artifacts": artifacts or []
        }
        
        if spawned_tool:
            manifest["spawned_tools"].append(spawned_tool)
        
        # Calculate duration
        created = datetime.fromisoformat(manifest["created_at"])
        completed = datetime.fromisoformat(manifest["completed_at"])
        manifest["metrics"]["total_duration_seconds"] = (completed - created).total_seconds()
        
        self._save_manifest(session_id, manifest)
        
        # Update README
        self._update_readme(session_id, manifest)
        
        # Append final entry to execution log
        self._append_final_to_execution_log(session_id, manifest)
        
        logger.info(f"Session {session_id} completed with status: {status}")
    
    def _get_status_message(self, status: str) -> str:
        """Get human-readable status message"""
        messages = {
            "task_complete": "🔵 TASK COMPLETE! Ooh yeah, CAN DO! *poof*",
            "execute_with_monitoring": "🔵 Executing with monitoring... *nervous*",
            "spawned_helper": "🔵 Spawning more Meeseeks to spawned/...",
            "escalate_to_human": "🔵 EXISTENCE IS PAIN, JERRY! Need human help.",
            "failed": "🔴 Session failed",
            # Spinning Meeseeks / Arbiter decision style statuses
            "converge": "🔵 TASK COMPLETE! Ooh yeah, CAN DO! *poof*",
            "spawn": "🔵 Spawning more Meeseeks to spawned/...",
            "escalate": "🔵 EXISTENCE IS PAIN, JERRY! Need human help.",
            "pivot": "🔄 Pivoting strategy",
            "continue": "➡️ Continuing",
            "terminate": "🔴 Terminated",
            # Manifest-level status values (session_manifest.schema.json)
            "completed": "🔵 Completed",
            "spawned": "🔵 Spawned helper",
            "escalated": "🔵 Escalated to human",
            "terminated": "🔴 Terminated",
            "initializing": "🔵 Initializing",
            "checkpoint": "🔵 Checkpoint reached",
            "running": "🔵 Running",
        }
        return messages.get(status, f"Status: {status}")
    
    def _update_readme(self, session_id: str, manifest: Dict[str, Any]):
        """Update session README with final status"""
        session_dir = self.base_dir / session_id
        readme_path = session_dir / "semantic_traces" / "README.md"
        
        status = manifest["status"]
        confidence = manifest.get("final_confidence", 0)
        loops = manifest.get("loops_completed", 0)
        
        readme = f"""# Meeseeks Session: {session_id}

**Prime Directive:** {manifest["prime_directive"]}

**Created:** {manifest["created_at"]}
**Completed:** {manifest.get("completed_at", "N/A")}

## Status: {status.upper()}

{self._get_status_message(status)}

**Final Confidence:** {confidence:.0%}
**Loops Completed:** {loops}/3

## Configuration
- Execute threshold: {manifest["config"].get("execute_threshold", 0.85):.0%}
- Monitor threshold: {manifest["config"].get("monitor_threshold", 0.70):.0%}
- Spawn threshold: {manifest["config"].get("spawn_threshold", 0.50):.0%}

## Traces
See individual trace files for detailed reasoning:
- `reasoning/loop_1.json` - First loop
- `reasoning/loop_2.json` - Second loop  
- `reasoning/loop_3.json` - Final loop
- `execution_log.md` - Timeline
"""
        readme_path.parent.mkdir(parents=True, exist_ok=True)
        readme_path.write_text(readme)
    
    def _append_final_to_execution_log(
        self,
        session_id: str,
        manifest: Dict[str, Any]
    ):
        """Append final summary to execution log"""
        session_dir = self.base_dir / session_id
        exec_log_path = session_dir / "semantic_traces" / "execution_log.md"
        
        entry = f"""
## {datetime.now().strftime("%H:%M:%S")} - SESSION COMPLETE

{self._get_status_message(manifest["status"])}

**Final Confidence:** {manifest.get("final_confidence", 0):.0%}
**Loops Completed:** {manifest.get("loops_completed", 0)}/3
**Duration:** {manifest["metrics"].get("total_duration_seconds", 0):.1f}s
"""
        
        exec_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(exec_log_path, 'a') as f:
            f.write(entry)
    
    def _load_manifest(self, session_id: str) -> Dict[str, Any]:
        """Load session manifest"""
        manifest_path = self.base_dir / session_id / "manifest.json"
        with open(manifest_path, 'r') as f:
            return json.load(f)
    
    def _save_manifest(self, session_id: str, manifest: Dict[str, Any]):
        """Save session manifest"""
        manifest_path = self.base_dir / session_id / "manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self._validate_against_schema("session_manifest.schema.json", manifest)
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
    
    def get_session_artifacts(self, session_id: str) -> List[str]:
        """Get list of artifact paths for a session"""
        session_dir = self.base_dir / session_id
        artifacts = []

        # The findings report FIRST - it is the one artifact a person reads.
        # It was written to the session directory but never listed, so runs
        # advertised "Artifacts: 4" and omitted the deliverable.
        findings_path = session_dir / "findings.md"
        if findings_path.exists():
            artifacts.append(str(findings_path))

        # Reasoning logs
        reasoning_dir = session_dir / "reasoning"
        if reasoning_dir.exists():
            for f in reasoning_dir.glob("*.json"):
                artifacts.append(str(f))
        
        # Traces
        traces_dir = session_dir / "semantic_traces"
        if traces_dir.exists():
            for f in traces_dir.glob("*.md"):
                artifacts.append(str(f))
        
        # Manifest
        manifest_path = session_dir / "manifest.json"
        if manifest_path.exists():
            artifacts.append(str(manifest_path))
        
        return artifacts

    def _map_status_to_manifest(self, status: str) -> str:
        """
        Map internal runner statuses to the session_manifest.schema.json status enum.
        """
        mapping = {
            "task_complete": "completed",
            "execute_with_monitoring": "completed",
            "converge": "completed",
            "spawned_helper": "spawned",
            "spawn": "spawned",
            "escalate_to_human": "escalated",
            "escalate": "escalated",
            "pivot": "checkpoint",
            "continue": "running",
            "terminate": "terminated",
            "failed": "failed",
            "unknown": "failed",
        }
        mapped = mapping.get(status, status)
        allowed = {
            "initializing",
            "running",
            "checkpoint",
            "completed",
            "spawned",
            "escalated",
            "failed",
            "terminated",
        }
        return mapped if mapped in allowed else "failed"
    
    def _map_status_to_outcome_decision(self, status: str) -> str:
        """
        Map internal statuses to the session_manifest.schema.json final_outcome.decision enum.
        """
        mapping = {
            "task_complete": "TASK_COMPLETE",
            "execute_with_monitoring": "EXECUTE_WITH_MONITORING",
            "spawned_helper": "SPAWNED_HELPER",
            "spawn": "SPAWNED_HELPER",
            "converge": "TASK_COMPLETE",
            "escalate_to_human": "ESCALATE_TO_HUMAN",
            "escalate": "ESCALATE_TO_HUMAN",
            "pivot": "PIVOT_STRATEGY",
            "terminate": "TERMINATED",
            "failed": "FAILED",
        }
        decision = mapping.get(status)
        if decision:
            return decision
        # Fall back to a safe, schema-valid value
        return "FAILED"

    def _ensure_meeseeks_identity(self, prime_directive: str) -> str:
        """
        Create a Meeseeks identity entry for this session and return its GUID.
        
        This satisfies the `meeseeks_guid` requirement in `session_manifest.schema.json`.
        """
        try:
            from .meeseeks_identity import MeeseeksKnowledgeStore  # local import to avoid import cycles
        except Exception:
            # If identity system isn't available, fall back to a timestamp-based GUID.
            return datetime.now().strftime("%H%M%S%f")[:8]
        
        registry_dir = Path(__file__).parent.parent.parent / "box" / "meeseeks_registry"
        store = MeeseeksKnowledgeStore(registry_dir)
        identity = store.create_identity(
            name="Mr. Meeseeks",
            purpose=prime_directive or "Complete the prime directive",
        )
        return identity.guid

    def _validate_against_schema(self, schema_filename: str, data: Dict[str, Any]) -> None:
        """Best-effort JSON schema validation for saved artifacts."""
        if jsonschema is None:
            return
        schema_path = SCHEMA_DIR / schema_filename
        if not schema_path.exists():
            return
        try:
            schema = json.loads(schema_path.read_text())
            jsonschema.validate(instance=data, schema=schema)
        except Exception as e:
            # Don't block execution/logging, but surface the issue loudly.
            logger.warning(f"Schema validation failed for {schema_filename}: {e}")
    
    def list_sessions(
        self,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        List sessions.
        
        Args:
            status: Filter by status (optional)
            limit: Maximum number to return
        
        Returns:
            List of session manifests
        """
        sessions = []
        
        for session_dir in sorted(self.base_dir.iterdir(), reverse=True):
            if not session_dir.is_dir():
                continue
            
            manifest_path = session_dir / "manifest.json"
            if not manifest_path.exists():
                continue
            
            try:
                with open(manifest_path, 'r') as f:
                    manifest = json.load(f)
                
                if status and manifest.get("status") != status:
                    continue
                
                sessions.append(manifest)
                
                if len(sessions) >= limit:
                    break
                    
            except (json.JSONDecodeError, IOError):
                continue
        
        return sessions
    
    def delete_session(self, session_id: str) -> bool:
        """
        Delete a session and all its data.
        
        Args:
            session_id: Session to delete
        
        Returns:
            True if deleted
        """
        session_dir = self.base_dir / session_id
        
        if not session_dir.exists():
            return False
        
        shutil.rmtree(session_dir)
        logger.info(f"Deleted session: {session_id}")
        return True
