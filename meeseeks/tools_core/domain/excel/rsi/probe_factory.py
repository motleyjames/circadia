"""
Metacognitive Probe Factory - Synthesize verification tools from LLM feedback

Parses council feedback and dynamically creates new probes to verify claims.
"""

import re
import logging
from typing import Dict, List, Optional, Any

from ..core.data_classes import ToolType, SynthesizedTool

logger = logging.getLogger(__name__)


# Pre-built tool templates
TOOL_TEMPLATES = {
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
    for cell in sheet[1]:
        if cell.value and column_name.lower() in str(cell.value).lower():
            return {'exists': True, 'cell': cell.coordinate}
    return {'exists': False}
""",
    ToolType.CHECK_INVARIANT: """
def check_invariant(wb, sheet_name, formula_cell, expected_relation, reference_value):
    '''Check if an invariant holds'''
    sheet = wb[sheet_name]
    actual = sheet[formula_cell].value
    if expected_relation == 'equals':
        return actual == reference_value
    elif expected_relation == 'greater_than':
        return actual > reference_value
    elif expected_relation == 'not_changed':
        return actual == reference_value
    return None
""",
}


class MetacognitiveProbeFactory:
    """
    MPS - Metacognitive Probe Synthesis
    
    Parses council feedback and synthesizes new probes dynamically.
    """
    
    def __init__(self):
        self.synthesized_tools: List[SynthesizedTool] = []
    
    def synthesize_from_council(self, votes: List[Dict]) -> List[SynthesizedTool]:
        """
        Parse council feedback and synthesize new probes.
        """
        new_tools = []
        
        for vote in votes:
            model = vote.get('model', 'unknown')
            dissenting_points = vote.get('dissenting_points', [])
            
            for point in dissenting_points:
                if isinstance(point, str):
                    tool = self._synthesize_from_dissent(point, model)
                    if tool:
                        new_tools.append(tool)
                        self.synthesized_tools.append(tool)
        
        logger.info(f"  🔬 Synthesized {len(new_tools)} new probes from council")
        return new_tools
    
    def _synthesize_from_dissent(self, dissent: str, model: str) -> Optional[SynthesizedTool]:
        """Synthesize a tool from a dissenting point"""
        dissent_lower = dissent.lower()
        
        # Row count
        if any(k in dissent_lower for k in ['row count', 'count rows', 'validate csv']):
            return SynthesizedTool(
                name=f"count_rows_{len(self.synthesized_tools)}",
                tool_type=ToolType.COUNT_ROWS,
                description="Count rows in data",
                code=TOOL_TEMPLATES[ToolType.COUNT_ROWS],
                parameters={'source': 'csv'},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        # Column exists
        if any(k in dissent_lower for k in ['column', 'header']):
            col_match = re.search(r'[\'"]([^"\']+)[\'"]', dissent)
            col_name = col_match.group(1) if col_match else 'Column'
            return SynthesizedTool(
                name=f"check_column_{len(self.synthesized_tools)}",
                tool_type=ToolType.CHECK_COLUMN_EXISTS,
                description=f"Check column '{col_name}'",
                code=TOOL_TEMPLATES[ToolType.CHECK_COLUMN_EXISTS],
                parameters={'column_name': col_name},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        # Cell probe
        if any(k in dissent_lower for k in ['cell', 'value', 'check']):
            cell_match = re.search(r'([A-Z]+\d+)', dissent, re.IGNORECASE)
            cell_ref = cell_match.group(1).upper() if cell_match else 'A1'
            return SynthesizedTool(
                name=f"probe_cell_{cell_ref}_{len(self.synthesized_tools)}",
                tool_type=ToolType.PROBE_CELL,
                description=f"Probe cell {cell_ref}",
                code=TOOL_TEMPLATES[ToolType.PROBE_CELL],
                parameters={'cell_ref': cell_ref},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        # Invariant
        if any(k in dissent_lower for k in ['total', 'sum', 'formula', 'unchanged']):
            return SynthesizedTool(
                name=f"check_invariant_{len(self.synthesized_tools)}",
                tool_type=ToolType.CHECK_INVARIANT,
                description="Check formula invariant",
                code=TOOL_TEMPLATES[ToolType.CHECK_INVARIANT],
                parameters={},
                generated_by=model,
                from_dissent=dissent[:100]
            )
        
        return None
    
    def execute_tool(self, tool: SynthesizedTool, wb, 
                     sheet_name: str, **kwargs) -> Dict[str, Any]:
        """Execute a synthesized tool"""
        try:
            local_ns = {'wb': wb}
            exec(tool.code, local_ns)
            
            func_name = tool.code.split('def ')[1].split('(')[0]
            func = local_ns[func_name]
            
            all_params = {**tool.parameters, **kwargs}
            
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
            
            return {'success': True, 'tool': tool.name, 'result': result}
            
        except Exception as e:
            return {'success': False, 'tool': tool.name, 'error': str(e)}

