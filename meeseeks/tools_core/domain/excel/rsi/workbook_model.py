"""
Workbook Mental Model - Deep Understanding of Excel Structure

RSI v3.1's key innovation: Instead of asking questions, we KNOW the answers.

This module pre-computes:
- Sheet relationships (what feeds what)
- Formula chains (INDEX/MATCH flows, SUMIF aggregations)
- Table structures (auto-expanding tables)
- Data flow patterns (how data propagates)

When an update is proposed, we can immediately answer:
- "Will data propagate?" → YES, via 1,170 INDEX/MATCH formulas
- "Will tables expand?" → YES, Total_Data is an Excel Table
- "Will totals update?" → YES, Summary uses SUMIF on Total_Holdings
"""

import re
import logging
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional, Any
from dataclasses import dataclass, field

from ..core.data_classes import (
    SheetRole, FormulaChain, DataFlowEdge, WorkbookUnderstanding
)

logger = logging.getLogger(__name__)


# =============================================================================
# FORMULA PATTERNS
# =============================================================================

# Regex patterns for common Excel functions
FORMULA_PATTERNS = {
    'INDEX_MATCH': re.compile(
        r'INDEX\s*\(\s*([^,]+?)\s*,\s*MATCH\s*\(\s*([^,]+)\s*,\s*([^,]+)', 
        re.IGNORECASE
    ),
    'VLOOKUP': re.compile(
        r'VLOOKUP\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(\d+)', 
        re.IGNORECASE
    ),
    'HLOOKUP': re.compile(
        r'HLOOKUP\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(\d+)', 
        re.IGNORECASE
    ),
    'SUMIF': re.compile(
        r'SUMIF[S]?\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,?\s*([^)]*)\)', 
        re.IGNORECASE
    ),
    'COUNTIF': re.compile(
        r'COUNTIF[S]?\s*\(\s*([^,]+)\s*,\s*([^,]+)', 
        re.IGNORECASE
    ),
    'AVERAGEIF': re.compile(
        r'AVERAGEIF[S]?\s*\(\s*([^,]+)\s*,\s*([^,]+)', 
        re.IGNORECASE
    ),
    'INDIRECT': re.compile(
        r'INDIRECT\s*\(\s*([^)]+)\)', 
        re.IGNORECASE
    ),
    'OFFSET': re.compile(
        r'OFFSET\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)', 
        re.IGNORECASE
    ),
    'SUMPRODUCT': re.compile(
        r'SUMPRODUCT\s*\(\s*(.+?)\)', 
        re.IGNORECASE
    ),
    'DIRECT_REF': re.compile(
        r"'?([^'!\[\]]+)'?!(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)"
    )
}

# Sheet reference pattern
SHEET_REF_PATTERN = re.compile(r"'?([^'!\[\]]+)'?!(\$?[A-Z]+\$?\d+)")


