---
name: meeseeks-llm
description: >
  Multi-provider LLM caller supporting Claude, Gemini, and GPT. Provides a
  unified call_model() interface plus convenience functions for each provider.
  Model configs live in meeseeks/box/00_llm_router_config.json. Use whenever
  you need to call an external LLM from Meeseeks code.
autoload: true
---

# Meeseeks LLM Caller

## File Locations
```
meeseeks/tools_core/core/
├── meeseeks_llm_caller.py     ← Multi-provider LLM calls
└── meeseeks_gemini3pro.py     ← Gemini 3 Pro specific utilities

meeseeks/box/
├── 00_llm_router_config.json  ← Model configs (names, providers, params)
└── API_CONFIG.env             ← API keys (ANTHROPIC_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY)
```

## Exports
```
From core __init__:
  call_model, call_anthropic, call_google, call_gemini_pro, call_gemini_flash,
  call_claude_opus, call_claude_sonnet, list_available_models, get_model_config,
  Provider, ModelConfig
```

## Universal Caller (recommended)

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.core import call_model

# Routes to the right provider automatically based on model name
response = call_model(
    model="claude-opus-4-6",
    prompt="Analyze this architecture for potential issues...",
    system="You are a senior software architect.",
    max_tokens=8000,       # optional, uses model default if None
    temperature=0.7,       # optional, default 0.7
)
print(response)  # string response
```

## Convenience Functions

```python
from tools_core.core import (
    call_claude_opus,
    call_claude_sonnet,
    call_gemini_pro,
    call_gemini_flash,
    call_anthropic,
    call_google,
)

# Claude (via Anthropic)
response = call_claude_opus("Design an architecture for...", system="You are an architect")
response = call_claude_sonnet("Quick question about...", system=None)

# Gemini (via Google)
response = call_gemini_pro("Analyze this 200k token codebase...", system="Code reviewer")
response = call_gemini_flash("Quick classification task", system=None)

# Direct provider calls (with model name)
response = call_anthropic(
    model="claude-opus-4-6",
    prompt="...",
    system="...",
    max_tokens=8000,
    temperature=0.7,
)

response = call_google(
    model="gemini-3.1-pro-preview",
    prompt="...",
    system="...",
    max_tokens=8000,
    temperature=0.7,
)
```

## Model Discovery

```python
from tools_core.core import list_available_models, get_model_config

# List all configured models
models = list_available_models()
for model in models:
    print(model)

# Get config for a specific model
config = get_model_config("claude-opus-4-6")
```

## Provider enum
```python
from tools_core.core import Provider

Provider.ANTHROPIC  # Claude models
Provider.GOOGLE     # Gemini models
Provider.OPENAI     # GPT models
```

## Model Config

Models are configured in `meeseeks/box/00_llm_router_config.json`:
- `claude-opus-4-6` — Creative, architecture, complex reasoning
- `gemini-3.1-pro-preview` — 2M context, analysis, large codebases
- `gpt-5.3-codex` — OpenAI top tier

API keys in `meeseeks/box/API_CONFIG.env`:
```
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

## Rules
- ALWAYS trace LLM calls via the Tracer (see meeseeks-tracer skill)
- For council decisions, use meeseeks-council skill instead of raw LLM calls
- Match model to task: Opus for architecture, Gemini Pro for large context, Flash for quick tasks
