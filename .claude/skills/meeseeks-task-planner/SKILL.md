---
name: meeseeks-task-planner
description: >
  Task decomposition and opportunity discovery. Breaks complex goals into
  structured subtasks, discovers improvement opportunities proactively.
  Use before starting large features to plan the work, or to find improvements
  in existing code. Also generates autonomous prompt runbooks for hands-off execution.
---

# Meeseeks Task Planner + Opportunity Discovery

## File Locations
```
meeseeks/tools_core/reasoning/
├── meeseeks_task_planner.py           ← Task decomposition
├── meeseeks_opportunity_discovery.py  ← Proactive improvement finding

meeseeks/tools_core/scripts/
├── goal_to_meeseeks_aware_prompt_list.py  ← Autonomous runbook generator
├── meeseeks_spin.py                        ← Full RSI spinner CLI
└── meeseeks_loop.py                        ← Quick 3-loop CLI
```

## Exports
```
From reasoning __init__:
  TaskStatus, TaskPriority, Task, TaskPlan, decompose_goal, save_plan, load_plan,
  run_discovery, identify_opportunities, rank_opportunities, design_opportunity
```

## Task Decomposition

Break a large goal into structured, prioritized subtasks:

```python
import sys
sys.path.insert(0, 'meeseeks')
from pathlib import Path
from tools_core.reasoning import decompose_goal, save_plan, load_plan

plan = decompose_goal(
    goal="<your high-level goal here>",
    codebase_path=Path("apps/api/"),   # optional — provides codebase context
    tracer=None,                        # optional Tracer instance
)

for task in plan.tasks:
    print(f"[{task.priority}] {task.name}: {task.description}")
    print(f"  Dependencies: {task.dependencies}")
    print(f"  Status: {task.status}")

# Save/load plans
save_plan(plan, Path("meeseeks/logs/plans/my_plan.json"))
loaded = load_plan(Path("meeseeks/logs/plans/my_plan.json"))
```

### Task dataclass fields
- `name` — task title
- `description` — what needs to be done
- `priority` — TaskPriority enum (CRITICAL, HIGH, MEDIUM, LOW)
- `status` — TaskStatus enum (PENDING, IN_PROGRESS, DONE, BLOCKED)
- `dependencies` — list of task names this depends on

## Opportunity Discovery

Proactively find improvements in existing code:

```python
from tools_core.reasoning import run_discovery, identify_opportunities, rank_opportunities

# Full discovery run (multi-loop)
results = run_discovery(
    loops=3,                    # number of analysis loops
    focus_area="performance",   # optional focus
    output_dir=Path("meeseeks/logs/discovery/"),
)

# Or step-by-step
opportunities = identify_opportunities(context="<codebase analysis>")
ranked = rank_opportunities(opportunities)

for opp in ranked:
    print(f"[{opp['impact']}] {opp['description']}")
    print(f"  Effort: {opp['effort']}")
```

## Autonomous Runbook Generator

Turn a high-level goal into 50-100 Meeseeks-aware prompts for hands-off execution:

```bash
cd meeseeks

# Generate runbook
python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py \
    "<your goal here>" \
    --ai-plan --target-prompts 75 \
    --output logs/prompt_lists/my_runbook.md

# Or from a file
python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py \
    --file box/prime_directive.md \
    --target-prompts 75

# Template-only (no LLM calls, deterministic)
python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py \
    "Build auth system" --template-only --target-prompts 60
```

Arguments:
- `goal` (positional) — the goal / prime directive
- `--file, -f` — read goal from a file instead
- `--target-prompts, -n` — target prompt count (10-100, default 75)
- `--output, -o` — output path (default: `logs/prompt_lists/{timestamp}_prompt_list.md`)
- `--template-only` — deterministic, no LLM calls
- `--ai-plan` — use LLM to tailor the prompt list

The generated runbook embeds:
- RSI loop rules (3 hypotheses, confidence checkpoints)
- Review cycles (implement → review → apply → re-review → validate)
- Designed to run for hours without human intervention

## CLI Quick Commands

```bash
cd meeseeks

# Full RSI spinner (keeps going until done)
RUN_ID=$(date +"%Y%m%d_%H%M%S")
export MEESEEKS_TRACES_DIR="logs/agent_runs/$RUN_ID/traces"
./tools_core/scripts/meeseeks_spin.py "Build auth system" \
    --output logs/agent_runs/$RUN_ID/sessions \
    --max-loops 10 --verbose

# Or from a file
./tools_core/scripts/meeseeks_spin.py --file box/prime_directive.md

# Quick 3-loop analysis
./tools_core/scripts/meeseeks_loop.py "Check for security issues"

# Single loop
./tools_core/scripts/meeseeks_loop.py "Quick review" --loops 1

# Custom output directory
./tools_core/scripts/meeseeks_loop.py "Analyze API" --output logs/api_review
```