class FormulaFlowAnalyzer:
    """
    Traces formula chains to understand data flow.
    
    Key insight: Excel is a data flow graph. If we understand the graph,
    we can predict exactly what happens when we insert new data.
    """
    
    def __init__(self):
        self.formula_chains: List[FormulaChain] = []
        self.aggregation_patterns: Dict[str, List[str]] = defaultdict(list)
        self.lookup_patterns: Dict[str, List[str]] = defaultdict(list)
        self.flow_edges: List[DataFlowEdge] = []
    
    def analyze_formula(self, cell: str, formula: str, sheet_name: str) -> Dict[str, Any]:
        """
        Deeply analyze a formula to understand its data flow.
        
        Returns:
            {
                'type': 'INDEX_MATCH' | 'VLOOKUP' | 'SUMIF' | etc.,
                'sources': [list of source sheet!range],
                'is_lookup': bool,
                'is_aggregation': bool,
                'lookup_key': str (if lookup),
                'aggregation_type': str (if aggregation)
            }
        """
        result = {
            'cell': f"{sheet_name}!{cell}",
            'formula': formula,
            'type': 'unknown',
            'sources': [],
            'is_lookup': False,
            'is_aggregation': False,
            'lookup_key': None,
            'aggregation_type': None
        }
        
        formula_upper = formula.upper()
        
        # INDEX/MATCH - The workhorse of data lookup
        if 'INDEX' in formula_upper and 'MATCH' in formula_upper:
            result['type'] = 'INDEX_MATCH'
            result['is_lookup'] = True
            match = FORMULA_PATTERNS['INDEX_MATCH'].search(formula)
            if match:
                result['sources'].append(self._parse_range_ref(match.group(1)))
                result['lookup_key'] = match.group(2).strip()
        
        # VLOOKUP
        elif 'VLOOKUP' in formula_upper:
            result['type'] = 'VLOOKUP'
            result['is_lookup'] = True
            match = FORMULA_PATTERNS['VLOOKUP'].search(formula)
            if match:
                result['sources'].append(self._parse_range_ref(match.group(2)))
                result['lookup_key'] = match.group(1).strip()
        
        # SUMIF/SUMIFS - Aggregation
        elif 'SUMIF' in formula_upper:
            result['type'] = 'SUMIF'
            result['is_aggregation'] = True
            result['aggregation_type'] = 'sum'
            match = FORMULA_PATTERNS['SUMIF'].search(formula)
            if match:
                result['sources'].append(self._parse_range_ref(match.group(1)))
        
        # COUNTIF - Aggregation
        elif 'COUNTIF' in formula_upper:
            result['type'] = 'COUNTIF'
            result['is_aggregation'] = True
            result['aggregation_type'] = 'count'
            match = FORMULA_PATTERNS['COUNTIF'].search(formula)
            if match:
                result['sources'].append(self._parse_range_ref(match.group(1)))
        
        # SUMPRODUCT - Complex aggregation
        elif 'SUMPRODUCT' in formula_upper:
            result['type'] = 'SUMPRODUCT'
            result['is_aggregation'] = True
            result['aggregation_type'] = 'sumproduct'
        
        # Direct references
        refs = SHEET_REF_PATTERN.findall(formula)
        for sheet, cell_ref in refs:
            if sheet != sheet_name:  # Cross-sheet reference
                result['sources'].append(f"'{sheet}'!{cell_ref}")
        
        return result
    
    def _parse_range_ref(self, ref_str: str) -> str:
        """Parse a range reference from formula fragment"""
        # Clean up the reference
        ref_str = ref_str.strip()
        
        # Look for sheet!range pattern
        match = SHEET_REF_PATTERN.search(ref_str)
        if match:
            return f"'{match.group(1)}'!{match.group(2)}"
        
        # Just a range without sheet
        return ref_str
    
    def build_flow_graph(self, all_formulas: Dict[str, Dict[str, Any]]) -> List[DataFlowEdge]:
        """
        Build a data flow graph from all formulas.
        
        Args:
            all_formulas: {sheet_name: {cell: formula_info}}
            
        Returns:
            List of edges showing data flow
        """
        edges = []
        edge_counts = defaultdict(lambda: {'count': 0, 'functions': set()})
        
        for sheet_name, formulas in all_formulas.items():
            for cell, formula_info in formulas.items():
                if isinstance(formula_info, dict):
                    formula = formula_info.get('formula', '')
                else:
                    formula = str(formula_info)
                
                analysis = self.analyze_formula(cell, formula, sheet_name)
                
                target = f"{sheet_name}!{cell}"
                
                for source in analysis['sources']:
                    if source:
                        # Extract sheet from source
                        source_sheet = self._extract_sheet_from_ref(source)
                        if source_sheet and source_sheet != sheet_name:
                            key = (source_sheet, sheet_name)
                            edge_counts[key]['count'] += 1
                            edge_counts[key]['functions'].add(analysis['type'])
        
        # Convert to edges
        for (source_sheet, target_sheet), data in edge_counts.items():
            relationship = 'lookup' if any(
                f in data['functions'] for f in ['INDEX_MATCH', 'VLOOKUP', 'HLOOKUP']
            ) else 'aggregation' if any(
                f in data['functions'] for f in ['SUMIF', 'COUNTIF', 'SUMPRODUCT']
            ) else 'direct'
            
            edges.append(DataFlowEdge(
                source=source_sheet,
                target=target_sheet,
                relationship=relationship,
                formula_count=data['count'],
                functions_used=list(data['functions'])
            ))
        
        self.flow_edges = edges
        return edges
    
    def _extract_sheet_from_ref(self, ref: str) -> Optional[str]:
        """Extract sheet name from a reference like 'Sheet1'!A1"""
        match = re.match(r"'?([^'!]+)'?!", ref)
        if match:
            return match.group(1)
        return None


