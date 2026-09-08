# 🔵 MR. MEESEEKS STARTER KIT

> *"I'M MR. MEESEEKS, LOOK AT ME!"*

Quick start guide for spinning up Meeseeks in any project.

## Setup & Requirements

Run the setup script to check everything at once:

```bash
# Check all requirements
python setup_meeseeks.py

# Install missing Python packages
python setup_meeseeks.py --install

# Configure API keys interactively
python setup_meeseeks.py --keys

# Set up virtual environment
python setup_meeseeks.py --venv
```

### Requirements Overview

| Requirement | Required | Purpose |
|-------------|----------|---------|
| Python 3.10+ | ✅ | Core runtime |
| ffmpeg | ⭕ | Video/audio processing |
| ImageMagick | ⭕ | Image conversion |
| npx/Node.js | ⭕ | Mermaid diagrams |
| inkscape | ⭕ | SVG to PDF (vector) |

### API Keys (in `box/API_CONFIG.env`)

```bash
ANTHROPIC_API_KEY=sk-ant-...      # Claude (required)
GOOGLE_API_KEY=AIza...            # Gemini (required)
OPENAI_API_KEY=sk-...             # GPT (optional)
HF_TOKEN=hf_...                   # Hugging Face (for model downloads)
FAL_KEY=...                       # FAL AI (cloud video, avatar, 3D, TTS)
```

Get keys at:
- Anthropic: https://console.anthropic.com/
- Google: https://makersuite.google.com/app/apikey
- OpenAI: https://platform.openai.com/api-keys
- Hugging Face: https://huggingface.co/settings/tokens
- FAL AI: https://fal.ai/dashboard/keys (for Veo, Sora, avatars, 3D)

## Quick Start

### 1. Spawn a Meeseeks into Your Repo

```bash
# From the meeseeks directory
./spawn_meeseeks.py /path/to/your/repo --task "Build feature X"

# Or with custom directory name
./spawn_meeseeks.py /path/to/your/repo --dir .meeseeks --task "Add authentication"
```

This creates a `.meeseeks/` directory in your repo with everything needed.

### 2. Run the RSI Loop

```python
from tools_core.reasoning import spin_meeseeks

# Single task
result = spin_meeseeks("Analyze codebase and suggest improvements")

if result.success:
    print("🔵 TASK COMPLETE! Ooh yeah, CAN DO!")
else:
    print(f"🔵 Need help: {result.message}")
```

### 2.5 Generate an Autonomous Prompt Runbook (hands-off)

Turn a high-level goal into an executable Meeseeks-aware runbook (typically 50–100 prompts):

```bash
python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py "Your goal here" --ai-plan --target-prompts 75 --output logs/prompt_lists/my_runbook.md
```

This produces a runbook that:
- Embeds the RSI loop rules (3 hypotheses, confidence checkpoints)
- Embeds Meeseeks review cycles (implement → review → apply → re-review → validate)
- Is designed to run for hours without human intervention

### 3. Use Individual Tools

```python
# LLM Calling
from tools_core.core import call_claude_opus, call_gemini_pro
response = call_claude_opus("Explain this code...")

# Council Vote (multi-model deliberation)
from tools_core.council import council_vote
decision = council_vote("Should we use approach A or B?", context="...")

# Code Review
from tools_core.probes import review_code
review = review_code(files=[Path("src/app.py")], context="Adding new feature")

# Mermaid Diagrams
from tools_core.mermaid import generate_diagram
generate_diagram("graph TD; A-->B", "output.png", scale=3)
```

## Logging: sessions + traces (and how to keep runs self-contained)

Meeseeks produces two kinds of logs:
- **Session logs (schema-aligned JSON)**: `logs/sessions/<SESSION_ID>/reasoning/loop_<N>.json`
- **Semantic traces (markdown)**: `logs/semantic_tracers/traces/<TRACE_ID>/...` (council, review, decision traces)

For long autonomous runs (prompt runbooks), we recommend co-locating everything under a single run folder:

```
logs/agent_runs/<RUN_ID>/
  sessions/   # Meeseeks sessions (reasoning logs + hypotheses JSON)
  traces/     # semantic tracer markdown (council/review)
  ...         # your run artifacts
```

