#!/usr/bin/env python3
"""
goal_to_meeseeks_aware_prompt_list.py

Generate a Meeseeks-aware prompt list from a single goal.

Default is a long autonomous runbook (typically 50–100 prompts), but smaller
prompt counts are useful for quick demos.

This is a successor to the legacy, masterplan-specific prompt queue builder in
`tools_core/reasoning/original_rsi/`. Instead of hardcoding phases, it takes a goal
and emits a structured prompt sequence that guides:
- RSI loops (3 hypotheses rule, confidence checkpoints)
- Code reviews using Meeseeks probes
- Optional orchestration via Meeseeks CLIs

Usage:
  python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py "Your goal"
  python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py --file goal.md
  python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py "Goal" --template-only --target-prompts 60
  python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py "Goal" --ai-plan --target-prompts 75
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# Ensure imports work when executed directly from anywhere
TOOLS_CORE_PATH = Path(__file__).parent.parent
sys.path.insert(0, str(TOOLS_CORE_PATH))

# The directory that contains this `tools_core/` folder (i.e., the Meeseeks bundle root)
MEESEEKS_ROOT = TOOLS_CORE_PATH.parent


MIN_PROMPTS = 10
MAX_PROMPTS = 100
DEFAULT_TARGET_PROMPTS = 75


@dataclass(frozen=True)
class PromptBlock:
    title: str
    body: str


def _build_meeseeks_tools_prompt(meeseeks_root: Path) -> str:
    """
    Return a tools-awareness prompt describing what Meeseeks can do in THIS bundle.

    This is used to make `--ai-plan` genuinely Meeseeks-aware (not generic).
    """
    try:
        from tools_registry import ToolsRegistry  # type: ignore

        registry = ToolsRegistry(
            core_dir=meeseeks_root / "tools_core",
            spawned_dir=meeseeks_root / "tools_spawned",
        )
        # Keep this reasonably sized; include core tools and any spawned tools if present.
        return registry.generate_tools_prompt(include_spawned=True)
    except Exception as e:
        return f"(Tools registry unavailable: {e})"


def _env_has_value(env_path: Path, key: str) -> bool:
    if not env_path.exists():
        return False

    try:
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key and v.strip().strip('"').strip("'"):
                return True
    except Exception:
        return False

    return False


def _clamp_target_prompts(n: int) -> int:
    return max(MIN_PROMPTS, min(MAX_PROMPTS, n))


def _read_goal(args: argparse.Namespace) -> str:
    if args.file:
        goal_path = Path(args.file)
        if not goal_path.exists():
            raise SystemExit(f"❌ File not found: {args.file}")
        goal = goal_path.read_text().strip()
        if not goal:
            raise SystemExit(f"❌ File is empty: {args.file}")
        return goal

    if args.goal:
        goal = args.goal.strip()
        if goal:
            return goal

    raise SystemExit("❌ Error: Must provide a goal or --file")


def _default_output_path(timestamp: str) -> Path:
    return Path("logs") / "prompt_lists" / f"{timestamp}_prompt_list.md"


def _render_markdown(
    *,
    goal: str,
    prompts: List[PromptBlock],
    mode: str,
    created_at: str,
) -> str:
    header = f"""# Meeseeks-Aware Prompt List

**Goal:** {goal}
**Mode:** {mode}
**Generated:** {created_at}
**Total Prompts:** {len(prompts)}

---

## How to use (AUTONOMOUS)
This prompt list is designed to be **hands-off / autonomous**.

Recommended usage:
- Paste the entire file into a Cursor agent (or attach it as context) and say:\n  **“Execute PROMPT #1 through PROMPT #{len(prompts)} in order. Do not ask me questions unless you are truly blocked. Keep going until you finish.”**
- Each prompt is an **imperative instruction** for the agent to execute.\n- Prompts embed Meeseeks-aware cycles (implement → review → apply → re-review → validate) so you can walk away for 2–4 hours.

