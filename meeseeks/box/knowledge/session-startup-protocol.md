---
name: Session Startup Protocol
description: The brain-loading sequence every agent MUST follow before doing any work
domains: [session-management, onboarding, agent-protocol]
keywords: [session, startup, brain-load, context, prime-directive, skills, codebase]
when_to_use: At the START of every session, before any implementation work
priority: critical
max_tokens: 2000
---

# Session Startup Protocol — "Brain Loading"

## Why This Matters

An AI agent without context is like a contractor who shows up to a job site without reading the blueprints. They'll start working, but they'll make wrong assumptions, miss requirements, and produce work that doesn't fit.

**The #1 cause of bad agent output is insufficient context at session start.**

This protocol ensures the agent has full context before it writes a single line of code.

## The Brain-Loading Sequence

Every session — whether in Cursor, Claude Code, or any AI coding tool — MUST start with this sequence:

### Step 1: Read the entire codebase structure

```
Read my whole codebase. Understand the directory structure, what exists,
what patterns are in use, and how things connect.
```

This gives the agent a map of the territory. Without it, the agent will create files in wrong places, duplicate existing code, or miss available utilities.

### Step 2: Read the Prime Directive

```
Read meeseeks/box/prime_directive.md
```

This is the mission document. It tells the agent:
- What this project IS
- Who uses it
- What the quality standards are
- What domain vocabulary matters
- What constraints exist

### Step 3: Read the Skills

```
Read all files in .claude/skills/
```

This tells the agent what Meeseeks capabilities are available — the RSI loop, council voting, code review, visual sentinel, etc. Without this, the agent won't know it CAN use these tools.

### Step 4: Read Domain Knowledge

```
Read the files in meeseeks/box/knowledge/ that are relevant to the current task
```

This injects domain expertise and mental models that change HOW the agent reasons about the problem.

## Mental Models

1. **Context is not optional** — An agent without context will confidently produce wrong output. Loading context feels slow but saves hours of rework.

2. **Breadth before depth** — Read the whole codebase structure FIRST (breadth), then dive into specific files (depth). The map matters more than any single file.

3. **Skills are capabilities** — Reading the skills isn't just documentation; it activates the agent's awareness of what tools are available. An agent that doesn't know about the council won't use the council.

4. **Every session starts cold** — Even if you "know" the codebase from a previous session, the agent doesn't. Context doesn't persist across sessions unless you explicitly reload it.

## The One-Liner Version

> "First prompt: read everything. Second prompt: start working."

## Anti-Patterns

- Starting work immediately without reading context
- Reading only the file you want to change (missing the bigger picture)
- Skipping the prime directive ("I already know what this project does")
- Not reading skills (the agent won't use tools it doesn't know about)
- Assuming context from a previous session carried over
