#!/usr/bin/env python3
"""
tracer.py - Semantic Logging for Recursive Self-Intelligence

This module provides structured logging that creates markdown trace files,
allowing humans to follow the AI's reasoning process and decision-making.

Part of the Meeseeks RSI Toolkit.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field, asdict
from enum import Enum

# Traces directory
TRACES_DIR = Path(__file__).parent / "traces"
TRACES_DIR.mkdir(exist_ok=True)


class Phase(Enum):
    """Phases of the recursive self-intelligence process."""
    BOOTSTRAP = "bootstrap"
    ANALYSIS = "analysis"
    ARCHITECTURE = "architecture"
    PLANNING = "planning"
    EXECUTION = "execution"
    VALIDATION = "validation"
    REFLECTION = "reflection"


@dataclass
class ModelCall:
    """Record of an external model call."""
    model: str
    prompt_summary: str
    response_summary: str
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    duration_ms: Optional[int] = None


@dataclass
class TraceEntry:
    """A single trace entry with full context."""
    phase: str
    title: str
    context: str
    reasoning: str
    decision_action: str
    model_calls: List[ModelCall] = field(default_factory=list)
    next_steps: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class Tracer:
    """
    Semantic tracer for logging reasoning and decisions.
    
    Creates timestamped markdown files that document the AI's
    thought process, decisions, and external model calls.
    """
    
    def __init__(self, session_id: Optional[str] = None):
        """Initialize a new tracer session."""
        self.session_id = session_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = TRACES_DIR / self.session_id
        self.session_dir.mkdir(exist_ok=True)
        self.trace_count = 0
        self.entries: List[TraceEntry] = []
        
        # Create session index
        self._write_session_index()
    
    def _write_session_index(self):
        """Write/update the session index file."""
        index_path = self.session_dir / "README.md"
        content = f"""# Recursive Self-Intelligence Session: {self.session_id}

Started: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Session Goal
Build out the target project - merge all components from archive into a working system.

## Trace Files
"""
        for i, entry in enumerate(self.entries, 1):
            content += f"- [{i:03d}_{entry.phase}.md](./{i:03d}_{entry.phase}.md) - {entry.title}\n"
        
        if not self.entries:
            content += "_No traces yet - session in progress_\n"
        
        content += f"""
## Quick Links
- [Latest Trace](./latest.md)
- [Execution Log](./execution_log.md)

## Session Metadata
```json
{json.dumps({"session_id": self.session_id, "trace_count": self.trace_count}, indent=2)}
```
"""
        with open(index_path, 'w') as f:
            f.write(content)
    
    def log(
        self,
        phase: Phase,
        title: str,
        context: str,
        reasoning: str,
        decision_action: str,
        model_calls: Optional[List[Dict[str, Any]]] = None,
        next_steps: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Path:
        """
        Log a trace entry.
        
        Args:
            phase: The current phase of work
            title: Short title for this trace
            context: What we're doing and why
            reasoning: Detailed chain of thought
            decision_action: What was decided/done
            model_calls: List of external model calls made
            next_steps: What follows from this
            metadata: Additional structured data
        
        Returns:
            Path to the created trace file
        """
        self.trace_count += 1
        
        # Convert model calls to ModelCall objects if needed
        calls = []
        if model_calls:
            for call in model_calls:
                if isinstance(call, ModelCall):
                    calls.append(call)
                else:
                    calls.append(ModelCall(**call))
        
        entry = TraceEntry(
            phase=phase.value,
            title=title,
            context=context,
            reasoning=reasoning,
            decision_action=decision_action,
            model_calls=calls,
            next_steps=next_steps or [],
            metadata=metadata or {},
        )
        
        self.entries.append(entry)
        
        # Write trace file
        filename = f"{self.trace_count:03d}_{phase.value}.md"
        filepath = self.session_dir / filename
        
        content = self._format_trace(entry)
        with open(filepath, 'w') as f:
            f.write(content)
        
        # Update latest symlink (as a file copy for compatibility)
        latest_path = self.session_dir / "latest.md"
        with open(latest_path, 'w') as f:
            f.write(content)
        
        # Update session index
        self._write_session_index()
        
        # Also append to execution log
        self._append_to_log(entry)
        
        return filepath
    
    def _format_trace(self, entry: TraceEntry) -> str:
        """Format a trace entry as markdown."""
        content = f"""# {entry.title}