Meeseeks primitives to use during execution:
- **Co-locate traces with the run**: `export MEESEEKS_TRACES_DIR=\"logs/agent_runs/<RUN_ID>/traces\"`
- **Full orchestrator**: `python tools_core/scripts/meeseeks_spin.py \"<task>\" --output logs/agent_runs/<RUN_ID>/sessions`
- **Manual loops**: `python tools_core/scripts/meeseeks_loop.py \"<task>\" --loops 1|2|3 --output logs/agent_runs/<RUN_ID>/sessions`
- **Code review probe**: `from tools_core.probes import review_code, review_directory, format_review_as_markdown`

---
"""

    parts: List[str] = [header]
    for idx, prompt in enumerate(prompts, start=1):
        parts.append(f"## PROMPT #{idx}: {prompt.title}\n\n{prompt.body}\n")
        if idx != len(prompts):
            parts.append("\n---\n")
    return "\n".join(parts).rstrip() + "\n"


def _prompt_bootstrap(goal: str) -> List[PromptBlock]:
    return [
        PromptBlock(
            title="AUTONOMY SETUP (no questions, write artifacts)",
            body=f"""You are an autonomous Cursor coding agent executing this runbook end-to-end.\n\nGOAL:\n{goal}\n\nRULES:\n- Do not ask the user questions unless truly blocked.\n- Make safe assumptions and proceed.\n- Persist artifacts to disk so the user can inspect results later.\n\nACTION:\n1) Choose a RUN_ID (timestamp format `YYYYMMDD_HHMMSS`).\n2) Create `logs/agent_runs/<RUN_ID>/` and subfolders:\n   - `logs/agent_runs/<RUN_ID>/sessions/` (Meeseeks sessions: reasoning logs + hypotheses JSON)\n   - `logs/agent_runs/<RUN_ID>/traces/` (semantic tracer markdown logs for council/review)\n3) Export trace colocation so council/review traces land inside this run folder:\n   - `export MEESEEKS_TRACES_DIR=\"logs/agent_runs/<RUN_ID>/traces\"`\n4) Write `00_goal.md` containing: goal summary, constraints, done-criteria, risks.\n\nOUTPUT (write files, then continue automatically):\n- `logs/agent_runs/<RUN_ID>/00_goal.md`""",
        ),
        PromptBlock(
            title="RSI LOOP (1 loop): generate hypotheses you will actually test",
            body=f"""GOAL:\n{goal}\n\nACTION:\nRun a 1-loop Meeseeks cycle to generate exactly 3 hypotheses.\n\nCommand:\n```bash\npython tools_core/scripts/meeseeks_loop.py \"{goal}\" --loops 1 --output logs/agent_runs/<RUN_ID>/sessions\n```\n\nThen write `01_hypotheses.md` with:\n- the 3 hypotheses\n- the concrete tests you will run\n\nOUTPUT (write file, then continue):\n- `logs/agent_runs/<RUN_ID>/01_hypotheses.md`""",
        ),
        PromptBlock(
            title="TASK PLAN (make it executable and Meeseeks-aware)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nCreate an execution checklist of tasks. Each task MUST include the cycle:\nImplement → MeeseeksReview → ApplyFindings → VerifyApplied → ReReview+Validate.\n\nOUTPUT:\n- Write `02_execution_checklist.md` to `logs/agent_runs/<RUN_ID>/`.\n- Continue automatically.""",
        ),
    ]


def _padding_prompts(goal: str) -> List[PromptBlock]:
    """
    Padding prompts used to hit an exact prompt count without producing a partial
    IMPLEMENT→REVIEW→APPLY→VERIFY→RE-REVIEW cycle.
    """
    return [
        PromptBlock(
            title="CHECKPOINT: update progress log (autonomous)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nUpdate `logs/agent_runs/<RUN_ID>/progress.md` with:\n- what you just did\n- what you will do next\n- any risks discovered\n\nOUTPUT:\n- Append to `logs/agent_runs/<RUN_ID>/progress.md`\n- Continue automatically""",
        ),
        PromptBlock(
            title="CHECKPOINT: council sanity check (autonomous)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nRun a council sanity check on your current plan and progress.\n\n```bash\npython - <<'PY'\nfrom tools_core.council import council_vote\n\nquestion = \"Given the goal and current progress, what are the top 3 risks and the next best step?\"\ncontext = \"GOAL:\\n{goal}\\n\\nPROGRESS:\\n(Briefly summarize what you have done so far and what remains.)\"\nresult = council_vote(question, context=context)\nprint(result.synthesis)\nprint(\"\\nFINAL:\\n\" + result.final_decision)\nPY\n```\n\nOUTPUT:\n- Save to `logs/agent_runs/<RUN_ID>/checkpoint_council.md`\n- Continue automatically""",
        ),
        PromptBlock(
            title="CHECKPOINT: deterministic constraints pass (autonomous)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nWrite down the *deterministic* constraints implied by the goal (things you can check without judgment).\nExamples: word count, required phrase, required file exists, tests pass.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/checkpoint_constraints.md`\n- Continue automatically""",
        ),
        PromptBlock(
            title="CHECKPOINT: artifact inventory (autonomous)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nList all artifacts created so far (files, logs, outputs) and where they live.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/checkpoint_artifacts.md`\n- Continue automatically""",
        ),
    ]

