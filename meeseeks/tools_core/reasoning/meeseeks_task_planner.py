#!/usr/bin/env python3
"""
task_planner.py - Goal Decomposition and Task Planning

This module uses external LLMs to decompose complex goals into
actionable tasks, leveraging Gemini's 2M context for codebase analysis.

Part of the Meeseeks RSI Toolkit.
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum

# Import from core - try both import paths for flexibility
try:
    from core.meeseeks_llm_caller import call_gemini_pro, call_claude_opus, get_default_model
    from core.meeseeks_tracer import Tracer, Phase, get_tracer
except ImportError:
    from tools_core.core.meeseeks_llm_caller import call_gemini_pro, call_claude_opus, get_default_model
    from tools_core.core.meeseeks_tracer import Tracer, Phase, get_tracer


class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


class TaskPriority(Enum):
    CRITICAL = "critical"  # Must be done for demo
    HIGH = "high"          # Important but not blocking
    MEDIUM = "medium"      # Nice to have
    LOW = "low"            # Can skip if time constrained


@dataclass
class Task:
    """A single actionable task."""
    id: str
    title: str
    description: str
    priority: TaskPriority
    status: TaskStatus
    dependencies: List[str]  # List of task IDs this depends on
    estimated_hours: float
    files_involved: List[str]
    acceptance_criteria: List[str]
    notes: str = ""


@dataclass 
class TaskPlan:
    """A complete task plan with ordered tasks."""
    goal: str
    tasks: List[Task]
    total_estimated_hours: float
    critical_path: List[str]  # Task IDs in critical path order
    created_at: str


def gather_codebase_context(base_path: Path) -> str:
    """
    Gather context from the codebase for analysis.
    
    This creates a summary of the project structure and key files
    that can be sent to Gemini for comprehensive analysis.
    """
    context_parts = []
    
    # Key directories to analyze
    key_dirs = [
        "legion-desktop-app/src",
        "__TO_MERGE_LIST/legion-gateway",
        "__TO_MERGE_LIST/legion-opencode", 
        "__TO_MERGE_LIST/legion-tools",
        "__TO_MERGE_LIST/l-os-legion-ui-chat-panel/src",
    ]
    
    for dir_path in key_dirs:
        full_path = base_path / dir_path
        if full_path.exists():
            context_parts.append(f"\n\n### {dir_path}\n")
            context_parts.append(_get_directory_tree(full_path, max_depth=3))
            
            # Get key file contents
            for ext in ['.go', '.ts', '.tsx', '.js', '.json', '.md']:
                for file_path in full_path.rglob(f'*{ext}'):
                    # Skip node_modules and other generated files
                    if 'node_modules' in str(file_path) or '.git' in str(file_path):
                        continue
                    
                    try:
                        content = file_path.read_text()
                        if len(content) < 10000:  # Only include smaller files in full
                            rel_path = file_path.relative_to(base_path)
                            context_parts.append(f"\n\n#### {rel_path}\n```{ext[1:]}\n{content}\n```\n")
                    except Exception:
                        pass
    
    return ''.join(context_parts)


def _get_directory_tree(path: Path, max_depth: int = 3, prefix: str = "") -> str:
    """Get a tree representation of a directory."""
    if max_depth <= 0:
        return ""
    
    lines = []
    try:
        entries = sorted(path.iterdir(), key=lambda x: (x.is_file(), x.name))
        for i, entry in enumerate(entries):
            if entry.name.startswith('.') or entry.name == 'node_modules':
                continue
            
            is_last = i == len(entries) - 1
            current_prefix = "└── " if is_last else "├── "
            lines.append(f"{prefix}{current_prefix}{entry.name}")
            
            if entry.is_dir():
                next_prefix = prefix + ("    " if is_last else "│   ")
                lines.append(_get_directory_tree(entry, max_depth - 1, next_prefix))
    except PermissionError:
        pass
    
    return '\n'.join(filter(None, lines))


def decompose_goal(
    goal: str,
    codebase_path: Optional[Path] = None,
    tracer: Optional[Tracer] = None,
) -> TaskPlan:
    """
    Decompose a high-level goal into actionable tasks using Gemini.
    
    Args:
        goal: The high-level goal to decompose
        codebase_path: Path to the codebase root
        tracer: Optional tracer for logging
    
    Returns:
        A TaskPlan with ordered, actionable tasks
    """
    tracer = tracer or get_tracer()
    
    # Log the start of decomposition
    tracer.log(
        phase=Phase.PLANNING,
        title="Goal Decomposition Started",
        context=f"Decomposing goal: {goal}",
        reasoning="Using Gemini 3 Pro with 2M context to analyze the codebase and create a detailed task plan.",
        decision_action="Gathering codebase context and calling Gemini for analysis.",
        next_steps=["Gather codebase context", "Call Gemini", "Parse response into tasks"],
    )
    
    # Gather context if path provided
    context = ""
    if codebase_path:
        context = gather_codebase_context(codebase_path)
    
    # Build the prompt
    prompt = f"""You are a senior software architect planning a complex integration project.

