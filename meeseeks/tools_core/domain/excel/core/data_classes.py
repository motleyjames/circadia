"""
Core Data Classes for Excel Auto-Updater

All shared data structures, enums, and types used across the package.
"""

import re
import hashlib
from enum import Enum
from datetime import datetime
from typing import Any, Dict, List, Tuple, Optional
from dataclasses import dataclass, field

try:
    import openpyxl
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False


# =============================================================================
# ENUMS
# =============================================================================

class UpdateType(Enum):
    """Type of update operation"""
    INSERT = "insert"
    UPDATE = "update"
    DELETE = "delete"
    APPEND = "append"


class ApprovalStatus(Enum):
    """Status of human approval"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    MODIFIED = "modified"


class DissentStatus(Enum):
    """Status of a dissenting point"""
    UNRESOLVED = "unresolved"
    PARTIALLY_RESOLVED = "partially_resolved"
    FULLY_RESOLVED = "fully_resolved"
    ESCALATED = "escalated"


class DissentSeverity(Enum):
    """Severity of a dissenting point"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ResolutionStatus(Enum):
    """Resolution attempt status"""
    RESOLVED = "resolved"
    PARTIALLY_RESOLVED = "partially_resolved"
    CANNOT_RESOLVE = "cannot_resolve"
    NEEDS_SANDBOX = "needs_sandbox"
    NEEDS_HUMAN = "needs_human"


class ToolType(Enum):
    """Types of tools that can be synthesized"""
    PROBE_CELL = "probe_cell"
    PROBE_RANGE = "probe_range"
    PROBE_FORMULA = "probe_formula"
    COUNT_ROWS = "count_rows"
    CHECK_COLUMN_EXISTS = "check_column_exists"
    VALIDATE_TYPE = "validate_type"
    COMPUTE_VALUE = "compute_value"
    CHECK_INVARIANT = "check_invariant"
    CUSTOM_CODE = "custom_code"


# =============================================================================
# LOCATION & UPDATE DATA CLASSES
# =============================================================================

@dataclass
class CellLocation:
    """Represents a cell location in Excel"""
    sheet: str
    cell: str
    row: int
    column: int
    column_letter: str
    
    @classmethod
    def from_cell(cls, sheet: str, cell: str) -> 'CellLocation':
        """Create from cell reference like 'A1'"""
        match = re.match(r'^([A-Z]+)(\d+)$', cell.upper())
        if not match:
            raise ValueError(f"Invalid cell reference: {cell}")
        col_letter = match.group(1)
        row = int(match.group(2))
        if OPENPYXL_AVAILABLE:
            col = openpyxl.utils.column_index_from_string(col_letter)
        else:
            # Manual calculation
            col = 0
            for char in col_letter:
                col = col * 26 + (ord(char) - ord('A') + 1)
        return cls(sheet=sheet, cell=cell.upper(), row=row, column=col, column_letter=col_letter)


@dataclass
class UpdateTarget:
    """Represents a single update target"""
    location: CellLocation
    old_value: Any
    new_value: Any
    update_type: UpdateType
    confidence: float = 1.0
    reasoning: str = ""
    affected_formulas: List[str] = field(default_factory=list)


@dataclass
class UpdatePlan:
    """Complete update plan"""
    id: str
    timestamp: str
    source_file: str
    excel_file: str
    targets: List[UpdateTarget]
    execution_order: List[int]
    estimated_impact: Dict[str, Any]
    reasoning_trace: List[str]
    requires_approval: bool = True
    approval_status: ApprovalStatus = ApprovalStatus.PENDING


@dataclass
class ExecutionResult:
    """Result of executing an update"""
    success: bool
    plan_id: str
    updates_applied: int
    updates_failed: int
    errors: List[str]
    backup_path: str
    output_path: str
    duration_seconds: float


@dataclass
class ValidationResult:
    """Result of validating an update"""
    valid: bool
    checks_passed: int
    checks_failed: int
    issues: List[str]
    formula_errors: List[str]
    metric_changes: Dict[str, Tuple[Any, Any]]


@dataclass
class AuditLog:
    """Immutable audit record"""
    id: str
    timestamp: str
    user: str
    action: str
    plan: UpdatePlan
    result: ExecutionResult
    validation: ValidationResult
    checksum: str


# =============================================================================
# RSI DATA CLASSES
# =============================================================================

