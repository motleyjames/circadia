---
name: meeseeks-council
description: >
  Multi-model council deliberation (Claude + Gemini + GPT) for architectural
  decisions, approach selection, or any choice where multiple perspectives matter.
  ALWAYS prefer async via meeseeks_async_council.py. Use when choosing between
  approaches, evaluating tradeoffs, or when you need multi-LLM consensus.
autoload: true
---

# Meeseeks Council Vote (Async-First)

## When to Use
- Choosing between architectural approaches
- Evaluating tradeoffs (cost vs accuracy, speed vs correctness)
- Any decision where multi-model consensus reduces risk
- Before committing to a design pattern or library choice

## File Locations
```
meeseeks/tools_core/council/
├── __init__.py
├── meeseeks_async_council.py   ← ALWAYS USE THIS
└── meeseeks_council.py         ← sync fallback only
```

## Exports
```
From council __init__:
  council_vote, quick_council, get_opinion, synthesize_opinions,
  VotingMethod, Opinion, CouncilDecision, DEFAULT_COUNCIL, MODEL_WEIGHTS,
  AsyncCouncil, AsyncVisualCouncil, AsyncCouncilConfig, VisualVoteResult,
  create_async_council, create_visual_council
```

## ALWAYS Use Async

```python
import sys, asyncio
sys.path.insert(0, 'meeseeks')

from tools_core.council import create_async_council, AsyncCouncilConfig

async def decide(question: str, context: str):
    council = create_async_council()

    decision = await council.deliberate(
        prompt=f"Question: {question}\n\nContext: {context}",
        system="You are a technical architecture council member.",
    )

    print(f"Decision: {decision.final_decision}")
    print(f"Confidence: {decision.confidence}")

    if decision.dissent_points:
        print(f"⚠️ {len(decision.dissent_points)} dissent(s) — feed into SRDE")
        # See meeseeks-srde skill

    return decision

result = asyncio.run(decide(
    question="Should we use approach A or B?",
    context="Full context including constraints and requirements",
))
```

### Async with Custom Config

```python
config = AsyncCouncilConfig(...)  # customize models, weights, etc.
council = create_async_council(config=config)
decision = await council.deliberate(prompt="...", system="...")
```

### Sync Deliberation (from async council)

```python
council = create_async_council()
decision = council.deliberate_sync(prompt="...", system="...")
```

### Visual Council (image analysis)

```python
from tools_core.council import create_visual_council

visual_council = create_visual_council()
votes = await visual_council.analyze_image(
    image_b64="<base64-encoded-image>",
    prompt="Does this dashboard render correctly?",
)
# Or sync:
votes = visual_council.analyze_sync(image_b64="...", prompt="...")
```

## Sync Fallback (only if async is impossible)

```python
from tools_core.council import council_vote, quick_council

# Full council with options
decision = council_vote(
    question="Should we use approach A or B?",
    context="Full context here",
    models=["claude-opus-4-6", "gemini-3.1-pro-preview"],
    voting_method=VotingMethod.ARBITER,
    arbiter="claude-opus-4-6",
    tracer=None,  # optional Tracer instance
)

# Quick one-liner (returns string)
answer = quick_council("Should we cache at the API or DB layer?")

# Get a single model's opinion
opinion = get_opinion("claude-opus-4-6", "question", context="...")
```

## Model Config

Models are configured in `meeseeks/box/00_llm_router_config.json`:
- `claude-opus-4-6` — Creative, architecture
- `gemini-3.1-pro-preview` — 2M context, analysis
- `gpt-5.3-codex` — OpenAI top tier

API keys in `meeseeks/box/API_CONFIG.env`.

## Rules
- ALWAYS prefer async for agent teams (parallel teammates = concurrent calls)
- ALWAYS check dissent_points — never just read final_decision
- ALWAYS provide rich context — models deliberate better with specifics
- Feed dissents into SRDE for automatic resolution (see meeseeks-srde skill)
- Register results on Semantic Bridge for cross-teammate visibility
