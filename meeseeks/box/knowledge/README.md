# 📚 Meeseeks Knowledge Base

> *"I'M MR. MEESEEKS! I KNOW THINGS!"*

This directory contains **domain knowledge** that can be injected into Meeseeks prompts when relevant. Unlike tools (which do things), knowledge (which informs thinking).

## How It Works

1. Knowledge files live here with metadata
2. `KnowledgeRegistry` scans and indexes them
3. When Meeseeks starts a task, it queries: "What knowledge is relevant?"
4. Relevant knowledge is injected into the prompt

## File Structure

Each knowledge file needs **frontmatter** at the top:

```markdown
---
name: SVG Elevated Thinking
description: Advanced SVG techniques for creating sophisticated visual experiences
domains: [svg, animation, graphics, visualization, frontend]
keywords: [viewBox, path, filter, clip-path, mask, gsap, responsive]
when_to_use: When working with SVG graphics, animations, data visualizations, or interactive frontend components
priority: high
max_tokens: 4000
---

# Your Knowledge Content Here

...actual content...
```

## Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name |
| `description` | Yes | Brief description |
| `domains` | Yes | Categories (e.g., `[svg, frontend, animation]`) |
| `keywords` | Yes | Trigger words that indicate relevance |
| `when_to_use` | Yes | Natural language description of when to include |
| `priority` | No | `critical`, `high`, `medium`, `low` (default: medium) |
| `max_tokens` | No | Approximate token count (helps with prompt budgeting) |
| `version` | No | Version string for tracking updates |
| `source` | No | Where this knowledge came from |

## Example Knowledge Files

### Domain Expertise
```
knowledge/
├── svg-elevated-llm.md      # SVG advanced techniques
├── react-patterns.md        # React best practices
├── python-async.md          # Async/await patterns
├── api-design.md            # REST/GraphQL design
└── database-optimization.md # Query optimization
```

### Project-Specific
```
knowledge/
├── repo_analysis.json       # Auto-generated repo context
├── architecture.md          # System architecture
├── conventions.md           # Code conventions
└── gotchas.md               # Known issues/workarounds
```

## How Relevance Is Determined

The `KnowledgeRegistry` scores relevance based on:

1. **Domain match**: Task domains ∩ knowledge domains
2. **Keyword match**: Task text contains knowledge keywords
3. **Explicit request**: Task mentions the knowledge by name
4. **Priority**: Higher priority knowledge preferred when budgets are tight

## Using Knowledge in Code

```python
from tools_core import KnowledgeRegistry

registry = KnowledgeRegistry()

# Get all relevant knowledge for a task
relevant = registry.get_relevant_knowledge(
    task="Create an animated SVG visualization",
    domains=["frontend", "visualization"],
    max_tokens=8000,  # Budget for knowledge
)

# Build prompt with knowledge
for k in relevant:
    prompt += f"\n\n## Knowledge: {k.name}\n{k.content}"
```

## Creating New Knowledge

### Option 1: Manual
Create a `.md` file with frontmatter:

```markdown
---
name: My Domain Knowledge
description: What this knowledge covers
domains: [domain1, domain2]
keywords: [keyword1, keyword2, keyword3]
when_to_use: When you need to...
priority: medium
---

# Content

Your knowledge content here...
```

### Option 2: Programmatic
```python
from tools_core import create_knowledge

create_knowledge(
    name="API Design Patterns",
    description="Best practices for REST and GraphQL APIs",
    domains=["api", "backend", "architecture"],
    keywords=["REST", "GraphQL", "endpoint", "schema"],
    when_to_use="When designing or reviewing API endpoints",
    content="# API Design Patterns\n\n...",
)
```

### Option 3: Extracted from Sessions
Meeseeks can extract knowledge from successful sessions:

```python
from tools_core import extract_knowledge_from_session

# After a successful session about SVG optimization
extract_knowledge_from_session(
    session_id="20260117_143022",
    name="SVG Optimization Learnings",
    domains=["svg", "performance"],
)
```

## Knowledge vs Tools vs Identity

| Concept | Purpose | Location |
|---------|---------|----------|
| **Knowledge** | Inform thinking (context) | `box/knowledge/` |
| **Tools** | Do things (actions) | `tools_core/`, `tools_spawned/` |
| **Identity** | Remember learnings (hints) | `box/meeseeks_registry/` |

- **Knowledge**: "Here's everything about SVG animations"
- **Tools**: "Here's a function to generate diagrams"
- **Identity**: "Last time I parsed PDFs, the list was cut off on page 5"

## Best Practices

1. **Be specific**: Vague knowledge is useless
2. **Include examples**: Code snippets, patterns, anti-patterns
3. **Keep updated**: Outdated knowledge causes bugs
4. **Right-size**: Don't dump everything - be selective
5. **Tag accurately**: Good keywords = good relevance matching
6. **Consider tokens**: Large knowledge files eat prompt budget

## Token Budgeting

Meeseeks has a prompt token budget. Knowledge competes with:
- System prompt
- Task description
- Conversation history
- Tool descriptions

Set `max_tokens` in frontmatter to help the registry make smart choices.

---

*"LOOK AT ME! I'M FULL OF KNOWLEDGE!" 🔵*
