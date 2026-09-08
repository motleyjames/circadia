---
name: meeseeks-workflow
description: >
  Master workflow for development with full Meeseeks RSI integration.
  Orchestrates all Meeseeks skills: identity, council, SRDE, RSI loops, code
  review + probes, consistency auditing, visual sentinel, semantic bridge,
  knowledge injection, task planning, and diagram generation. Use for any
  substantial development task, especially with agent teams.
autoload: true
---

# Meeseeks Master Workflow

## The Full Pipeline

```
1. CREATE IDENTITY      → meeseeks-identity
2. LEARN FROM EXPERTS   → meeseeks-identity
3. PLAN TASKS           → meeseeks-task-planner
4. LOAD KNOWLEDGE       → meeseeks-knowledge (elevated thinking)
5. DECIDE ARCHITECTURE  → meeseeks-council (async!) + meeseeks-srde
6. IMPLEMENT            → meeseeks-rsi (hypothesis loops)
7. VALIDATE CODE        → meeseeks-code-review + probe factory
8. CHECK CONSISTENCY    → meeseeks-consistency + self-healer
9. VERIFY UI            → meeseeks-visual-sentinel
10. REGISTER PROBES     → meeseeks-semantic-bridge
11. DOCUMENT            → meeseeks-mermaid
12. EXTRACT LEARNINGS   → meeseeks-identity
```

## Quick Reference

| Situation | Skill | Key Function/Class |
|-----------|-------|--------------------|
| Call an LLM | meeseeks-llm | `call_model()`, `call_claude_opus()` |
| Log reasoning | meeseeks-tracer | `get_tracer()`, `log_reasoning()` |
| "Should I use A or B?" | meeseeks-council | `create_async_council()` → `council.deliberate()` |
| Models disagreed | meeseeks-srde | `create_srde()` → `srde.attempt_resolution()` |
| Plan a large feature | meeseeks-task-planner | `decompose_goal()` |
| Build something complex | meeseeks-rsi | `spin_meeseeks()` |
| Just wrote code | meeseeks-code-review | `review_code()`, `create_probe_factory()` |
| Check codebase patterns | meeseeks-consistency | `ConsistencyAuditor()`, `audit_consistency()` |
| Verify UI rendering | meeseeks-visual-sentinel | `create_web_sentinel()` |
| About to run a probe | meeseeks-semantic-bridge | `SemanticBridge()` |
| Need domain context | meeseeks-knowledge | `KnowledgeRegistry()` |
| Starting a session | meeseeks-identity | `get_or_create_meeseeks()` |
| Need a diagram | meeseeks-mermaid | `generate_diagram()` |
| Generate a runbook | meeseeks-task-planner | `goal_to_meeseeks_aware_prompt_list.py` |
| Deploy to another repo | meeseeks-spawner | `spawn_meeseeks()` |

## Agent Team Startup (EVERY TEAMMATE)

```python
import sys, asyncio
sys.path.insert(0, 'meeseeks')

from tools_core.reasoning import (
    MeeseeksKnowledgeStore, get_or_create_meeseeks,
    MeeseeksLearner, SemanticBridge
)
from tools_core import KnowledgeRegistry

# 1. Identity
store = MeeseeksKnowledgeStore()
me = get_or_create_meeseeks(store=store, name="<ROLE>", purpose="<PURPOSE>")

# 2. Learn from experts
learner = MeeseeksLearner(store)
for domain in ["<relevant>", "<domains>"]:
    expert = store.find_expert(domain)
    if expert:
        learner.learn_from(me, expert.guid, domains=[domain])

# 3. Domain knowledge
registry = KnowledgeRegistry()
knowledge = registry.get_relevant_knowledge(task="<task>", domains=["<your>", "<domains>"])
elevated = registry.get_elevated_summary()

# 4. Shared bridge
bridge = SemanticBridge()
```

## Agent Team Shutdown (EVERY TEAMMATE)

```python
from pathlib import Path
from tools_core.mermaid import generate_diagram

# Extract learnings
learner.extract_learnings_from_session(
    identity=me, session_dir=Path("meeseeks/logs/sessions/<session_id>")
)

# Document architecture
generate_diagram("<mermaid>", "docs/<component>_architecture.png", scale=4)
```

## Async-First Rule

ALL Meeseeks calls in agent teams MUST use async:
- `create_async_council()` → `await council.deliberate()` from `council/meeseeks_async_council.py`
- Wrap sync in `asyncio.to_thread()` if no async variant exists
- 5 parallel teammates = 5 concurrent LLM calls = blocking kills you

## Confidence-Gated Execution (NON-NEGOTIABLE)

| Confidence | Action |
|-----------|--------|
| >= 85% | Ship it |
| >= 70% | Ship with caveats noted |
| >= 50% | Ask teammate or spawn sub-Meeseeks |
| < 50% | **STOP** — escalate to team lead or human |

## Project Context (include in all council votes & reviews)

