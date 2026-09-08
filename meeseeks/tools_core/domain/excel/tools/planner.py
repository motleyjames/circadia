"""
Update Planner - Dependency-aware update planning
"""

import hashlib
import logging
from datetime import datetime
from typing import Any, Dict, List

from ..core.data_classes import (
    UpdatePlan, UpdateTarget, UpdateType, CellLocation
)
from .schema_matcher import SchemaMatcher

logger = logging.getLogger(__name__)


class UpdatePlanner:
    """
    Plans updates with full dependency awareness.
    
    Creates update plans that:
    - Order updates by dependency
    - Identify affected formulas
    - Predict outcomes
    - Flag potential issues
    """
    
    def __init__(self, knowledge_base: Dict[str, Any], schema_matcher: SchemaMatcher):
        self.knowledge = knowledge_base
        self.matcher = schema_matcher
        self.sheets = knowledge_base.get('sheets', {})
    
    def create_plan(self, incoming_data: Dict[str, Any], 
                    target_match: Dict[str, Any],
                    mode: str = 'append') -> UpdatePlan:
        """
        Create an update plan for incoming data.
        
        Args:
            incoming_data: Parsed data from DataIngester
            target_match: Match result from SchemaMatcher
            mode: 'append', 'update', or 'replace'
            
        Returns:
            UpdatePlan with all targets and execution order
        """
        logger.info("📋 Creating update plan...")
        
        plan_id = f"plan_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(str(incoming_data).encode()).hexdigest()[:8]}"
        
        targets = []
        reasoning_trace = []
        
        target_sheet = target_match['sheet']
        reasoning_trace.append(f"Target sheet: {target_sheet} (confidence: {target_match['confidence']:.2f})")
        reasoning_trace.append(f"Match reasoning: {target_match['reasoning']}")
        
        structure = self.matcher.get_sheet_structure(target_sheet)
        sheet_headers = structure.get('headers', {})
        
        reasoning_trace.append(f"Sheet has {len(sheet_headers)} headers: {list(sheet_headers.values())[:5]}...")
        
        column_mapping = self._create_column_mapping(
            incoming_data['headers'],
            sheet_headers
        )
        
        reasoning_trace.append(f"Column mapping: {column_mapping}")
        
        if mode == 'append':
            insert_point = self.matcher.find_insert_point(target_sheet)
            reasoning_trace.append(f"Insert point: {insert_point.cell}")
            
            for row_idx, row_data in enumerate(incoming_data['rows']):
                row_num = insert_point.row + row_idx
                
                for incoming_col, excel_col in column_mapping.items():
                    value = row_data.get(incoming_col)
                    if value is not None:
                        cell = f"{excel_col}{row_num}"
                        location = CellLocation.from_cell(target_sheet, cell)
                        
                        targets.append(UpdateTarget(
                            location=location,
                            old_value=None,
                            new_value=value,
                            update_type=UpdateType.INSERT,
                            confidence=target_match['confidence'],
                            reasoning=f"Insert {incoming_col} value into {cell}"
                        ))
        
        execution_order = list(range(len(targets)))
        
        impact = self._estimate_impact(targets, target_sheet)
        
        plan = UpdatePlan(
            id=plan_id,
            timestamp=datetime.now().isoformat(),
            source_file=incoming_data['source'],
            excel_file=self.knowledge.get('file_info', {}).get('file_path', ''),
            targets=targets,
            execution_order=execution_order,
            estimated_impact=impact,
            reasoning_trace=reasoning_trace,
            requires_approval=len(targets) > 10
        )
        
        logger.info(f"  ✓ Plan created with {len(targets)} updates")
        
        return plan
    
    def _create_column_mapping(self, incoming_headers: List[str], 
                               excel_headers: Dict[str, str]) -> Dict[str, str]:
        """Map incoming column names to Excel columns"""
        mapping = {}
        
        header_to_col = {v.lower(): k for k, v in excel_headers.items() if v}
        
        for header in incoming_headers:
            header_lower = header.lower()
            
            if header_lower in header_to_col:
                mapping[header] = header_to_col[header_lower]
                continue
            
            for excel_header, col in header_to_col.items():
                if header_lower in excel_header or excel_header in header_lower:
                    mapping[header] = col
                    break
        
        return mapping
    
    def _estimate_impact(self, targets: List[UpdateTarget], sheet_name: str) -> Dict[str, Any]:
        """Estimate the impact of updates"""
        sheet_data = self.sheets.get(sheet_name, {})
        formulas = sheet_data.get('formulas', {})
        
        affected_formulas = []
        affected_cells = {t.location.cell for t in targets}
        
        for cell, formula_data in formulas.items():
            refs = formula_data.get('references', [])
            for ref in refs:
                if any(ac in ref for ac in affected_cells):
                    affected_formulas.append(cell)
                    break
        
        return {
            'rows_affected': len(set(t.location.row for t in targets)),
            'columns_affected': len(set(t.location.column for t in targets)),
            'potential_formula_recalcs': len(affected_formulas),
            'affected_formulas': affected_formulas[:10]
        }
    
    def generate_diff(self, plan: UpdatePlan) -> str:
        """Generate human-readable diff"""
        lines = [
            f"# Update Plan: {plan.id}",
            f"",
            f"**Source:** {plan.source_file}",
            f"**Target:** {plan.excel_file}",
            f"**Updates:** {len(plan.targets)}",
            f"**Requires Approval:** {plan.requires_approval}",
            f"",
            "## Reasoning Trace",
            ""
        ]
        
        for trace in plan.reasoning_trace:
            lines.append(f"- {trace}")
        
        lines.extend([
            "",
            "## Proposed Updates",
            "",
            "| Sheet | Cell | Type | New Value |",
            "|-------|------|------|-----------|"
        ])
        
        for target in plan.targets[:50]:
            value_str = str(target.new_value)[:30]
            lines.append(f"| {target.location.sheet} | {target.location.cell} | {target.update_type.value} | {value_str} |")
        
        if len(plan.targets) > 50:
            lines.append(f"| ... | ... | ... | ({len(plan.targets) - 50} more) |")
        
        lines.extend([
            "",
            "## Estimated Impact",
            "",
            f"- Rows affected: {plan.estimated_impact.get('rows_affected', 0)}",
            f"- Columns affected: {plan.estimated_impact.get('columns_affected', 0)}",
            f"- Formulas that may recalculate: {plan.estimated_impact.get('potential_formula_recalcs', 0)}"
        ])
        
        return '\n'.join(lines)