def _cycle_prompts(goal: str, cycle_index: int) -> List[PromptBlock]:
    cycle_tag = f"CYCLE {cycle_index}"
    return [
        PromptBlock(
            title=f"{cycle_tag} — IMPLEMENT (autonomous)",
            body=f"""GOAL:\n{goal}\n\nACTION:\n1) Choose the next highest-priority item from `logs/agent_runs/<RUN_ID>/02_execution_checklist.md`.\n2) Run a 1-loop Meeseeks hypothesis pass for that task:\n```bash\npython tools_core/scripts/meeseeks_loop.py \"{goal} — {cycle_tag}\" --loops 1 --output logs/agent_runs/<RUN_ID>/sessions\n```\n3) Implement the task (code changes + tests).\n4) Record which files you changed.\n\nOUTPUT (write file, then continue):\n- `logs/agent_runs/<RUN_ID>/{cycle_tag.lower().replace(' ', '_')}_01_implement.md`""",
        ),
        PromptBlock(
            title=f"{cycle_tag} — MEESEEKS REVIEW (code OR deliverable review)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nRun a Meeseeks review appropriate to what you produced.\n\nIF YOU CHANGED CODE:\n- Use the Meeseeks code reviewer probe on changed files.\n\nIF YOU PRODUCED A NON-CODE DELIVERABLE (poem/doc/spec/etc):\n- Use Meeseeks Council Vote to critique it against the goal constraints and quality rubric.\n\nCODE REVIEW (auto-detect changed files via git diff):\n```bash\npython - <<'PY'\nimport subprocess\nfrom pathlib import Path\nfrom tools_core.probes import review_code, review_directory, format_review_as_markdown\n\ntry:\n    names = subprocess.check_output([\"git\", \"diff\", \"--name-only\"]).decode().splitlines()\nexcept Exception:\n    names = []\n\nfiles = [Path(n) for n in names if Path(n).is_file()]\nif files:\n    review = review_code(files, context=\"Meeseeks code review for goal: {goal}\")\nelse:\n    review = review_directory(Path(\".\"), context=\"Meeseeks code review (fallback) for goal: {goal}\", max_files=20)\n\nprint(format_review_as_markdown(review))\nPY\n```\n\nDELIVERABLE REVIEW (paste the deliverable text into `deliverable_text`):\n```bash\npython - <<'PY'\nfrom tools_core.council import council_vote\n\ndeliverable_text = \"\"\"PASTE_DELIVERABLE_HERE\"\"\"\nquestion = \"Review this deliverable for the stated goal. List failures vs constraints and give concrete improvements.\"\ncontext = f\"GOAL:\\n{goal}\\n\\nDELIVERABLE:\\n{{deliverable_text}}\"\nresult = council_vote(question, context=context)\nprint(result.synthesis)\nprint(\"\\nFINAL:\\n\" + result.final_decision)\nPY\n```\n\nOUTPUT (write file, then continue):\n- `logs/agent_runs/<RUN_ID>/{cycle_tag.lower().replace(' ', '_')}_02_review.md`\n- A checklist of CRITICAL/HIGH findings (inline in that file)""",
        ),
        PromptBlock(
            title=f"{cycle_tag} — APPLY FINDINGS (implement recommendations)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nImplement all CRITICAL/HIGH recommendations from the previous review.\nIf you cannot implement a recommendation, document exactly why.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/{cycle_tag.lower().replace(' ', '_')}_03_apply.md` (checklist with statuses)\n- Continue automatically""",
        ),
        PromptBlock(
            title=f"{cycle_tag} — VERIFY APPLIED (did you catch them all?)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nVerify every CRITICAL/HIGH item is actually addressed.\n- Compare the review output vs your fixes\n- If anything remains, fix it now\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/{cycle_tag.lower().replace(' ', '_')}_04_verify_applied.md`\n- Continue automatically""",
        ),
        PromptBlock(
            title=f"{cycle_tag} — RE-REVIEW + VALIDATE (golden pass)",
            body=f"""GOAL:\n{goal}\n\nACTION:\n1) Re-run Meeseeks review (code review OR deliverable council review) and confirm CRITICAL/HIGH issues are gone.\n2) Run validations appropriate to what you produced:\n   - If code: run the relevant test suite (e.g., `pytest -q`, `npm test`, etc.)\n   - If non-code deliverable: run deterministic checks for the goal constraints (e.g., length, required phrases, formatting) and re-run council review.\n3) Update a progress log.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/{cycle_tag.lower().replace(' ', '_')}_05_rereview.md`\n- `logs/agent_runs/<RUN_ID>/{cycle_tag.lower().replace(' ', '_')}_06_validate.md`\n- Append status to `logs/agent_runs/<RUN_ID>/progress.md`\n- Continue automatically""",
        ),
    ]


