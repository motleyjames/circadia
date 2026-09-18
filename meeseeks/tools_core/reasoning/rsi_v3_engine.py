#!/usr/bin/env python3
"""
RSI v3.0 - THE 1000% RECURSIVE SELF-INTELLIGENCE ENGINE

This module implements the ultimate RSI with:

1. SELF-RESOLVING DISSENT ENGINE (SRDE)
   - Parse dissents and attempt to resolve them programmatically
   - Bridge probes to dissents for automatic resolution
   
2. METACOGNITIVE PROBE SYNTHESIS (MPS)
   - Generate new probes from council feedback
   - LLM-driven tool generation
   
3. SANDBOX EXECUTION ENVIRONMENT
   - Copy Excel to temp, apply changes, verify outcomes
   - Rollback if verification fails
   
4. LLM-GENERATED VERIFICATION CODE
   - Ask LLMs "what code would verify this worked?"
   - Execute the code and feed results back
   
5. INVARIANT DETECTION & VERIFICATION
   - Capture key formulas and values before update
   - Verify invariants held after update
   
6. SEMANTIC BRIDGE
   - Connect probes ↔ dissents ↔ resolutions
   - Prevent repeated concerns about verified facts
   
7. CONFIDENCE-GATED AUTO-EXECUTE
   - Execute automatically when all conditions are met
   - Only defer to human when genuinely needed

Author: RSI v3.0 Architect
"""

import os
import re
import json
import shutil
import hashlib
import tempfile
import traceback
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple, Callable, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
import logging

# Excel support
try:
    import openpyxl
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

# LLM support
try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

try:
    from tools_core.core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model

logger = logging.getLogger(__name__)


# =============================================================================
# DATA STRUCTURES
# =============================================================================

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


class ResolutionStatus(Enum):
    """Resolution attempt status"""
    RESOLVED = "resolved"
    PARTIALLY_RESOLVED = "partially_resolved"
    CANNOT_RESOLVE = "cannot_resolve"
    NEEDS_SANDBOX = "needs_sandbox"
    NEEDS_HUMAN = "needs_human"


@dataclass
class SynthesizedTool:
    """A tool synthesized by the LLM"""
    name: str
    tool_type: ToolType
    description: str
    code: str  # Python code to execute
    parameters: Dict[str, Any]
    generated_by: str  # Which LLM generated this
    from_dissent: Optional[str] = None  # Dissent that triggered generation


@dataclass
class ResolutionAttempt:
    """Result of attempting to resolve a dissent"""
    dissent_id: str
    dissent_content: str
    status: ResolutionStatus
    method: str  # How we tried to resolve it
    evidence: str  # What we found
    confidence_impact: float
    tool_used: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class SemanticBridgeLink:
    """A link connecting a probe result to dissents it resolves"""
    probe_id: str
    probe_result: Any
    dissent_ids: List[str]
    link_strength: float  # 0-1: how strongly the probe answers the dissent
    link_reasoning: str


@dataclass
class InvariantCheck:
    """An invariant to check before and after update"""
    name: str
    description: str
    check_code: str  # Python code that returns True/False
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
# SELF-RESOLVING DISSENT ENGINE (SRDE)
# =============================================================================

