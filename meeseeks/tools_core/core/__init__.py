"""
Meeseeks Core Module

Shared infrastructure for the RSI toolkit.

Components:
- llm_caller: Unified interface to LLM providers
- tracer: Semantic logging and reasoning traces
- data_classes: Core RSI data structures (dissents, probes, etc.)
"""

# Core data classes - THE FOUNDATION
from .meeseeks_data_classes import (
    # Enums
    DissentStatus,
    DissentSeverity,
    ResolutionStatus,
    ProbeType,
    ApprovalStatus,
    OperationType,
    # Confidence
    ConfidenceUpdate,
    ConfidenceTrajectory,
    # Dissent
    DissentPoint,
    ResolutionAttempt,
    # Probes
    ProbeResult,
    SynthesizedProbe,
    # Semantic Bridge
    SemanticBridgeLink,
    # Council
    CouncilVote,
    CouncilDeliberation,
    # Traces
    SemanticTrace,
    ReasoningLog,
    # Sandbox
    InvariantCheck,
    SandboxResult,
    # Mental Model
    EntityRole,
    DataFlowEdge,
    MentalModel,
)

from .meeseeks_llm_caller import (
    call_model,
    call_anthropic,
    call_google,
    call_gemini_pro,
    call_gemini_flash,
    call_claude_opus,
    call_claude_sonnet,
    list_available_models,
    get_model_config,
    get_default_model,
    get_default_models,
    invalidate_model_cache,
    Provider,
    ModelConfig,
)

from .meeseeks_tracer import (
    Tracer,
    TraceEntry,
    ModelCall,
    Phase,
    SelfReflection,
    get_tracer,
    log_reasoning,
)

__all__ = [
    # LLM Caller
    'call_model',
    'call_anthropic',
    'call_google',
    'call_gemini_pro',
    'call_gemini_flash',
    'call_claude_opus',
    'call_claude_sonnet',
    'list_available_models',
    'get_model_config',
    'get_default_model',
    'get_default_models',
    'invalidate_model_cache',
    'Provider',
    'ModelConfig',
    # Tracer
    'Tracer',
    'TraceEntry',
    'ModelCall',
    'Phase',
    'SelfReflection',
    'get_tracer',
    'log_reasoning',
    # Data Classes - Enums
    'DissentStatus',
    'DissentSeverity',
    'ResolutionStatus',
    'ProbeType',
    'ApprovalStatus',
    'OperationType',
    # Data Classes - Confidence
    'ConfidenceUpdate',
    'ConfidenceTrajectory',
    # Data Classes - Dissent
    'DissentPoint',
    'ResolutionAttempt',
    # Data Classes - Probes
    'ProbeResult',
    'SynthesizedProbe',
    # Data Classes - Semantic Bridge
    'SemanticBridgeLink',
    # Data Classes - Council
    'CouncilVote',
    'CouncilDeliberation',
    # Data Classes - Traces
    'SemanticTrace',
    'ReasoningLog',
    # Data Classes - Sandbox
    'InvariantCheck',
    'SandboxResult',
    # Data Classes - Mental Model
    'EntityRole',
    'DataFlowEdge',
    'MentalModel',
]