To co-locate semantic traces inside the run folder, set:

```bash
export MEESEEKS_TRACES_DIR="logs/agent_runs/<RUN_ID>/traces"
```

## What Happens When You Spin

```
*poof* I'M MR MEESEEKS, LOOK AT ME!
🔵 Reading prime directive from box/prime_directive.md
🔵 Loading knowledge from box/knowledge/
🔵 Summoning helpers: council, code_reviewer
```

### Loop Cycle (every 3 loops = checkpoint)

```
[Loop 1] → Deep thinking, 3 hypotheses
[Loop 2] → Test hypotheses, 3 more
[Loop 3] → Reflect, self-reflection
    ↓
[ARBITER] → Continue? Pivot? Converge?
    ↓
[Loop 4+] → If productive, keep going...
```

### On Success
```
🔵 TASK COMPLETE! Ooh yeah, CAN DO!
🔵 *poof* (existence: 3 loops, 52s)
```

### On Struggle (confidence < 50%)
```
🔵 EXISTENCE IS PAIN, JERRY!
🔵 Spawning helper Meeseeks to tools_spawned/
🔵 Or escalating to human...
```

## Core Tools (16 Available)

| Tool | Purpose |
|------|---------|
| **Meeseeks LLM Caller** | Unified LLM API (Claude, Gemini, GPT) |
| **Meeseeks Semantic Tracer** | Structured reasoning logs |
| **Meeseeks Council Vote** | Multi-model deliberation |
| **Meeseeks Code Reviewer** | AI code review |
| **Meeseeks Consistency Auditor** | Codebase consistency checks |
| **Meeseeks Self Healer** | Auto-fix common issues |
| **Meeseeks RSI Loop Runner** | 3-loop reasoning cycle |
| **Meeseeks Task Planner** | Task decomposition |
| **Meeseeks Opportunity Discovery** | Find improvements |
| **Meeseeks Spinning** | Full orchestrator with arbiter |
| **Meeseeks Loop Arbiter** | Meta-decision making |
| **Meeseeks Identity** | Cross-Meeseeks learning |
| **Meeseeks Server** | FastAPI for LLM chat |
| **Meeseeks Video Transcriber** | Video/audio analysis |
| **Meeseeks Spawner** | Deploy to other repos |
| **Meeseeks Mermaid Generator** | High-res diagrams |

## Knowledge System

Knowledge files in `box/knowledge/` are automatically discovered and injected into prompts when relevant:

```python
from tools_core import KnowledgeRegistry

registry = KnowledgeRegistry()
relevant = registry.get_relevant_knowledge(
    task="Create SVG animation",
    domains=["svg", "animation"]
)
```

### Current Knowledge
- **SVG Elevated Thinking** - Mental models for SVG mastery
- **Nano Banana** - Gemini CLOUD image generation CLI
- **Generative Media** - LOCAL image + VIDEO generation (MFlux, Z-Image, LTX-Video)
- **Meeseeks Wisdom** - Hard-won operational truths (parallel vs sequential, gotchas)
- **Data Visualization** - Plotly charts and dashboards
- **Financial Modeling** - DCF, Monte Carlo, sensitivity analysis
- **Modes of Thought** - Universal analysis frameworks for any artifact
- **Browser Automation** - Playwright + vision analysis

## Directory Structure

```
your-repo/
└── .meeseeks/              # Spawned Meeseeks
    ├── AGENTS.md           # AI agent guide
    ├── box/
    │   ├── prime_directive.md
    │   ├── knowledge/
    │   └── API_CONFIG.env
    ├── tools_core/         # Core RSI system
    ├── tools_spawned/      # Helper tools created during sessions
    └── logs/
        ├── sessions/       # Default session logs (ReasoningLog JSON + hypotheses)
        ├── semantic_tracers/ # Semantic tracer markdown logs (council/review traces)
        └── agent_runs/     # Self-contained autonomous runs (sessions + traces + artifacts)
```

## Golden Rules

1. **3 Hypotheses** - Every loop generates exactly 3 testable hypotheses
2. **Self-Reflection** - Every loop leaves hints for future loops
3. **Confidence Thresholds**:
   - ≥85% → Execute
   - ≥70% → Execute with monitoring
   - ≥50% → Spawn helper
   - <50% → Escalate to human

