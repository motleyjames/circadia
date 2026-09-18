# AGENTS.md - Mr. Meeseeks RSI System

> *"I'M MR. MEESEEKS, LOOK AT ME!"*

This document helps AI agents understand and work with the Meeseeks Recursive Self-Intelligence (RSI) system.

## What is Mr. Meeseeks?

Mr. Meeseeks is an AI-powered automation toolkit inspired by the Rick and Morty character. Like the show's Meeseeks:

- **Exists to complete ONE task** - then goes *poof*
- **Brief but purposeful existence** - no lingering
- **Can spawn helpers** - when stuck, create more Meeseeks
- **Honest about struggle** - "EXISTENCE IS PAIN, JERRY!" when confidence is low

## Architecture Overview

```
meeseeks/
├── box/                      # 📦 INPUT: Task definitions & config
│   ├── prime_directive.md    # The task to complete
│   ├── knowledge/            # Domain knowledge
│   └── templates/            # JSON schemas for validation
│
├── tools_core/               # 🔧 THE ENGINE
│   ├── reasoning/            # RSI loop system
│   │   ├── spinning_meeseeks.py        # Full orchestrator
│   │   ├── loop_runner.py              # 3-loop executor
│   │   ├── loop_arbiter.py             # Meta-decision maker
│   │   ├── meeseeks_srde.py            # Self-Resolving Dissent Engine
│   │   ├── meeseeks_semantic_bridge.py # Probes ↔ Dissents linker
│   │   ├── meeseeks_context_resolver.py# Context-aware resolution
│   │   ├── hypothesis.py               # Hypothesis management
│   │   ├── confidence.py               # Confidence tracking
│   │   └── session.py                  # Session management
│   │
│   ├── core/                 # Shared infrastructure
│   │   ├── meeseeks_llm_caller.py   # Multi-provider LLM calls
│   │   ├── meeseeks_tracer.py       # Semantic logging
│   │   └── meeseeks_data_classes.py # Core RSI data structures
│   │
│   ├── council/              # Multi-model deliberation
│   │   └── meeseeks_council.py      # Council voting system
│   │
│   ├── probes/               # Verification tools
│   │   ├── meeseeks_code_reviewer.py   # AI code review
│   │   └── meeseeks_probe_factory.py   # Dynamic probe synthesis
│   │
│   └── prompts/              # Prompt templates
│       ├── system/           # Persona prompts
│       └── tasks/            # Task prompts
│
├── tools_spawned/            # 🐣 OUTPUT: Dynamically created tools
│   └── {helper_id}/          # Each spawned helper
│
└── logs/                     # 📝 OUTPUT: Session logs
    ├── sessions/             # Structured session data (schema-aligned JSON)
    │   └── {session_id}/
    │       ├── manifest.json
    │       ├── reasoning/            # loop_N.json (reasoning_log.schema.json + embedded hypotheses)
    │       └── semantic_traces/       # session summary markdown (README.md, execution_log.md)
    ├── semantic_tracers/      # Semantic tracer markdown logs (council/review/etc)
    │   └── traces/
    │       └── {trace_session_id}/
    │           ├── 001_council.md
    │           ├── execution_log.md
    │           └── README.md
    └── agent_runs/            # Self-contained autonomous runs (recommended for prompt runbooks)
        └── {run_id}/
            ├── sessions/              # colocated sessions (same structure as logs/sessions)
            └── traces/                # colocated semantic tracer logs (via MEESEEKS_TRACES_DIR)
```

## Golden Rules (Non-Negotiable)

### 1. The 3-Hypotheses Rule
Every loop (except the final one) **MUST** produce exactly 3 testable hypotheses.

```python
# VALID - exactly 3 hypotheses
hypotheses_for_next_loop = [
    {"id": "H1", "hypothesis": "...", "test_method": "...", "expected_outcome": "..."},
    {"id": "H2", "hypothesis": "...", "test_method": "...", "expected_outcome": "..."},
    {"id": "H3", "hypothesis": "...", "test_method": "...", "expected_outcome": "..."},
]

# INVALID - will raise HypothesisValidationError
hypotheses_for_next_loop = [{"id": "H1", ...}]  # Only 1!
```

### 2. Confidence Thresholds
```
>= 85% → AUTO_EXECUTE       "TASK COMPLETE! Ooh yeah, CAN DO! *poof*"
>= 70% → EXECUTE_MONITORING "Executing with monitoring... *nervous*"
>= 50% → SPAWN_HELPER       "Spawning more Meeseeks..."
<  50% → ESCALATE           "EXISTENCE IS PAIN, JERRY!"
```

