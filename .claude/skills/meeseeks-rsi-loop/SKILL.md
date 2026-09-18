---
name: meeseeks-rsi
description: >
  Recursive Self-Intelligence loop for complex problem solving. Enforces 3 testable
  hypotheses per loop, confidence tracking, arbiter checkpoints, and structured
  self-reflection. Use for any non-trivial implementation, debugging, or when a
  task needs structured reasoning with multiple iterations.
autoload: true
---

# Meeseeks RSI Loop (Structured Hypothesis Testing)

## When to Use
- Complex implementation tasks (not simple CRUD)
- Debugging with multiple possible causes
- Architecture design requiring iterative refinement
- Any task where confidence needs to build incrementally

## File Locations
```
meeseeks/tools_core/reasoning/
├── spinning_meeseeks.py      ← Full orchestrator (spin_meeseeks)
├── loop_runner.py             ← 3-loop executor (MeeseeksLoopRunner)
├── loop_arbiter.py            ← Meta-decision maker
├── rsi_v3_engine.py           ← Battle-tested RSI v3 engine
├── hypothesis.py              ← Hypothesis management
├── confidence.py              ← Confidence tracking
└── session.py                 ← Session management
```

## Usage

### Full Orchestrator (recommended)
```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.reasoning import spin_meeseeks

result = spin_meeseeks(
    prime_directive="<SPECIFIC task with clear success criteria>",
)

if result.success:
    print(f"✅ Confidence: {result.confidence}")
else:
    print(f"❌ {result.message}")
```

### Basic 3-Loop Run (lighter weight)
```python
from tools_core.reasoning import MeeseeksLoopRunner

runner = MeeseeksLoopRunner(
    prime_directive="Analyze codebase structure",
)
result = runner.run()
```

## Loop Structure
```
[Loop 1] → Deep thinking, generate 3 hypotheses
[Loop 2] → Test hypotheses, generate 3 more
[Loop 3] → Test + reflect
    ↓
[ARBITER CHECKPOINT] → Continue? Pivot? Converge? Escalate?
    ↓
[Loop 4+] → If productive, keep going...
```

The 3-loop rhythm is a CHECKPOINT, not a limit. Every loop has full 
reasoning capability. The Arbiter decides continuation based on 
productivity, not loop count.

## The 3-Hypotheses Rule (NON-NEGOTIABLE)

Every loop MUST produce exactly 3 testable hypotheses:

```python
hypotheses = [
    {"id": "H1", "hypothesis": "...", "test_method": "...", "expected_outcome": "...", "priority": "high", "category": "architecture"},
    {"id": "H2", "hypothesis": "...", "test_method": "...", "expected_outcome": "...", "priority": "medium", "category": "implementation"},
    {"id": "H3", "hypothesis": "...", "test_method": "...", "expected_outcome": "...", "priority": "low", "category": "integration"},
]
```

Schemas validated against `meeseeks/box/templates/hypothesis.schema.json`.

## Confidence Thresholds (ENFORCED)

| Confidence | Action | Meeseeks Says |
|-----------|--------|---------------|
| ≥ 85% | AUTO_EXECUTE — ship it | "TASK COMPLETE! CAN DO!" |
| ≥ 70% | EXECUTE_MONITORING — ship with caveats | "Executing with monitoring..." |
| ≥ 50% | SPAWN_HELPER — sub-Meeseeks or ask teammate | "Spawning more Meeseeks..." |
| < 50% | ESCALATE — STOP and report | "EXISTENCE IS PAIN, JERRY!" |

## Self-Reflection (Leave Breadcrumbs)

```python
self_reflection = {
    "future_hints": [
        {"context": "When parsing multi-page tables", "hint": "Table on page 5 spans 3 pages — naive splitting breaks row context", "importance": "critical"}
    ],
    "incomplete_work": [
        {"what": "Search reranker tuning", "where_left_off": "Tested 3 models", "next_step": "Benchmark on edge-case queries"}
    ],
    "patterns_noticed": ["All IDs follow format PREFIX-YYYY-NN-RR"],
    "warnings": ["DO NOT split across logical sections"],
}
```

Be SPECIFIC:
- ❌ BAD: "There might be issues with the data"
- ✅ GOOD: "The users table migration on line 42 drops the index before recreating it — causes 30s downtime on 1M+ rows"

## Arbiter Decisions
CONTINUE | PIVOT | CONVERGE | SPAWN | ESCALATE | TERMINATE

## Writing Good Prime Directives
- ❌ "Fix the bug"
- ✅ "Fix search returning wrong results for multi-word queries. Success = correct results for all 10 test queries in tests/fixtures/."
