---
name: meeseeks-knowledge
description: >
  Domain knowledge injection with elevated thinking (mental models that change
  HOW the agent thinks). Use when creating domain knowledge, injecting
  project context into prompts, or building agent skills. Knowledge files
  live in meeseeks/box/knowledge/ with YAML frontmatter.
---

# Meeseeks Knowledge System

## File Locations
```
meeseeks/tools_core/knowledge_registry.py  ← KnowledgeRegistry

meeseeks/box/knowledge/
├── README.md
├── browser-automation.md
├── cloud-generative-media.md
├── data-visualization-plotly.md
├── financial-modeling.md
├── generative-media.md
├── meeseeks-wisdom.md           ← Hard-won operational truths
├── modes-of-thought.md          ← Universal analysis frameworks
├── nano-banana-compression.md
└── svg-elevated-llm.md          ← Mental models for SVG mastery
```

## Elevated Thinking (The Key Insight)

Knowledge files contain **mental models** that change HOW reasoning works:

```markdown
---
name: Domain Structure
description: Your domain's document organization
domains: [your, domain, tags]
keywords: [relevant, keywords]
when_to_use: When working with domain documents
priority: high
max_tokens: 4000
---

## Key Mental Models
1. **Mental model 1** — paradigm shift that changes reasoning
2. **Mental model 2** — another reframe
3. **Mental model 3** — structural insight

## Elevated Thinking Prompts
1. Does this preserve the relevant scope?
2. Will the citation trace back to the source?
```

## Usage

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core import KnowledgeRegistry, create_knowledge

registry = KnowledgeRegistry()

# Get relevant knowledge for a task
relevant = registry.get_relevant_knowledge(
    task="Build compliance tracker agent",
    domains=["<your>", "<domains>"],
)

# Get elevated thinking (mental models + prompts FIRST)
elevated = registry.get_elevated_summary()
prompt = registry.generate_knowledge_prompt(relevant, elevated_first=True)
```

## Creating Project-Specific Knowledge

Add knowledge files to `meeseeks/box/knowledge/` with YAML frontmatter.
Each file should include domains, keywords, mental models, and elevated
thinking prompts relevant to your project's domain.
