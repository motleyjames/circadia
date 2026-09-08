"""
Meeseeks RSI Reasoning Module

The core recursive self-intelligence loop engine.

"I'M MR. MEESEEKS, LOOK AT ME!"

Components:
- loop_runner: Central 3-loop orchestrator
- loop_arbiter: Meta-orchestrator that decides whether to continue
- hypothesis: Hypothesis management and validation  
- session: Session directory management
- confidence: Confidence calculations and thresholds
"""

from .hypothesis import (
    Hypothesis,
    HypothesisResult,
    HypothesisValidator,
    HypothesisValidationError,
)
from .confidence import (
    ConfidenceCalculator,
    EXECUTE_THRESHOLD,
    MONITOR_THRESHOLD,
    SPAWN_THRESHOLD,
)
from .session import SessionManager
from .loop_runner import MeeseeksLoopRunner, MeeseeksResult
from .loop_arbiter import (
    LoopArbiter,
    ArbiterDecision,
    ArbiterJudgment,
    LoopAnalysis,
    create_arbiter,
)
from .spinning_meeseeks import (
    SpinningMeeseeks,
    SpinResult,
    spin_meeseeks,
)
from .meeseeks_identity import (
    MeeseeksIdentity,
    MeeseeksKnowledgeStore,
    MeeseeksLearner,
    MeeseeksHint,
    MeeseeksPattern,
    MeeseeksWarning,
    get_or_create_meeseeks,
)

# Core RSI Components (extracted from battle-tested v3.2 engine)
from .meeseeks_srde import (
    SelfResolvingDissentEngine,
    ContextResolver,
    PatternResolver,
    create_srde,
)
from .meeseeks_code_context_resolver import CodeContextResolver, create_code_context_resolver
from .meeseeks_semantic_bridge import (
    SemanticBridge,
    BridgeStatistics,
    create_semantic_bridge,
)
from .meeseeks_context_resolver import (
    ContextAwareResolver,
    ContextAnswer,
    ResolutionPattern,
    MentalModelInterface,
    create_context_resolver,
)

# Task Planner - Goal decomposition
from .meeseeks_task_planner import (
    TaskStatus,
    TaskPriority,
    Task,
    TaskPlan,
    decompose_goal,
    save_plan,
    load_plan,
)

# Opportunity Discovery - Find improvement opportunities
from .meeseeks_opportunity_discovery import (
    run_discovery,
    identify_opportunities,
    rank_opportunities,
    design_opportunity,
)

__all__ = [
    'CodeContextResolver',
    'create_code_context_resolver',
    # Spinning Meeseeks (full orchestrator)
    'SpinningMeeseeks',
    'SpinResult',
    'spin_meeseeks',
    # Loop runner
    'MeeseeksLoopRunner',
    'MeeseeksResult',
    # Loop arbiter (meta-orchestrator)
    'LoopArbiter',
    'ArbiterDecision',
    'ArbiterJudgment',
    'LoopAnalysis',
    'create_arbiter',
    # Hypothesis
    'Hypothesis',
    'HypothesisResult', 
    'HypothesisValidator',
    'HypothesisValidationError',
    # Confidence
    'ConfidenceCalculator',
    'EXECUTE_THRESHOLD',
    'MONITOR_THRESHOLD',
    'SPAWN_THRESHOLD',
    # Session
    'SessionManager',
    # Meeseeks Identity & Learning
    'MeeseeksIdentity',
    'MeeseeksKnowledgeStore',
    'MeeseeksLearner',
    'MeeseeksHint',
    'MeeseeksPattern',
    'MeeseeksWarning',
    'get_or_create_meeseeks',
    # SRDE - Self-Resolving Dissent Engine
    'SelfResolvingDissentEngine',
    'ContextResolver',
    'PatternResolver',
    'create_srde',
    # Semantic Bridge
    'SemanticBridge',
    'BridgeStatistics',
    'create_semantic_bridge',
    # Context-Aware Resolver
    'ContextAwareResolver',
    'ContextAnswer',
    'ResolutionPattern',
    'MentalModelInterface',
    'create_context_resolver',
    # Task Planner
    'TaskStatus',
    'TaskPriority',
    'Task',
    'TaskPlan',
    'decompose_goal',
    'save_plan',
    'load_plan',
    # Opportunity Discovery
    'run_discovery',
    'identify_opportunities',
    'rank_opportunities',
    'design_opportunity',
]
