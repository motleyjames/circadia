"""
Schema Matcher - AI-powered location finding using analyzer output

Uses the knowledge base from excel_analyzer.py to find where data belongs.
"""

import re
import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

from ..core.data_classes import CellLocation

logger = logging.getLogger(__name__)


class SchemaMatcher:
    """
    Uses analyzer output to find where incoming data belongs in the spreadsheet.
    
    This is the "brain" that maps external data to Excel locations using:
    - Sheet names and purposes
    - Column headers
    - Data patterns
    - Formula structures
    """
    
    def __init__(self, knowledge_base: Dict[str, Any]):
        """
        Initialize with analyzer output as knowledge base.
        
        Args:
            knowledge_base: Output from excel_analyzer.py
        """
        self.knowledge = knowledge_base
        self.sheets = knowledge_base.get('sheets', {})
        self.file_info = knowledge_base.get('file_info', {})
        
        self._build_indexes()
        
        logger.info(f"🧠 SchemaMatcher initialized with {len(self.sheets)} sheets")
    
    def _build_indexes(self):
        """Build indexes for efficient matching"""
        self.sheet_purposes = {}
        self.header_index = defaultdict(list)
        self.data_patterns = {}
        
        for sheet_name, sheet_data in self.sheets.items():
            self.sheet_purposes[sheet_name] = self._infer_sheet_purpose(sheet_name)
            
            values = sheet_data.get('values', {})
            for cell, cell_data in values.items():
                if cell.startswith('_'):
                    continue
                
                match = re.match(r'^([A-Z]+)(\d+)$', cell)
                if match:
                    row_num = int(match.group(2))
                    if row_num <= 10:
                        if isinstance(cell_data, dict):
                            header_value = cell_data.get('value', '')
                        else:
                            header_value = str(cell_data) if cell_data else ''
                        
                        if header_value and len(header_value) > 2:
                            self.header_index[header_value.lower()].append({
                                'sheet': sheet_name,
                                'column': match.group(1),
                                'row': row_num,
                                'original_header': header_value
                            })
    
    def _infer_sheet_purpose(self, sheet_name: str) -> str:
        """Infer the purpose of a sheet from its name"""
        name_lower = sheet_name.lower()
        
        purpose_map = {
            'summary': 'dashboard',
            'equities': 'stock_holdings',
            'equity': 'stock_holdings',
            'stocks': 'stock_holdings',
            'real estate': 'real_estate',
            'property': 'real_estate',
            'crypto': 'crypto_holdings',
            'bitcoin': 'crypto_holdings',
            'cash': 'cash_accounts',
            'money market': 'cash_accounts',
            'private equity': 'private_investments',
            'venture': 'private_investments',
            'income': 'income_tracking',
            'expense': 'expense_tracking',
            'capital call': 'capital_calls',
            'schedule': 'schedule',
            'data': 'raw_data',
            'schwab': 'custodian_schwab',
            'merrill': 'custodian_merrill',
            'etrade': 'custodian_etrade',
            'fidelity': 'custodian_fidelity',
            'quicken': 'quicken_import',
            'price': 'price_data',
            'holdings': 'holdings_summary',
            'vesting': 'vesting_schedule',
            'options': 'stock_options',
            'index': 'lookup_index',
            'ownership': 'ownership_tracking'
        }
        
        for key, purpose in purpose_map.items():
            if key in name_lower:
                return purpose
        
        return 'general'
    
    def match_data(self, incoming_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Match incoming data to Excel locations.
        
        Args:
            incoming_data: Output from DataIngester
            
        Returns:
            List of match suggestions with confidence scores
        """
        logger.info("🎯 Matching incoming data to spreadsheet locations...")
        
        matches = []
        headers = incoming_data.get('headers', [])
        metadata = incoming_data.get('metadata', {})
        
        source_match = self._match_by_source(metadata)
        if source_match:
            matches.append(source_match)
        
        header_matches = self._match_by_headers(headers)
        matches.extend(header_matches)
        
        pattern_matches = self._match_by_pattern(incoming_data)
        matches.extend(pattern_matches)
        
        ranked_matches = self._rank_matches(matches)
        
        logger.info(f"  ✓ Found {len(ranked_matches)} potential matches")
        
        return ranked_matches
    
    def _match_by_source(self, metadata: Dict) -> Optional[Dict]:
        """Match by inferred data source"""
        source = metadata.get('inferred_source', '').lower()
        
        if not source:
            return None
        
        for sheet_name, purpose in self.sheet_purposes.items():
            if source in purpose.lower() or source in sheet_name.lower():
                return {
                    'sheet': sheet_name,
                    'match_type': 'source',
                    'confidence': 0.9,
                    'reasoning': f"Data source '{source}' matches sheet '{sheet_name}'"
                }
        
        return None
    
    def _match_by_headers(self, headers: List[str]) -> List[Dict]:
        """Match by header column names"""
        matches = []
        
        for header in headers:
            header_lower = header.lower()
            
            if header_lower in self.header_index:
                for location in self.header_index[header_lower]:
                    matches.append({
                        'sheet': location['sheet'],
                        'column': location['column'],
                        'match_type': 'header',
                        'matched_header': header,
                        'confidence': 0.85,
                        'reasoning': f"Header '{header}' found in {location['sheet']}!{location['column']}"
                    })
        
        return matches
    
    def _match_by_pattern(self, data: Dict) -> List[Dict]:
        """Match by data pattern (columns structure)"""
        matches = []
        headers = data.get('headers', [])
        
        if 'ticker' in [h.lower() for h in headers] or 'symbol' in [h.lower() for h in headers]:
            for sheet_name, purpose in self.sheet_purposes.items():
                if purpose in ['stock_holdings', 'holdings_summary']:
                    matches.append({
                        'sheet': sheet_name,
                        'match_type': 'pattern',
                        'pattern': 'equity_holdings',
                        'confidence': 0.75,
                        'reasoning': f"Data contains ticker/symbol column, matches {sheet_name}"
                    })
        
        if 'amount' in [h.lower() for h in headers] and 'date' in [h.lower() for h in headers]:
            for sheet_name, purpose in self.sheet_purposes.items():
                if 'schedule' in purpose or 'tracking' in purpose:
                    matches.append({
                        'sheet': sheet_name,
                        'match_type': 'pattern',
                        'pattern': 'transactions',
                        'confidence': 0.7,
                        'reasoning': f"Data contains amount+date, matches {sheet_name}"
                    })
        
        return matches
    
    def _rank_matches(self, matches: List[Dict]) -> List[Dict]:
        """Rank and deduplicate matches"""
        by_sheet = defaultdict(list)
        for match in matches:
            by_sheet[match['sheet']].append(match)
        
        ranked = []
        for sheet, sheet_matches in by_sheet.items():
            best = max(sheet_matches, key=lambda x: x['confidence'])
            all_reasons = [m['reasoning'] for m in sheet_matches]
            best['all_reasoning'] = all_reasons
            best['total_signals'] = len(sheet_matches)
            ranked.append(best)
        
        ranked.sort(key=lambda x: (x['confidence'], x.get('total_signals', 0)), reverse=True)
        
        return ranked
    
    def find_insert_point(self, sheet_name: str, data_type: str = 'append') -> CellLocation:
        """Find where to insert new data in a sheet"""
        if sheet_name not in self.sheets:
            raise ValueError(f"Sheet not found: {sheet_name}")
        
        sheet_data = self.sheets[sheet_name]
        dimensions = sheet_data.get('dimensions', {})
        max_row = dimensions.get('max_row', 1)
        
        insert_row = max_row + 1
        
        return CellLocation.from_cell(sheet_name, f"A{insert_row}")
    
    def get_sheet_structure(self, sheet_name: str) -> Dict[str, Any]:
        """Get the structure of a sheet (headers, columns, etc.)"""
        if sheet_name not in self.sheets:
            return {}
        
        sheet_data = self.sheets[sheet_name]
        values = sheet_data.get('values', {})
        
        headers = {}
        header_row = 1
        
        row_contents = {}
        for cell, cell_data in values.items():
            match = re.match(r'^([A-Z]+)(\d+)$', cell)
            if match and int(match.group(2)) <= 10:
                row_num = int(match.group(2))
                col = match.group(1)
                
                if isinstance(cell_data, dict):
                    value = cell_data.get('value', '')
                else:
                    value = str(cell_data) if cell_data else ''
                
                if value and len(str(value)) > 2:
                    if row_num not in row_contents:
                        row_contents[row_num] = {}
                    row_contents[row_num][col] = value
        
        if row_contents:
            header_row = max(row_contents.keys(), key=lambda r: len(row_contents[r]))
            headers = row_contents.get(header_row, {})
        
        return {
            'sheet_name': sheet_name,
            'purpose': self.sheet_purposes.get(sheet_name, 'unknown'),
            'dimensions': sheet_data.get('dimensions', {}),
            'headers': headers,
            'header_row': header_row,
            'formula_count': sheet_data.get('statistics', {}).get('total_formulas', 0)
        }

