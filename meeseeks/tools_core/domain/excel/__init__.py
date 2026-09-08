"""
Excel Auto-Updater Package

A modular, composable architecture for AI-powered Excel updates.

Structure:
- core/         : Data classes, enums, shared types
- tools/        : DataIngester, SchemaMatcher, Planner, Executor, Validator
- rsi/          : RSI v3.1 engine with WorkbookMentalModel
"""

from .core.data_classes import (
    UpdateType, ApprovalStatus, CellLocation, UpdateTarget,
    UpdatePlan, ExecutionResult, ValidationResult, AuditLog
)
from .tools.ingester import DataIngester
from .tools.schema_matcher import SchemaMatcher
from .tools.planner import UpdatePlanner
from .tools.executor import Executor
from .tools.validator import Validator
from .tools.human_review import HumanReview

__version__ = "3.1.0"

__all__ = [
    'UpdateType', 'ApprovalStatus', 'CellLocation', 'UpdateTarget',
    'UpdatePlan', 'ExecutionResult', 'ValidationResult', 'AuditLog',
    'DataIngester', 'SchemaMatcher', 'UpdatePlanner', 'Executor',
    'Validator', 'HumanReview'
]

