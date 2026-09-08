---
name: meeseeks-mermaid
description: >
  Generate high-resolution PNG diagrams from Mermaid code. Use for architecture
  diagrams, agent topology, data flows, sequence diagrams. Requires npx/Node.js.
---

# Meeseeks Mermaid Diagram Generator

## File Locations
```
meeseeks/tools_core/mermaid/
├── __init__.py
├── generate.sh      ← Shell script (quick)
└── generator.py     ← Python API
```

## Usage

```bash
cd meeseeks
./tools_core/mermaid/generate.sh diagram.mmd output.png --scale 4
./tools_core/mermaid/generate.sh --all diagrams/
```

```python
import sys
sys.path.insert(0, 'meeseeks')

from tools_core.mermaid import generate_diagram

generate_diagram(
    "graph TD; A[Query] --> B[Agent]; B --> C[RAG]; C --> D[pgvector]",
    "architecture.png",
    scale=4,
    theme="default",
)
```

## Common Diagrams
- Agent topology (agents + connections)
- Data pipeline flow (input → process → output)
- Permission flow (auth → middleware → scoping)
- Entity lifecycle (states + triggers)
- Service topology
- Meeseeks RSI integration (agent teams → Meeseeks calls)
