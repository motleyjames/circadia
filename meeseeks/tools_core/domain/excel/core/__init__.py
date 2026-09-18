"""
Core - Excel-Specific Data Classes and Engine

This module provides Excel-specific components, importing generic
components from tools_core where possible.

Excel-Specific:
- data_classes: Excel-specific Pydantic/dataclass models
- structured_outputs: Pydantic schemas for LLM responses
- excel_engine: xlwings + calamine for production Excel handling

Generic Components (imported from tools_core):
- AsyncCouncil (from tools_core.council)
- CouncilVote, CouncilDeliberation (from tools_core.core.meeseeks_data_classes)
"""

# Excel-specific data classes
from .data_classes import (
    UpdateType, ApprovalStatus, CellLocation, UpdateTarget,
    UpdatePlan, ExecutionResult, ValidationResult, AuditLog,
    DissentSeverity, DissentStatus, DissentPoint, ResolutionStatus,
    ResolutionAttempt, ProbeResult
)

# Structured outputs for Excel operations
from .structured_outputs import (
    CouncilVote as ExcelCouncilVote,  # Excel-specific version
    CouncilDeliberationResult,
    DissentItem,
    VisualVoteResult,
    VisualComparisonResult,
    SynthesizedProbe,
    ProbeExecutionResult,
    UpdateImpactPrediction,
    get_structured_client
)

# Import generic AsyncCouncil from tools_core
from tools_core.council import (
    AsyncCouncil,
    AsyncCouncilConfig,
    AsyncVisualCouncil
)

# Excel-specific engine
from .excel_engine import (
    ExcelEngine,
    ExcelCapture,
    create_excel_engine,
    check_excel_engines,
    XLWINGS_AVAILABLE,
    CALAMINE_AVAILABLE
)

__all__ = [
    # Excel-Specific Data Classes
    'UpdateType', 'ApprovalStatus', 'CellLocation', 'UpdateTarget',
    'UpdatePlan', 'ExecutionResult', 'ValidationResult', 'AuditLog',
    'DissentSeverity', 'DissentStatus', 'DissentPoint', 'ResolutionStatus',
    'ResolutionAttempt', 'ProbeResult',
    # Structured Outputs (Excel-specific)
    'ExcelCouncilVote', 'CouncilDeliberationResult', 'DissentItem',
    'VisualVoteResult', 'VisualComparisonResult', 'SynthesizedProbe',
    'ProbeExecutionResult', 'UpdateImpactPrediction', 'get_structured_client',
    # Async Council (from tools_core)
    'AsyncCouncil', 'AsyncCouncilConfig', 'AsyncVisualCouncil',
    # Excel Engine
    'ExcelEngine', 'ExcelCapture', 'create_excel_engine', 'check_excel_engines',
    'XLWINGS_AVAILABLE', 'CALAMINE_AVAILABLE'
]

