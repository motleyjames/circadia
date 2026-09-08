"""
RSI v3.1.1 - Recursive Self-Intelligence with Vision (Excel Specialized)

This module provides Excel-specific RSI capabilities, importing generic
components from tools_core/core, tools_core/reasoning, and tools_core/probes.

Excel-Specific:
- WorkbookMentalModel: Pre-computes data flow, formula chains, table structures
- FormulaFlowAnalyzer: Traces INDEX/MATCH/SUMIF chains
- RSIv31Engine: Excel-specific RSI orchestrator

Generic Components (imported from tools_core):
- SelfResolvingDissentEngine (from tools_core.reasoning)
- MetacognitiveProbeFactory (from tools_core.probes)
- SemanticBridge (from tools_core.reasoning)
- ContextAwareResolver (from tools_core.reasoning)
- VisualSentinel, VisualCouncil (from tools_core.probes)
"""

# Excel-specific components
from .workbook_model import WorkbookMentalModel, FormulaFlowAnalyzer
from .engine import RSIv31Engine, create_rsi_v31_engine

# Import generic components from tools_core
# These are the CANONICAL implementations
from tools_core.reasoning import (
    SelfResolvingDissentEngine,
    SemanticBridge,
    ContextAwareResolver,
)

from tools_core.probes import (
    MetacognitiveProbeFactory,
    VisualCouncil,
    BaseVisualSentinel,
    VisualCapture,
    VisualVerification,
    VisualDiff,
    VisualCheckType,
    VisualDeliberation,
    VisualVote,
)

# Excel-specific visual components (extends base)
from .visual_sentinel import (
    VisualSentinel,  # Excel-specific subclass
    UITars2Client,
    VisionProvider,
)
from .visual_dissent import (
    VisualDissentResolver,
    VisualProofGenerator,
    VisualResolution
)

__version__ = "3.1.1"

__all__ = [
    # Excel-Specific
    'WorkbookMentalModel',
    'FormulaFlowAnalyzer',
    'RSIv31Engine',
    'create_rsi_v31_engine',
    # Generic Components (from tools_core)
    'SelfResolvingDissentEngine',
    'MetacognitiveProbeFactory',
    'SemanticBridge',
    'ContextAwareResolver',
    # Visual Intelligence
    'VisualSentinel',
    'VisualCouncil',
    'BaseVisualSentinel',
    'UITars2Client',
    'VisualCapture',
    'VisualVerification',
    'VisualDiff',
    'VisualCheckType',
    'VisionProvider',
    'VisualDeliberation',
    'VisualVote',
    'VisualDissentResolver',
    'VisualProofGenerator',
    'VisualResolution'
]