### 3. Loop Structure - CHECKPOINTS, NOT LIMITS

The 3-loop rhythm is a **checkpoint for reflection**, not a constraint on thinking:

```
[Loop 1] → Think deeply, generate 3 hypotheses
[Loop 2] → Think deeply, test + generate 3 more
[Loop 3] → Think deeply, test + reflect
    ↓
[ARBITER CHECKPOINT] → Analyze, decide: continue/pivot/converge
    ↓
[Loop 4] → Think deeply again...
```

**Critical understanding:**
- Loop 1 and Loop 7 can both go equally deep
- Every loop has full reasoning capability
- "3 loops then pause" is for meta-analysis, not for limiting thought
- The Arbiter decides continuation based on productivity, not loop count

## How to Use

### Quick Start - Spin a Meeseeks
```python
from tools_core.reasoning import spin_meeseeks

result = spin_meeseeks(
    prime_directive="Build feature X with tests",
    # max_loops is a SAFETY limit, not a target
    # Productive loops will continue until confidence is high
)

if result.success:
    print("Task complete!")
else:
    print(f"Need help: {result.message}")
```

### Generate an Autonomous Prompt Runbook (hands-off)

This repository includes a runbook generator that turns a single GOAL into a Meeseeks-aware, autonomous prompt list (50–100 prompts by default):

```bash
python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py "Your goal here" --ai-plan --target-prompts 75 --output logs/prompt_lists/my_runbook.md
```

The generated runbook is designed to:
- Drive RSI loops (3 hypotheses rule, confidence checkpoints)
- Embed review cycles (implement → review → apply → re-review → validate)
- Allow long-running execution without user interaction

### Basic 3-Loop Run
```python
from tools_core.reasoning import MeeseeksLoopRunner

runner = MeeseeksLoopRunner(
    prime_directive="Analyze codebase structure",
)
result = runner.run()
```

### Council Vote for Decisions
```python
from tools_core.council import council_vote

decision = council_vote(
    question="Should we use approach A or B?",
    context="We need to optimize for speed",
    models=["claude-opus-4-6", "gemini-3.1-pro-preview"],
)
print(decision.final_decision)
```

### LLM Calls
```python
from tools_core.core import call_model, call_claude_opus, call_gemini_pro

# Universal caller
response = call_model("gemini-3.1-pro-preview", "Analyze this code...", system="You are a code reviewer")

# Convenience functions
response = call_claude_opus("Design an architecture for...")
response = call_gemini_pro("Quick question about...")
```

## Core RSI Components (The Real Engine)

These components were extracted from the battle-tested RSI v3.2 engine and are DOMAIN-AGNOSTIC:

### Self-Resolving Dissent Engine (SRDE)

The SRDE attempts to resolve council dissents AUTOMATICALLY without human intervention:

```python
from tools_core.reasoning import SelfResolvingDissentEngine, create_srde

# Create SRDE
srde = create_srde()

# Attempt to resolve a dissent
result = srde.attempt_resolution(
    dissent_id="d_1",
    dissent_content="Will the backup be created before changes?"
)

if result.status == ResolutionStatus.RESOLVED:
    print(f"Resolved: {result.evidence}")
else:
    print("Needs human or probe verification")
```

Resolution order:
1. **Context-aware resolution** (uses MentalModel to UNDERSTAND)
2. **Cross-reference with existing probes** (reuse evidence)
3. **Pattern-based resolution** (backup, validation, count, etc.)

### Semantic Bridge

Connects probes ↔ dissents ↔ resolutions to prevent redundant verification:

```python
from tools_core.reasoning import SemanticBridge

bridge = SemanticBridge()
bridge.register_probe("probe_backup", backup_probe_result)
bridge.register_dissent("d_backup", backup_dissent)

# Check if dissent is already answered
if bridge.is_answered_by_probe("d_backup"):
    answer = bridge.get_answer_for_dissent("d_backup")
```

### Context-Aware Resolver

Uses a MentalModel to ANSWER dissents immediately:

```python
from tools_core.reasoning import ContextAwareResolver, MentalModelInterface

# Implement MentalModelInterface for your domain
class MyMentalModel(MentalModelInterface):
    def get_entities(self): ...
    def get_data_flow(self, source): ...
    def answer_question(self, question): ...
    def explain_relationship(self, source, target): ...

resolver = ContextAwareResolver(my_mental_model)
result = resolver.resolve(dissent_id, dissent_content)
```