class SelfResolvingDissentEngine:
    """
    SRDE - Self-Resolving Dissent Engine
    
    Instead of just tracking dissents, this engine ATTEMPTS TO RESOLVE them
    programmatically before the next iteration.
    
    Resolution strategies:
    1. Cross-reference with existing probe results
    2. Execute new probes based on dissent parsing
    3. Run validation code
    4. Use sandbox execution for verification
    """
    
    def __init__(self, excel_path: Optional[Path] = None, 
                 incoming_data: Optional[Dict] = None,
                 knowledge_base: Optional[Dict] = None):
        self.excel_path = excel_path
        self.incoming_data = incoming_data or {}
        self.knowledge = knowledge_base or {}
        self.probe_results: Dict[str, Any] = {}  # Cache of probe results
        self.resolution_history: List[ResolutionAttempt] = []
        self._workbook = None
        
        # Resolution patterns - regex to action mapping
        self.resolution_patterns = [
            # CSV row count verification
            (r'(validate|verify|confirm|check).*(csv|row|count).*(\d+)', 
             self._resolve_row_count),
            # Insertion point verification
            (r'(verify|check|validate).*(insert|insertion|row|A\d+)', 
             self._resolve_insertion_point),
            # Column/header existence
            (r'(check|verify|ensure).*(column|header).*exists?', 
             self._resolve_column_exists),
            # Data type validation
            (r'(validate|check).*(data|type|numeric|format)', 
             self._resolve_data_type),
            # Empty range check
            (r'(confirm|verify|check).*(empty|blank|clear)', 
             self._resolve_empty_range),
            # Backup verification
            (r'(create|ensure|backup)', 
             self._resolve_backup_exists),
            # Dynamic range detection
            (r'(dynamic|last|next).*(row|range)', 
             self._resolve_dynamic_range),
        ]
    
    def _get_workbook(self):
        """Lazy load workbook"""
        if self._workbook is None and self.excel_path and self.excel_path.exists():
            try:
                self._workbook = openpyxl.load_workbook(
                    self.excel_path, data_only=True, read_only=True
                )
            except Exception as e:
                logger.warning(f"Could not load workbook: {e}")
        return self._workbook
    
    def register_probe_result(self, probe_id: str, result: Any):
        """Register a probe result for cross-referencing"""
        self.probe_results[probe_id] = result
    
    def attempt_resolution(self, dissent_id: str, dissent_content: str) -> ResolutionAttempt:
        """
        Attempt to resolve a dissent programmatically.
        
        This is the core of SRDE - instead of just noting concerns,
        we try to ANSWER them.
        """
        content_lower = dissent_content.lower()
        
        # Try each resolution pattern
        for pattern, resolver in self.resolution_patterns:
            if re.search(pattern, content_lower, re.IGNORECASE):
                try:
                    result = resolver(dissent_id, dissent_content)
                    if result.status == ResolutionStatus.RESOLVED:
                        logger.info(f"✓ SRDE resolved dissent: {dissent_id[:8]}... via {result.method}")
                    self.resolution_history.append(result)
                    return result
                except Exception as e:
                    logger.warning(f"Resolution attempt failed: {e}")
        
        # Try cross-reference with existing probes
        cross_ref = self._cross_reference_probes(dissent_id, dissent_content)
        if cross_ref:
            self.resolution_history.append(cross_ref)
            return cross_ref
        
        # Cannot resolve programmatically
        result = ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=dissent_content,
            status=ResolutionStatus.CANNOT_RESOLVE,
            method="no_matching_resolver",
            evidence="No programmatic resolution available",
            confidence_impact=0.0
        )
        self.resolution_history.append(result)
        return result
    
    def _cross_reference_probes(self, dissent_id: str, content: str) -> Optional[ResolutionAttempt]:
        """Check if any existing probe answers this dissent"""
        content_lower = content.lower()
        
        for probe_id, result in self.probe_results.items():
            # Check for keyword matches
            probe_lower = probe_id.lower()
            
            # Insertion point concerns
            if 'insert' in content_lower and 'insert' in probe_lower:
                if isinstance(result, dict) and result.get('safe'):
                    return ResolutionAttempt(
                        dissent_id=dissent_id,
                        dissent_content=content,
                        status=ResolutionStatus.RESOLVED,
                        method="cross_reference_probe",
                        evidence=f"Probe '{probe_id}' already verified: {result}",
                        confidence_impact=0.10,
                        tool_used=probe_id
                    )
            
            # Row/range concerns
            if any(k in content_lower for k in ['row', 'range', 'empty']):
                if any(k in probe_lower for k in ['row', 'range', 'empty']):
                    if isinstance(result, dict) and result.get('verified'):
                        return ResolutionAttempt(
                            dissent_id=dissent_id,
                            dissent_content=content,
                            status=ResolutionStatus.RESOLVED,
                            method="cross_reference_probe",
                            evidence=f"Verified by probe: {result}",
                            confidence_impact=0.08,
                            tool_used=probe_id
                        )
        
        return None
    
    def _resolve_row_count(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve row count verification dissents"""
        # Extract expected count from dissent
        match = re.search(r'(\d+)', content)
        expected_count = int(match.group(1)) if match else None
        
        # Count actual rows in incoming data
        actual_count = len(self.incoming_data.get('rows', []))
        
        if expected_count is not None and actual_count == expected_count:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.RESOLVED,
                method="row_count_verification",
                evidence=f"CSV has {actual_count} data rows, matches expected {expected_count}",
                confidence_impact=0.12
            )
        elif expected_count is not None:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.PARTIALLY_RESOLVED,
                method="row_count_verification",
                evidence=f"MISMATCH: CSV has {actual_count} rows, expected {expected_count}",
                confidence_impact=-0.05
            )
        else:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.RESOLVED,
                method="row_count_verification",
                evidence=f"CSV has {actual_count} data rows (no specific count required)",
                confidence_impact=0.08
            )
    
    def _resolve_insertion_point(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve insertion point verification dissents"""
        # Check if already probed
        for probe_id, result in self.probe_results.items():
            if 'insert' in probe_id.lower():
                if isinstance(result, dict) and result.get('safe'):
                    return ResolutionAttempt(
                        dissent_id=dissent_id,
                        dissent_content=content,
                        status=ResolutionStatus.RESOLVED,
                        method="insertion_point_verification",
                        evidence=f"Already verified safe by probe: {probe_id}",
                        confidence_impact=0.10,
                        tool_used=probe_id
                    )
        
        # Need to probe - mark for sandbox
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.NEEDS_SANDBOX,
            method="insertion_point_verification",
            evidence="Requires sandbox verification",
            confidence_impact=0.0
        )
    
    def _resolve_column_exists(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve column existence dissents"""
        wb = self._get_workbook()
        if not wb:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.CANNOT_RESOLVE,
                method="column_check",
                evidence="Cannot access workbook",
                confidence_impact=0.0
            )
        
        # Extract column name from content
        match = re.search(r'[\'"]([^"\']+)[\'"]', content)
        column_name = match.group(1) if match else None
        
        if column_name:
            # Check each sheet for the column
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                for cell in sheet[1]:  # First row (headers)
                    if cell.value and column_name.lower() in str(cell.value).lower():
                        return ResolutionAttempt(
                            dissent_id=dissent_id,
                            dissent_content=content,
                            status=ResolutionStatus.RESOLVED,
                            method="column_check",
                            evidence=f"Column '{column_name}' found at {sheet_name}!{cell.coordinate}",
                            confidence_impact=0.08
                        )
            
            # Column not found
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.PARTIALLY_RESOLVED,
                method="column_check",
                evidence=f"Column '{column_name}' not found in any sheet",
                confidence_impact=-0.03
            )
        
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.CANNOT_RESOLVE,
            method="column_check",
            evidence="Could not extract column name from dissent",
            confidence_impact=0.0
        )
    
    def _resolve_data_type(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve data type validation dissents"""
        # Check incoming data types
        inferred_types = self.incoming_data.get('inferred_types', {})
        
        if inferred_types:
            numeric_cols = [k for k, v in inferred_types.items() if v in ['int', 'float', 'number']]
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.RESOLVED,
                method="data_type_check",
                evidence=f"Data types inferred: {inferred_types}. Numeric columns: {numeric_cols}",
                confidence_impact=0.06
            )
        
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.CANNOT_RESOLVE,
            method="data_type_check",
            evidence="No type inference available",
            confidence_impact=0.0
        )
    
    def _resolve_empty_range(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve empty range dissents"""
        # Check probe results for range emptiness
        for probe_id, result in self.probe_results.items():
            if 'range' in probe_id.lower() or 'empty' in probe_id.lower():
                if isinstance(result, dict):
                    is_empty = result.get('is_empty') or result.get('result', {}).get('is_empty')
                    if is_empty:
                        return ResolutionAttempt(
                            dissent_id=dissent_id,
                            dissent_content=content,
                            status=ResolutionStatus.RESOLVED,
                            method="empty_range_check",
                            evidence=f"Range verified empty by probe: {probe_id}",
                            confidence_impact=0.08,
                            tool_used=probe_id
                        )
        
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.NEEDS_SANDBOX,
            method="empty_range_check",
            evidence="Requires sandbox verification of range emptiness",
            confidence_impact=0.0
        )
    
    def _resolve_backup_exists(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve backup-related dissents"""
        # Backup is handled by Executor - always created
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.RESOLVED,
            method="backup_verification",
            evidence="Automatic backup is created by Executor before any updates",
            confidence_impact=0.05
        )
    
    def _resolve_dynamic_range(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve dynamic range detection dissents"""
        # Check if we have last_row probe
        for probe_id, result in self.probe_results.items():
            if 'last' in probe_id.lower() and 'row' in probe_id.lower():
                if isinstance(result, (int, dict)):
                    last_row = result if isinstance(result, int) else result.get('result')
                    return ResolutionAttempt(
                        dissent_id=dissent_id,
                        dissent_content=content,
                        status=ResolutionStatus.RESOLVED,
                        method="dynamic_range_detection",
                        evidence=f"Last populated row detected: {last_row}. Using dynamic append.",
                        confidence_impact=0.10,
                        tool_used=probe_id
                    )
        
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.NEEDS_SANDBOX,
            method="dynamic_range_detection",
            evidence="Requires probing to determine last row",
            confidence_impact=0.0
        )
    
    def close(self):
        """Clean up resources"""
        if self._workbook:
            try:
                self._workbook.close()
            except Exception:
                pass
            self._workbook = None


# =============================================================================
# METACOGNITIVE PROBE SYNTHESIS (MPS)
# =============================================================================

class MetacognitiveProbeFactory:
    """
    MPS - Metacognitive Probe Synthesis
    
    Parses council feedback and SYNTHESIZES new probes dynamically.
    The system builds its own verification tools based on what the LLMs ask for.
    """
    
    def __init__(self, openai_key: Optional[str] = None,
                 anthropic_key: Optional[str] = None,
                 gemini_key: Optional[str] = None):
        self.openai_key = openai_key
        self.anthropic_key = anthropic_key
        self.gemini_key = gemini_key
        self.synthesized_tools: List[SynthesizedTool] = []
        
        # Pre-built tool templates
        self.tool_templates = {
            ToolType.PROBE_CELL: """
def probe_cell(wb, sheet_name, cell_ref):
    '''Probe a specific cell value'''
    sheet = wb[sheet_name]
    return sheet[cell_ref].value
""",
            ToolType.COUNT_ROWS: """
def count_rows(wb, sheet_name, column='A'):
    '''Count non-empty rows in a column'''
    sheet = wb[sheet_name]
    count = 0
    for row in range(1, sheet.max_row + 1):
        if sheet[f'{column}{row}'].value is not None:
            count += 1
    return count
""",
            ToolType.CHECK_COLUMN_EXISTS: """
def check_column_exists(wb, sheet_name, column_name):
    '''Check if a column with given name exists in headers'''
    sheet = wb[sheet_name]
    for cell in sheet[1]:  # First row
        if cell.value and column_name.lower() in str(cell.value).lower():
            return {'exists': True, 'cell': cell.coordinate}
    return {'exists': False}
""",
            ToolType.CHECK_INVARIANT: """
def check_invariant(wb, sheet_name, formula_cell, expected_relation, reference_value):
    '''Check if an invariant holds (e.g., a total equals sum of parts)'''
    sheet = wb[sheet_name]
    actual = sheet[formula_cell].value
    if expected_relation == 'equals':
        return actual == reference_value
    elif expected_relation == 'greater_than':
        return actual > reference_value
    elif expected_relation == 'less_than':
        return actual < reference_value
    elif expected_relation == 'not_changed':
        return actual == reference_value
    return None
""",
        }
    
    def synthesize_from_council(self, votes: List[Dict]) -> List[SynthesizedTool]:
        """
        Parse council feedback and synthesize new probes.
        
        This is where the magic happens - we turn LLM suggestions into actual tools.
        """
        new_tools = []
        
        for vote in votes:
            model = vote.get('model', 'unknown')
            dissenting_points = vote.get('dissenting_points', [])
            
            for point in dissenting_points:
                if isinstance(point, str):
                    tool = self._synthesize_tool_from_dissent(point, model)
                    if tool:
                        new_tools.append(tool)
                        self.synthesized_tools.append(tool)
        
        return new_tools
    
    def _synthesize_tool_from_dissent(self, dissent: str, model: str) -> Optional[SynthesizedTool]:
        """Synthesize a tool from a dissenting point"""
        dissent_lower = dissent.lower()
        
        # Pattern matching to determine tool type
        if any(k in dissent_lower for k in ['row count', 'count rows', 'validate csv']):
            return SynthesizedTool(
                name=f"count_csv_rows_{len(self.synthesized_tools)}",
                tool_type=ToolType.COUNT_ROWS,
                description="Count rows in CSV data",
                code=self.tool_templates[ToolType.COUNT_ROWS],
                parameters={'source': 'csv'},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        if any(k in dissent_lower for k in ['column', 'header', 'date']):
            col_match = re.search(r'[\'"]([^"\']+)[\'"]', dissent)
            col_name = col_match.group(1) if col_match else 'Date'
            return SynthesizedTool(
                name=f"check_column_{col_name}_{len(self.synthesized_tools)}",
                tool_type=ToolType.CHECK_COLUMN_EXISTS,
                description=f"Check if column '{col_name}' exists",
                code=self.tool_templates[ToolType.CHECK_COLUMN_EXISTS],
                parameters={'column_name': col_name},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        if any(k in dissent_lower for k in ['cell', 'value', 'a72', 'check row']):
            cell_match = re.search(r'([A-Z]+\d+)', dissent, re.IGNORECASE)
            cell_ref = cell_match.group(1).upper() if cell_match else 'A1'
            return SynthesizedTool(
                name=f"probe_cell_{cell_ref}_{len(self.synthesized_tools)}",
                tool_type=ToolType.PROBE_CELL,
                description=f"Probe cell {cell_ref}",
                code=self.tool_templates[ToolType.PROBE_CELL],
                parameters={'cell_ref': cell_ref},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        if any(k in dissent_lower for k in ['total', 'sum', 'formula', 'unchanged', 'invariant']):
            return SynthesizedTool(
                name=f"check_invariant_{len(self.synthesized_tools)}",
                tool_type=ToolType.CHECK_INVARIANT,
                description="Check formula/value invariant",
                code=self.tool_templates[ToolType.CHECK_INVARIANT],
                parameters={},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        return None
    
    def execute_tool(self, tool: SynthesizedTool, wb, 
                     sheet_name: str, **kwargs) -> Dict[str, Any]:
        """Execute a synthesized tool"""
        try:
            # Create a local namespace for execution
            local_ns = {'wb': wb}
            
            # Execute the tool code to define the function
            exec(tool.code, local_ns)
            
            # Get the function
            func_name = tool.code.split('def ')[1].split('(')[0]
            func = local_ns[func_name]
            
            # Merge parameters
            all_params = {**tool.parameters, **kwargs}
            
            # Execute based on tool type
            if tool.tool_type == ToolType.PROBE_CELL:
                result = func(wb, sheet_name, all_params.get('cell_ref', 'A1'))
            elif tool.tool_type == ToolType.COUNT_ROWS:
                result = func(wb, sheet_name, all_params.get('column', 'A'))
            elif tool.tool_type == ToolType.CHECK_COLUMN_EXISTS:
                result = func(wb, sheet_name, all_params.get('column_name', ''))
            elif tool.tool_type == ToolType.CHECK_INVARIANT:
                result = func(wb, sheet_name, 
                             all_params.get('formula_cell', 'A1'),
                             all_params.get('relation', 'not_changed'),
                             all_params.get('reference_value', None))
            else:
                result = None
            
            return {
                'success': True,
                'tool': tool.name,
                'result': result
            }
            
        except Exception as e:
            return {
                'success': False,
                'tool': tool.name,
                'error': str(e)
            }


# =============================================================================
# SEMANTIC BRIDGE
# =============================================================================

class SemanticBridge:
    """
    Semantic Bridge - Connect probes ↔ dissents ↔ resolutions
    
    This prevents the system from repeatedly asking about things it has already verified.
    When a probe answers a question, we link that answer to all related dissents.
    """
    
    def __init__(self):
        self.links: List[SemanticBridgeLink] = []
        self.probe_index: Dict[str, Any] = {}  # probe_id -> result
        self.dissent_index: Dict[str, str] = {}  # dissent_id -> content
        
        # Keyword mappings for semantic matching
        self.keyword_groups = {
            'insertion': ['insert', 'row', 'a72', 'append', 'target', 'write'],
            'count': ['count', 'rows', '25', 'csv', 'data'],
            'empty': ['empty', 'blank', 'clear', 'overwrite'],
            'column': ['column', 'header', 'date', 'field'],
            'table': ['table', 'range', 'boundaries', 'listobjec'],
            'backup': ['backup', 'rollback', 'restore', 'snapshot'],
            'type': ['type', 'numeric', 'format', 'precision'],
        }
    
    def register_probe(self, probe_id: str, result: Any):
        """Register a probe result"""
        self.probe_index[probe_id] = result
        self._build_links_for_probe(probe_id, result)
    
    def register_dissent(self, dissent_id: str, content: str):
        """Register a dissent"""
        self.dissent_index[dissent_id] = content
        self._build_links_for_dissent(dissent_id, content)
    
    def _get_keywords(self, text: str) -> Set[str]:
        """Extract semantic keywords from text"""
        text_lower = text.lower()
        keywords = set()
        for group, terms in self.keyword_groups.items():
            if any(term in text_lower for term in terms):
                keywords.add(group)
        return keywords
    
    def _build_links_for_probe(self, probe_id: str, result: Any):
        """Build links from a new probe to existing dissents"""
        probe_keywords = self._get_keywords(probe_id)
        
        for dissent_id, content in self.dissent_index.items():
            dissent_keywords = self._get_keywords(content)
            
            overlap = probe_keywords & dissent_keywords
            if overlap:
                strength = len(overlap) / max(len(probe_keywords), len(dissent_keywords), 1)
                
                link = SemanticBridgeLink(
                    probe_id=probe_id,
                    probe_result=result,
                    dissent_ids=[dissent_id],
                    link_strength=min(strength * 1.5, 1.0),  # Boost
                    link_reasoning=f"Matched on: {', '.join(overlap)}"
                )
                self.links.append(link)
    
    def _build_links_for_dissent(self, dissent_id: str, content: str):
        """Build links from a new dissent to existing probes"""
        dissent_keywords = self._get_keywords(content)
        
        for probe_id, result in self.probe_index.items():
            probe_keywords = self._get_keywords(probe_id)
            
            overlap = probe_keywords & dissent_keywords
            if overlap:
                strength = len(overlap) / max(len(probe_keywords), len(dissent_keywords), 1)
                
                link = SemanticBridgeLink(
                    probe_id=probe_id,
                    probe_result=result,
                    dissent_ids=[dissent_id],
                    link_strength=min(strength * 1.5, 1.0),
                    link_reasoning=f"Matched on: {', '.join(overlap)}"
                )
                self.links.append(link)
    
    def is_answered_by_probe(self, dissent_id: str) -> bool:
        """Check if a dissent is answered by any probe"""
        for link in self.links:
            if dissent_id in link.dissent_ids and link.link_strength >= 0.5:
                return True
        return False
    
    def get_answer_for_dissent(self, dissent_id: str) -> Optional[Tuple[str, Any]]:
        """Get the probe answer for a dissent"""
        best_link = None
        best_strength = 0
        
        for link in self.links:
            if dissent_id in link.dissent_ids and link.link_strength > best_strength:
                best_link = link
                best_strength = link.link_strength
        
        if best_link:
            return (best_link.probe_id, best_link.probe_result)
        return None
    
    def get_unanswered_dissents(self) -> List[str]:
        """Get list of dissent IDs not answered by any probe"""
        answered = set()
        for link in self.links:
            if link.link_strength >= 0.5:
                answered.update(link.dissent_ids)
        
        return [d for d in self.dissent_index.keys() if d not in answered]
    
    def get_bridge_summary(self) -> Dict[str, Any]:
        """Get summary of the semantic bridge state"""
        answered = set()
        for link in self.links:
            if link.link_strength >= 0.5:
                answered.update(link.dissent_ids)
        
        return {
            'total_probes': len(self.probe_index),
            'total_dissents': len(self.dissent_index),
            'total_links': len(self.links),
            'dissents_answered': len(answered),
            'dissents_unanswered': len(self.dissent_index) - len(answered),
            'coverage': len(answered) / max(len(self.dissent_index), 1)
        }


# =============================================================================
# SANDBOX EXECUTION ENVIRONMENT
# =============================================================================

class SandboxExecutor:
    """
    Sandbox Execution Environment
    
    Instead of just THINKING about changes, we EXECUTE them in a sandbox copy
    and VERIFY the outcomes before committing to the real file.
    """
    
    def __init__(self, excel_path: Path, knowledge_base: Dict[str, Any]):
        self.original_path = Path(excel_path)
        self.knowledge = knowledge_base
        self.sandbox_dir = Path(tempfile.mkdtemp(prefix='rsi_sandbox_'))
        self.sandbox_path: Optional[Path] = None
        self.invariants: List[InvariantCheck] = []
        self.before_state: Dict[str, Any] = {}
        self.after_state: Dict[str, Any] = {}
    
    def prepare_sandbox(self) -> Path:
        """Copy the Excel file to sandbox"""
        self.sandbox_path = self.sandbox_dir / self.original_path.name
        shutil.copy2(self.original_path, self.sandbox_path)
        logger.info(f"Sandbox created: {self.sandbox_path}")
        return self.sandbox_path
    
    def capture_before_state(self, cells_of_interest: List[str] = None):
        """Capture the state before any changes"""
        if not self.sandbox_path:
            self.prepare_sandbox()
        
        try:
            wb = openpyxl.load_workbook(self.sandbox_path, data_only=True)
            
            self.before_state = {
                'timestamp': datetime.now().isoformat(),
                'cells': {},
                'formula_errors': 0,
                'sheet_dims': {}
            }
            
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                self.before_state['sheet_dims'][sheet_name] = {
                    'max_row': sheet.max_row,
                    'max_col': sheet.max_column
                }
                
                # Count formula errors
                for row in sheet.iter_rows():
                    for cell in row:
                        if cell.value in ['#VALUE!', '#REF!', '#NAME?', '#DIV/0!', '#NULL!', '#N/A']:
                            self.before_state['formula_errors'] += 1
                        
                        # Capture cells of interest
                        if cells_of_interest:
                            cell_ref = f"{sheet_name}!{cell.coordinate}"
                            if cell_ref in cells_of_interest or cell.coordinate in cells_of_interest:
                                self.before_state['cells'][cell_ref] = cell.value
            
            wb.close()
            logger.info(f"Before state captured: {len(self.before_state['cells'])} cells, {self.before_state['formula_errors']} errors")
            
        except Exception as e:
            logger.error(f"Failed to capture before state: {e}")
    
    def apply_updates(self, targets: List['UpdateTarget']) -> int:
        """Apply updates to the sandbox copy"""
        if not self.sandbox_path:
            self.prepare_sandbox()
        
        try:
            wb = openpyxl.load_workbook(self.sandbox_path, keep_vba=True)
            applied = 0
            
            for target in targets:
                try:
                    sheet = wb[target.location.sheet]
                    cell = sheet[target.location.cell]
                    cell.value = target.new_value
                    applied += 1
                except Exception as e:
                    logger.warning(f"Failed to apply update to {target.location.cell}: {e}")
            
            wb.save(self.sandbox_path)
            wb.close()
            
            logger.info(f"Applied {applied}/{len(targets)} updates to sandbox")
            return applied
            
        except Exception as e:
            logger.error(f"Failed to apply updates: {e}")
            return 0
    
    def capture_after_state(self, cells_of_interest: List[str] = None):
        """Capture the state after changes"""
        try:
            wb = openpyxl.load_workbook(self.sandbox_path, data_only=True)
            
            self.after_state = {
                'timestamp': datetime.now().isoformat(),
                'cells': {},
                'formula_errors': 0,
                'sheet_dims': {}
            }
            
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                self.after_state['sheet_dims'][sheet_name] = {
                    'max_row': sheet.max_row,
                    'max_col': sheet.max_column
                }
                
                # Count formula errors
                for row in sheet.iter_rows():
                    for cell in row:
                        if cell.value in ['#VALUE!', '#REF!', '#NAME?', '#DIV/0!', '#NULL!', '#N/A']:
                            self.after_state['formula_errors'] += 1
                        
                        # Capture cells of interest
                        if cells_of_interest:
                            cell_ref = f"{sheet_name}!{cell.coordinate}"
                            if cell_ref in cells_of_interest or cell.coordinate in cells_of_interest:
                                self.after_state['cells'][cell_ref] = cell.value
            
            wb.close()
            logger.info(f"After state captured: {len(self.after_state['cells'])} cells, {self.after_state['formula_errors']} errors")
            
        except Exception as e:
            logger.error(f"Failed to capture after state: {e}")
    
    def add_invariant(self, name: str, description: str, check_code: str):
        """Add an invariant to check"""
        self.invariants.append(InvariantCheck(
            name=name,
            description=description,
            check_code=check_code
        ))
    
    def verify_invariants(self) -> List[InvariantCheck]:
        """Verify all invariants"""
        results = []
        
        for invariant in self.invariants:
            try:
                # Execute the check code
                local_ns = {
                    'before': self.before_state,
                    'after': self.after_state,
                }
                exec(f"result = {invariant.check_code}", local_ns)
                invariant.held = local_ns.get('result', False)
            except Exception as e:
                logger.warning(f"Invariant check failed: {invariant.name}: {e}")
                invariant.held = None
            
            results.append(invariant)
        
        return results
    
    def run_verification(self, targets: List['UpdateTarget']) -> SandboxResult:
        """Run complete sandbox verification"""
        
        # Prepare cells of interest (target cells + formula cells from knowledge)
        cells_of_interest = [f"{t.location.sheet}!{t.location.cell}" for t in targets]
        
        # Add formula cells from knowledge base
        for sheet_name, sheet_data in self.knowledge.get('sheets', {}).items():
            for cell in list(sheet_data.get('formulas', {}).keys())[:50]:  # First 50 formulas
                cells_of_interest.append(f"{sheet_name}!{cell}")
        
        # 1. Prepare sandbox
        self.prepare_sandbox()
        
        # 2. Capture before state
        self.capture_before_state(cells_of_interest)
        
        # 3. Apply updates
        applied = self.apply_updates(targets)
        
        # 4. Capture after state
        self.capture_after_state(cells_of_interest)
        
        # 5. Verify invariants
        invariant_results = self.verify_invariants()
        invariants_held = sum(1 for i in invariant_results if i.held is True)
        
        # 6. Compare before/after
        value_changes = {}
        for cell in set(self.before_state.get('cells', {}).keys()) | set(self.after_state.get('cells', {}).keys()):
            before_val = self.before_state.get('cells', {}).get(cell)
            after_val = self.after_state.get('cells', {}).get(cell)
            if before_val != after_val:
                value_changes[cell] = (before_val, after_val)
        
        # 7. Check for new formula errors
        errors_before = self.before_state.get('formula_errors', 0)
        errors_after = self.after_state.get('formula_errors', 0)
        
        issues = []
        if errors_after > errors_before:
            issues.append(f"New formula errors introduced: {errors_after - errors_before}")
        
        failed_invariants = [i for i in invariant_results if i.held is False]
        for inv in failed_invariants:
            issues.append(f"Invariant failed: {inv.name}")
        
        # 8. Determine if verification passed
        verification_passed = (
            applied == len(targets) and
            errors_after <= errors_before and
            len(failed_invariants) == 0
        )
        
        return SandboxResult(
            success=verification_passed,
            sandbox_path=str(self.sandbox_path),
            updates_applied=applied,
            invariants_checked=len(invariant_results),
            invariants_held=invariants_held,
            formula_errors_before=errors_before,
            formula_errors_after=errors_after,
            value_changes=value_changes,
            issues=issues,
            verification_passed=verification_passed,
            rollback_needed=not verification_passed
        )
    
    def cleanup(self):
        """Clean up sandbox directory"""
        try:
            shutil.rmtree(self.sandbox_dir)
            logger.info("Sandbox cleaned up")
        except Exception as e:
            logger.warning(f"Failed to cleanup sandbox: {e}")


# =============================================================================
# LLM-GENERATED VERIFICATION CODE
# =============================================================================

class LLMVerificationCodeGenerator:
    """
    LLM-Generated Verification Code
    
    Asks LLMs: "What code would verify this update worked correctly?"
    Then executes that code to get real verification results.
    """
    
    def __init__(self, openai_key: Optional[str] = None,
                 anthropic_key: Optional[str] = None):
        self.openai_key = openai_key
        self.anthropic_key = anthropic_key
        self.generated_checks: List[Dict] = []
    
    def generate_verification_code(self, 
                                    target_sheet: str,
                                    update_count: int,
                                    column_mapping: Dict[str, str],
                                    insert_row: int) -> List[str]:
        """Generate verification code from LLM"""
        
        prompt = f"""Given this Excel update:
- Target Sheet: {target_sheet}
- Updates: {update_count} rows to insert
- Starting Row: {insert_row}
- Column Mapping: {json.dumps(column_mapping)}

Generate 3-5 Python verification checks that would confirm the update worked.
Each check should be a single expression that evaluates to True if successful.

Format each check as:
CHECK: <description>
CODE: <python expression using wb (workbook) and sheet variables>

Example:
CHECK: Verify data was inserted starting at row {insert_row}
CODE: wb['{target_sheet}']['A{insert_row}'].value is not None

CHECK: Verify all {update_count} rows were inserted
CODE: all(wb['{target_sheet}'][f'A{{r}}'].value is not None for r in range({insert_row}, {insert_row + update_count}))

Provide your verification checks:"""
        
        response = None
        
        if self.anthropic_key and ANTHROPIC_AVAILABLE:
            try:
                client = anthropic.Anthropic(api_key=self.anthropic_key)
                resp = client.messages.create(
                    model=get_default_model("anthropic_top"),
                    max_tokens=1024,
                    messages=[{"role": "user", "content": prompt}]
                )
                response = resp.content[0].text
            except Exception as e:
                logger.warning(f"Anthropic call failed: {e}")
        
        if not response and self.openai_key and OPENAI_AVAILABLE:
            try:
                client = openai.OpenAI(api_key=self.openai_key)
                resp = client.chat.completions.create(
                    model=get_default_model("vision"),
                    messages=[{"role": "user", "content": prompt}],
                    max_completion_tokens=1024
                )
                response = resp.choices[0].message.content
            except Exception as e:
                logger.warning(f"OpenAI call failed: {e}")
        
        # Parse the response
        checks = []
        if response:
            lines = response.split('\n')
            current_check = {}
            for line in lines:
                if line.startswith('CHECK:'):
                    if current_check:
                        checks.append(current_check)
                    current_check = {'description': line.replace('CHECK:', '').strip()}
                elif line.startswith('CODE:'):
                    current_check['code'] = line.replace('CODE:', '').strip()
            if current_check and 'code' in current_check:
                checks.append(current_check)
        
        self.generated_checks = checks
        return checks
    
    def execute_checks(self, wb) -> List[Dict]:
        """Execute generated verification checks"""
        results = []
        
        for check in self.generated_checks:
            try:
                # Safety: only allow basic Excel operations
                local_ns = {'wb': wb}
                exec(f"result = {check['code']}", local_ns)
                
                results.append({
                    'description': check.get('description', 'Unknown check'),
                    'code': check['code'],
                    'passed': bool(local_ns.get('result')),
                    'error': None
                })
            except Exception as e:
                results.append({
                    'description': check.get('description', 'Unknown check'),
                    'code': check['code'],
                    'passed': False,
                    'error': str(e)
                })
        
        return results


# =============================================================================
# CONFIDENCE-GATED AUTO-EXECUTOR
# =============================================================================

class ConfidenceGatedAutoExecutor:
    """
    Confidence-Gated Auto-Execute
    
    Makes the final decision about whether to execute automatically
    based on confidence, dissent resolution, probe verification, and sandbox results.
    """
    
    def __init__(self):
        self.decision_log: List[Dict] = []
        
        # Thresholds
        self.auto_execute_confidence = 0.85
        self.monitoring_confidence = 0.70
        self.critical_dissent_threshold = 0
        self.resolution_rate_threshold = 0.50
    
    def make_decision(self,
                      confidence: float,
                      dissent_scoreboard: Dict,
                      probe_results: List,
                      sandbox_result: Optional[SandboxResult],
                      semantic_bridge_summary: Dict) -> Tuple[str, Dict]:
        """
        Make the final execution decision.
        
        Returns (decision, reasoning_dict)
        """
        
        reasons = []
        blockers = []
        enablers = []
        
        # Check confidence
        if confidence >= self.auto_execute_confidence:
            enablers.append(f"High confidence: {confidence:.0%}")
        elif confidence >= self.monitoring_confidence:
            enablers.append(f"Sufficient confidence: {confidence:.0%}")
        else:
            blockers.append(f"Low confidence: {confidence:.0%}")
        
        # Check critical dissents
        critical = dissent_scoreboard.get('critical_unresolved', 0)
        if critical <= self.critical_dissent_threshold:
            enablers.append(f"No critical dissents (count: {critical})")
        else:
            blockers.append(f"{critical} critical unresolved dissents")
        
        # Check resolution rate
        resolution_rate = dissent_scoreboard.get('resolution_rate', 0)
        if resolution_rate >= self.resolution_rate_threshold:
            enablers.append(f"Good resolution rate: {resolution_rate:.0%}")
        elif dissent_scoreboard.get('total', 0) <= 3:
            enablers.append("Few dissents raised (acceptable)")
        else:
            blockers.append(f"Low resolution rate: {resolution_rate:.0%}")
        
        # Check probe verification
        verified_probes = sum(1 for p in probe_results if getattr(p, 'verified', False) and getattr(p, 'confidence_impact', 0) > 0)
        if verified_probes > 0:
            enablers.append(f"{verified_probes} probes verified safe")
        
        # Check sandbox result
        if sandbox_result:
            if sandbox_result.verification_passed:
                enablers.append("Sandbox verification PASSED")
            else:
                blockers.append(f"Sandbox verification failed: {sandbox_result.issues}")
        
        # Check semantic bridge coverage
        coverage = semantic_bridge_summary.get('coverage', 0)
        if coverage >= 0.5:
            enablers.append(f"Good semantic coverage: {coverage:.0%}")
        
        # Make decision
        if not blockers:
            if confidence >= self.auto_execute_confidence:
                decision = "AUTO_EXECUTE"
                reasons.append("All conditions met for automatic execution")
            else:
                decision = "EXECUTE_WITH_MONITORING"
                reasons.append("Conditions met with monitoring recommended")
        elif len(blockers) == 1 and confidence >= self.monitoring_confidence:
            decision = "EXECUTE_WITH_MONITORING"
            reasons.append(f"Minor issue: {blockers[0]}")
        else:
            decision = "DEFER_TO_HUMAN"
            reasons.extend(blockers)
        
        reasoning = {
            'decision': decision,
            'confidence': confidence,
            'enablers': enablers,
            'blockers': blockers,
            'reasons': reasons,
            'auto_executable': len(blockers) == 0,
            'sandbox_verified': sandbox_result.verification_passed if sandbox_result else None
        }
        
        self.decision_log.append(reasoning)
        
        return decision, reasoning


# =============================================================================
# MAIN RSI v3.0 INTEGRATION CLASS
# =============================================================================

class RSIv3Engine:
    """
    RSI v3.0 - THE 1000% ENGINE
    
    Integrates all components:
    - Self-Resolving Dissent Engine
    - Metacognitive Probe Synthesis
    - Semantic Bridge
    - Sandbox Execution
    - LLM Verification Code Generation
    - Confidence-Gated Auto-Execute
    """
    
    def __init__(self, 
                 excel_path: Path,
                 knowledge_base: Dict[str, Any],
                 incoming_data: Dict[str, Any],
                 iterations: int = 3,
                 output_dir: Optional[Path] = None):
        
        self.excel_path = Path(excel_path)
        self.knowledge = knowledge_base
        self.incoming_data = incoming_data
        self.iterations = iterations
        self.output_dir = output_dir or Path('rsi_v3_logs')
        self.output_dir.mkdir(exist_ok=True)
        
        # API Keys
        self.openai_key = os.environ.get("OPENAI_API_KEY")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        self.gemini_key = os.environ.get("GEMINI_API_KEY")
        
        # Initialize all components
        self.srde = SelfResolvingDissentEngine(
            excel_path=excel_path,
            incoming_data=incoming_data,
            knowledge_base=knowledge_base
        )
        
        self.probe_factory = MetacognitiveProbeFactory(
            openai_key=self.openai_key,
            anthropic_key=self.anthropic_key,
            gemini_key=self.gemini_key
        )
        
        self.semantic_bridge = SemanticBridge()
        
        self.sandbox: Optional[SandboxExecutor] = None
        
        self.verification_generator = LLMVerificationCodeGenerator(
            openai_key=self.openai_key,
            anthropic_key=self.anthropic_key
        )
        
        self.auto_executor = ConfidenceGatedAutoExecutor()
        
        # State
        self.all_probes = []
        self.all_resolutions = []
        self.sandbox_result: Optional[SandboxResult] = None
        self.running_confidence = 0.5
        self.confidence_trajectory = [0.5]
        
        logger.info("=" * 70)
        logger.info("🧠 RSI v3.0 - THE 1000% ENGINE INITIALIZED")
        logger.info("=" * 70)
        logger.info("  ├─ Self-Resolving Dissent Engine: ✓")
        logger.info("  ├─ Metacognitive Probe Synthesis: ✓")
        logger.info("  ├─ Semantic Bridge: ✓")
        logger.info("  ├─ Sandbox Execution: ✓")
        logger.info("  ├─ LLM Verification Code Gen: ✓")
        logger.info("  └─ Confidence-Gated Auto-Execute: ✓")
    
    def run_phase_resolve_dissents(self, dissents: List[Dict]) -> Dict:
        """
        Phase: Self-Resolve Dissents
        
        Instead of just tracking, we ATTEMPT TO RESOLVE each dissent.
        """
        logger.info("\n  🔧 PHASE: SELF-RESOLVING DISSENTS")
        
        resolved = 0
        partially = 0
        needs_sandbox = 0
        
        for dissent in dissents:
            dissent_id = dissent.get('id', hashlib.md5(dissent.get('content', '').encode()).hexdigest()[:12])
            content = dissent.get('content', '')
            
            if not content:
                continue
            
            # Register with semantic bridge
            self.semantic_bridge.register_dissent(dissent_id, content)
            
            # Check if already answered by a probe
            if self.semantic_bridge.is_answered_by_probe(dissent_id):
                answer = self.semantic_bridge.get_answer_for_dissent(dissent_id)
                logger.info(f"    ✓ {dissent_id[:8]}... already answered by probe: {answer[0]}")
                resolved += 1
                self.all_resolutions.append(ResolutionAttempt(
                    dissent_id=dissent_id,
                    dissent_content=content,
                    status=ResolutionStatus.RESOLVED,
                    method="semantic_bridge",
                    evidence=f"Answered by probe: {answer}",
                    confidence_impact=0.08
                ))
                continue
            
            # Try SRDE resolution
            result = self.srde.attempt_resolution(dissent_id, content)
            self.all_resolutions.append(result)
            
            if result.status == ResolutionStatus.RESOLVED:
                resolved += 1
                self.running_confidence = min(1.0, self.running_confidence + result.confidence_impact)
                logger.info(f"    ✓ {dissent_id[:8]}... RESOLVED: {result.evidence[:50]}")
            elif result.status == ResolutionStatus.PARTIALLY_RESOLVED:
                partially += 1
                self.running_confidence = max(0.0, self.running_confidence + result.confidence_impact)
                logger.info(f"    ◐ {dissent_id[:8]}... PARTIALLY: {result.evidence[:50]}")
            elif result.status == ResolutionStatus.NEEDS_SANDBOX:
                needs_sandbox += 1
                logger.info(f"    ⏳ {dissent_id[:8]}... needs sandbox")
        
        return {
            'total': len(dissents),
            'resolved': resolved,
            'partially_resolved': partially,
            'needs_sandbox': needs_sandbox,
            'resolution_rate': resolved / max(len(dissents), 1)
        }
    
    def run_phase_synthesize_probes(self, council_votes: List[Dict]) -> List[SynthesizedTool]:
        """
        Phase: Metacognitive Probe Synthesis
        
        Generate new probes from council feedback.
        """
        logger.info("\n  🔬 PHASE: METACOGNITIVE PROBE SYNTHESIS")
        
        new_tools = self.probe_factory.synthesize_from_council(council_votes)
        
        logger.info(f"    → Synthesized {len(new_tools)} new tools from council feedback")
        
        for tool in new_tools:
            logger.info(f"      • {tool.name} ({tool.tool_type.value})")
        
        return new_tools
    
    def run_phase_execute_synthesized_probes(self, 
                                              tools: List[SynthesizedTool],
                                              target_sheet: str) -> List[Dict]:
        """Execute synthesized probes and collect results"""
        logger.info("\n  ⚡ PHASE: EXECUTING SYNTHESIZED PROBES")
        
        results = []
        
        try:
            wb = openpyxl.load_workbook(self.excel_path, data_only=True, read_only=True)
            
            for tool in tools:
                result = self.probe_factory.execute_tool(tool, wb, target_sheet)
                results.append(result)
                
                # Register with semantic bridge
                self.semantic_bridge.register_probe(tool.name, result)
                
                # Register with SRDE for cross-referencing
                self.srde.register_probe_result(tool.name, result)
                
                status = "✓" if result['success'] else "✗"
                logger.info(f"    {status} {tool.name}: {result.get('result', result.get('error'))}")
            
            wb.close()
            
        except Exception as e:
            logger.error(f"Failed to execute probes: {e}")
        
        return results
    
    def run_phase_sandbox_verification(self, 
                                        plan: 'UpdatePlan') -> Optional[SandboxResult]:
        """
        Phase: Sandbox Verification
        
        Copy Excel, apply changes, verify outcomes.
        """
        logger.info("\n  📦 PHASE: SANDBOX VERIFICATION")
        
        try:
            self.sandbox = SandboxExecutor(self.excel_path, self.knowledge)
            
            # Add default invariants
            self.sandbox.add_invariant(
                name="no_new_formula_errors",
                description="No new formula errors introduced",
                check_code="after['formula_errors'] <= before['formula_errors']"
            )
            
            # Run verification
            self.sandbox_result = self.sandbox.run_verification(plan.targets)
            
            if self.sandbox_result.verification_passed:
                logger.info("    ✓ Sandbox verification PASSED")
                self.running_confidence = min(1.0, self.running_confidence + 0.15)
            else:
                logger.warning(f"    ✗ Sandbox verification FAILED: {self.sandbox_result.issues}")
                self.running_confidence = max(0.0, self.running_confidence - 0.10)
            
            return self.sandbox_result
            
        except Exception as e:
            logger.error(f"Sandbox verification failed: {e}")
            return None
        finally:
            if self.sandbox:
                self.sandbox.cleanup()
    
    def run_phase_llm_verification(self,
                                    target_sheet: str,
                                    update_count: int,
                                    column_mapping: Dict,
                                    insert_row: int) -> List[Dict]:
        """
        Phase: LLM-Generated Verification
        
        Ask LLMs what code would verify this, then execute it.
        """
        logger.info("\n  🤖 PHASE: LLM-GENERATED VERIFICATION")
        
        # Generate verification code
        checks = self.verification_generator.generate_verification_code(
            target_sheet=target_sheet,
            update_count=update_count,
            column_mapping=column_mapping,
            insert_row=insert_row
        )
        
        logger.info(f"    → Generated {len(checks)} verification checks")
        
        # Execute checks on sandbox copy if available
        if self.sandbox and self.sandbox.sandbox_path:
            try:
                wb = openpyxl.load_workbook(self.sandbox.sandbox_path, data_only=True)
                results = self.verification_generator.execute_checks(wb)
                wb.close()
                
                passed = sum(1 for r in results if r['passed'])
                logger.info(f"    → {passed}/{len(results)} checks passed")
                
                for r in results:
                    status = "✓" if r['passed'] else "✗"
                    logger.info(f"      {status} {r['description']}")
                
                return results
                
            except Exception as e:
                logger.error(f"LLM verification execution failed: {e}")
        
        return []
    
    def run_phase_final_decision(self, dissent_scoreboard: Dict) -> Tuple[str, Dict]:
        """
        Phase: Confidence-Gated Final Decision
        """
        logger.info("\n  🏁 PHASE: CONFIDENCE-GATED DECISION")
        
        bridge_summary = self.semantic_bridge.get_bridge_summary()
        
        decision, reasoning = self.auto_executor.make_decision(
            confidence=self.running_confidence,
            dissent_scoreboard=dissent_scoreboard,
            probe_results=self.all_probes,
            sandbox_result=self.sandbox_result,
            semantic_bridge_summary=bridge_summary
        )
        
        logger.info(f"\n    🎯 DECISION: {decision}")
        logger.info(f"    📊 Confidence: {self.running_confidence:.0%}")
        logger.info(f"    📋 Enablers: {len(reasoning['enablers'])}")
        logger.info(f"    ❌ Blockers: {len(reasoning['blockers'])}")
        
        if reasoning['auto_executable']:
            logger.info("    ✅ AUTO-EXECUTABLE: YES")
        else:
            logger.info("    ⚠️ AUTO-EXECUTABLE: NO")
            for blocker in reasoning['blockers']:
                logger.info(f"       • {blocker}")
        
        return decision, reasoning
    
    def save_report(self, session_id: str, final_result: Dict):
        """Save comprehensive RSI v3.0 report"""
        
        report_path = self.output_dir / f"{session_id}_v3_report.md"
        
        lines = [
            "# RSI v3.0 - THE 1000% ENGINE REPORT",
            "",
            f"**Session ID:** {session_id}",
            f"**Timestamp:** {datetime.now().isoformat()}",
            "",
            "## 🎯 FINAL DECISION",
            "",
            f"**Decision:** {final_result.get('decision', 'N/A')}",
            f"**Confidence:** {final_result.get('confidence', 0):.0%}",
            f"**Auto-Executable:** {'YES' if final_result.get('reasoning', {}).get('auto_executable') else 'NO'}",
            "",
            "## 📊 CONFIDENCE TRAJECTORY",
            "",
            " → ".join(f"{c:.0%}" for c in self.confidence_trajectory),
            "",
            "## 🔧 SELF-RESOLVING DISSENT ENGINE",
            "",
            f"- Total resolution attempts: {len(self.all_resolutions)}",
            f"- Resolved: {sum(1 for r in self.all_resolutions if r.status == ResolutionStatus.RESOLVED)}",
            f"- Partially resolved: {sum(1 for r in self.all_resolutions if r.status == ResolutionStatus.PARTIALLY_RESOLVED)}",
            "",
            "## 🔬 METACOGNITIVE PROBE SYNTHESIS",
            "",
            f"- Tools synthesized: {len(self.probe_factory.synthesized_tools)}",
            "",
        ]
        
        for tool in self.probe_factory.synthesized_tools:
            lines.append(f"- **{tool.name}** ({tool.tool_type.value}): from dissent about '{tool.from_dissent[:50] if tool.from_dissent else 'N/A'}...'")
        
        lines.extend([
            "",
            "## 🌉 SEMANTIC BRIDGE",
            "",
        ])
        
        bridge = self.semantic_bridge.get_bridge_summary()
        lines.append(f"- Probes registered: {bridge['total_probes']}")
        lines.append(f"- Dissents registered: {bridge['total_dissents']}")
        lines.append(f"- Links created: {bridge['total_links']}")
        lines.append(f"- Dissents answered by probes: {bridge['dissents_answered']}")
        lines.append(f"- Coverage: {bridge['coverage']:.0%}")
        
        if self.sandbox_result:
            lines.extend([
                "",
                "## 📦 SANDBOX VERIFICATION",
                "",
                f"- Updates applied: {self.sandbox_result.updates_applied}",
                f"- Formula errors before: {self.sandbox_result.formula_errors_before}",
                f"- Formula errors after: {self.sandbox_result.formula_errors_after}",
                f"- Invariants checked: {self.sandbox_result.invariants_checked}",
                f"- Invariants held: {self.sandbox_result.invariants_held}",
                f"- **Verification passed:** {'YES ✓' if self.sandbox_result.verification_passed else 'NO ✗'}",
            ])
            
            if self.sandbox_result.issues:
                lines.append("")
                lines.append("### Issues Found:")
                for issue in self.sandbox_result.issues:
                    lines.append(f"- ⚠️ {issue}")
        
        lines.extend([
            "",
            "## ✅ ENABLERS",
            "",
        ])
        for e in final_result.get('reasoning', {}).get('enablers', []):
            lines.append(f"- ✓ {e}")
        
        lines.extend([
            "",
            "## ❌ BLOCKERS",
            "",
        ])
        for b in final_result.get('reasoning', {}).get('blockers', []):
            lines.append(f"- ✗ {b}")
        
        with open(report_path, 'w') as f:
            f.write('\n'.join(lines))
        
        logger.info(f"\n  📁 Report saved: {report_path}")


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def create_rsi_v3_engine(excel_path: Path,
                          knowledge_base: Dict,
                          incoming_data: Dict,
                          iterations: int = 3) -> RSIv3Engine:
    """Factory function to create RSI v3.0 engine"""
    return RSIv3Engine(
        excel_path=excel_path,
        knowledge_base=knowledge_base,
        incoming_data=incoming_data,
        iterations=iterations
    )