@dataclass
class ConfidenceUpdate:
    """Tracks a single confidence adjustment with full reasoning"""
    source: str
    signal_type: str
    delta: float
    evidence: str
    iteration: int
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ProbeResult:
    """Result of an active schema probe"""
    probe_type: str
    target: str
    result: Any
    verified: bool
    confidence_impact: float
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class DissentPoint:
    """A tracked dissenting point across iterations"""
    id: str
    content: str
    raised_by: str
    raised_iteration: int
    severity: DissentSeverity
    status: DissentStatus
    persistence_count: int = 1
    resolution_notes: List[str] = field(default_factory=list)
    related_probes: List[str] = field(default_factory=list)


@dataclass
class SemanticTrace:
    """A single step in the semantic reasoning trace"""
    iteration: int
    step: str
    thought: str
    observation: str
    confidence: float
    confidence_impact: float = 0.0
    evidence_weight: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ReasoningLog:
    """Complete reasoning log for an iteration"""
    iteration: int
    phase: str
    traces: List[SemanticTrace]
    insights: List[str]
    recommendations: List[str]
    self_critique: str
    improvement_actions: List[str]
    confidence_delta: float
    running_confidence: float = 0.5
    probes_performed: int = 0
    dissents_resolved: int = 0


@dataclass
class CouncilVote:
    """A vote from an LLM council member"""
    model: str
    provider: str
    decision: str
    reasoning: str
    confidence: float
    dissenting_points: List[str]


@dataclass
class CouncilDeliberation:
    """Result of LLM council deliberation"""
    votes: List[CouncilVote]
    consensus: str
    consensus_confidence: float
    key_agreements: List[str]
    key_disagreements: List[str]
    final_recommendation: Dict[str, Any]
    dissent_count: int = 0
    confidence_adjustment: float = 0.0


# =============================================================================
# RSI v3.0+ DATA CLASSES
# =============================================================================

@dataclass
class SynthesizedTool:
    """A tool synthesized by the LLM"""
    name: str
    tool_type: ToolType
    description: str
    code: str
    parameters: Dict[str, Any]
    generated_by: str
    from_dissent: Optional[str] = None


@dataclass
class ResolutionAttempt:
    """Result of attempting to resolve a dissent"""
    dissent_id: str
    dissent_content: str
    status: ResolutionStatus
    method: str
    evidence: str
    confidence_impact: float
    tool_used: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class SemanticBridgeLink:
    """A link connecting a probe result to dissents it resolves"""
    probe_id: str
    probe_result: Any
    dissent_ids: List[str]
    link_strength: float
    link_reasoning: str


@dataclass
class InvariantCheck:
    """An invariant to check before and after update"""
    name: str
    description: str
    check_code: str
    before_value: Any = None
    after_value: Any = None
    held: Optional[bool] = None


@dataclass
class SandboxResult:
    """Result of sandbox execution"""
    success: bool
    sandbox_path: str
    updates_applied: int
    invariants_checked: int
    invariants_held: int
    formula_errors_before: int
    formula_errors_after: int
    value_changes: Dict[str, Tuple[Any, Any]]
    issues: List[str]
    verification_passed: bool
    rollback_needed: bool


# =============================================================================
# RSI v3.1 - WORKBOOK MENTAL MODEL DATA CLASSES
# =============================================================================

@dataclass
class SheetRole:
    """Role/purpose of a sheet in the workbook"""
    name: str
    purpose: str  # 'data_source', 'calculation', 'summary', 'lookup', 'input'
    is_table: bool
    table_name: Optional[str]
    auto_expands: bool
    row_count: int
    formula_count: int
    feeds_into: List[str]  # Sheet names this feeds
    fed_by: List[str]  # Sheet names that feed this
    key_columns: List[str]  # Columns used for lookups


@dataclass
class FormulaChain:
    """A chain of formulas that connect data flow"""
    source_sheet: str
    source_range: str
    target_sheet: str
    target_cell: str
    formula_type: str  # 'INDEX_MATCH', 'VLOOKUP', 'SUMIF', 'DIRECT_REF'
    intermediates: List[str]  # Cells in between


@dataclass
class DataFlowEdge:
    """Edge in the data flow graph"""
    source: str  # Sheet!Range
    target: str  # Sheet!Range
    relationship: str  # 'lookup', 'aggregation', 'direct', 'calculated'
    formula_count: int
    functions_used: List[str]


@dataclass
class WorkbookUnderstanding:
    """Complete mental model of the workbook"""
    sheets: Dict[str, SheetRole]
    data_flows: List[DataFlowEdge]
    formula_chains: List[FormulaChain]
    aggregation_patterns: Dict[str, List[str]]  # target -> [sources]
    lookup_patterns: Dict[str, List[str]]  # lookup_table -> [consumers]
    table_structures: Dict[str, Dict[str, Any]]  # table_name -> table_info
    key_formulas: Dict[str, str]  # cell -> formula description
    update_propagation_map: Dict[str, List[str]]  # source -> affected targets

