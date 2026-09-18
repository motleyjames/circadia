"""
tools_registry.py - MEESEEKS TOOLS AWARENESS SYSTEM

"I'M MR. MEESEEKS! I KNOW WHAT TOOLS I HAVE!"

This module maintains awareness of all tools available to Meeseeks:
- Core tools: Built-in, always available
- Spawned tools: Created during sessions, stored in tools_spawned/

Each spawned tool MUST have a README.md that describes:
- What the tool does
- How to use it
- When to use it
- Example usage

The tools prompt is dynamically generated from:
1. Core tool descriptions (hardcoded)
2. Spawned tool READMEs (scanned from tools_spawned/)
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional


@dataclass
class ToolDefinition:
    """Definition of a tool available to Meeseeks."""
    name: str
    description: str
    usage: str
    when_to_use: str
    examples: List[str]
    category: str  # core, spawned
    path: Optional[str] = None
    created_by: Optional[str] = None  # Meeseeks GUID that created it
    created_at: Optional[str] = None
    
    def to_prompt_section(self) -> str:
        """Convert to a section for the tools prompt."""
        section = f"""### {self.name}
**Category:** {self.category}
**Description:** {self.description}

**When to use:** {self.when_to_use}

**Usage:**
```
{self.usage}
```
"""
        if self.examples:
            section += "\n**Examples:**\n"
            for ex in self.examples:
                section += f"- {ex}\n"
        
        return section


# Core tools - always available (all prefixed with meeseeks_)
CORE_TOOLS: List[ToolDefinition] = [
    ToolDefinition(
        name="Meeseeks LLM Caller",
        description="Call various LLM models (Claude, Gemini, GPT) with unified interface",
        usage="from tools_core.core import call_model, call_claude_opus, call_gemini_pro",
        when_to_use="When you need to query an LLM for analysis, generation, or reasoning",
        examples=[
            "call_claude_opus('Analyze this architecture...')",
            "call_gemini_pro('Analyze this codebase with 2M context...')",
            "call_model(get_default_model('google_top'), prompt, system='You are...')",
        ],
        category="core",
        path="tools_core/core/meeseeks_llm_caller.py",
    ),
    ToolDefinition(
        name="Meeseeks Semantic Tracer",
        description="Create structured markdown traces of reasoning and decisions",
        usage="from tools_core.core import Tracer, get_tracer",
        when_to_use="When making significant decisions that should be logged for audit",
        examples=[
            "tracer = get_tracer(session_id)",
            "tracer.log(Phase.REASONING, 'Decision', context='...', reasoning='...')",
        ],
        category="core",
        path="tools_core/core/meeseeks_tracer.py",
    ),
    ToolDefinition(
        name="Meeseeks Council Vote",
        description="Multi-model deliberation for important decisions",
        usage="from tools_core.council import council_vote",
        when_to_use="When making critical decisions that benefit from multiple perspectives",
        examples=[
            "decision = council_vote('Should we use approach A or B?', context='...')",
        ],
        category="core",
        path="tools_core/council/meeseeks_council.py",
    ),
    ToolDefinition(
        name="Meeseeks Code Reviewer",
        description="AI-powered code review using Claude",
        usage="from tools_core.probes import review_code",
        when_to_use="When validating code changes before execution",
        examples=[
            "review = review_code(files=[Path('src/app.py')], context='Adding auth feature')",
        ],
        category="core",
        path="tools_core/probes/meeseeks_code_reviewer.py",
    ),
    ToolDefinition(
        name="Meeseeks Consistency Auditor",
        description="Audit codebase for consistency issues",
        usage="from tools_core.probes import audit_consistency",
        when_to_use="When checking for inconsistencies across the codebase",
        examples=[
            "issues = audit_consistency(directory='src/')",
        ],
        category="core",
        path="tools_core/probes/meeseeks_consistency_auditor.py",
    ),
    ToolDefinition(
        name="Meeseeks Self Healer",
        description="Self-healing tool for resolving unclear/invalid DSL-style semantic values",
        usage="from tools_core.probes import self_heal",
        when_to_use="When attempting to automatically fix detected issues",
        examples=[
            "req = self_heal(value='gap: cozy', attribute='gap', context='Panel layout')",
        ],
        category="core",
        path="tools_core/probes/meeseeks_self_healer.py",
    ),
    ToolDefinition(
        name="Meeseeks RSI Loop Runner",
        description="Execute the 3-loop recursive self-intelligence cycle",
        usage="from tools_core.reasoning import MeeseeksLoopRunner",
        when_to_use="When running a focused analysis task",
        examples=[
            "runner = MeeseeksLoopRunner(prime_directive='...')",
            "result = runner.run()",
        ],
        category="core",
        path="tools_core/reasoning/loop_runner.py",
    ),
    ToolDefinition(
        name="Meeseeks Task Planner",
        description="Plan and decompose complex tasks into actionable steps",
        usage="from tools_core.reasoning import decompose_goal",
        when_to_use="When breaking down a complex task into subtasks",
        examples=[
            "plan = decompose_goal('Build authentication system')",
        ],
        category="core",
        path="tools_core/reasoning/meeseeks_task_planner.py",
    ),
    ToolDefinition(
        name="Meeseeks Opportunity Discovery",
        description="Discover opportunities for improvement in code/processes",
        usage="from tools_core.reasoning import run_discovery",
        when_to_use="When looking for ways to improve or optimize",
        examples=[
            "results = run_discovery(loops=3, focus_area='user experience')",
        ],
        category="core",
        path="tools_core/reasoning/meeseeks_opportunity_discovery.py",
    ),
    ToolDefinition(
        name="Meeseeks Spinning",
        description="Full RSI orchestrator with arbiter and continuous learning",
        usage="from tools_core.reasoning import spin_meeseeks",
        when_to_use="When running a complex task that may need multiple loop cycles",
        examples=[
            "result = spin_meeseeks('Build feature X with tests')",
        ],
        category="core",
        path="tools_core/reasoning/spinning_meeseeks.py",
    ),
    ToolDefinition(
        name="Meeseeks Server",
        description="FastAPI server for LLM chat (and model listing)",
        usage="cd tools_core/server && uvicorn meeseeks_server:app --port 8000",
        when_to_use="When you need a web API for LLM interactions",
        examples=[
            "curl http://localhost:8000/health",
            "curl http://localhost:8000/models",
            "curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{\"message\": \"Hello\"}'",
        ],
        category="core",
        path="tools_core/server/meeseeks_server.py",
    ),
    ToolDefinition(
        name="Meeseeks Video Transcriber",
        description="Transcribe and analyze videos with multiple modes (meeting, technical, creative)",
        usage="python meeseeks_video_transcriber.py video.mp4 --focus meeting",
        when_to_use="When transcribing videos or extracting information from video content",
        examples=[
            "transcribe('meeting.mp4', mode='meeting')",
            "transcribe('tutorial.mp4', mode='technical')",
        ],
        category="core",
        path="tools_core/domain/video/meeseeks_video_transcriber.py",
    ),
    ToolDefinition(
        name="Meeseeks Loop Arbiter",
        description="Meta-orchestrator that decides whether to continue, pivot, or converge",
        usage="from tools_core.reasoning import LoopArbiter, create_arbiter",
        when_to_use="When analyzing loop results to decide next action",
        examples=[
            "arbiter = create_arbiter()",
            "judgment = arbiter.analyze_and_decide(session_id, result, directive)",
        ],
        category="core",
        path="tools_core/reasoning/loop_arbiter.py",
    ),
    ToolDefinition(
        name="Meeseeks Identity",
        description="Manage Meeseeks identity, knowledge, and cross-learning",
        usage="from tools_core.reasoning import MeeseeksKnowledgeStore, MeeseeksLearner",
        when_to_use="When creating Meeseeks, storing learnings, or learning from others",
        examples=[
            "store = MeeseeksKnowledgeStore()",
            "meeseeks = store.create_identity('Name', 'Purpose')",
            "learner = MeeseeksLearner(store)",
            "learner.learn_from(student, teacher_guid)",
        ],
        category="core",
        path="tools_core/reasoning/meeseeks_identity.py",
    ),
    ToolDefinition(
        name="Meeseeks Spawner",
        description="Spawn a Meeseeks into another repository",
        usage="from tools_core.spawner import MeeseeksSpawner",
        when_to_use="When deploying Meeseeks to work on a different codebase",
        examples=[
            "./spawn_meeseeks.py /path/to/repo --task 'Build feature X'",
        ],
        category="core",
        path="tools_core/spawner/meeseeks_spawner.py",
    ),
    ToolDefinition(
        name="Meeseeks Mermaid Generator",
        description="Generate high-resolution PNG diagrams from Mermaid code",
        usage="from tools_core.mermaid import generate_diagram\ngenerate_diagram('graph TD; A-->B', 'output.png', scale=3)",
        when_to_use="When visualizing architecture, flows, or relationships",
        examples=[
            "generate_diagram('flowchart.mmd', 'output.png', theme='dark')",
            "generate_all_in_directory('diagrams/', scale=4)",
            "./tools_core/mermaid/generate.sh diagram.mmd output.png --scale 4",
        ],
        category="core",
        path="tools_core/mermaid/",
    ),
    ToolDefinition(
        name="Meeseeks Browser Automation",
        description="Take screenshots, run smoke tests, analyze pages with vision AI. One command, one task, done.",
        usage="""# CLI