Adapt these to your project's domain. Common concerns:
- **Auth/RBAC**: Which roles exist and what they can access
- **Audit**: What data access gets logged
- **Citations**: Whether AI responses must cite sources
- **Data locality**: Whether data can leave the environment
- **Safety**: Domain-specific zero-tolerance rules
- **AI Guardrails**: Low confidence = say so + point to source. No guessing.

## Complete Skill Map (15 skills)

| Skill | Coverage |
|-------|----------|
| meeseeks-llm | LLM calling (call_model, providers, convenience functions) |
| meeseeks-tracer | Semantic tracing and structured logging |
| meeseeks-council | Multi-model deliberation (async + sync + visual) |
| meeseeks-srde | Self-resolving dissent engine + context resolver |
| meeseeks-semantic-bridge | Probe ↔ dissent linking, redundancy prevention |
| meeseeks-rsi-loop | RSI hypothesis loops, arbiter, confidence tracking |
| meeseeks-identity | Cross-agent learning, knowledge store, expert discovery |
| meeseeks-knowledge | Domain knowledge injection, elevated thinking |
| meeseeks-task-planner | Goal decomposition, opportunity discovery, runbooks |
| meeseeks-code-review | AI code review, probe factory, verification |
| meeseeks-consistency | Codebase auditing, self-healing |
| meeseeks-visual-sentinel | Screenshot capture, visual regression, vision council |
| meeseeks-mermaid | Mermaid diagram generation |
| meeseeks-spawner | Deploy Meeseeks to other repos |
| meeseeks-workflow | This file — master orchestration |

## Meeseeks File Map (Complete)

```
meeseeks/
├── tools_core/
│   ├── __init__.py                    ← Top-level exports (31 items)
│   ├── core/
│   │   ├── meeseeks_llm_caller.py      ← Multi-provider LLM (Claude, Gemini, GPT)
│   │   ├── meeseeks_tracer.py           ← Semantic logging
│   │   ├── meeseeks_data_classes.py     ← All RSI data structures
│   │   └── meeseeks_gemini3pro.py       ← Gemini 3 Pro specific
│   │
│   ├── council/
│   │   ├── meeseeks_async_council.py    ← ASYNC council (PREFERRED)
│   │   └── meeseeks_council.py          ← Sync fallback
│   │
│   ├── reasoning/
│   │   ├── spinning_meeseeks.py         ← Full RSI orchestrator
│   │   ├── loop_runner.py               ← 3-loop executor
│   │   ├── loop_arbiter.py              ← Meta-decision maker
│   │   ├── rsi_v3_engine.py             ← Battle-tested RSI v3
│   │   ├── hypothesis.py                ← Hypothesis management
│   │   ├── confidence.py                ← Confidence tracking
│   │   ├── session.py                   ← Session management
│   │   ├── meeseeks_srde.py             ← Self-Resolving Dissent Engine
│   │   ├── meeseeks_semantic_bridge.py  ← Probe ↔ dissent linking
│   │   ├── meeseeks_context_resolver.py ← Context-aware resolution
│   │   ├── meeseeks_identity.py         ← Cross-agent learning
│   │   ├── meeseeks_task_planner.py     ← Task decomposition
│   │   └── meeseeks_opportunity_discovery.py ← Proactive improvements
│   │
│   ├── probes/
│   │   ├── meeseeks_code_reviewer.py    ← AI code review
│   │   ├── meeseeks_probe_factory.py    ← Dynamic probe synthesis
│   │   ├── meeseeks_consistency_auditor.py ← Codebase consistency
│   │   ├── meeseeks_self_healer.py      ← Auto-fix issues
│   │   └── meeseeks_visual_sentinel.py  ← Visual regression
│   │
│   ├── knowledge_registry.py            ← Domain knowledge injection
│   ├── tools_registry.py                ← Tools awareness
│   ├── mermaid/                          ← Diagram generation
│   ├── scripts/                          ← CLI tools + runbook generator
│   ├── server/                           ← FastAPI for LLM chat
│   ├── spawner/                          ← Deploy to other repos
│   │
│   └── domain/                           ← Domain-specific tools
│       ├── excel/rsi/                    ← Excel RSI (SRDE, probes, bridge, visual)
│       ├── pdf/                          ← PDF processing agent
│       ├── video/                        ← Video transcription
│       ├── media/                        ← Generative media (local + cloud)
│       ├── finance/                      ← DCF, sensitivity analysis
│       └── cloud/fal_client.py           ← FAL AI (50+ models)
│
├── box/
│   ├── prime_directive.md               ← Current task (set per project)
│   ├── 00_llm_router_config.json        ← Model configs
│   ├── API_CONFIG.env                    ← API keys
│   ├── knowledge/                        ← Domain knowledge files
│   ├── templates/                        ← JSON schemas
│   └── meeseeks_registry/               ← Persisted identities
│
├── goals/                                ← Goal definitions
├── logs/                                 ← Sessions, traces, runs
├── tools_spawned/                        ← Dynamically created tools
└── artifacts/                            ← Output artifacts
```
