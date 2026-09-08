---
name: meeseeks-spawner
description: >
  Deploy the Meeseeks RSI system into any target repository. Analyzes the
  target repo, copies core tools, generates customized AGENTS.md, and sets
  up the prime directive. Use when you need Meeseeks capabilities in a new
  project or when bootstrapping agent teams in another codebase.
---

# Meeseeks Spawner

## File Locations
```
meeseeks/tools_core/spawner/
├── __init__.py
├── meeseeks_spawner.py    ← MeeseeksSpawner, RepoAnalyzer, spawn_meeseeks()
└── __main__.py             ← CLI entry point

meeseeks/spawn_meeseeks.py ← Top-level CLI script
```

## Exports
```
From spawner __init__:
  spawn_meeseeks, MeeseeksSpawner, RepoAnalyzer, RepoAnalysis
```

## Quick Spawn (function)

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.spawner import spawn_meeseeks

spawn_meeseeks(
    target_repo="/path/to/target/repo",
    prime_directive="Build authentication system with JWT and RBAC",
    meeseeks_dir=".meeseeks",  # directory name in target repo
)
```

## Full Control (class)

```python
from tools_core.spawner import MeeseeksSpawner, RepoAnalyzer

# Analyze the target repo first
analyzer = RepoAnalyzer()
analysis = analyzer.analyze("/path/to/target/repo")
print(f"Tech stack: {analysis.tech_stack}")
print(f"Languages: {analysis.languages}")

# Spawn with full control
spawner = MeeseeksSpawner()
spawner.spawn(
    target_repo="/path/to/repo",
    prime_directive="Build feature X",
    meeseeks_dir=".meeseeks",
)
```

## CLI Usage

```bash
cd meeseeks

# Basic spawn
./spawn_meeseeks.py /path/to/target/repo

# With a task
./spawn_meeseeks.py /path/to/repo --task "Build authentication system"

# Custom directory name
./spawn_meeseeks.py /path/to/repo --dir meeseeks --task "Add tests"
```

## What Gets Spawned

```
target-repo/
├── .meeseeks/                    # Spawned Meeseeks
│   ├── AGENTS.md                 # Customized for THIS repo
│   ├── tools_core/               # Core RSI system
│   ├── box/
│   │   ├── prime_directive.md    # The task
│   │   ├── knowledge/
│   │   │   ├── repo_analysis.json    # Auto-analyzed repo info
│   │   │   └── repo_summary.md       # Human-readable analysis
│   │   └── templates/            # JSON schemas
│   ├── logs/sessions/            # Session logs
│   └── tools_spawned/            # Sub-helpers
└── AGENTS.md                     # Also added to repo root
```

## RepoAnalysis Fields
- `tech_stack` — detected technologies
- `languages` — programming languages found
- `frameworks` — detected frameworks
- `structure` — directory structure summary
- `patterns` — coding patterns detected

## Self-Evolution

The spawned Meeseeks can:
1. **Read repo context** from `box/knowledge/repo_analysis.json`
2. **Follow repo patterns** based on detected tech stack
3. **Spawn sub-helpers** that inherit repo knowledge
4. **Leave hints** for future Meeseeks in the knowledge base

## When to Use
- Bootstrapping Meeseeks in a new project
- Setting up agent teams in a different codebase
- Creating domain-specific Meeseeks instances
- Deploying RSI capabilities to client repos