./tools_core/scripts/meeseeks_browser.py screenshot http://localhost:3000 page.png
./tools_core/scripts/meeseeks_browser.py smoke http://localhost:3000
./tools_core/scripts/meeseeks_browser.py analyze page.png "Is login visible?"
./tools_core/scripts/meeseeks_browser.py check  # Check dependencies""",
        when_to_use="When you need to screenshot a page, verify UI works, or analyze what a page looks like",
        examples=[
            "./tools_core/scripts/meeseeks_browser.py screenshot http://localhost:3000 page.png",
            "./tools_core/scripts/meeseeks_browser.py smoke http://localhost:3000",
            "./tools_core/scripts/meeseeks_browser.py analyze screenshot.png 'Is there an error message?'",
            "./tools_core/scripts/meeseeks_browser.py test http://localhost:3000 / /dashboard",
        ],
        category="core",
        path="tools_core/scripts/meeseeks_browser.py",
    ),
    ToolDefinition(
        name="Meeseeks SRDE",
        description="Self-Resolving Dissent Engine - automatically resolve council dissents without human intervention",
        usage="from tools_core.reasoning import SelfResolvingDissentEngine, create_srde",
        when_to_use="When council raises dissents that need programmatic resolution",
        examples=[
            "srde = create_srde()",
            "result = srde.attempt_resolution(dissent_id, dissent_content)",
        ],
        category="core",
        path="tools_core/reasoning/meeseeks_srde.py",
    ),
    ToolDefinition(
        name="Meeseeks Semantic Bridge",
        description="Connect probes to dissents to prevent redundant verification",
        usage="from tools_core.reasoning import SemanticBridge, create_semantic_bridge",
        when_to_use="When tracking what probes answer which dissents",
        examples=[
            "bridge = create_semantic_bridge()",
            "bridge.register_probe('probe_1', result)",
            "if bridge.is_answered_by_probe('dissent_1'): ...",
        ],
        category="core",
        path="tools_core/reasoning/meeseeks_semantic_bridge.py",
    ),
    ToolDefinition(
        name="Meeseeks Context Resolver",
        description="Use mental models to answer dissents immediately instead of probing",
        usage="from tools_core.reasoning import ContextAwareResolver, create_context_resolver",
        when_to_use="When you have domain understanding that can immediately answer questions",
        examples=[
            "resolver = create_context_resolver(mental_model)",
            "result = resolver.resolve(dissent_id, dissent_content)",
        ],
        category="core",
        path="tools_core/reasoning/meeseeks_context_resolver.py",
    ),
    ToolDefinition(
        name="Meeseeks Probe Factory",
        description="Dynamically synthesize verification probes from council dissents",
        usage="from tools_core.probes import MetacognitiveProbeFactory, create_probe_factory",
        when_to_use="When council raises concerns that need new verification tools",
        examples=[
            "factory = create_probe_factory()",
            "probes = factory.synthesize_from_council(votes)",
            "results = factory.execute_probes(probes, context)",
        ],
        category="core",
        path="tools_core/probes/meeseeks_probe_factory.py",
    ),
    ToolDefinition(
        name="Meeseeks Async Council",
        description="Parallel LLM execution - runs all council members simultaneously for 3x speedup",
        usage="from tools_core.council import AsyncCouncil, create_async_council",
        when_to_use="When you need faster council deliberation (parallel vs sequential)",
        examples=[
            "council = create_async_council()",
            "result = await council.deliberate(prompt)",
            "# Or sync: result = council.deliberate_sync(prompt)",
        ],
        category="core",
        path="tools_core/council/meeseeks_async_council.py",
    ),
    ToolDefinition(
        name="Meeseeks Visual Sentinel",
        description="Visual verification using VLM council - see what users see, not just what code sees",
        usage="from tools_core.probes import VisualCouncil, WebVisualSentinel, create_web_sentinel",
        when_to_use="When verifying visual output (screenshots, UI, documents)",
        examples=[
            "sentinel = create_web_sentinel()",
            "capture = sentinel.capture('http://localhost:3000')",
            "verification = sentinel.verify(capture, 'Check login form')",
            "diff = sentinel.compare(before_capture, after_capture)",
        ],
        category="core",
        path="tools_core/probes/meeseeks_visual_sentinel.py",
    ),
    
    # =============================================================================
    # DOMAIN TOOLS - Specialized capabilities for specific domains
    # =============================================================================
    
    ToolDefinition(
        name="Meeseeks Excel Engine",
        description="Full RSI-powered Excel automation: analyze workbooks, understand formulas, apply updates with verification",
        usage="from tools_core.domain.excel import RSIv32Engine\nengine = RSIv32Engine(workbook_path)\nresult = engine.apply_updates(updates)",
        when_to_use="When automating Excel workbooks, especially complex ones with formulas and cross-sheet references",
        examples=[
            "engine = RSIv32Engine('financials.xlsx')",
            "understanding = engine.analyze_workbook()",
            "result = engine.apply_updates(changes, verify=True)",
        ],
        category="domain",
        path="tools_core/domain/excel/",
    ),
    ToolDefinition(
        name="Meeseeks Financial Modeling",
        description="DCF valuation, sensitivity analysis, Monte Carlo simulation, and scenario planning",
        usage="from tools_core.domain.finance import DCFModel, SensitivityAnalyzer",
        when_to_use="When building financial models, valuations, or investment analysis",
        examples=[
            "model = DCFModel('CompanyName')",
            "model.set_assumptions(revenue_growth=0.15, wacc=0.10)",
            "result = model.calculate()",
            "analyzer = SensitivityAnalyzer(model)",
            "table = analyzer.two_way('wacc', 'terminal_growth')",
        ],
        category="domain",
        path="tools_core/domain/finance/",
    ),
    ToolDefinition(
        name="Meeseeks PDF Agent",
        description="PDF parsing, text/table extraction, and AI-powered analysis",
        usage="from tools_core.domain.pdf import PDFAgent, extract_text, analyze_pdf",
        when_to_use="When processing PDF documents for extraction or analysis",
        examples=[
            "agent = PDFAgent()",
            "text = extract_text('document.pdf')",
            "tables = extract_tables('report.pdf')",
            "summary = analyze_pdf('contract.pdf', 'Extract key terms')",
        ],
        category="domain",
        path="tools_core/domain/pdf/",
    ),
    ToolDefinition(
        name="Meeseeks Video Transcriber",
        description="Video transcription with focus modes: meeting (action items), technical (code/commands), creative (visuals)",
        usage="from tools_core.domain.video import VideoTranscriber, TranscriptionMode",
        when_to_use="When transcribing videos or extracting structured information from recordings",
        examples=[
            "transcriber = VideoTranscriber()",
            "result = transcriber.transcribe('meeting.mp4', mode='meeting')",
            "result = transcriber.transcribe('tutorial.mp4', mode='technical')",
        ],
        category="domain",
        path="tools_core/domain/video/",
    ),
    ToolDefinition(
        name="Meeseeks Generative Media",
        description="Local image AND video: Z-Image-Turbo (FASTEST image), MFlux (Apple Silicon), LTX-2 (video+audio!)",
        usage="""# IMAGES - Z-Image-Turbo (FASTEST, best text rendering)
from diffusers import ZImagePipeline
pipe = ZImagePipeline.from_pretrained("Tongyi-MAI/Z-Image-Turbo", torch_dtype=torch.bfloat16)
image = pipe("prompt", guidance_scale=0.0).images[0]

# VIDEO + AUDIO - LTX-2 (generates both together!)
from diffusers import LTX2Pipeline
pipe = LTX2Pipeline.from_pretrained("Lightricks/LTX-2", subfolder="ltx-2-19b-distilled")
video = pipe("cat playing piano", num_frames=97, guidance_scale=1.0).frames[0]""",
        when_to_use="Images: Z-Image-Turbo (sub-second). Video: LTX-2 (generates audio too!). Apple Silicon: MFlux",
        examples=[
            "pipe('Sign saying Hello', guidance_scale=0.0).images[0]  # Z-Image",
            "pipe('cat dancing', num_frames=97, guidance_scale=1.0).frames[0]  # LTX-2 video+audio",
            "./tools_core/scripts/meeseeks_generate.py 'a red panda' panda.png  # MFlux",
        ],
        category="domain",
        path="tools_core/domain/media/",
    ),
    ToolDefinition(
        name="Meeseeks FAL Cloud Media",
        description="Cloud generative media: 50+ models. 🔥 SAM 3 extracts ANY object from ANY image! Plus Veo/Sora video, avatars, 3D, TTS",
        usage="""# CLI
./tools_core/scripts/meeseeks_fal.py models  # List all 50+ models
./tools_core/scripts/meeseeks_fal.py image "a sunset" --priority quality
./tools_core/scripts/meeseeks_fal.py video "cat dancing" --model veo3.1-fast
./tools_core/scripts/meeseeks_fal.py speech "Hello" --voice English_CalmWoman
./tools_core/scripts/meeseeks_fal.py 3d --image <url>

# 🔥 SAM 3 - SEGMENT ANYTHING (Game Changer!)
./tools_core/scripts/meeseeks_fal.py segment <url> --prompt "the red car"
./tools_core/scripts/meeseeks_fal.py segment <url> --point 320,240  # Click to extract
./tools_core/scripts/meeseeks_fal.py track <video_url> --point 320,240  # Track through video!

# Python API
from tools_core.domain.cloud import segment_image, track_object, generate_video
mask = segment_image(url, prompt="the cat")  # Extract ANY object!
result = track_object(video_url, click_position=[320, 240])  # Track through ALL frames!""",
        when_to_use="🔥 SAM 3: Extract objects from images, track objects in video. Plus: Veo/Sora video, avatars, 3D, TTS",
        examples=[
            "segment_image(url, prompt='the person')  # 🔥 Extract ANY object!",
            "track_object(video, click_position=[320, 240])  # 🔥 Track through video!",
            "./meeseeks_fal.py segment photo.jpg --prompt 'the coffee mug'",
            "./meeseeks_fal.py track video.mp4 --point 320,240 -d 'the car'",
            "generate_video('robot walking', model='veo3.1-fast')",
        ],
        category="domain",
        path="tools_core/domain/cloud/",
    ),
]