def _final_prompts(goal: str) -> List[PromptBlock]:
    return [
        PromptBlock(
            title="Full-system validation checkpoint",
            body=f"""GOAL:\n{goal}\n\nACTION:\nDo a full validation sweep appropriate to the work performed.\n- If code changes were made: run the relevant test suite(s) (e.g., `pytest -q`, `npm test`, etc.).\n- If the output is a non-code deliverable: run deterministic constraint checks for the goal (length, required rhyme/keywords, formatting), and re-run council review for quality.\n\nOUTPUT (write file, then continue):\n- `logs/agent_runs/<RUN_ID>/90_full_validation.md` (commands/checks + pass/fail + known issues)""",
        ),
        PromptBlock(
            title="Final Meeseeks code review (directory-level) + fix pass",
            body=f"""GOAL:\n{goal}\n\nACTION:\nRun a final Meeseeks review and fix pass:\n- If code: do a directory-level Meeseeks code review (bounded) and address remaining CRITICAL/HIGH issues.\n- If non-code deliverable: run council review on the final deliverable and address remaining CRITICAL/HIGH issues.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/91_final_review.md` (final review + fixes + anything intentionally not changed)""",
        ),
        PromptBlock(
            title="Handoff summary (what changed, how to run, how to verify)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nWrite a handoff summary for a teammate.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/92_handoff.md`""",
        ),
        PromptBlock(
            title="Self-reflection (leave breadcrumbs for future Meeseeks)",
            body=f"""GOAL:
{goal}

ACTION:
Leave breadcrumbs for future Meeseeks.

OUTPUT (write file, then stop):
- `logs/agent_runs/<RUN_ID>/93_self_reflection.json`

JSON shape:
```json
{{
  "future_hints": [{{"context": "...", "hint": "...", "importance": "critical|useful|minor"}}],
  "patterns_noticed": ["..."],
  "warnings": ["..."],
  "incomplete_work": [{{"what": "...", "where_left_off": "...", "next_step": "..."}}]
}}
```""",
        ),
    ]


def generate_template_only_prompts(goal: str, target_prompts: int) -> List[PromptBlock]:
    target_prompts = _clamp_target_prompts(target_prompts)

    prompts: List[PromptBlock] = []
    prompts.extend(_prompt_bootstrap(goal))

    final_blocks = _final_prompts(goal)
    reserved_final = len(final_blocks)

    target_before_final = target_prompts - reserved_final
    padding = _padding_prompts(goal)

    cycle_index = 1
    while True:
        cycle_blocks = _cycle_prompts(goal, cycle_index)
        if len(prompts) + len(cycle_blocks) > target_before_final:
            break
        prompts.extend(cycle_blocks)
        cycle_index += 1

    pad_i = 0
    while len(prompts) < target_before_final:
        prompts.append(padding[pad_i % len(padding)])
        pad_i += 1

    prompts.extend(final_blocks)
    return prompts[:target_prompts]


