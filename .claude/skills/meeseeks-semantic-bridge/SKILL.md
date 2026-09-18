---
name: meeseeks-semantic-bridge
description: >
  Connects probes, dissents, and resolutions to prevent redundant verification
  across agent teammates. ALWAYS check before running new probes, ALWAYS register
  after running probes. Critical for agent teams to avoid 5 agents testing the same thing.
---

# Meeseeks Semantic Bridge

## File Location
```
meeseeks/tools_core/reasoning/meeseeks_semantic_bridge.py

Also domain-specific: meeseeks/tools_core/domain/excel/rsi/semantic_bridge.py
```

## Usage

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.reasoning import SemanticBridge

bridge = SemanticBridge()

# BEFORE running a probe — check first!
if bridge.is_answered_by_probe("dissent_auth_bypass_risk"):
    answer = bridge.get_answer_for_dissent("dissent_auth_bypass_risk")
    print(f"Already verified: {answer}")  # SKIP
else:
    result = run_my_probe()
    bridge.register_probe("probe_rbac_enforcement", result)
    bridge.register_dissent("dissent_auth_bypass_risk", dissent_obj)
```

## Agent Team Pattern
```
@backend-architect → registers "probe_rbac_enforcement" ✅
@rag-engineer → checks bridge → already proven → SKIP
@frontend-lead → checks bridge → not proven → runs probe → registers
```

## Rules
- ALWAYS check `is_answered_by_probe()` before new verification
- ALWAYS `register_probe()` after running any probe
- Use descriptive IDs: `probe_rbac_technician_wo_scoping` not `probe_1`