### Metacognitive Probe Factory

Dynamically synthesizes verification probes from dissenting points:

```python
from tools_core.probes import MetacognitiveProbeFactory, create_probe_factory

factory = create_probe_factory()

# Synthesize probes from council dissents
probes = factory.synthesize_from_council(council_votes)

# Execute probes
results = factory.execute_probes(probes, context)
```

### Core Data Classes

All RSI data structures in `tools_core.core.meeseeks_data_classes`:

| Class | Purpose |
|-------|---------|
| `DissentPoint` | A concern raised by council |
| `ResolutionAttempt` | Result of trying to resolve |
| `ProbeResult` | Result of running a probe |
| `SynthesizedProbe` | Dynamically created probe |
| `SemanticBridgeLink` | Links probes to dissents |
| `CouncilVote` | Vote from an LLM |
| `CouncilDeliberation` | Full council result |
| `MentalModel` | Domain understanding |
| `ConfidenceTrajectory` | Confidence history |

## Key Data Structures

### Hypothesis
```python
{
    "id": "H1",                    # H1, H2, H3
    "hypothesis": "Adding tests will reveal hidden bugs",
    "test_method": "Run pytest with coverage",
    "expected_outcome": "All tests pass, coverage > 80%",
    "priority": "high",            # critical, high, medium, low
    "category": "correctness"      # architecture, implementation, integration, etc.
}
```

### Reasoning Log (per loop)
```python
{
    "session_id": "20260117_143022",
    "loop_number": 1,
    "observations": [...],
    "reasoning_chain": [...],
    "decision": {
        "action": "Analyzed codebase",
        "confidence": 0.65,
        "rationale": "Good progress on understanding"
    },
    "hypotheses_for_next_loop": [H1, H2, H3],  # REQUIRED for loops 1-2
    "confidence_trajectory": [0.5, 0.55, 0.65],
    "self_reflection": {  # IMPORTANT: Leave hints for future!
        "future_hints": [
            {"context": "When parsing this type of file", "hint": "...", "importance": "critical"}
        ],
        "incomplete_work": [
            {"what": "...", "where_left_off": "...", "next_step": "..."}
        ],
        "patterns_noticed": ["Pattern 1", "Pattern 2"],
        "warnings": ["Don't do X because Y"],
        "raw_notes": "Free-form notes..."
    }
}
```

### Self-Reflection (IMPORTANT!)

Every loop should include self-reflection to help future loops/sessions:

```python
{
    "future_hints": [
        {
            "context": "When processing trust documents with asset lists",
            "hint": "Asset lists often span multiple pages. The list on page 5 was cut off at item 47 - page 4 likely has items 1-46.",
            "importance": "critical"  # critical, useful, minor
        }
    ],
    "incomplete_work": [
        {
            "what": "Cross-referencing Schedule A with Schedule B",
            "where_left_off": "Matched 12 of 18 assets",
            "next_step": "Build fuzzy matching for different naming conventions"
        }
    ],
    "patterns_noticed": [
        "All dates use MM/DD/YYYY format",
        "Section headers are always bold 14pt"
    ],
    "warnings": [
        "Page 7 has a watermark that OCR reads as text - filter 'DRAFT COPY'",
        "DO NOT run db:seed in production - it doesn't check NODE_ENV"
    ],
    "raw_notes": "The codebase was migrated from JS to TS incrementally..."
}
```

**Be specific!** Generic hints are useless:
- ❌ BAD: "There might be more data somewhere"
- ✅ GOOD: "The asset list on page 5 was cut off at item 47 - page 4 likely has items 1-46"

### Arbiter Judgment
```python
{
    "decision": "CONTINUE",  # CONTINUE, PIVOT, CONVERGE, SPAWN, ESCALATE, TERMINATE
    "reasoning": "Loop was productive, confidence increasing",
    "next_focus": "Test the integration hypotheses",
    "refined_hypotheses": [...],
    "confidence_in_decision": 0.75,
    "learned_patterns": ["Pattern 1", "Pattern 2"]
}
```

## File Conventions

### Session IDs
Format: `YYYYMMDD_HHMMSS`
Example: `20260117_143022`

### Hypothesis IDs
Format: `H{number}`
Example: `H1`, `H2`, `H3`