class ToolsRegistry:
    """
    Registry of all tools available to Meeseeks.
    
    Scans both core tools and spawned tools to build a complete inventory.
    """
    
    def __init__(
        self,
        core_dir: Optional[Path] = None,
        spawned_dir: Optional[Path] = None,
    ):
        self.core_dir = core_dir or Path("tools_core")
        self.spawned_dir = spawned_dir or Path("tools_spawned")
        
        self._core_tools = CORE_TOOLS
        self._spawned_tools: List[ToolDefinition] = []
        
        # Scan spawned tools
        self._scan_spawned_tools()
    
    def _scan_spawned_tools(self):
        """Scan tools_spawned/ for tool definitions."""
        if not self.spawned_dir.exists():
            return
        
        for tool_dir in self.spawned_dir.iterdir():
            if not tool_dir.is_dir():
                continue
            
            # Look for README.md or tool.json
            readme_path = tool_dir / "README.md"
            spec_path = tool_dir / "spec.json"
            
            if spec_path.exists():
                # Load from spec.json (structured)
                tool = self._load_from_spec(spec_path)
                if tool:
                    self._spawned_tools.append(tool)
                    
            elif readme_path.exists():
                # Parse from README.md
                tool = self._parse_readme(readme_path, tool_dir.name)
                if tool:
                    self._spawned_tools.append(tool)
    
    def _load_from_spec(self, spec_path: Path) -> Optional[ToolDefinition]:
        """Load tool definition from spec.json."""
        try:
            with open(spec_path) as f:
                data = json.load(f)
            
            return ToolDefinition(
                name=data.get("name", spec_path.parent.name),
                description=data.get("description", ""),
                usage=data.get("usage", ""),
                when_to_use=data.get("when_to_use", ""),
                examples=data.get("examples", []),
                category="spawned",
                path=str(spec_path.parent),
                created_by=data.get("created_by"),
                created_at=data.get("created_at"),
            )
        except Exception as e:
            print(f"Warning: Failed to load {spec_path}: {e}")
            return None
    
    def _parse_readme(self, readme_path: Path, tool_name: str) -> Optional[ToolDefinition]:
        """Parse tool definition from README.md."""
        try:
            content = readme_path.read_text()
            
            # Simple parsing - look for sections
            description = ""
            usage = ""
            when_to_use = ""
            examples = []
            
            lines = content.split('\n')
            current_section = None
            
            for line in lines:
                if line.startswith('# '):
                    # Title - use as description start
                    description = line[2:].strip()
                elif line.startswith('## Description'):
                    current_section = 'description'
                elif line.startswith('## Usage'):
                    current_section = 'usage'
                elif line.startswith('## When to Use'):
                    current_section = 'when_to_use'
                elif line.startswith('## Examples'):
                    current_section = 'examples'
                elif line.startswith('## '):
                    current_section = None
                elif current_section:
                    if current_section == 'description':
                        description += " " + line.strip()
                    elif current_section == 'usage':
                        usage += line + "\n"
                    elif current_section == 'when_to_use':
                        when_to_use += " " + line.strip()
                    elif current_section == 'examples':
                        if line.strip().startswith('- '):
                            examples.append(line.strip()[2:])
            
            return ToolDefinition(
                name=tool_name,
                description=description.strip(),
                usage=usage.strip(),
                when_to_use=when_to_use.strip(),
                examples=examples,
                category="spawned",
                path=str(readme_path.parent),
            )
        except Exception as e:
            print(f"Warning: Failed to parse {readme_path}: {e}")
            return None
    
    @property
    def all_tools(self) -> List[ToolDefinition]:
        """Get all tools (core + spawned)."""
        return self._core_tools + self._spawned_tools
    
    @property
    def core_tools(self) -> List[ToolDefinition]:
        """Get core tools only."""
        return self._core_tools
    
    @property
    def spawned_tools(self) -> List[ToolDefinition]:
        """Get spawned tools only."""
        return self._spawned_tools
    
    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Get a tool by name."""
        for tool in self.all_tools:
            if tool.name.lower() == name.lower():
                return tool
        return None
    
    def generate_tools_prompt(self, include_spawned: bool = True) -> str:
        """
        Generate a prompt section describing all available tools.
        
        This should be included in the Meeseeks system prompt.
        """
        prompt = """# AVAILABLE TOOLS