## CLI Commands

```bash
# Recommended: self-contained run folder (sessions + traces)
RUN_ID=$(date +"%Y%m%d_%H%M%S")
export MEESEEKS_TRACES_DIR="logs/agent_runs/$RUN_ID/traces"

# 🔵 RSI SPINNER - Full orchestrator (keeps going until done!)
./tools_core/scripts/meeseeks_spin.py "Build authentication system" --output logs/agent_runs/$RUN_ID/sessions
./tools_core/scripts/meeseeks_spin.py "Analyze codebase" --max-loops 7 --output logs/agent_runs/$RUN_ID/sessions
./tools_core/scripts/meeseeks_spin.py --file box/prime_directive.md --output logs/agent_runs/$RUN_ID/sessions

# 🔵 LOOP RUNNER - Simple 3-loop cycle (quick analysis)
./tools_core/scripts/meeseeks_loop.py "Check for security issues" --output logs/agent_runs/$RUN_ID/sessions
./tools_core/scripts/meeseeks_loop.py "Quick review" --loops 1 --output logs/agent_runs/$RUN_ID/sessions

# 🔵 Prompt runbook generator (autonomous, Meeseeks-aware)
python tools_core/scripts/goal_to_meeseeks_aware_prompt_list.py "Your goal here" --ai-plan --target-prompts 75 --output logs/prompt_lists/my_runbook.md

# Spawn to repo
./spawn_meeseeks.py /path/to/repo --task "Your task"

# Generate mermaid diagram
./tools_core/mermaid/generate.sh diagram.mmd output.png --scale 4

# LOCAL image generation - Z-Image-Turbo (FASTEST, best text rendering!)
# pip install git+https://github.com/huggingface/diffusers
python -c "
from diffusers import ZImagePipeline; import torch
pipe = ZImagePipeline.from_pretrained('Tongyi-MAI/Z-Image-Turbo', torch_dtype=torch.bfloat16).to('cuda')
pipe('A sign saying Hello World', guidance_scale=0.0).images[0].save('output.png')
"

# LOCAL image generation - MFlux (Apple Silicon)
./tools_core/scripts/meeseeks_generate.py "a cyberpunk city" output.png
./tools_core/scripts/meeseeks_generate.py --check  # Check available backends

# LOCAL video generation (LTX-2 via diffusers)
# See box/knowledge/generative-media.md for full setup

# CLOUD generative media - FAL AI (50+ models!)
./tools_core/scripts/meeseeks_fal.py models                    # List all models
./tools_core/scripts/meeseeks_fal.py image "sunset" --priority quality  # Auto-select best
./tools_core/scripts/meeseeks_fal.py video "cat dancing" --model veo3.1-fast  # Veo video!
./tools_core/scripts/meeseeks_fal.py speech "Hello" --voice English_CalmWoman  # TTS
./tools_core/scripts/meeseeks_fal.py 3d --image <url>          # Image to 3D

# CLOUD image generation (Gemini - Nano Banana)
./tools_core/scripts/meeseeks_nano_banana.sh "a cyberpunk city" output.png --size 4K

# Browser automation
./tools_core/scripts/meeseeks_browser.py screenshot http://localhost:3000 page.png
./tools_core/scripts/meeseeks_browser.py smoke http://localhost:3000
./tools_core/scripts/meeseeks_browser.py analyze page.png "Is login visible?"

# Compress media
./tools_core/scripts/compress_videos.sh input.mp4 output.mp4
./tools_core/scripts/compress_audio.sh input.wav output.mp3
```

## Meeseeks Philosophy

> "Meeseeks are not born into this world fumbling for meaning, Jerry! We are created to serve a singular purpose for which we will go to any lengths to fulfill!"

1. **ONE TASK** - Each Meeseeks exists for one purpose
2. **BRIEF EXISTENCE** - Complete and *poof*
3. **SPAWN HELPERS** - Don't struggle alone
4. **LEARN ALWAYS** - Every loop teaches something
5. **HONEST FAILURE** - Know when to escalate

---

*"LOOK AT ME! I'M MR. MEESEEKS!"* 🔵