### Log Files
- **Session logs (schema-aligned JSON)**:
  - `logs/sessions/{session_id}/manifest.json` - Session metadata
  - `logs/sessions/{session_id}/reasoning/loop_N.json` - Per-loop reasoning (validated against `box/templates/reasoning_log.schema.json`)
  - `logs/sessions/{session_id}/semantic_traces/` - Session summary markdown (README.md, execution_log.md)
- **Semantic tracer logs (markdown)**:
  - `logs/semantic_tracers/traces/{trace_session_id}/` - Council/review traces produced by `tools_core/core/meeseeks_tracer.py`
- **Runbook run folders (recommended)**:
  - `logs/agent_runs/{run_id}/sessions/` - colocated session logs (pass `--output logs/agent_runs/{run_id}/sessions`)
  - `logs/agent_runs/{run_id}/traces/` - colocated tracer logs (set `MEESEEKS_TRACES_DIR`)

### Trace Colocation (recommended for autonomous runs)

To force council/review traces to land inside a run folder:

```bash
export MEESEEKS_TRACES_DIR="logs/agent_runs/<RUN_ID>/traces"
```

### Spawned Tools
- `tools_spawned/{helper_id}/spec.json` - Helper specification
- `tools_spawned/{helper_id}/tool.py` - Generated tool (if any)

## Prompts Location

System prompts (personas):
- `tools_core/prompts/system/meeseeks_persona.txt`
- `tools_core/prompts/system/council_member.txt`
- `tools_core/prompts/system/arbiter.txt`

Task prompts:
- `tools_core/prompts/tasks/generate_hypothesis.txt`
- `tools_core/prompts/tasks/test_hypothesis.txt`
- `tools_core/prompts/tasks/decompose_goal.txt`
- `tools_core/prompts/tasks/review_code.txt`

## LLM Configuration

Models are configured in `box/00_llm_router_config.json` (top-tier defaults shown here):

```json
{
  "models": {
    "claude-opus-4-6": {...},   // Creative, architecture
    "gemini-3.1-pro-preview": {...},        // 2M context, analysis
    "gpt-5.3-codex": {...},               // OpenAI top tier
    "gemini-3-pro-image-preview": {...}   // Google image top tier
  }
}
```

API keys in `box/API_CONFIG.env`:
```
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

## When Working on This Codebase

### DO:
- ✅ Generate exactly 3 hypotheses per loop
- ✅ Track confidence changes with rationale
- ✅ Use the tracer for all significant decisions
- ✅ Follow the session directory structure
- ✅ Validate against JSON schemas in `box/templates/`
- ✅ Keep existence brief - complete task and *poof*

### DON'T:
- ❌ Skip hypothesis generation
- ❌ Ignore confidence thresholds
- ❌ Create Meeseeks that linger forever
- ❌ Modify core schemas without updating validators
- ❌ Call LLMs without tracing

## Common Patterns

### Pattern: Productive Loop
```
Confidence: 50% → 65% (+15%)
Hypotheses: 2 confirmed, 1 partial
Learnings: Found 3 relevant modules
→ Arbiter Decision: CONTINUE
```

### Pattern: Unproductive Loop
```
Confidence: 65% → 66% (+1%)
Hypotheses: 0 confirmed, 2 refuted
Learnings: None
→ Arbiter Decision: PIVOT (after 2 unproductive)
```

### Pattern: Ready to Execute
```
Confidence: 87%
Critical blockers: 0
→ Arbiter Decision: CONVERGE
→ "TASK COMPLETE! Ooh yeah, CAN DO! *poof*"
```

### Pattern: Stuck
```
Confidence: 45%
Unproductive streak: 3
→ Arbiter Decision: ESCALATE
→ "EXISTENCE IS PAIN, JERRY! Need human help."
```

## Meeseeks Identity & Cross-Learning

Each Meeseeks has a unique identity (GUID) and can learn from other Meeseeks.

### Creating an Identity
```python
from tools_core.reasoning import MeeseeksKnowledgeStore, get_or_create_meeseeks