You have access to the following tools. Use them appropriately based on your task.

## Core Tools (Always Available)

"""
        for tool in self._core_tools:
            prompt += tool.to_prompt_section() + "\n"
        
        if include_spawned and self._spawned_tools:
            prompt += """
## Spawned Tools (Created by Other Meeseeks)

These tools were created during previous sessions and are available for reuse.

"""
            for tool in self._spawned_tools:
                prompt += tool.to_prompt_section() + "\n"
        
        prompt += """
## Creating New Tools

When you create a new tool, you MUST:

1. Create it in `tools_spawned/{tool_name}/`
2. Include a `README.md` with these sections:
   - `# Tool Name` - Brief description
   - `## Description` - What it does
   - `## Usage` - How to use it (code examples)
   - `## When to Use` - When this tool is appropriate
   - `## Examples` - Concrete usage examples
3. Optionally include a `spec.json` for structured metadata

This ensures future Meeseeks can discover and use your tool!
"""
        return prompt
    
    def save_registry(self, output_path: Optional[Path] = None):
        """Save the registry to a JSON file."""
        output = output_path or Path("box/tools_registry.json")
        
        data = {
            "generated_at": datetime.now().isoformat(),
            "core_tools": [
                {
                    "name": t.name,
                    "description": t.description,
                    "path": t.path,
                    "category": t.category,
                }
                for t in self._core_tools
            ],
            "spawned_tools": [
                {
                    "name": t.name,
                    "description": t.description,
                    "path": t.path,
                    "category": t.category,
                    "created_by": t.created_by,
                    "created_at": t.created_at,
                }
                for t in self._spawned_tools
            ],
        }
        
        output.parent.mkdir(parents=True, exist_ok=True)
        with open(output, 'w') as f:
            json.dump(data, f, indent=2)
        
        return output


def create_spawned_tool(
    name: str,
    description: str,
    usage: str,
    when_to_use: str,
    examples: List[str],
    code: Optional[str] = None,
    created_by: Optional[str] = None,
    spawned_dir: Optional[Path] = None,
) -> Path:
    """
    Create a new spawned tool with proper documentation.
    
    Args:
        name: Tool name (will be used as directory name)
        description: What the tool does
        usage: How to use it
        when_to_use: When this tool is appropriate
        examples: List of example usages
        code: Optional Python code for the tool
        created_by: Meeseeks GUID that created this
        spawned_dir: Directory for spawned tools
    
    Returns:
        Path to the created tool directory
    """
    base_dir = spawned_dir or Path("tools_spawned")
    tool_dir = base_dir / name.lower().replace(" ", "_")
    tool_dir.mkdir(parents=True, exist_ok=True)
    
    # Create spec.json
    spec = {
        "name": name,
        "description": description,
        "usage": usage,
        "when_to_use": when_to_use,
        "examples": examples,
        "created_by": created_by,
        "created_at": datetime.now().isoformat(),
    }
    
    with open(tool_dir / "spec.json", 'w') as f:
        json.dump(spec, f, indent=2)
    
    # Create README.md
    readme = f"""# {name}