class WorkbookMentalModel:
    """
    The Mental Model - Complete understanding of workbook structure.
    
    This is RSI v3.1's key innovation. Instead of asking questions,
    the system KNOWS the answers because it has pre-analyzed the workbook.
    
    Key capabilities:
    1. Sheet role identification (source, calculation, summary, lookup)
    2. Data flow tracing (what feeds what)
    3. Table structure detection (auto-expand behavior)
    4. Update propagation prediction (what changes when X is updated)
    
    Example understanding:
    "Schwab_Data feeds into Total_Holdings via 1,170 INDEX/MATCH formulas"
    "Total_Data is an Excel Table that auto-expands"
    "Summary sheet aggregates by Asset Class using SUMIF"
    "Inserting new positions will automatically flow through to Summary totals"
    """
    
    def __init__(self, knowledge_base: Dict[str, Any], 
                 agents_data: Optional[Dict[str, Any]] = None):
        """
        Initialize with knowledge base from excel_analyzer.py
        
        Args:
            knowledge_base: The _analysis.json file contents
            agents_data: Optional _agents.json file contents
        """
        self.knowledge = knowledge_base
        self.agents = agents_data or {}
        self.sheets = knowledge_base.get('sheets', {})
        
        # Core analysis components
        self.flow_analyzer = FormulaFlowAnalyzer()
        
        # The mental model
        self.understanding: Optional[WorkbookUnderstanding] = None
        
        # Build the model
        self._build_mental_model()
        
        logger.info("=" * 60)
        logger.info("🧠 WORKBOOK MENTAL MODEL BUILT")
        logger.info("=" * 60)
        self._print_understanding_summary()
    
    def _build_mental_model(self):
        """Build the complete mental model"""
        
        # 1. Analyze sheet roles
        sheet_roles = self._analyze_sheet_roles()
        
        # 2. Build formula flow graph
        all_formulas = {}
        for sheet_name, sheet_data in self.sheets.items():
            all_formulas[sheet_name] = sheet_data.get('formulas', {})
        
        data_flows = self.flow_analyzer.build_flow_graph(all_formulas)
        
        # 3. Analyze formula chains
        formula_chains = self._trace_formula_chains(all_formulas)
        
        # 4. Build aggregation patterns
        aggregation_patterns = self._find_aggregation_patterns(all_formulas)
        
        # 5. Find lookup patterns
        lookup_patterns = self._find_lookup_patterns(all_formulas)
        
        # 6. Detect table structures
        table_structures = self._detect_table_structures()
        
        # 7. Identify key formulas
        key_formulas = self._identify_key_formulas(all_formulas)
        
        # 8. Build update propagation map
        propagation_map = self._build_propagation_map(data_flows, sheet_roles)
        
        # Create understanding
        self.understanding = WorkbookUnderstanding(
            sheets=sheet_roles,
            data_flows=data_flows,
            formula_chains=formula_chains,
            aggregation_patterns=aggregation_patterns,
            lookup_patterns=lookup_patterns,
            table_structures=table_structures,
            key_formulas=key_formulas,
            update_propagation_map=propagation_map
        )
    
    def _analyze_sheet_roles(self) -> Dict[str, SheetRole]:
        """Analyze the role of each sheet"""
        roles = {}
        
        for sheet_name, sheet_data in self.sheets.items():
            dims = sheet_data.get('dimensions', {})
            formulas = sheet_data.get('formulas', {})
            tables = sheet_data.get('tables', [])
            
            # Count formulas
            formula_count = len(formulas)
            row_count = dims.get('max_row', 0)
            
            # Infer purpose
            name_lower = sheet_name.lower()
            purpose = 'data_source'
            
            if 'summary' in name_lower or 'total' in name_lower:
                purpose = 'summary'
            elif 'calc' in name_lower or 'formula' in name_lower:
                purpose = 'calculation'
            elif 'lookup' in name_lower or 'index' in name_lower:
                purpose = 'lookup'
            elif 'input' in name_lower or 'entry' in name_lower:
                purpose = 'input'
            elif formula_count == 0:
                purpose = 'data_source'
            elif formula_count / max(row_count, 1) > 0.5:
                purpose = 'calculation'
            
            # Detect if it's an Excel Table
            is_table = len(tables) > 0
            table_name = tables[0].get('name') if tables else None
            
            roles[sheet_name] = SheetRole(
                name=sheet_name,
                purpose=purpose,
                is_table=is_table,
                table_name=table_name,
                auto_expands=is_table,  # Excel Tables auto-expand
                row_count=row_count,
                formula_count=formula_count,
                feeds_into=[],  # Populated later
                fed_by=[],  # Populated later
                key_columns=[]  # Populated later
            )
        
        return roles
    
    def _trace_formula_chains(self, all_formulas: Dict) -> List[FormulaChain]:
        """Trace multi-step formula chains"""
        chains = []
        
        for sheet_name, formulas in all_formulas.items():
            for cell, formula_info in formulas.items():
                if isinstance(formula_info, dict):
                    formula = formula_info.get('formula', '')
                    refs = formula_info.get('references', [])
                else:
                    formula = str(formula_info)
                    refs = []
                
                # Check for cross-sheet references
                for ref in refs:
                    if '!' in ref:
                        source_sheet = ref.split('!')[0].strip("'")
                        if source_sheet != sheet_name:
                            # Determine chain type
                            analysis = self.flow_analyzer.analyze_formula(cell, formula, sheet_name)
                            
                            chains.append(FormulaChain(
                                source_sheet=source_sheet,
                                source_range=ref,
                                target_sheet=sheet_name,
                                target_cell=cell,
                                formula_type=analysis['type'],
                                intermediates=[]
                            ))
        
        return chains
    
    def _find_aggregation_patterns(self, all_formulas: Dict) -> Dict[str, List[str]]:
        """Find SUMIF/COUNTIF/aggregation patterns"""
        patterns = defaultdict(list)
        
        for sheet_name, formulas in all_formulas.items():
            for cell, formula_info in formulas.items():
                if isinstance(formula_info, dict):
                    formula = formula_info.get('formula', '')
                else:
                    formula = str(formula_info)
                
                formula_upper = formula.upper()
                
                if any(f in formula_upper for f in ['SUMIF', 'COUNTIF', 'AVERAGEIF', 'SUMPRODUCT']):
                    analysis = self.flow_analyzer.analyze_formula(cell, formula, sheet_name)
                    for source in analysis['sources']:
                        source_sheet = self.flow_analyzer._extract_sheet_from_ref(source)
                        if source_sheet:
                            patterns[f"{sheet_name}!{cell}"].append(source_sheet)
        
        return dict(patterns)
    
    def _find_lookup_patterns(self, all_formulas: Dict) -> Dict[str, List[str]]:
        """Find INDEX/MATCH and VLOOKUP patterns"""
        patterns = defaultdict(list)
        
        for sheet_name, formulas in all_formulas.items():
            for cell, formula_info in formulas.items():
                if isinstance(formula_info, dict):
                    formula = formula_info.get('formula', '')
                else:
                    formula = str(formula_info)
                
                formula_upper = formula.upper()
                
                if 'INDEX' in formula_upper or 'VLOOKUP' in formula_upper or 'HLOOKUP' in formula_upper:
                    analysis = self.flow_analyzer.analyze_formula(cell, formula, sheet_name)
                    for source in analysis['sources']:
                        source_sheet = self.flow_analyzer._extract_sheet_from_ref(source)
                        if source_sheet:
                            patterns[source_sheet].append(f"{sheet_name}!{cell}")
        
        return dict(patterns)
    
    def _detect_table_structures(self) -> Dict[str, Dict[str, Any]]:
        """Detect Excel Table structures"""
        tables = {}
        
        for sheet_name, sheet_data in self.sheets.items():
            sheet_tables = sheet_data.get('tables', [])
            for table in sheet_tables:
                table_name = table.get('name', f"{sheet_name}_Table")
                tables[table_name] = {
                    'sheet': sheet_name,
                    'range': table.get('range', ''),
                    'auto_expand': True,
                    'header_row': table.get('header_row', 1),
                    'total_row': table.get('total_row', False)
                }
        
        return tables
    
    def _identify_key_formulas(self, all_formulas: Dict) -> Dict[str, str]:
        """Identify key formulas that are important"""
        key_formulas = {}
        
        for sheet_name, formulas in all_formulas.items():
            for cell, formula_info in formulas.items():
                if isinstance(formula_info, dict):
                    formula = formula_info.get('formula', '')
                else:
                    formula = str(formula_info)
                
                # Key formulas: summaries, totals, or those with many references
                if any(k in formula.upper() for k in ['SUM(', 'TOTAL', 'GRAND']):
                    key_formulas[f"{sheet_name}!{cell}"] = f"Aggregation: {formula[:50]}..."
                
                # Also identify formulas with many cross-sheet refs
                refs = SHEET_REF_PATTERN.findall(formula)
                if len(refs) > 3:
                    key_formulas[f"{sheet_name}!{cell}"] = f"Multi-source formula with {len(refs)} refs"
        
        return key_formulas
    
    def _build_propagation_map(self, data_flows: List[DataFlowEdge], 
                               sheet_roles: Dict[str, SheetRole]) -> Dict[str, List[str]]:
        """Build map of what gets affected when a sheet is updated"""
        propagation = defaultdict(list)
        
        for edge in data_flows:
            propagation[edge.source].append(edge.target)
        
        # Update sheet roles with feeds_into/fed_by
        for edge in data_flows:
            if edge.source in sheet_roles:
                sheet_roles[edge.source].feeds_into.append(edge.target)
            if edge.target in sheet_roles:
                sheet_roles[edge.target].fed_by.append(edge.source)
        
        return dict(propagation)
    
    def _print_understanding_summary(self):
        """Print a summary of the mental model"""
        if not self.understanding:
            return
        
        u = self.understanding
        
        logger.info(f"  Sheets analyzed: {len(u.sheets)}")
        logger.info(f"  Data flow edges: {len(u.data_flows)}")
        logger.info(f"  Formula chains: {len(u.formula_chains)}")
        logger.info(f"  Excel Tables: {len(u.table_structures)}")
        
        # Show key relationships
        for sheet_name, role in u.sheets.items():
            if role.feeds_into:
                feeds = ', '.join(role.feeds_into[:3])
                logger.info(f"  📊 {sheet_name} → [{feeds}]")
    
    # =========================================================================
    # PUBLIC API - ANSWER QUESTIONS ABOUT THE WORKBOOK
    # =========================================================================
    
    def will_data_propagate(self, source_sheet: str) -> Dict[str, Any]:
        """
        Answer: "If I insert data into this sheet, will it propagate?"
        
        Returns:
            {
                'will_propagate': bool,
                'targets': [list of affected sheets],
                'mechanism': 'INDEX_MATCH' | 'SUMIF' | etc.,
                'formula_count': int,
                'explanation': str
            }
        """
        if not self.understanding:
            return {'will_propagate': False, 'explanation': 'No mental model'}
        
        targets = self.understanding.update_propagation_map.get(source_sheet, [])
        
        if not targets:
            return {
                'will_propagate': False,
                'targets': [],
                'mechanism': None,
                'formula_count': 0,
                'explanation': f"No formulas reference {source_sheet}"
            }
        
        # Find the mechanism
        mechanisms = set()
        total_formulas = 0
        for edge in self.understanding.data_flows:
            if edge.source == source_sheet:
                mechanisms.update(edge.functions_used)
                total_formulas += edge.formula_count
        
        explanation = f"{source_sheet} feeds into {', '.join(targets)} via {total_formulas} formulas using {', '.join(mechanisms)}"
        
        return {
            'will_propagate': True,
            'targets': targets,
            'mechanism': ', '.join(mechanisms),
            'formula_count': total_formulas,
            'explanation': explanation
        }
    
    def will_table_auto_expand(self, sheet_name: str) -> Dict[str, Any]:
        """
        Answer: "If I insert data, will the table auto-expand?"
        """
        if not self.understanding:
            return {'auto_expand': False, 'explanation': 'No mental model'}
        
        role = self.understanding.sheets.get(sheet_name)
        if not role:
            return {'auto_expand': False, 'explanation': f'Sheet {sheet_name} not found'}
        
        if role.is_table:
            return {
                'auto_expand': True,
                'table_name': role.table_name,
                'explanation': f"{sheet_name} is an Excel Table named '{role.table_name}' which auto-expands"
            }
        
        return {
            'auto_expand': False,
            'explanation': f"{sheet_name} is not an Excel Table - manual range expansion may be needed"
        }
    
    def get_affected_aggregations(self, source_sheet: str) -> Dict[str, Any]:
        """
        Answer: "What SUMIF/aggregation formulas will be affected?"
        """
        if not self.understanding:
            return {'affected': [], 'explanation': 'No mental model'}
        
        affected = []
        for target, sources in self.understanding.aggregation_patterns.items():
            if source_sheet in sources:
                affected.append(target)
        
        if affected:
            return {
                'affected': affected,
                'count': len(affected),
                'explanation': f"{len(affected)} aggregation formulas reference {source_sheet} and will auto-update"
            }
        
        return {
            'affected': [],
            'count': 0,
            'explanation': f"No aggregation formulas reference {source_sheet}"
        }
    
    def predict_update_impact(self, target_sheet: str, insert_row: int, 
                              row_count: int) -> Dict[str, Any]:
        """
        Comprehensive prediction of update impact.
        
        This is the key API for RSI v3.1 - instead of asking,
        we PREDICT what will happen.
        """
        if not self.understanding:
            return {'success': False, 'reason': 'No mental model'}
        
        role = self.understanding.sheets.get(target_sheet)
        if not role:
            return {'success': False, 'reason': f'Sheet {target_sheet} not found'}
        
        propagation = self.will_data_propagate(target_sheet)
        table_info = self.will_table_auto_expand(target_sheet)
        aggregations = self.get_affected_aggregations(target_sheet)
        
        # Build prediction
        prediction = {
            'success': True,
            'target_sheet': target_sheet,
            'insert_row': insert_row,
            'rows_to_insert': row_count,
            
            # Sheet info
            'sheet_role': role.purpose,
            'current_rows': role.row_count,
            'new_total_rows': role.row_count + row_count,
            
            # Table behavior
            'is_table': role.is_table,
            'table_name': role.table_name,
            'will_auto_expand': table_info['auto_expand'],
            
            # Data propagation
            'will_propagate': propagation['will_propagate'],
            'propagation_targets': propagation['targets'],
            'propagation_mechanism': propagation['mechanism'],
            'formulas_affected': propagation['formula_count'],
            
            # Aggregations
            'aggregations_affected': aggregations['count'],
            'aggregation_cells': aggregations['affected'][:10],
            
            # Summary
            'impact_summary': self._generate_impact_summary(
                role, propagation, table_info, aggregations
            )
        }
        
        return prediction
    
    def _generate_impact_summary(self, role: SheetRole, 
                                  propagation: Dict, 
                                  table_info: Dict,
                                  aggregations: Dict) -> str:
        """Generate a human-readable impact summary"""
        parts = []
        
        parts.append(f"Inserting into {role.name} ({role.purpose})")
        
        if table_info['auto_expand']:
            parts.append(f"→ Table '{role.table_name}' will auto-expand")
        
        if propagation['will_propagate']:
            parts.append(f"→ Data flows to {', '.join(propagation['targets'][:3])} via {propagation['formula_count']} formulas")
        
        if aggregations['count'] > 0:
            parts.append(f"→ {aggregations['count']} aggregation formulas will recalculate")
        
        return " | ".join(parts)
    
    def answer_dissent(self, dissent_content: str) -> Optional[Dict[str, Any]]:
        """
        Try to answer a dissent using the mental model.
        
        This is the key v3.1 capability - we can ANSWER questions
        instead of just noting them.
        """
        content_lower = dissent_content.lower()
        
        # Pattern: "will data propagate?"
        if any(k in content_lower for k in ['propagate', 'flow', 'update', 'cascade']):
            # Find which sheet is being asked about
            for sheet_name in self.understanding.sheets.keys():
                if sheet_name.lower() in content_lower:
                    result = self.will_data_propagate(sheet_name)
                    if result['will_propagate']:
                        return {
                            'answered': True,
                            'question_type': 'propagation',
                            'answer': result['explanation'],
                            'confidence': 0.95
                        }
        
        # Pattern: "table expand?"
        if any(k in content_lower for k in ['table', 'expand', 'auto', 'grow']):
            for sheet_name in self.understanding.sheets.keys():
                if sheet_name.lower() in content_lower:
                    result = self.will_table_auto_expand(sheet_name)
                    return {
                        'answered': True,
                        'question_type': 'table_expansion',
                        'answer': result['explanation'],
                        'confidence': 0.90
                    }
        
        # Pattern: "formulas update?"
        if any(k in content_lower for k in ['formula', 'sumif', 'total', 'aggregate', 'sum']):
            for sheet_name in self.understanding.sheets.keys():
                if sheet_name.lower() in content_lower:
                    result = self.get_affected_aggregations(sheet_name)
                    if result['count'] > 0:
                        return {
                            'answered': True,
                            'question_type': 'aggregation',
                            'answer': result['explanation'],
                            'confidence': 0.92
                        }
        
        return None
    
    def get_understanding_summary(self) -> str:
        """Get a complete summary of workbook understanding"""
        if not self.understanding:
            return "No mental model built"
        
        u = self.understanding
        lines = [
            "=" * 60,
            "WORKBOOK MENTAL MODEL SUMMARY",
            "=" * 60,
            "",
            "## Sheet Roles"
        ]
        
        for name, role in u.sheets.items():
            line = f"- {name}: {role.purpose}"
            if role.is_table:
                line += f" (Excel Table: {role.table_name})"
            if role.feeds_into:
                line += f" → feeds [{', '.join(role.feeds_into[:3])}]"
            lines.append(line)
        
        lines.extend([
            "",
            "## Data Flow",
        ])
        
        for edge in u.data_flows[:10]:
            lines.append(f"- {edge.source} → {edge.target}: {edge.formula_count} {edge.relationship} formulas ({', '.join(edge.functions_used)})")
        
        if len(u.data_flows) > 10:
            lines.append(f"  ... and {len(u.data_flows) - 10} more flows")
        
        lines.extend([
            "",
            f"## Key Stats",
            f"- Total formula chains: {len(u.formula_chains)}",
            f"- Aggregation patterns: {len(u.aggregation_patterns)}",
            f"- Lookup patterns: {len(u.lookup_patterns)}",
            f"- Excel Tables: {len(u.table_structures)}",
        ])
        
        return "\n".join(lines)