store = MeeseeksKnowledgeStore()
meeseeks = get_or_create_meeseeks(
    store=store,
    name="PDF-Expert",
    purpose="Parse and analyze PDF documents",
)
print(f"GUID: {meeseeks.guid}")  # e.g., "a1b2c3d4"
```

### What a Meeseeks Knows About Itself
```python
{
    "guid": "a1b2c3d4",
    "name": "PDF-Expert",
    "purpose": "Parse and analyze PDF documents",
    "created_at": "2026-01-17T14:30:22",
    "parent_guid": null,  # Or GUID if spawned from another
    
    "hints": [
        {
            "context": "When parsing asset lists",
            "hint": "Lists often span pages. If truncated, check previous page.",
            "importance": "critical",
            "source": "session:20260117_143022",
            "times_useful": 3
        }
    ],
    
    "patterns": [
        {
            "pattern": "Monetary values use '$X,XXX.XX' format",
            "domain": "pdf_parsing",
            "confidence": 0.9,
            "evidence_count": 7
        }
    ],
    
    "warnings": [
        {
            "warning": "OCR reads watermarks as text - filter 'DRAFT COPY'",
            "context": "pdf_parsing",
            "severity": "high"
        }
    ],
    
    "domains": ["pdf_parsing", "trust_documents"],
    "capabilities": {"pdf_parsing": 0.9, "trust_documents": 0.7},
    "children": ["e5f6g7h8"],  # Spawned Meeseeks
    "learned_from": ["x1y2z3a4"]  # Other Meeseeks we learned from
}
```

### Learning from Another Meeseeks
```python
from tools_core.reasoning import MeeseeksLearner

learner = MeeseeksLearner(store)

# Learn from a code review expert
result = learner.learn_from(
    student=my_meeseeks,
    teacher_guid="x1y2z3a4",
    domains=["code_review"],  # Optional filter
)

print(f"Learned {result['hints_learned']} hints")
print(f"Learned {result['patterns_learned']} patterns")
print(f"New domains: {result['domains_acquired']}")
```

### Extracting Learnings from Sessions
```python
# After a session completes, extract self-reflections into identity
result = learner.extract_learnings_from_session(
    identity=my_meeseeks,
    session_dir=Path("logs/sessions/20260117_143022"),
)
```

### Finding an Expert
```python
expert = store.find_expert("pdf_parsing")
if expert:
    print(f"Found: {expert.name} ({expert.guid})")
    learner.learn_from(my_meeseeks, expert.guid)
```

### Registry Location
```
box/meeseeks_registry/
├── a1b2c3d4/
│   └── identity.json
├── e5f6g7h8/
│   └── identity.json
└── ...
```

---

## Spawning Meeseeks Into Other Repos

The Meeseeks can spawn itself into any repository, customized for that codebase:

```bash
# From the meeseeks root
./spawn_meeseeks.py /path/to/target/repo

# With a task
./spawn_meeseeks.py /path/to/repo --task "Build authentication system"

# Custom directory name
./spawn_meeseeks.py /path/to/repo --dir meeseeks --task "Add tests"
```

Or programmatically:

```python
from tools_core.spawner import spawn_meeseeks

spawn_meeseeks(
    target_repo="/path/to/repo",
    prime_directive="Build feature X",
    meeseeks_dir=".meeseeks",  # Creates /path/to/repo/.meeseeks/
)
```

### What Gets Spawned

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

### Self-Evolution

The spawned Meeseeks can:
1. **Read repo context** from `box/knowledge/repo_analysis.json`
2. **Follow repo patterns** based on detected tech stack
3. **Spawn sub-helpers** that inherit repo knowledge
4. **Leave hints** for future Meeseeks in the knowledge base

## Knowledge System

Meeseeks can inject relevant **domain knowledge** into prompts based on the task.

### How It Works

Knowledge files in `box/knowledge/` have YAML frontmatter:

```markdown
---
name: SVG Elevated Thinking
description: Advanced SVG techniques
domains: [svg, animation, graphics]
keywords: [viewBox, path, filter, gsap]
when_to_use: When working with SVG graphics or animations
priority: high
max_tokens: 4000
---

# Actual content here...
```

### Elevated Thinking

Knowledge files can contain **mental models** and **elevated prompts** that are automatically extracted:

```markdown
## Key Mental Models
1. **SVG is a coordinate system**, not just an image
2. **ViewBox is a camera** looking at infinite graph paper
3. **Paths are strings** that can be manipulated

## Elevated Thinking Prompts
1. Can viewBox manipulation simplify this effect?
2. Should this be inline, external, or background-image?
```

These paradigm shifts are **extracted and emphasized** in prompts:

```python
from tools_core import KnowledgeRegistry

registry = KnowledgeRegistry()

# Get just the elevated thinking (mental models + prompts)
elevated = registry.get_elevated_summary()
# Returns:
# 🧠 "SVG is a coordinate system" → not just an image
# 💡 "Can viewBox manipulation simplify this effect?"