def _fill_decompose_goal_template(
    template: str,
    *,
    prime_directive: str,
    context: str,
    codebase_summary: str,
) -> str:
    """
    Fill `tools_core/prompts/tasks/decompose_goal.txt` safely.

    NOTE: The template includes lots of JSON braces, so we MUST NOT use `.format()`.
    """
    return (
        template.replace("{prime_directive}", prime_directive)
        .replace("{context}", context)
        .replace("{codebase_summary}", codebase_summary)
    )


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract a JSON object from an LLM response, handling markdown code blocks."""
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if json_match:
        candidate = json_match.group(1).strip()
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

    # Try raw JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    return None


def _build_codebase_summary() -> str:
    """
    Intentionally NOT a repo summary.

    This tool’s job is to turn a GOAL into an executable, Meeseeks-aware autonomous runbook.
    The *executing agent* will discover the repo structure at runtime (project root, src/, features/, etc).
    """
    return "\n".join(
        [
            "Do NOT summarize the repo here.",
            "The executing agent will discover project structure at runtime.",
            "",
            "Assumptions for the runbook:",
            "- The agent is running in a Cursor workspace at the target repo root.",
            "- If not at repo root, the agent should `cd $(git rev-parse --show-toplevel)`.",
            "",
            "Meeseeks entrypoints available (from bundled tools_core):",
            "- export MEESEEKS_TRACES_DIR=\"logs/agent_runs/<RUN_ID>/traces\"",
            "- python tools_core/scripts/meeseeks_spin.py \"<task>\" --output logs/agent_runs/<RUN_ID>/sessions",
            "- python tools_core/scripts/meeseeks_loop.py \"<task>\" --loops 1|2|3 --output logs/agent_runs/<RUN_ID>/sessions",
            "- python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py \"<goal>\" --ai-plan",
            "",
            "Meeseeks probes:",
            "- tools_core/probes/meeseeks_code_reviewer.py",
            "- tools_core/probes/meeseeks_consistency_auditor.py",
            "- tools_core/probes/meeseeks_self_healer.py",
            "",
            "Optional external RSI toolkit (if present in the target repo):",
            "- recursive-self-intelligence-tools/gemini3.py",
            "- recursive-self-intelligence-tools/code_reviewer.py",
        ]
    )


def _order_tasks(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    tasks_raw = plan.get("tasks", [])
    if not isinstance(tasks_raw, list):
        return []

    tasks: List[Dict[str, Any]] = [t for t in tasks_raw if isinstance(t, dict)]
    tasks_by_id: Dict[str, Dict[str, Any]] = {}
    ordered_ids: List[str] = []

    for t in tasks:
        tid = t.get("id")
        if isinstance(tid, str) and tid:
            tasks_by_id[tid] = t

    critical_path = plan.get("critical_path", [])
    if isinstance(critical_path, list):
        for tid in critical_path:
            if isinstance(tid, str) and tid in tasks_by_id and tid not in ordered_ids:
                ordered_ids.append(tid)

    for t in tasks:
        tid = t.get("id")
        if isinstance(tid, str) and tid and tid in tasks_by_id and tid not in ordered_ids:
            ordered_ids.append(tid)

    return [tasks_by_id[tid] for tid in ordered_ids]


def _task_blocks(goal: str, task: Dict[str, Any]) -> List[PromptBlock]:
    tid = task.get("id", "T?")
    title = task.get("title", "Untitled task")
    description = task.get("description", "")
    deps = task.get("dependencies", [])
    files = task.get("files_affected", [])
    done = task.get("done_criteria", "")
    effort = task.get("effort", "")
    priority = task.get("priority", "")

    deps_str = ", ".join(deps) if isinstance(deps, list) else str(deps)
    files_str = ", ".join(files) if isinstance(files, list) else str(files)

    return [
        PromptBlock(
            title=f"Task {tid} — IMPLEMENT (autonomous)",
            body=f"""GOAL:\n{goal}\n\nTASK:\n{tid}: {title}\n\nDETAILS:\n- Description: {description}\n- Dependencies: {deps_str}\n- Files affected (expected): {files_str}\n- Done criteria: {done}\n- Priority/Effort: {priority} / {effort}\n\nACTION:\n1) Run a 1-loop Meeseeks hypothesis pass for this task:\n```bash\npython tools_core/scripts/meeseeks_loop.py \"{goal} — {tid}: {title}\" --loops 1 --output logs/agent_runs/<RUN_ID>/sessions\n```\n2) Implement the task now (code + tests).\n3) Record changed files.\n\nOUTPUT (write file, then continue):\n- `logs/agent_runs/<RUN_ID>/{tid}_01_implement.md`""",
        ),
        PromptBlock(
            title=f"Task {tid} — MEESEEKS REVIEW (code reviewer probe)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nRun a Meeseeks review appropriate to what this task produced.\n\nIF THIS TASK PRODUCES/CHANGES CODE:\n- Run Meeseeks code reviewer on the expected files.\n\nIF THIS TASK PRODUCES A NON-CODE DELIVERABLE:\n- Run Meeseeks Council Vote to critique it vs the goal constraints.\n\nCODE REVIEW (expected files):\n```bash\npython - <<'PY'\nfrom pathlib import Path\nfrom tools_core.probes import review_code, review_directory, format_review_as_markdown\n\npaths = [Path(p) for p in {json.dumps(files if isinstance(files, list) else [files_str])}]\nfiles = [p for p in paths if p.is_file()]\n\nif files:\n    review = review_code(files, context=\"Meeseeks code review for task {tid} ({goal})\")\nelse:\n    review = review_directory(Path(\".\"), context=\"Meeseeks code review fallback for task {tid} ({goal})\", max_files=20)\n\nprint(format_review_as_markdown(review))\nPY\n```\n\nDELIVERABLE REVIEW (paste deliverable into `deliverable_text`):\n```bash\npython - <<'PY'\nfrom tools_core.council import council_vote\n\ndeliverable_text = \"\"\"PASTE_DELIVERABLE_HERE\"\"\"\nquestion = \"Review this deliverable for the stated goal. List failures vs constraints and give concrete improvements.\"\ncontext = f\"GOAL:\\n{goal}\\n\\nDELIVERABLE:\\n{{deliverable_text}}\"\nresult = council_vote(question, context=context)\nprint(result.synthesis)\nprint(\"\\nFINAL:\\n\" + result.final_decision)\nPY\n```\n\nOUTPUT:\n- Save reviewer output to `logs/agent_runs/<RUN_ID>/{tid}_02_review.md`\n- Extract CRITICAL/HIGH checklist in that file\n- Continue automatically""",
        ),
        PromptBlock(
            title=f"Task {tid} — APPLY FINDINGS (implement recommendations)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nApply all CRITICAL/HIGH recommendations from the previous review.\nIf something cannot be implemented, document why.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/{tid}_03_apply.md` (checklist + status)\n- Continue automatically""",
        ),
        PromptBlock(
            title=f"Task {tid} — VERIFY APPLIED (did you really catch them all?)",
            body=f"""GOAL:\n{goal}\n\nACTION:\nVerify every CRITICAL/HIGH item is addressed.\n- Compare `.../{tid}_02_review.md` and your fixes\n- Fix anything that remains\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/{tid}_04_verify_applied.md`\n- Continue automatically""",
        ),
        PromptBlock(
            title=f"Task {tid} — RE-REVIEW + VALIDATE (golden pass)",
            body=f"""GOAL:\n{goal}\n\nACTION:\n1) Re-run Meeseeks review (code review OR deliverable council review) and confirm CRITICAL/HIGH issues are gone.\n2) Run validations appropriate to what you produced:\n   - If code: run the relevant test suite (e.g., `pytest -q`, `npm test`, etc.)\n   - If non-code deliverable: run deterministic checks for the goal constraints (e.g., length, required rhyme/keywords, formatting) and re-run council review.\n\nOUTPUT:\n- `logs/agent_runs/<RUN_ID>/{tid}_05_rereview.md`\n- `logs/agent_runs/<RUN_ID>/{tid}_06_validate.md`\n- Append status to `logs/agent_runs/<RUN_ID>/progress.md`\n- Continue automatically""",
        ),
    ]