{description}

## Description

{description}

## Usage

```python
{usage}
```

## When to Use

{when_to_use}

## Examples

"""
    for ex in examples:
        readme += f"- {ex}\n"
    
    if created_by:
        readme += f"\n---\n\n*Created by Meeseeks {created_by} on {datetime.now().isoformat()}*\n"
    
    with open(tool_dir / "README.md", 'w') as f:
        f.write(readme)
    
    # Create tool code if provided
    if code:
        with open(tool_dir / "tool.py", 'w') as f:
            f.write(code)
    
    return tool_dir


# Example usage and test
if __name__ == "__main__":
    print("🔵 MEESEEKS TOOLS REGISTRY")
    print("=" * 50)
    
    # Create registry
    registry = ToolsRegistry()
    
    print(f"\n📦 Core tools: {len(registry.core_tools)}")
    for tool in registry.core_tools:
        print(f"   - {tool.name}")
    
    print(f"\n🐣 Spawned tools: {len(registry.spawned_tools)}")
    for tool in registry.spawned_tools:
        print(f"   - {tool.name} (by {tool.created_by or 'unknown'})")
    
    # Generate prompt
    print("\n📝 Tools prompt preview (first 1000 chars):")
    print("-" * 40)
    prompt = registry.generate_tools_prompt()
    print(prompt[:1000] + "...")
    
    # Save registry
    output = registry.save_registry()
    print(f"\n✅ Saved registry to: {output}")
    
    # Demo creating a spawned tool
    print("\n🐣 Creating example spawned tool...")
    tool_dir = create_spawned_tool(
        name="PDF Parser",
        description="Parse PDF documents and extract structured data",
        usage="from tools_spawned.pdf_parser import parse_pdf\ndata = parse_pdf('document.pdf')",
        when_to_use="When you need to extract text, tables, or metadata from PDF files",
        examples=[
            "parse_pdf('contract.pdf')",
            "parse_pdf('report.pdf', extract_tables=True)",
        ],
        created_by="demo_meeseeks",
    )
    print(f"✅ Created: {tool_dir}")
    
    print("\n🔵 LOOK AT ME! Registry complete!")
