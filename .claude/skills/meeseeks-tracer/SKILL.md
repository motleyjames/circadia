---
name: meeseeks-tracer
description: >
  Semantic tracing and structured logging for all Meeseeks operations. Records
  model calls, reasoning phases, self-reflections, and generates markdown traces.
  Use to instrument any Meeseeks workflow. Traces land in logs/semantic_tracers/
  or the MEESEEKS_TRACES_DIR if set.
---

# Meeseeks Semantic Tracer

## File Locations
```
meeseeks/tools_core/core/
├── meeseeks_tracer.py         ← Tracer, TraceEntry, get_tracer, log_reasoning

meeseeks/logs/
├── semantic_tracers/traces/   ← Default trace output
│   └── {trace_session_id}/
│       ├── 001_council.md
│       ├── execution_log.md
│       └── README.md
└── agent_runs/{run_id}/traces/ ← Colocated traces (via MEESEEKS_TRACES_DIR)
```

## Exports
```
From core __init__:
  Tracer, TraceEntry, ModelCall, Phase, SelfReflection,
  get_tracer, log_reasoning
```

## Getting a Tracer

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.core import get_tracer

# Get or create a tracer for this session
tracer = get_tracer()
```

## Logging Model Calls

```python
from tools_core.core import Tracer, ModelCall

tracer = get_tracer()

# Log an LLM call
tracer.log_model_call(ModelCall(
    model="claude-opus-4-6",
    prompt="Analyze this code...",
    response="The code has...",
    tokens_in=500,
    tokens_out=1200,
))
```

## Logging Reasoning Phases

```python
from tools_core.core import Phase

# Log a reasoning phase
tracer.log_phase(Phase(
    name="hypothesis_generation",
    description="Generating 3 hypotheses for loop 1",
    result="Generated H1, H2, H3",
))
```

## Logging Self-Reflections

```python
from tools_core.core import SelfReflection

tracer.log_reflection(SelfReflection(
    future_hints=["Check page 5 for continuation of table"],
    patterns_noticed=["All IDs use UUID v4 format"],
    warnings=["Don't call external API in test mode"],
    incomplete_work=[{"what": "Reranker tuning", "next_step": "Benchmark"}],
))
```

## Quick Logging Helper

```python
from tools_core.core import log_reasoning

# One-liner for simple reasoning traces
log_reasoning(
    phase="implementation",
    detail="Built auth middleware with JWT validation",
    confidence=0.75,
)
```

## Trace Entries

```python
from tools_core.core import TraceEntry

# TraceEntry is the base unit — all log methods create these
entry = TraceEntry(
    timestamp="2026-01-17T14:30:22",
    type="model_call",
    content={...},
)
```

## Passing Tracer to Other Tools

Many Meeseeks functions accept an optional `tracer` parameter:

```python
from tools_core.probes import review_code
from tools_core.council import council_vote
from tools_core.reasoning import decompose_goal

tracer = get_tracer()

# Code review with tracing
review = review_code(files=[...], context="...", tracer=tracer)

# Council vote with tracing
decision = council_vote(question="...", context="...", tracer=tracer)

# Task decomposition with tracing
plan = decompose_goal(goal="...", tracer=tracer)
```

## Trace Colocation (recommended for autonomous runs)

Force traces into a run folder:

```bash
export MEESEEKS_TRACES_DIR="logs/agent_runs/<RUN_ID>/traces"
```

## Rules
- ALWAYS get a tracer at session start
- ALWAYS pass tracer to Meeseeks functions that accept it
- ALWAYS log self-reflections at the end of each loop
- Traces are markdown files — human-readable by design