def generate_ai_plan_prompts(goal: str, target_prompts: int) -> List[PromptBlock]:
    """
    Generate prompts tailored to `goal` using an LLM-produced task plan.

    On any failure (missing keys, network, parse), fall back to template-only
    and prepend a warning prompt that includes the failure reason.
    """
    target_prompts = _clamp_target_prompts(target_prompts)

    # Import only the top-tier Gemini model helper (resolved from model_roles)
    try:
        from core.meeseeks_llm_caller import call_gemini_pro  # type: ignore
    except Exception:  # pragma: no cover
        from tools_core.core.meeseeks_llm_caller import call_gemini_pro  # type: ignore

    template_path = TOOLS_CORE_PATH / "prompts" / "tasks" / "decompose_goal.txt"
    if not template_path.exists():
        warning = PromptBlock(
            title="AI-plan unavailable (missing template) — fallback to template-only",
            body=f"Could not find: {template_path}. Using template-only prompt scaffold.",
        )
        prompts = generate_template_only_prompts(goal, target_prompts)
        prompts.insert(0, warning)
        return prompts[:target_prompts]

    template = template_path.read_text()
    codebase_summary = _build_codebase_summary()
    tools_prompt = _build_meeseeks_tools_prompt(MEESEEKS_ROOT)
    context = (
        "You are generating an AUTONOMOUS execution runbook for a Cursor agent.\n"
        "Hard requirements:\n"
        "- No human decision points (do not ask the user to choose options)\n"
        "- Output tasks that can run for hours autonomously\n"
        "- Every task must be verifiable and produce artifacts/logs\n"
        "- Bake in the closed loop: Implement → MeeseeksReview → ApplyFindings → VerifyApplied → ReReview+Validate\n"
        "- Explicitly use Meeseeks tools (loop runner, spin, probes, tracer) when appropriate\n"
        "- Do NOT rely on a static repo summary; the executing agent will inspect the repo live\n"
        "- The goal may be NON-CODE (writing, research, specs). Prefer council review + deterministic constraint checks for such deliverables\n"
        "- If the target project uses feature-sliced structure (e.g., src/features/), follow it; otherwise follow existing conventions\n"
        "\n"
        "AVAILABLE MEESEEKS TOOLS:\n"
        f"{tools_prompt}\n"
    )
    prompt = _fill_decompose_goal_template(
        template,
        prime_directive=goal,
        context=context,
        codebase_summary=codebase_summary,
    )

    system = "You are a Meeseeks task planner. Output valid JSON only."

    try:
        response = call_gemini_pro(prompt, system=system)
        plan = _extract_json(response)
        if not plan:
            raise ValueError("Could not parse JSON task plan from model response.")
    except Exception as e:
        warning = PromptBlock(
            title="AI-plan failed — fallback to template-only",
            body=f"""AI-plan generation failed, so we’re falling back to the deterministic scaffold.\n\nFailure:\n{e}""",
        )
        prompts = generate_template_only_prompts(goal, target_prompts)
        prompts.insert(0, warning)
        return prompts[:target_prompts]

    ordered_tasks = _order_tasks(plan)

    prompts: List[PromptBlock] = []
    prompts.extend(_prompt_bootstrap(goal))
    prompts.append(
        PromptBlock(
            title="AI-produced task plan (AUTONOMOUS EXECUTION INPUT)",
            body=f"""GOAL:\n{goal}\n\nYou are executing autonomously.\n\nACTION:\n1) Save this JSON to `logs/agent_runs/<RUN_ID>/10_ai_plan.json`.\n2) Decide an execution order (respect dependencies; follow critical_path when present).\n3) Write that order to `logs/agent_runs/<RUN_ID>/11_task_order.md`.\n4) Start executing Task T1 immediately.\n\n```json\n{json.dumps(plan, indent=2)}\n```""",
        )
    )

    final_blocks = _final_prompts(goal)
    reserved_final = len(final_blocks)
    per_task_blocks = 5

    reserved_initial = len(prompts)
    available = max(0, target_prompts - reserved_initial - reserved_final)
    max_tasks = available // per_task_blocks if per_task_blocks > 0 else 0
    tasks_to_include = ordered_tasks[:max_tasks]

    for task in tasks_to_include:
        prompts.extend(_task_blocks(goal, task))

    # Fill remaining space with FULL cycles (never partial), then pad with checkpoints.
    target_before_final = target_prompts - reserved_final
    padding = _padding_prompts(goal)

    cycle_index = 1
    while True:
        cycle_blocks = _cycle_prompts(goal, cycle_index)
        if len(prompts) + len(cycle_blocks) > target_before_final:
            break
        prompts.extend(cycle_blocks)
        cycle_index += 1

    pad_i = 0
    while len(prompts) < target_before_final:
        prompts.append(padding[pad_i % len(padding)])
        pad_i += 1

    prompts.extend(final_blocks)
    return prompts[:target_prompts]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a Meeseeks-aware prompt list (50–100 prompts) from a goal."
    )
    parser.add_argument(
        "goal",
        nargs="?",
        help="The goal / prime directive",
    )
    parser.add_argument(
        "--file",
        "-f",
        help="Read the goal from a file",
    )
    parser.add_argument(
        "--target-prompts",
        "-n",
        type=int,
        default=DEFAULT_TARGET_PROMPTS,
        help=f"Target number of prompts (clamped to {MIN_PROMPTS}-{MAX_PROMPTS}). Default: {DEFAULT_TARGET_PROMPTS}",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output markdown file path. Default: logs/prompt_lists/{timestamp}_prompt_list.md",
    )
    parser.add_argument(
        "--template-only",
        action="store_true",
        help="Generate deterministically with no LLM calls (always available).",
    )
    parser.add_argument(
        "--ai-plan",
        action="store_true",
        help="Use a top-tier LLM to tailor the prompt list to the goal (falls back if unavailable).",
    )

    args = parser.parse_args()

    if args.template_only and args.ai_plan:
        raise SystemExit("❌ Choose either --template-only or --ai-plan (not both).")

    goal = _read_goal(args)
    target_prompts = _clamp_target_prompts(args.target_prompts)

    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Path(args.output) if args.output else _default_output_path(timestamp)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Generation mode (ai-plan implementation is added in a later step)
    if args.ai_plan:
        mode = "ai-plan"
        prompts = generate_ai_plan_prompts(goal, target_prompts)
    else:
        mode = "template-only"
        prompts = generate_template_only_prompts(goal, target_prompts)

    content = _render_markdown(goal=goal, prompts=prompts, mode=mode, created_at=created_at)
    output_path.write_text(content)

    print("🔵 Prompt List Generator")
    print("=" * 60)
    print(f"Goal: {goal[:80]}{'...' if len(goal) > 80 else ''}")
    print(f"Mode: {mode}")
    print(f"Prompts: {len(prompts)}")
    print(f"Output: {output_path}")
    if mode == "template-only":
        repo_root = TOOLS_CORE_PATH.parent
        env_path = repo_root / "box" / "API_CONFIG.env"
        has_google_key = _env_has_value(env_path, "GOOGLE_API_KEY")

        implicit_default = (not args.ai_plan) and (not args.template_only)
        print()
        if implicit_default:
            print(
                "NOTICE: You did not pass --ai-plan, so you got the generic template-only scaffold."
            )
            print("In practice, ~99/100 runs are better with --ai-plan (goal-tailored prompts).")
        else:
            print("NOTICE: You selected --template-only (deterministic, no API calls).")
            print("If you wanted goal-tailored prompts, rerun with --ai-plan.")

        if not has_google_key:
            print(f"Tip: Configure GOOGLE_API_KEY in {env_path} to enable --ai-plan.")

        goal_arg = f"--file {args.file}" if args.file else json.dumps(goal)
        out_arg = f" --output {output_path}" if args.output else ""
        print("Recommended rerun:")
        print(
            f"  python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py {goal_arg} --ai-plan --target-prompts {target_prompts}{out_arg}"
        )


if __name__ == "__main__":
    main()