## Goal
{goal}

## Codebase Context
{context if context else "No codebase context provided."}

## Your Task
Create a detailed, actionable task plan. For each task, provide:

1. **ID**: Short unique identifier (e.g., "merge-ui-1")
2. **Title**: Clear, action-oriented title
3. **Description**: What needs to be done
4. **Priority**: critical/high/medium/low
5. **Dependencies**: List of task IDs this depends on
6. **Estimated Hours**: Realistic time estimate
7. **Files Involved**: Key files that will be modified
8. **Acceptance Criteria**: How to know the task is done

## Output Format
Respond with a JSON object:
```json
{{
  "tasks": [
    {{
      "id": "task-1",
      "title": "Task Title",
      "description": "Detailed description",
      "priority": "critical",
      "dependencies": [],
      "estimated_hours": 2.0,
      "files_involved": ["path/to/file.ts"],
      "acceptance_criteria": ["Criterion 1", "Criterion 2"]
    }}
  ],
  "critical_path": ["task-1", "task-2"],
  "total_estimated_hours": 10.0,
  "key_risks": ["Risk 1"],
  "recommended_order": "Description of recommended execution order"
}}
```

Focus on:
1. Getting a working demo ASAP
2. Minimal changes to achieve integration
3. Clear dependencies between tasks
4. Realistic time estimates

Be specific about which files need changes and what changes are needed.
"""

    system = """You are an expert software architect. You create detailed, actionable task plans.
