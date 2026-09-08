---
name: meeseeks-identity
description: >
  Cross-agent learning system. Each agent creates a persistent identity (GUID),
  learns from sessions, shares knowledge, and finds domain experts. Use at START
  of agent team sessions to create identity + learn from experts, and at END to
  extract learnings for future agents.
---

# Meeseeks Identity (Cross-Agent Learning)

## File Locations
```
meeseeks/tools_core/reasoning/meeseeks_identity.py
  → MeeseeksKnowledgeStore, get_or_create_meeseeks, MeeseeksLearner

meeseeks/box/meeseeks_registry/
  └── {guid}/identity.json     ← Persisted identities
```

## Session Start: Create + Learn

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.reasoning import (
    MeeseeksKnowledgeStore, get_or_create_meeseeks, MeeseeksLearner
)

store = MeeseeksKnowledgeStore()
me = get_or_create_meeseeks(
    store=store,
    name="<YOUR-ROLE>",
    purpose="<describe what this agent does>",
)

learner = MeeseeksLearner(store)
for domain in ["<relevant>", "<domains>", "<here>"]:
    expert = store.find_expert(domain)
    if expert:
        result = learner.learn_from(me, expert.guid, domains=[domain])
        print(f"Learned {result['hints_learned']} hints from {expert.name}")
```

## Session End: Extract Learnings

```python
from pathlib import Path

learner.extract_learnings_from_session(
    identity=me,
    session_dir=Path("meeseeks/logs/sessions/<session_id>"),
)
# Future agents calling store.find_expert("rag") will find YOUR learnings
```

## What Gets Stored
- **hints** — specific actionable knowledge with context and importance
- **patterns** — recurring observations with confidence scores
- **warnings** — things to avoid with severity
- **domains** — areas of expertise
- **capabilities** — skill levels per domain
- **children** — spawned sub-Meeseeks GUIDs
- **learned_from** — other Meeseeks this one learned from

## Agent Teams: Every Teammate Gets an Identity
At session end, @agent-architect learns from ALL identities.
Knowledge compounds across sessions — the team gets smarter.