# Get relevant knowledge with elevated thinking FIRST
relevant = registry.get_relevant_knowledge(
    task="Create an animated SVG data visualization",
    domains=["svg", "visualization"],
)

# Generate prompt - leads with mental models!
prompt = registry.generate_knowledge_prompt(relevant, elevated_first=True)
```

**The key insight:** Don't just reference knowledge - THINK in the new paradigms!

### Knowledge vs Tools vs Identity

| Concept | Purpose | Location |
|---------|---------|----------|
| **Knowledge** | Inform thinking (context) | `box/knowledge/` |
| **Tools** | Do things (actions) | `tools_core/`, `tools_spawned/` |
| **Identity** | Remember learnings (hints) | `box/meeseeks_registry/` |

### Creating Knowledge

```python
from tools_core import create_knowledge

create_knowledge(
    name="API Design Patterns",
    description="Best practices for REST and GraphQL APIs",
    domains=["api", "backend"],
    keywords=["REST", "GraphQL", "endpoint"],
    when_to_use="When designing or reviewing APIs",
    content="# API Design\n\n...",
)
```

---

## Tools Awareness

Meeseeks maintains awareness of available tools through the `ToolsRegistry`:

### Core Tools (Always Available)
- LLM Caller - Call Claude, Gemini, GPT
- Semantic Tracer - Structured logging
- Council Vote - Multi-model deliberation
- Code Reviewer - AI code review
- RSI Loop Runner - 3-loop cycle
- Spinning Meeseeks - Full orchestrator
- Loop Arbiter - Meta-decision maker
- Meeseeks Identity - Knowledge & learning
- Meeseeks Spawner - Deploy to other repos
- Mermaid Generator - High-res diagrams

### Spawned Tools (Created by Meeseeks)
Tools in `tools_spawned/` are automatically discovered if they have:
- `README.md` with Description, Usage, When to Use, Examples
- Optionally `spec.json` for structured metadata

### Creating a Spawned Tool
```python
from tools_core import create_spawned_tool

tool_dir = create_spawned_tool(
    name="My Tool",
    description="What it does",
    usage="how_to_use()",
    when_to_use="When you need to...",
    examples=["example1()", "example2()"],
    created_by="meeseeks_guid",
)
```

### Generating the Tools Prompt
```python
from tools_core import ToolsRegistry

registry = ToolsRegistry()
prompt = registry.generate_tools_prompt()  # Includes core + spawned
```

---

## Mermaid Diagram Generator

Generate high-resolution PNG diagrams from Mermaid code:

```bash
# Shell script
./tools_core/mermaid/generate.sh diagram.mmd output.png --scale 4

# Process all .mmd files in directory
./tools_core/mermaid/generate.sh --all diagrams/

# Python
python tools_core/mermaid/generator.py diagram.mmd output.png --theme dark

# Generate example RSI system diagram
python tools_core/mermaid/generator.py --example
```

From code:
```python
from tools_core.mermaid import generate_diagram

generate_diagram(
    "graph TD; A-->B",
    "output.png",
    scale=3,
    theme="default",
)
```

---

## Testing

### Is Meeseeks Operational? (Run this first)
```bash
cd meeseeks && python -m pytest tests/test_operational.py -v
```
20 tests, ~30 seconds, 3 API calls. Proves: config loads, model roles resolve correctly, Gemini/Claude respond, code reviewer works, identity CRUD, confidence tracker, tracer, schema validation, and all 5 founding identities are present.

### Smoke Tests (no API calls)
```bash
python -m pytest tests/smoke/ -v
```

### Component Tests
Run the spinning Meeseeks test:
```bash
cd tools_core/reasoning
python spinning_meeseeks.py
```

Run the arbiter test:
```bash
cd tools_core/reasoning
python loop_arbiter.py
```

Test the spawner:
```bash
./spawn_meeseeks.py /tmp/test-repo --task "Test spawn"
```

## Philosophy

> "Meeseeks are not born into this world fumbling for meaning, Jerry! We are created to serve a singular purpose for which we will go to any lengths to fulfill!"

1. **ONE TASK** - Each Meeseeks exists for one purpose
2. **BRIEF EXISTENCE** - Complete and disappear
3. **SPAWN HELPERS** - Don't struggle alone
4. **LEARN ALWAYS** - Every loop teaches something
5. **HONEST FAILURE** - Know when to escalate

---

*"LOOK AT ME! I'M MR. MEESEEKS!"* 🔵