Your plans are realistic, well-ordered, and focused on delivering working software quickly.
Always output valid JSON that can be parsed directly."""

    # Call Gemini
    try:
        response = call_gemini_pro(prompt, system)
        
        # Parse the JSON from the response
        # Try to extract JSON from the response
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            json_str = response[json_start:json_end]
            plan_data = json.loads(json_str)
        else:
            raise ValueError("No JSON found in response")
        
        # Convert to Task objects
        tasks = []
        for t in plan_data.get('tasks', []):
            tasks.append(Task(
                id=t['id'],
                title=t['title'],
                description=t['description'],
                priority=TaskPriority(t.get('priority', 'medium')),
                status=TaskStatus.PENDING,
                dependencies=t.get('dependencies', []),
                estimated_hours=float(t.get('estimated_hours', 1.0)),
                files_involved=t.get('files_involved', []),
                acceptance_criteria=t.get('acceptance_criteria', []),
            ))
        
        plan = TaskPlan(
            goal=goal,
            tasks=tasks,
            total_estimated_hours=plan_data.get('total_estimated_hours', sum(t.estimated_hours for t in tasks)),
            critical_path=plan_data.get('critical_path', [t.id for t in tasks if t.priority == TaskPriority.CRITICAL]),
            created_at=str(Path(__file__).stat().st_mtime),
        )
        
        # Log success
        tracer.log(
            phase=Phase.PLANNING,
            title="Goal Decomposition Complete",
            context=f"Successfully decomposed goal into {len(tasks)} tasks.",
            reasoning=f"Gemini analyzed the codebase and created a structured plan with {plan.total_estimated_hours} estimated hours.",
            decision_action=f"Created task plan with critical path: {' → '.join(plan.critical_path[:5])}",
            model_calls=[{
                "model": get_default_model("google_top"),
                "prompt_summary": f"Decompose goal: {goal[:100]}...",
                "response_summary": f"Created {len(tasks)} tasks, {plan.total_estimated_hours}h estimated",
            }],
            next_steps=[t.title for t in tasks[:5]],
            metadata={"task_count": len(tasks), "total_hours": plan.total_estimated_hours},
        )
        
        return plan
        
    except Exception as e:
        # Log failure and create a basic plan
        tracer.log(
            phase=Phase.PLANNING,
            title="Goal Decomposition Failed - Using Fallback",
            context=f"Gemini call failed: {e}",
            reasoning="Will create a basic fallback plan based on known project structure.",
            decision_action="Creating fallback task plan.",
        )
        
        # Return a basic fallback plan
        return create_fallback_plan(goal)


def create_fallback_plan(goal: str) -> TaskPlan:
    """Create a basic fallback plan when LLM fails."""
    tasks = [
        Task(
            id="merge-ui-1",
            title="Copy chat panel components to Electron renderer",
            description="Copy l-os-legion-ui-chat-panel/src/features to legion-desktop-app/src/renderer",
            priority=TaskPriority.CRITICAL,
            status=TaskStatus.PENDING,
            dependencies=[],
            estimated_hours=1.0,
            files_involved=["l-os-legion-ui-chat-panel/src/features/*"],
            acceptance_criteria=["Components copied", "Imports updated"],
        ),
        Task(
            id="merge-ui-2", 
            title="Update Electron renderer to use chat panel",
            description="Modify App.tsx to import and render the ChatPanel",
            priority=TaskPriority.CRITICAL,
            status=TaskStatus.PENDING,
            dependencies=["merge-ui-1"],
            estimated_hours=1.0,
            files_involved=["legion-desktop-app/src/renderer/App.tsx"],
            acceptance_criteria=["Chat panel renders", "No import errors"],
        ),
        Task(
            id="docker-1",
            title="Create Docker compose file",
            description="Set up docker-compose.yml for gateway, opencode, tools services",
            priority=TaskPriority.HIGH,
            status=TaskStatus.PENDING,
            dependencies=[],
            estimated_hours=2.0,
            files_involved=["docker/docker-compose.yml"],
            acceptance_criteria=["All services start", "Health checks pass"],
        ),
        Task(
            id="wire-1",
            title="Wire Electron to gateway",
            description="Update Electron to connect to gateway API on localhost:8089",
            priority=TaskPriority.HIGH,
            status=TaskStatus.PENDING,
            dependencies=["merge-ui-2", "docker-1"],
            estimated_hours=1.5,
            files_involved=["legion-desktop-app/src/renderer/*"],
            acceptance_criteria=["API calls work", "Events stream"],
        ),
    ]
    
    return TaskPlan(
        goal=goal,
        tasks=tasks,
        total_estimated_hours=sum(t.estimated_hours for t in tasks),
        critical_path=["merge-ui-1", "merge-ui-2", "wire-1"],
        created_at="fallback",
    )


def save_plan(plan: TaskPlan, path: Path):
    """Save a task plan to JSON."""
    data = {
        "goal": plan.goal,
        "tasks": [asdict(t) for t in plan.tasks],
        "total_estimated_hours": plan.total_estimated_hours,
        "critical_path": plan.critical_path,
        "created_at": plan.created_at,
    }
    
    # Convert enums to strings
    for t in data["tasks"]:
        t["priority"] = t["priority"].value if hasattr(t["priority"], 'value') else t["priority"]
        t["status"] = t["status"].value if hasattr(t["status"], 'value') else t["status"]
    
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def load_plan(path: Path) -> TaskPlan:
    """Load a task plan from JSON."""
    with open(path, 'r') as f:
        data = json.load(f)
    
    tasks = []
    for t in data["tasks"]:
        tasks.append(Task(
            id=t["id"],
            title=t["title"],
            description=t["description"],
            priority=TaskPriority(t["priority"]),
            status=TaskStatus(t["status"]),
            dependencies=t["dependencies"],
            estimated_hours=t["estimated_hours"],
            files_involved=t["files_involved"],
            acceptance_criteria=t["acceptance_criteria"],
            notes=t.get("notes", ""),
        ))
    
    return TaskPlan(
        goal=data["goal"],
        tasks=tasks,
        total_estimated_hours=data["total_estimated_hours"],
        critical_path=data["critical_path"],
        created_at=data["created_at"],
    )


if __name__ == "__main__":
    # Test the planner
    from pathlib import Path
    
    base = Path(__file__).parent.parent
    goal = "Build out the target project - merge all components from __TO_MERGE_LIST into a working Electron app with Docker backend"
    
    print("Decomposing goal...")
    plan = decompose_goal(goal, base)
    
    print(f"\n=== Task Plan ===")
    print(f"Goal: {plan.goal}")
    print(f"Total Tasks: {len(plan.tasks)}")
    print(f"Estimated Hours: {plan.total_estimated_hours}")
    print(f"\nCritical Path: {' → '.join(plan.critical_path)}")
    
    print(f"\n=== Tasks ===")
    for task in plan.tasks:
        print(f"\n[{task.priority.value.upper()}] {task.id}: {task.title}")
        print(f"  Est: {task.estimated_hours}h | Deps: {task.dependencies}")

