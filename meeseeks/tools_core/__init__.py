"""
Meeseeks RSI Toolkit

"I'M MR. MEESEEKS, LOOK AT ME!"

A unified AI-powered automation toolkit for recursive self-intelligence.

Modules:
- core: LLM calling, tracing, configuration
- reasoning: RSI loop runner, hypothesis management, confidence tracking
- council: Multi-model deliberation and synthesis
- probes: Code review and verification tools
- spawner: Spawn Meeseeks into other repos
- domain: Domain-specific implementations (excel, media, video)
"""

__version__ = "3.0.0"
__author__ = "Arcane Labs"

# Core imports
from .core import call_model, get_default_model, get_default_models, invalidate_model_cache, Tracer, get_tracer

# Reasoning imports
from .reasoning import (
    MeeseeksLoopRunner,
    MeeseeksResult,
    SpinningMeeseeks,
    spin_meeseeks,
    LoopArbiter,
    ArbiterDecision,
    Hypothesis,
    HypothesisResult,
    HypothesisValidator,
    ConfidenceCalculator,
    SessionManager,
)

# Spawner imports
from .spawner import spawn_meeseeks, MeeseeksSpawner

# Mermaid diagram generator
from .mermaid import generate_diagram, generate_all_in_directory

# Tools registry imports
from .tools_registry import (
    ToolsRegistry,
    ToolDefinition,
    create_spawned_tool,
    CORE_TOOLS,
)

# Knowledge registry imports
from .knowledge_registry import (
    KnowledgeRegistry,
    KnowledgeEntry,
    create_knowledge,
)

__all__ = [
    # Core
    'call_model',
    'Tracer',
    'get_tracer',
    # Reasoning - Full orchestrator
    'SpinningMeeseeks',
    'spin_meeseeks',
    'LoopArbiter',
    'ArbiterDecision',
    # Reasoning - Basic
    'MeeseeksLoopRunner',
    'MeeseeksResult',
    'Hypothesis',
    'HypothesisResult',
    'HypothesisValidator',
    'ConfidenceCalculator',
    'SessionManager',
    # Spawner
    'spawn_meeseeks',
    'MeeseeksSpawner',
    # Tools registry
    'ToolsRegistry',
    'ToolDefinition',
    'create_spawned_tool',
    'CORE_TOOLS',
    # Mermaid
    'generate_diagram',
    'generate_all_in_directory',
    # Knowledge registry
    'KnowledgeRegistry',
    'KnowledgeEntry',
    'create_knowledge',
]
