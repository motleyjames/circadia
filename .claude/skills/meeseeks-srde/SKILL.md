---
name: meeseeks-srde
description: >
  Self-Resolving Dissent Engine — automatically resolves disagreements from
  council votes without human intervention. Uses context-aware resolution
  (MentalModel), cross-references existing probes via Semantic Bridge, and
  pattern matching. Use after any council deliberation with dissent_points.
---

# Meeseeks SRDE (Self-Resolving Dissent Engine)

## File Locations
```
meeseeks/tools_core/reasoning/
├── meeseeks_srde.py              ← Core SRDE
├── meeseeks_context_resolver.py  ← Context-aware resolution (MentalModel)
├── meeseeks_semantic_bridge.py   ← Cross-reference probes ↔ dissents

meeseeks/tools_core/core/
└── meeseeks_data_classes.py      ← DissentPoint, ResolutionAttempt, etc.
```

Also domain-specific SRDE in `meeseeks/tools_core/domain/excel/rsi/srde.py`.

## Exports
```
From reasoning __init__:
  SelfResolvingDissentEngine, ContextResolver, PatternResolver, create_srde,
  ContextAwareResolver, ContextAnswer, ResolutionPattern, MentalModelInterface,
  create_context_resolver, SemanticBridge, create_semantic_bridge
```

## Resolution Order
1. **Context-aware** — uses MentalModel to UNDERSTAND the concern
2. **Cross-reference probes** — reuses evidence from Semantic Bridge
3. **Pattern-based** — matches known patterns (backup, validation, etc.)

## Usage

```python
import sys, asyncio
sys.path.insert(0, 'meeseeks')

from tools_core.council import create_async_council
from tools_core.reasoning import create_srde
from tools_core.probes import create_probe_factory

async def decide_with_resolution(question, context):
    # 1. Get council decision
    council = create_async_council()
    decision = await council.deliberate(
        prompt=f"Question: {question}\n\nContext: {context}",
    )

    # 2. Resolve any dissents
    if decision.dissent_points:
        srde = create_srde()
        unresolved = []

        for dissent in decision.dissent_points:
            resolution = srde.attempt_resolution(
                dissent_id=dissent.id,
                dissent_content=dissent.content,
                context=None,  # optional Dict[str, Any]
            )
            if resolution.status == "RESOLVED":
                print(f"✅ {dissent.content}")
            else:
                unresolved.append(dissent)

        # 3. Batch resolution alternative
        # results, resolved_count, total = srde.attempt_batch_resolution(dissents)

        # 4. Unresolved → generate probes
        if unresolved:
            factory = create_probe_factory()
            probes = factory.synthesize_from_council(decision.votes)
            results = factory.execute_probes(probes, context={})

    return decision

asyncio.run(decide_with_resolution("...", "..."))
```

## SRDE API

```python
from tools_core.reasoning import create_srde

srde = create_srde(
    context_resolver=None,   # optional ContextResolver
    domain_context=None,     # optional Dict[str, Any]
)

# Set a context resolver after creation
srde.set_context_resolver(my_resolver)

# Add custom pattern resolvers
srde.add_pattern_resolver(
    pattern="backup",
    resolver_fn=lambda dissent: ...,
    name="backup_pattern",
)

# Provide domain context
srde.set_domain_context({"entities": [...], "constraints": [...]})

# Register probe results (for cross-referencing)
srde.register_probe_result("probe_rbac_check", probe_result)

# Resolve a single dissent
resolution = srde.attempt_resolution(
    dissent_id="d_1",
    dissent_content="Will the backup be created before changes?",
    context=None,
)

# Batch resolve
results, resolved_count, total = srde.attempt_batch_resolution(dissent_points)

# Check stats
stats = srde.get_stats()
unresolved = srde.get_unresolved()
```

## Custom MentalModel (for your domain)

```python
from tools_core.reasoning import ContextAwareResolver, MentalModelInterface, create_context_resolver

class MyDomainMentalModel(MentalModelInterface):
    def get_entities(self):
        return ["User", "Order", "Product", "Payment"]
    def get_data_flow(self, source):
        return {"Order": ["Products", "Payment", "Shipping"]}
    def answer_question(self, question): ...
    def explain_relationship(self, source, target): ...

# Via factory
resolver = create_context_resolver(
    mental_model=MyDomainMentalModel(),
    patterns=None,  # optional List[ResolutionPattern]
)

# Or directly
resolver = ContextAwareResolver(mental_model=MyDomainMentalModel())
resolver.add_pattern("backup", lambda d: ..., "backup_check")

can_handle = resolver.can_resolve(dissent_content)
result = resolver.resolve(dissent_id, dissent_content, context=None)
```

## Resolution Statuses
- **RESOLVED** — proceed
- **PARTIALLY_RESOLVED** — run targeted probe
- **UNRESOLVED** — escalate or synthesize probe
- **NOT_APPLICABLE** — proceed