**Phase:** {entry.phase}  
**Timestamp:** {entry.timestamp}

---

## Context

{entry.context}

---

## Reasoning

{entry.reasoning}

---

## Decision / Action

{entry.decision_action}

---

## External Model Calls

"""
        if entry.model_calls:
            for call in entry.model_calls:
                content += f"""### {call.model}

**Prompt Summary:** {call.prompt_summary}

**Response Summary:** {call.response_summary}

"""
                if call.tokens_in or call.tokens_out:
                    content += f"_Tokens: {call.tokens_in or '?'} in, {call.tokens_out or '?'} out_\n\n"
        else:
            content += "_No external model calls in this phase._\n"
        
        content += """
---

## Next Steps

"""
        if entry.next_steps:
            for step in entry.next_steps:
                content += f"- {step}\n"
        else:
            content += "_To be determined based on results._\n"
        
        if entry.metadata:
            content += f"""
---

## Metadata

```json
{json.dumps(entry.metadata, indent=2)}
```
"""
        
        return content
    
    def _append_to_log(self, entry: TraceEntry):
        """Append a summary to the execution log."""
        log_path = self.session_dir / "execution_log.md"
        
        # Create header if file doesn't exist
        if not log_path.exists():
            with open(log_path, 'w') as f:
                f.write(f"# Execution Log - Session {self.session_id}\n\n")
        
        # Append entry summary
        with open(log_path, 'a') as f:
            f.write(f"""
## [{entry.timestamp}] {entry.phase.upper()}: {entry.title}

{entry.decision_action[:500]}{'...' if len(entry.decision_action) > 500 else ''}

---
""")
    
    def log_quick(self, phase: Phase, message: str, metadata: Optional[Dict[str, Any]] = None):
        """Quick log for simple status updates."""
        return self.log(
            phase=phase,
            title=message[:50],
            context=message,
            reasoning="Quick status update",
            decision_action=message,
            metadata=metadata,
        )
    
    def get_session_path(self) -> Path:
        """Get the path to the session directory."""
        return self.session_dir


# Global tracer instance (created on first use)
_global_tracer: Optional[Tracer] = None


def get_tracer() -> Tracer:
    """Get or create the global tracer instance."""
    global _global_tracer
    if _global_tracer is None:
        _global_tracer = Tracer()
    return _global_tracer


def log_reasoning(
    phase: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Path:
    """
    Convenience function for logging reasoning.
    
    Args:
        phase: Phase name (will be converted to Phase enum)
        content: The reasoning content
        metadata: Optional metadata
    
    Returns:
        Path to the trace file
    """
    tracer = get_tracer()
    phase_enum = Phase(phase) if phase in [p.value for p in Phase] else Phase.EXECUTION
    return tracer.log_quick(phase_enum, content, metadata)


if __name__ == "__main__":
    # Test the tracer
    tracer = Tracer("test_session")
    
    tracer.log(
        phase=Phase.BOOTSTRAP,
        title="Test Trace Entry",
        context="Testing the tracer module to ensure it works correctly.",
        reasoning="We need to verify that all trace functionality works before using it in production.",
        decision_action="Created a test trace entry with all fields populated.",
        model_calls=[
            {
                "model": "gemini-3.1-pro-preview",
                "prompt_summary": "Test prompt",
                "response_summary": "Test response",
            }
        ],
        next_steps=["Verify file was created", "Check formatting"],
        metadata={"test": True},
    )
    
    print(f"Trace written to: {tracer.get_session_path()}")

