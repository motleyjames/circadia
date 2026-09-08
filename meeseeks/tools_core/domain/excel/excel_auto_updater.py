#!/usr/bin/env python3
"""
Excel Auto-Updater: Agentic Spreadsheet Intelligence

An AI-powered tool that automatically updates Excel spreadsheets when new data arrives.
Uses the output from excel_analyzer.py as a "knowledge base" to understand spreadsheet
structure and reason about where new data should be placed.

Architecture:
- Tool 1: DataIngester - Parse any input (CSV, JSON, PDF)
- Tool 2: SchemaMatcher - AI-powered location finding using analyzer output
- Tool 3: UpdatePlanner - Dependency-aware update planning
- Tool 4: HumanReview - Optional approval interface
- Tool 5: Executor - Safe Excel writing with backups
- Tool 6: Validator - Post-update verification and audit logging
- ExcelReasoningEngine - LLM-powered reasoning about updates

Usage:
    python excel_auto_updater.py --excel "file.xlsx" --knowledge "file_analysis.json" --input "new_data.csv"
"""

import openpyxl
import json
import csv
import re
import argparse
import logging
import sys
import os
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import defaultdict
import hashlib

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    DOTENV_LOADED = True
except ImportError:
    DOTENV_LOADED = False

# Optional LLM support
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

# LLM model resolution
try:
    from tools_core.core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model

# RSI v3.0 Engine - THE 1000% UPGRADE
try:
    from rsi_v3_engine import (
        RSIv3Engine,
        SelfResolvingDissentEngine,
        MetacognitiveProbeFactory,
        SemanticBridge,
        SandboxExecutor,
        LLMVerificationCodeGenerator,
        ConfidenceGatedAutoExecutor,
        create_rsi_v3_engine
    )
    RSI_V3_AVAILABLE = True
except ImportError:
    RSI_V3_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
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
        col = openpyxl.utils.column_index_from_string(col_letter)
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
# TOOL 1: DATA INGESTER
# =============================================================================

class DataIngester:
    """
    Extracts structured data from various input sources.
    
    Supports:
    - CSV files
    - JSON files
    - Tab-delimited files
    - (Future: PDF with OCR, Email parsing, API responses)
    """
    
    def __init__(self):
        self.supported_formats = ['.csv', '.json', '.tsv', '.txt']
    
    def ingest(self, input_path: Path) -> Dict[str, Any]:
        """Auto-detect format and ingest data"""
        input_path = Path(input_path)
        
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        suffix = input_path.suffix.lower()
        
        logger.info(f"📄 Ingesting data from: {input_path.name}")
        
        if suffix == '.csv':
            return self.ingest_csv(input_path)
        elif suffix == '.json':
            return self.ingest_json(input_path)
        elif suffix in ['.tsv', '.txt']:
            return self.ingest_tsv(input_path)
        else:
            raise ValueError(f"Unsupported format: {suffix}. Supported: {self.supported_formats}")
    
    def ingest_csv(self, csv_path: Path) -> Dict[str, Any]:
        """Parse CSV file into structured data"""
        rows = []
        headers = []
        
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            # Try to detect delimiter
            sample = f.read(8192)
            f.seek(0)
            
            try:
                dialect = csv.Sniffer().sniff(sample)
            except csv.Error:
                dialect = csv.excel
            
            reader = csv.DictReader(f, dialect=dialect)
            headers = reader.fieldnames or []
            
            for row in reader:
                # Clean and normalize values
                cleaned_row = {}
                for key, value in row.items():
                    if key:
                        cleaned_row[key.strip()] = self._normalize_value(value)
                rows.append(cleaned_row)
        
        logger.info(f"  ✓ Parsed {len(rows)} rows with {len(headers)} columns")
        
        return {
            'source': str(csv_path),
            'format': 'csv',
            'headers': headers,
            'rows': rows,
            'row_count': len(rows),
            'inferred_types': self._infer_column_types(rows, headers),
            'metadata': self._extract_metadata(csv_path, rows)
        }
    
    def ingest_json(self, json_path: Path) -> Dict[str, Any]:
        """Parse JSON file into structured data"""
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Handle both array and object formats
        if isinstance(data, list):
            rows = data
            headers = list(rows[0].keys()) if rows else []
        elif isinstance(data, dict):
            if 'data' in data:
                rows = data['data']
                headers = list(rows[0].keys()) if rows else []
            else:
                rows = [data]
                headers = list(data.keys())
        else:
            raise ValueError("JSON must be an array or object")
        
        logger.info(f"  ✓ Parsed {len(rows)} records from JSON")
        
        return {
            'source': str(json_path),
            'format': 'json',
            'headers': headers,
            'rows': rows,
            'row_count': len(rows),
            'inferred_types': self._infer_column_types(rows, headers),
            'metadata': self._extract_metadata(json_path, rows)
        }
    
    def ingest_tsv(self, tsv_path: Path) -> Dict[str, Any]:
        """Parse tab-delimited file"""
        rows = []
        headers = []
        
        with open(tsv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter='\t')
            headers = reader.fieldnames or []
            
            for row in reader:
                cleaned_row = {k.strip(): self._normalize_value(v) for k, v in row.items() if k}
                rows.append(cleaned_row)
        
        logger.info(f"  ✓ Parsed {len(rows)} rows from TSV")
        
        return {
            'source': str(tsv_path),
            'format': 'tsv',
            'headers': headers,
            'rows': rows,
            'row_count': len(rows),
            'inferred_types': self._infer_column_types(rows, headers),
            'metadata': {}
        }
    
    def _normalize_value(self, value: str) -> Any:
        """Normalize and type-cast a value"""
        if value is None:
            return None
        
        value = str(value).strip()
        
        if not value:
            return None
        
        # Try to parse as number
        # Remove currency symbols and commas
        numeric_str = re.sub(r'[$,€£¥]', '', value)
        
        # Handle percentages
        if value.endswith('%'):
            try:
                return float(numeric_str.rstrip('%')) / 100
            except ValueError:
                pass
        
        # Handle parentheses for negative numbers
        if numeric_str.startswith('(') and numeric_str.endswith(')'):
            numeric_str = '-' + numeric_str[1:-1]
        
        # Try float
        try:
            num = float(numeric_str)
            # Return int if whole number
            if num.is_integer():
                return int(num)
            return num
        except ValueError:
            pass
        
        # Try date parsing (basic patterns)
        date_patterns = [
            r'^\d{4}-\d{2}-\d{2}$',
            r'^\d{2}/\d{2}/\d{4}$',
            r'^\d{2}-\d{2}-\d{4}$'
        ]
        for pattern in date_patterns:
            if re.match(pattern, value):
                return value  # Keep as string but mark as date-like
        
        return value
    
    def _infer_column_types(self, rows: List[Dict], headers: List[str]) -> Dict[str, str]:
        """Infer data types for each column"""
        types = {}
        
        for header in headers:
            values = [row.get(header) for row in rows if row.get(header) is not None]
            
            if not values:
                types[header] = 'empty'
                continue
            
            # Check types
            all_int = all(isinstance(v, int) for v in values)
            all_float = all(isinstance(v, (int, float)) for v in values)
            all_str = all(isinstance(v, str) for v in values)
            
            if all_int:
                types[header] = 'integer'
            elif all_float:
                types[header] = 'number'
            elif all_str:
                # Check for currency pattern
                sample = str(values[0]) if values else ''
                if '$' in sample or '€' in sample:
                    types[header] = 'currency'
                else:
                    types[header] = 'text'
            else:
                types[header] = 'mixed'
        
        return types
    
    def _extract_metadata(self, path: Path, rows: List[Dict]) -> Dict[str, Any]:
        """Extract metadata about the data"""
        metadata = {
            'filename': path.name,
            'file_size_kb': round(path.stat().st_size / 1024, 2),
            'row_count': len(rows)
        }
        
        # Try to infer data source from filename
        name_lower = path.stem.lower()
        if 'schwab' in name_lower:
            metadata['inferred_source'] = 'Schwab'
        elif 'merrill' in name_lower:
            metadata['inferred_source'] = 'Merrill Lynch'
        elif 'etrade' in name_lower:
            metadata['inferred_source'] = 'E*Trade'
        elif 'fidelity' in name_lower:
            metadata['inferred_source'] = 'Fidelity'
        elif 'quicken' in name_lower:
            metadata['inferred_source'] = 'Quicken'
        
        return metadata


# =============================================================================
# TOOL 2: SCHEMA MATCHER
# =============================================================================

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
        
        # Build indexes for fast lookup
        self._build_indexes()
        
        logger.info(f"🧠 SchemaMatcher initialized with {len(self.sheets)} sheets")
    
    def _build_indexes(self):
        """Build indexes for efficient matching"""
        # Index: sheet name -> purpose
        self.sheet_purposes = {}
        
        # Index: header text -> (sheet, column)
        self.header_index = defaultdict(list)
        
        # Index: data patterns
        self.data_patterns = {}
        
        for sheet_name, sheet_data in self.sheets.items():
            # Infer sheet purpose from name
            self.sheet_purposes[sheet_name] = self._infer_sheet_purpose(sheet_name)
            
            # Index headers (check rows 1-10 for potential header rows)
            values = sheet_data.get('values', {})
            for cell, cell_data in values.items():
                if cell.startswith('_'):
                    continue
                
                # Check rows 1-10 for potential headers
                match = re.match(r'^([A-Z]+)(\d+)$', cell)
                if match:
                    row_num = int(match.group(2))
                    if row_num <= 10:  # Only check first 10 rows
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
        
        # Strategy 1: Match by inferred source
        source_match = self._match_by_source(metadata)
        if source_match:
            matches.append(source_match)
        
        # Strategy 2: Match by header similarity
        header_matches = self._match_by_headers(headers)
        matches.extend(header_matches)
        
        # Strategy 3: Match by data pattern
        pattern_matches = self._match_by_pattern(incoming_data)
        matches.extend(pattern_matches)
        
        # Deduplicate and rank
        ranked_matches = self._rank_matches(matches)
        
        logger.info(f"  ✓ Found {len(ranked_matches)} potential matches")
        
        return ranked_matches
    
    def _match_by_source(self, metadata: Dict) -> Optional[Dict]:
        """Match by inferred data source"""
        source = metadata.get('inferred_source', '').lower()
        
        if not source:
            return None
        
        # Find sheet that matches this custodian
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
        types = data.get('inferred_types', {})
        
        # Common patterns
        if 'ticker' in [h.lower() for h in headers] or 'symbol' in [h.lower() for h in headers]:
            # This looks like equity/stock data
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
            # This looks like transaction data
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
        # Group by sheet
        by_sheet = defaultdict(list)
        for match in matches:
            by_sheet[match['sheet']].append(match)
        
        # For each sheet, take the best match
        ranked = []
        for sheet, sheet_matches in by_sheet.items():
            best = max(sheet_matches, key=lambda x: x['confidence'])
            # Combine reasoning from all matches
            all_reasons = [m['reasoning'] for m in sheet_matches]
            best['all_reasoning'] = all_reasons
            best['total_signals'] = len(sheet_matches)
            ranked.append(best)
        
        # Sort by confidence
        ranked.sort(key=lambda x: (x['confidence'], x.get('total_signals', 0)), reverse=True)
        
        return ranked
    
    def find_insert_point(self, sheet_name: str, data_type: str = 'append') -> CellLocation:
        """Find where to insert new data in a sheet"""
        if sheet_name not in self.sheets:
            raise ValueError(f"Sheet not found: {sheet_name}")
        
        sheet_data = self.sheets[sheet_name]
        dimensions = sheet_data.get('dimensions', {})
        max_row = dimensions.get('max_row', 1)
        
        # Insert after the last row
        insert_row = max_row + 1
        
        return CellLocation.from_cell(sheet_name, f"A{insert_row}")
    
    def get_sheet_structure(self, sheet_name: str) -> Dict[str, Any]:
        """Get the structure of a sheet (headers, columns, etc.)"""
        if sheet_name not in self.sheets:
            return {}
        
        sheet_data = self.sheets[sheet_name]
        values = sheet_data.get('values', {})
        
        # Find headers by looking for the row with most text content (likely headers)
        headers = {}
        header_row = 1
        
        # Try rows 1-10 to find the best header row
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
        
        # Find the row with the most columns filled (likely the header row)
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


# =============================================================================
# TOOL 3: UPDATE PLANNER
# =============================================================================

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
        
        # Get sheet structure
        structure = self.matcher.get_sheet_structure(target_sheet)
        sheet_headers = structure.get('headers', {})
        
        reasoning_trace.append(f"Sheet has {len(sheet_headers)} headers: {list(sheet_headers.values())[:5]}...")
        
        # Map incoming columns to Excel columns
        column_mapping = self._create_column_mapping(
            incoming_data['headers'],
            sheet_headers
        )
        
        reasoning_trace.append(f"Column mapping: {column_mapping}")
        
        if mode == 'append':
            # Find insert point
            insert_point = self.matcher.find_insert_point(target_sheet)
            reasoning_trace.append(f"Insert point: {insert_point.cell}")
            
            # Create targets for each row
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
        
        # Determine execution order (simple: left to right, top to bottom)
        execution_order = list(range(len(targets)))
        
        # Estimate impact
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
            requires_approval=len(targets) > 10  # Require approval for large updates
        )
        
        logger.info(f"  ✓ Plan created with {len(targets)} updates")
        
        return plan
    
    def _create_column_mapping(self, incoming_headers: List[str], 
                               excel_headers: Dict[str, str]) -> Dict[str, str]:
        """Map incoming column names to Excel columns"""
        mapping = {}
        
        # Create reverse lookup: header_value -> column_letter
        header_to_col = {v.lower(): k for k, v in excel_headers.items() if v}
        
        for header in incoming_headers:
            header_lower = header.lower()
            
            # Exact match
            if header_lower in header_to_col:
                mapping[header] = header_to_col[header_lower]
                continue
            
            # Fuzzy match (contains)
            for excel_header, col in header_to_col.items():
                if header_lower in excel_header or excel_header in header_lower:
                    mapping[header] = col
                    break
        
        return mapping
    
    def _estimate_impact(self, targets: List[UpdateTarget], sheet_name: str) -> Dict[str, Any]:
        """Estimate the impact of updates"""
        sheet_data = self.sheets.get(sheet_name, {})
        formulas = sheet_data.get('formulas', {})
        
        # Find formulas that might be affected
        affected_formulas = []
        affected_cells = {t.location.cell for t in targets}
        
        for cell, formula_data in formulas.items():
            refs = formula_data.get('references', [])
            # Check if any target cell is referenced
            for ref in refs:
                # Simple check - could be more sophisticated
                if any(ac in ref for ac in affected_cells):
                    affected_formulas.append(cell)
                    break
        
        return {
            'rows_affected': len(set(t.location.row for t in targets)),
            'columns_affected': len(set(t.location.column for t in targets)),
            'potential_formula_recalcs': len(affected_formulas),
            'affected_formulas': affected_formulas[:10]  # First 10
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
        
        for target in plan.targets[:50]:  # Show first 50
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


# =============================================================================
# TOOL 4: HUMAN REVIEW
# =============================================================================

class HumanReview:
    """
    Human-in-the-loop approval interface.
    """
    
    def __init__(self, mode: str = 'cli'):
        """
        Initialize review interface.
        
        Args:
            mode: 'cli' (command line), 'auto' (auto-approve), 'file' (write to file)
        """
        self.mode = mode
    
    def request_approval(self, plan: UpdatePlan, diff: str) -> ApprovalStatus:
        """Request human approval for a plan"""
        
        if self.mode == 'auto':
            logger.info("  → Auto-approval mode: approved")
            return ApprovalStatus.APPROVED
        
        if self.mode == 'file':
            # Write to file for external review
            review_path = Path(f"review_{plan.id}.md")
            with open(review_path, 'w') as f:
                f.write(diff)
            logger.info(f"  → Review file written to: {review_path}")
            return ApprovalStatus.PENDING
        
        # CLI mode
        print("\n" + "=" * 60)
        print("UPDATE PLAN REVIEW")
        print("=" * 60)
        print(diff)
        print("=" * 60)
        
        while True:
            response = input("\nApprove this update? [y/n/q]: ").lower().strip()
            
            if response == 'y':
                return ApprovalStatus.APPROVED
            elif response == 'n':
                return ApprovalStatus.REJECTED
            elif response == 'q':
                raise KeyboardInterrupt("User cancelled")
            else:
                print("Please enter 'y' (yes), 'n' (no), or 'q' (quit)")


# =============================================================================
# TOOL 5: EXECUTOR
# =============================================================================

class Executor:
    """
    Safely executes updates on Excel files.
    
    Features:
    - Automatic backups
    - Atomic updates
    - Rollback capability
    - Preserves formulas and formatting
    """
    
    def __init__(self, backup_dir: Optional[Path] = None):
        self.backup_dir = backup_dir or Path('backups')
        self.backup_dir.mkdir(exist_ok=True)
    
    def execute(self, excel_path: Path, plan: UpdatePlan) -> ExecutionResult:
        """Execute an update plan on an Excel file"""
        excel_path = Path(excel_path)
        start_time = datetime.now()
        
        logger.info(f"🔧 Executing update plan: {plan.id}")
        
        # Create backup
        backup_path = self._create_backup(excel_path)
        logger.info(f"  ✓ Backup created: {backup_path.name}")
        
        errors = []
        updates_applied = 0
        updates_failed = 0
        
        try:
            # Load workbook
            wb = openpyxl.load_workbook(excel_path, keep_vba=True)
            
            # Apply updates in order
            for idx in plan.execution_order:
                target = plan.targets[idx]
                
                try:
                    self._apply_update(wb, target)
                    updates_applied += 1
                except Exception as e:
                    errors.append(f"Failed to update {target.location.sheet}!{target.location.cell}: {e}")
                    updates_failed += 1
            
            # Save to new file
            output_path = self._get_output_path(excel_path)
            wb.save(output_path)
            wb.close()
            
            logger.info(f"  ✓ Applied {updates_applied} updates")
            logger.info(f"  ✓ Saved to: {output_path.name}")
            
            duration = (datetime.now() - start_time).total_seconds()
            
            return ExecutionResult(
                success=updates_failed == 0,
                plan_id=plan.id,
                updates_applied=updates_applied,
                updates_failed=updates_failed,
                errors=errors,
                backup_path=str(backup_path),
                output_path=str(output_path),
                duration_seconds=duration
            )
            
        except Exception as e:
            logger.error(f"  ✗ Execution failed: {e}")
            return ExecutionResult(
                success=False,
                plan_id=plan.id,
                updates_applied=updates_applied,
                updates_failed=updates_failed + 1,
                errors=errors + [str(e)],
                backup_path=str(backup_path),
                output_path='',
                duration_seconds=(datetime.now() - start_time).total_seconds()
            )
    
    def _create_backup(self, excel_path: Path) -> Path:
        """Create a backup of the Excel file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f"{excel_path.stem}_backup_{timestamp}{excel_path.suffix}"
        backup_path = self.backup_dir / backup_name
        shutil.copy2(excel_path, backup_path)
        return backup_path
    
    def _get_output_path(self, excel_path: Path) -> Path:
        """Generate output path with version"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_name = f"{excel_path.stem}_updated_{timestamp}{excel_path.suffix}"
        return excel_path.parent / output_name
    
    def _apply_update(self, wb: openpyxl.Workbook, target: UpdateTarget):
        """Apply a single update to the workbook"""
        sheet = wb[target.location.sheet]
        cell = sheet[target.location.cell]
        
        if target.update_type == UpdateType.INSERT:
            cell.value = target.new_value
        elif target.update_type == UpdateType.UPDATE:
            cell.value = target.new_value
        elif target.update_type == UpdateType.DELETE:
            cell.value = None
    
    def rollback(self, backup_path: Path, original_path: Path):
        """Rollback to backup"""
        logger.info(f"⏪ Rolling back to: {backup_path}")
        shutil.copy2(backup_path, original_path)


# =============================================================================
# TOOL 6: VALIDATOR
# =============================================================================

class Validator:
    """
    Post-update verification and audit logging.
    """
    
    def __init__(self, audit_dir: Optional[Path] = None):
        # Default to logs/audit_logs relative to project root (not CWD!)
        default_dir = Path(__file__).parent.parent.parent.parent / "logs" / "audit_logs"
        self.audit_dir = audit_dir or default_dir
        self.audit_dir.mkdir(exist_ok=True)
    
    def validate(self, original_path: Path, updated_path: Path, 
                 plan: UpdatePlan) -> ValidationResult:
        """Validate that updates were applied correctly"""
        logger.info("✅ Validating updates...")
        
        issues = []
        formula_errors = []
        checks_passed = 0
        checks_failed = 0
        
        try:
            # Load both workbooks
            wb_original = openpyxl.load_workbook(original_path, data_only=True)
            wb_updated = openpyxl.load_workbook(updated_path, data_only=True)
            
            # Check that updates were applied
            for target in plan.targets:
                sheet = wb_updated[target.location.sheet]
                cell = sheet[target.location.cell]
                
                if cell.value == target.new_value:
                    checks_passed += 1
                else:
                    checks_failed += 1
                    issues.append(f"Value mismatch at {target.location.sheet}!{target.location.cell}")
            
            # Check for formula errors in updated file
            wb_updated_formulas = openpyxl.load_workbook(updated_path, data_only=True)
            for sheet_name in wb_updated_formulas.sheetnames:
                sheet = wb_updated_formulas[sheet_name]
                for row in sheet.iter_rows():
                    for cell in row:
                        if cell.value in ['#VALUE!', '#REF!', '#NAME?', '#DIV/0!', '#NULL!', '#N/A']:
                            formula_errors.append(f"{sheet_name}!{cell.coordinate}: {cell.value}")
            
            wb_original.close()
            wb_updated.close()
            wb_updated_formulas.close()
            
        except Exception as e:
            issues.append(f"Validation error: {e}")
            checks_failed += 1
        
        valid = checks_failed == 0 and len(formula_errors) == 0
        
        logger.info(f"  ✓ Checks passed: {checks_passed}")
        if checks_failed > 0:
            logger.warning(f"  ✗ Checks failed: {checks_failed}")
        if formula_errors:
            logger.warning(f"  ⚠ Formula errors: {len(formula_errors)}")
        
        return ValidationResult(
            valid=valid,
            checks_passed=checks_passed,
            checks_failed=checks_failed,
            issues=issues,
            formula_errors=formula_errors[:20],  # First 20
            metric_changes={}
        )
    
    def create_audit_log(self, plan: UpdatePlan, result: ExecutionResult, 
                         validation: ValidationResult) -> AuditLog:
        """Create immutable audit record"""
        log_id = f"audit_{plan.id}"
        timestamp = datetime.now().isoformat()
        
        # Create checksum
        content = json.dumps({
            'plan_id': plan.id,
            'result': asdict(result),
            'validation': asdict(validation),
            'timestamp': timestamp
        }, sort_keys=True)
        checksum = hashlib.sha256(content.encode()).hexdigest()
        
        audit_log = AuditLog(
            id=log_id,
            timestamp=timestamp,
            user=os.getenv('USER', 'unknown'),
            action='update',
            plan=plan,
            result=result,
            validation=validation,
            checksum=checksum
        )
        
        # Save to file
        log_path = self.audit_dir / f"{log_id}.json"
        with open(log_path, 'w') as f:
            json.dump(self._audit_to_dict(audit_log), f, indent=2, default=str)
        
        logger.info(f"📝 Audit log saved: {log_path.name}")
        
        return audit_log
    
    def _audit_to_dict(self, audit: AuditLog) -> Dict:
        """Convert audit log to dictionary"""
        return {
            'id': audit.id,
            'timestamp': audit.timestamp,
            'user': audit.user,
            'action': audit.action,
            'plan': {
                'id': audit.plan.id,
                'source_file': audit.plan.source_file,
                'excel_file': audit.plan.excel_file,
                'target_count': len(audit.plan.targets),
                'reasoning_trace': audit.plan.reasoning_trace
            },
            'result': asdict(audit.result),
            'validation': asdict(audit.validation),
            'checksum': audit.checksum
        }


# =============================================================================
# RECURSIVE SELF-INTELLIGENCE ENGINE (ENHANCED)
# =============================================================================
# 
# THREE MAJOR ENHANCEMENTS:
# 1. CONFIDENCE CONVERGENCE ENGINE - Bayesian updates based on evidence
# 2. ACTIVE SCHEMA PROBING - Tool invocation during RSI to verify assumptions
# 3. DISSENT RESOLUTION TRACKING - Meta-loop to track concern resolution
#
# =============================================================================

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


@dataclass
class ConfidenceUpdate:
    """Tracks a single confidence adjustment with full reasoning"""
    source: str  # What triggered this update
    signal_type: str  # positive, negative, neutral
    delta: float  # The confidence change
    evidence: str  # Why this delta
    iteration: int
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ProbeResult:
    """Result of an active schema probe"""
    probe_type: str
    target: str  # e.g., "Schwab Data!A72"
    result: Any
    verified: bool
    confidence_impact: float
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class DissentPoint:
    """A tracked dissenting point across iterations"""
    id: str
    content: str
    raised_by: str  # Model that raised it
    raised_iteration: int
    severity: DissentSeverity
    status: DissentStatus
    persistence_count: int = 1
    resolution_notes: List[str] = field(default_factory=list)
    related_probes: List[str] = field(default_factory=list)


@dataclass
class SemanticTrace:
    """A single step in the semantic reasoning trace (enhanced)"""
    iteration: int
    step: str
    thought: str
    observation: str
    confidence: float
    confidence_impact: float = 0.0  # NEW: How this trace affected running confidence
    evidence_weight: float = 0.0  # NEW: How strong is this evidence
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ReasoningLog:
    """Complete reasoning log for an iteration (enhanced)"""
    iteration: int
    phase: str
    traces: List[SemanticTrace]
    insights: List[str]
    recommendations: List[str]
    self_critique: str
    improvement_actions: List[str]
    confidence_delta: float
    running_confidence: float = 0.5  # NEW: Confidence at end of this iteration
    probes_performed: int = 0  # NEW: Number of schema probes
    dissents_resolved: int = 0  # NEW: Dissents resolved this iteration


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
    """Result of LLM council deliberation (enhanced)"""
    votes: List[CouncilVote]
    consensus: str
    consensus_confidence: float
    key_agreements: List[str]
    key_disagreements: List[str]
    final_recommendation: Dict[str, Any]
    dissent_count: int = 0  # NEW: Total dissents raised
    confidence_adjustment: float = 0.0  # NEW: How council affected confidence


# =============================================================================
# ENHANCEMENT 2: ACTIVE SCHEMA PROBER
# =============================================================================

class SchemaProber:
    """
    Active Schema Probing - Verify assumptions by reading the actual Excel file.
    
    This allows RSI to VERIFY hypotheses rather than just speculating.
    """
    
    def __init__(self, excel_path: Path, knowledge_base: Dict[str, Any]):
        self.excel_path = Path(excel_path)
        self.knowledge = knowledge_base
        self.probe_history: List[ProbeResult] = []
        self._workbook = None
    
    def _get_workbook(self):
        """Lazy load workbook"""
        if self._workbook is None and self.excel_path.exists():
            try:
                self._workbook = openpyxl.load_workbook(self.excel_path, data_only=True, read_only=True)
            except Exception as e:
                logger.warning(f"Could not load workbook for probing: {e}")
        return self._workbook
    
    def probe_cell(self, sheet_name: str, cell_ref: str) -> ProbeResult:
        """Probe a specific cell to verify its contents"""
        wb = self._get_workbook()
        result_value = None
        verified = False
        
        if wb and sheet_name in wb.sheetnames:
            try:
                sheet = wb[sheet_name]
                cell = sheet[cell_ref]
                result_value = cell.value
                verified = True
            except Exception as e:
                result_value = f"Error: {e}"
        
        probe = ProbeResult(
            probe_type="cell",
            target=f"{sheet_name}!{cell_ref}",
            result=result_value,
            verified=verified,
            confidence_impact=0.05 if verified else 0.0
        )
        self.probe_history.append(probe)
        return probe
    
    def get_last_populated_row(self, sheet_name: str, column: str = "A") -> ProbeResult:
        """Find the last populated row in a column"""
        wb = self._get_workbook()
        last_row = 0
        verified = False
        
        if wb and sheet_name in wb.sheetnames:
            try:
                sheet = wb[sheet_name]
                for row in range(sheet.max_row, 0, -1):
                    cell = sheet[f"{column}{row}"]
                    if cell.value is not None:
                        last_row = row
                        verified = True
                        break
            except Exception as e:
                last_row = f"Error: {e}"
        
        probe = ProbeResult(
            probe_type="last_row",
            target=f"{sheet_name}!{column}",
            result=last_row,
            verified=verified,
            confidence_impact=0.10 if verified else 0.0
        )
        self.probe_history.append(probe)
        return probe
    
    def check_range_empty(self, sheet_name: str, start_cell: str, end_cell: str) -> ProbeResult:
        """Check if a range is empty (safe for insertion)"""
        wb = self._get_workbook()
        is_empty = True
        non_empty_cells = []
        verified = False
        
        if wb and sheet_name in wb.sheetnames:
            try:
                sheet = wb[sheet_name]
                for row in sheet[start_cell:end_cell]:
                    for cell in row:
                        if cell.value is not None:
                            is_empty = False
                            non_empty_cells.append(f"{cell.coordinate}={cell.value}")
                            if len(non_empty_cells) >= 5:
                                break
                    if len(non_empty_cells) >= 5:
                        break
                verified = True
            except Exception as e:
                is_empty = None
        
        confidence_impact = 0.15 if (verified and is_empty) else -0.10 if (verified and not is_empty) else 0.0
        
        probe = ProbeResult(
            probe_type="range_empty",
            target=f"{sheet_name}!{start_cell}:{end_cell}",
            result={"is_empty": is_empty, "non_empty_cells": non_empty_cells[:5]},
            verified=verified,
            confidence_impact=confidence_impact
        )
        self.probe_history.append(probe)
        return probe
    
    def check_table_boundaries(self, sheet_name: str) -> ProbeResult:
        """Check if there are Excel tables and their boundaries"""
        wb = self._get_workbook()
        tables = []
        verified = False
        
        # Note: read_only mode doesn't support tables, so we check from knowledge base
        sheet_data = self.knowledge.get('sheets', {}).get(sheet_name, {})
        tables_info = sheet_data.get('tables', [])
        
        if tables_info:
            tables = tables_info
            verified = True
        else:
            # Try to infer from dimensions
            dims = sheet_data.get('dimensions', {})
            if dims:
                tables.append({
                    'inferred': True,
                    'max_row': dims.get('max_row', 0),
                    'max_col': dims.get('max_col', 0)
                })
                verified = True
        
        probe = ProbeResult(
            probe_type="table_boundaries",
            target=sheet_name,
            result=tables,
            verified=verified,
            confidence_impact=0.08 if verified else 0.0
        )
        self.probe_history.append(probe)
        return probe
    
    def verify_insertion_point(self, sheet_name: str, insert_row: int) -> Dict[str, Any]:
        """Comprehensive verification of an insertion point"""
        results = {
            'verified': False,
            'safe': False,
            'issues': [],
            'probes': []
        }
        
        # Probe the target row
        target_probe = self.probe_cell(sheet_name, f"A{insert_row}")
        results['probes'].append(target_probe)
        
        # Check last populated row
        last_row_probe = self.get_last_populated_row(sheet_name, "A")
        results['probes'].append(last_row_probe)
        
        # Check if range below is empty
        range_probe = self.check_range_empty(sheet_name, f"A{insert_row}", f"Z{insert_row + 10}")
        results['probes'].append(range_probe)
        
        # Check table boundaries
        table_probe = self.check_table_boundaries(sheet_name)
        results['probes'].append(table_probe)
        
        # Analyze results
        if last_row_probe.verified:
            last_row = last_row_probe.result
            if isinstance(last_row, int):
                if insert_row > last_row:
                    results['safe'] = True
                    results['verified'] = True
                elif insert_row == last_row + 1:
                    results['safe'] = True
                    results['verified'] = True
                else:
                    results['issues'].append(f"Insert row {insert_row} is before last populated row {last_row}")
        
        if range_probe.verified and range_probe.result.get('is_empty') == False:
            results['safe'] = False
            results['issues'].append(f"Target range is not empty: {range_probe.result.get('non_empty_cells', [])}")
        
        # Calculate overall confidence impact
        total_impact = sum(p.confidence_impact for p in results['probes'])
        if results['safe']:
            total_impact += 0.10  # Bonus for verified safe
        elif results['issues']:
            total_impact -= 0.15  # Penalty for issues found
        
        results['confidence_impact'] = total_impact
        
        return results
    
    def close(self):
        """Close the workbook"""
        if self._workbook:
            try:
                self._workbook.close()
            except Exception:
                pass
            self._workbook = None


# =============================================================================
# ENHANCEMENT 3: DISSENT RESOLUTION TRACKER
# =============================================================================

class DissentTracker:
    """
    Dissent Resolution Tracking - Monitor which concerns get resolved vs persist.
    
    Uses semantic similarity to match related concerns across iterations.
    """
    
    def __init__(self):
        self.dissents: Dict[str, DissentPoint] = {}
        self.resolution_history: List[Dict] = []
    
    def _generate_dissent_id(self, content: str) -> str:
        """Generate a stable ID for a dissent based on content hash"""
        # Use first 100 chars for hashing to catch similar concerns
        normalized = re.sub(r'\s+', ' ', content.lower().strip())[:100]
        return hashlib.md5(normalized.encode()).hexdigest()[:12]
    
    def _classify_severity(self, content: str) -> DissentSeverity:
        """Classify the severity of a dissenting point"""
        content_lower = content.lower()
        
        critical_keywords = ['overwrite', 'data loss', 'critical', 'break', 'corrupt', 'fail', 'block']
        high_keywords = ['risk', 'verify', 'validation', 'incorrect', 'mismatch', 'error']
        medium_keywords = ['check', 'confirm', 'ensure', 'potential', 'may', 'could']
        low_keywords = ['suggest', 'recommend', 'consider', 'improve', 'optimize']
        
        if any(kw in content_lower for kw in critical_keywords):
            return DissentSeverity.CRITICAL
        elif any(kw in content_lower for kw in high_keywords):
            return DissentSeverity.HIGH
        elif any(kw in content_lower for kw in medium_keywords):
            return DissentSeverity.MEDIUM
        elif any(kw in content_lower for kw in low_keywords):
            return DissentSeverity.LOW
        return DissentSeverity.INFO
    
    def _find_similar_dissent(self, content: str) -> Optional[str]:
        """Find a semantically similar existing dissent"""
        content_lower = content.lower()
        content_words = set(re.findall(r'\w+', content_lower))
        
        best_match = None
        best_score = 0.0
        
        for dissent_id, dissent in self.dissents.items():
            existing_words = set(re.findall(r'\w+', dissent.content.lower()))
            
            # Jaccard similarity
            intersection = len(content_words & existing_words)
            union = len(content_words | existing_words)
            
            if union > 0:
                similarity = intersection / union
                if similarity > 0.4 and similarity > best_score:  # Threshold
                    best_score = similarity
                    best_match = dissent_id
        
        return best_match
    
    def add_dissent(self, content: str, raised_by: str, iteration: int) -> DissentPoint:
        """Add a new dissent or update existing similar one"""
        # Check for similar existing dissent
        similar_id = self._find_similar_dissent(content)
        
        if similar_id and similar_id in self.dissents:
            # Update existing dissent - it persists!
            dissent = self.dissents[similar_id]
            dissent.persistence_count += 1
            
            # Escalate if it keeps appearing
            if dissent.persistence_count >= 3 and dissent.severity != DissentSeverity.CRITICAL:
                old_severity = dissent.severity
                dissent.severity = DissentSeverity.CRITICAL
                dissent.resolution_notes.append(
                    f"Escalated from {old_severity.value} to CRITICAL (persisted {dissent.persistence_count} iterations)"
                )
            
            return dissent
        else:
            # Create new dissent
            dissent_id = self._generate_dissent_id(content)
            severity = self._classify_severity(content)
            
            dissent = DissentPoint(
                id=dissent_id,
                content=content,
                raised_by=raised_by,
                raised_iteration=iteration,
                severity=severity,
                status=DissentStatus.UNRESOLVED,
                persistence_count=1
            )
            
            self.dissents[dissent_id] = dissent
            return dissent
    
    def mark_resolved(self, dissent_id: str, resolution_note: str, 
                      probe_id: Optional[str] = None) -> bool:
        """Mark a dissent as resolved with evidence"""
        if dissent_id not in self.dissents:
            return False
        
        dissent = self.dissents[dissent_id]
        dissent.status = DissentStatus.FULLY_RESOLVED
        dissent.resolution_notes.append(resolution_note)
        
        if probe_id:
            dissent.related_probes.append(probe_id)
        
        self.resolution_history.append({
            'dissent_id': dissent_id,
            'action': 'resolved',
            'note': resolution_note,
            'timestamp': datetime.now().isoformat()
        })
        
        return True
    
    def mark_partially_resolved(self, dissent_id: str, note: str) -> bool:
        """Mark a dissent as partially resolved"""
        if dissent_id not in self.dissents:
            return False
        
        dissent = self.dissents[dissent_id]
        dissent.status = DissentStatus.PARTIALLY_RESOLVED
        dissent.resolution_notes.append(note)
        
        return True
    
    def resolve_with_probe(self, content_pattern: str, probe_result: ProbeResult) -> int:
        """Attempt to resolve dissents matching a pattern using probe evidence"""
        resolved_count = 0
        
        for dissent_id, dissent in self.dissents.items():
            if dissent.status == DissentStatus.UNRESOLVED:
                if content_pattern.lower() in dissent.content.lower():
                    if probe_result.verified:
                        self.mark_resolved(
                            dissent_id,
                            f"Verified by probe: {probe_result.target} = {probe_result.result}",
                            probe_id=probe_result.target
                        )
                        resolved_count += 1
        
        return resolved_count
    
    def get_scoreboard(self) -> Dict[str, Any]:
        """Get the dissent resolution scoreboard"""
        scoreboard = {
            'total': len(self.dissents),
            'by_status': {s.value: 0 for s in DissentStatus},
            'by_severity': {s.value: 0 for s in DissentSeverity},
            'critical_unresolved': 0,
            'high_persistence': [],  # Dissents that appeared 2+ times
            'resolution_rate': 0.0
        }
        
        for dissent in self.dissents.values():
            scoreboard['by_status'][dissent.status.value] += 1
            scoreboard['by_severity'][dissent.severity.value] += 1
            
            if dissent.status == DissentStatus.UNRESOLVED and dissent.severity == DissentSeverity.CRITICAL:
                scoreboard['critical_unresolved'] += 1
            
            if dissent.persistence_count >= 2:
                scoreboard['high_persistence'].append({
                    'id': dissent.id,
                    'content': dissent.content[:80],
                    'count': dissent.persistence_count,
                    'status': dissent.status.value
                })
        
        resolved = scoreboard['by_status'].get('fully_resolved', 0)
        if scoreboard['total'] > 0:
            scoreboard['resolution_rate'] = resolved / scoreboard['total']
        
        return scoreboard
    
    def should_escalate_to_human(self) -> Tuple[bool, List[str]]:
        """Determine if we should escalate to human based on dissent state"""
        reasons = []
        
        scoreboard = self.get_scoreboard()
        
        # Rule 1: Any critical unresolved dissent
        if scoreboard['critical_unresolved'] > 0:
            reasons.append(f"{scoreboard['critical_unresolved']} critical unresolved dissent(s)")
        
        # Rule 2: More than 2 high-persistence dissents
        if len(scoreboard['high_persistence']) > 2:
            reasons.append(f"{len(scoreboard['high_persistence'])} dissents persisted across iterations")
        
        # Rule 3: Resolution rate below 30%
        if scoreboard['resolution_rate'] < 0.3 and scoreboard['total'] >= 3:
            reasons.append(f"Low resolution rate: {scoreboard['resolution_rate']:.0%}")
        
        return len(reasons) > 0, reasons


class RecursiveSelfIntelligence:
    """
    Recursive Self-Intelligence Engine (ENHANCED v2.0) with:
    
    CORE CAPABILITIES:
    - Semantic Tracers: Track reasoning at every step
    - Reasoning Logs: Detailed thought processes with self-critique
    - LLM Councils: Multiple models deliberate on decisions
    - Iterative Improvement: Each iteration learns from previous
    
    ENHANCED CAPABILITIES (v2.0):
    1. CONFIDENCE CONVERGENCE ENGINE - Bayesian updates based on evidence
    2. ACTIVE SCHEMA PROBING - Tool invocation during RSI to verify assumptions
    3. DISSENT RESOLUTION TRACKING - Meta-loop to track concern resolution
    
    This is the BRAIN that makes the auto-updater truly intelligent.
    """
    
    def __init__(self, knowledge_base: Dict[str, Any], 
                 iterations: int = 3,
                 output_dir: Optional[Path] = None,
                 excel_path: Optional[Path] = None):
        self.knowledge = knowledge_base
        self.iterations = iterations
        # Default to logs/rsi_logs relative to project root (not CWD!)
        default_dir = Path(__file__).parent.parent.parent.parent / "logs" / "rsi_logs"
        self.output_dir = output_dir or default_dir
        self.output_dir.mkdir(exist_ok=True)
        self.excel_path = excel_path
        
        # API keys
        self.openai_key = os.environ.get("OPENAI_API_KEY")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        self.gemini_key = os.environ.get("GEMINI_API_KEY")
        
        # Core State
        self.all_traces: List[SemanticTrace] = []
        self.all_logs: List[ReasoningLog] = []
        self.all_deliberations: List[CouncilDeliberation] = []
        
        # === ENHANCEMENT 1: CONFIDENCE CONVERGENCE ENGINE ===
        self.running_confidence: float = 0.5  # Start at neutral
        self.confidence_history: List[ConfidenceUpdate] = []
        self.confidence_trajectory: List[float] = [0.5]  # Track over iterations
        
        # === ENHANCEMENT 2: ACTIVE SCHEMA PROBER ===
        self.prober: Optional[SchemaProber] = None
        if excel_path:
            self.prober = SchemaProber(excel_path, knowledge_base)
        self.all_probes: List[ProbeResult] = []
        
        # === ENHANCEMENT 3: DISSENT RESOLUTION TRACKER ===
        self.dissent_tracker = DissentTracker()
        
        # Models for council - resolved from model_roles
        self.council_models = []
        if self.openai_key and OPENAI_AVAILABLE:
            self.council_models.append(("openai", get_default_model("openai_top")))
        if self.anthropic_key and ANTHROPIC_AVAILABLE:
            self.council_models.append(("anthropic", get_default_model("anthropic_top")))
        if self.gemini_key and GEMINI_AVAILABLE:
            self.council_models.append(("gemini", get_default_model("google_top")))
        
        logger.info(f"🧠 Recursive Self-Intelligence v2.0 initialized")
        logger.info(f"   Iterations: {iterations}")
        logger.info(f"   Council members: {len(self.council_models)}")
        logger.info(f"   Active Probing: {'Enabled' if self.prober else 'Disabled'}")
        logger.info(f"   Confidence Engine: Enabled")
        logger.info(f"   Dissent Tracking: Enabled")
    
    # =========================================================================
    # ENHANCEMENT 1: CONFIDENCE CONVERGENCE ENGINE
    # =========================================================================
    
    def _update_confidence(self, source: str, signal_type: str, 
                           delta: float, evidence: str, iteration: int):
        """Update running confidence with a signed delta"""
        old_confidence = self.running_confidence
        
        # Apply delta with bounds
        self.running_confidence = max(0.0, min(1.0, self.running_confidence + delta))
        
        # Record the update
        update = ConfidenceUpdate(
            source=source,
            signal_type=signal_type,
            delta=delta,
            evidence=evidence,
            iteration=iteration
        )
        self.confidence_history.append(update)
        
        logger.debug(f"Confidence: {old_confidence:.3f} → {self.running_confidence:.3f} ({signal_type}: {delta:+.3f})")
    
    def _compute_trace_confidence_impact(self, trace_text: str) -> Tuple[float, str]:
        """Compute confidence impact from a trace based on content analysis"""
        text_lower = trace_text.lower()
        
        # Positive signals
        positive_signals = {
            'exact match': 0.08,
            'high confidence': 0.06,
            'verified': 0.10,
            'correct': 0.05,
            'aligned': 0.04,
            'seamless': 0.05,
            'appropriate': 0.04,
            'safe': 0.06,
            'confirmed': 0.08,
        }
        
        # Negative signals
        negative_signals = {
            'risk': -0.05,
            'overwrite': -0.08,
            'mismatch': -0.06,
            'incorrect': -0.07,
            'unverified': -0.06,
            'potential issue': -0.05,
            'concern': -0.04,
            'error': -0.06,
            'fail': -0.08,
            'uncertain': -0.04,
        }
        
        total_delta = 0.0
        signals_found = []
        
        for signal, delta in positive_signals.items():
            if signal in text_lower:
                total_delta += delta
                signals_found.append(f"+{signal}")
        
        for signal, delta in negative_signals.items():
            if signal in text_lower:
                total_delta += delta
                signals_found.append(f"-{signal}")
        
        return total_delta, ", ".join(signals_found) if signals_found else "neutral"
    
    def _compute_vote_confidence_impact(self, vote: CouncilVote) -> float:
        """Compute confidence impact from a council vote"""
        base_impact = {
            'APPROVE': 0.08,
            'APPROVE_WITH_CHANGES': 0.03,
            'DEFER': -0.05,
            'REJECT': -0.12
        }
        
        decision_upper = vote.decision.upper()
        impact = 0.0
        
        for key, delta in base_impact.items():
            if key in decision_upper:
                impact = delta
                break
        
        # Reduce impact for each dissenting point
        dissent_penalty = len(vote.dissenting_points) * -0.015
        
        return impact + dissent_penalty
    
    def _add_trace(self, iteration: int, step: str, thought: str, 
                   observation: str, confidence: float) -> SemanticTrace:
        """Add a semantic trace"""
        trace = SemanticTrace(
            iteration=iteration,
            step=step,
            thought=thought,
            observation=observation,
            confidence=confidence
        )
        self.all_traces.append(trace)
        return trace
    
    def _call_openai(self, prompt: str, model: str = None) -> Optional[str]:
        """Call OpenAI API"""
        if not self.openai_key or not OPENAI_AVAILABLE:
            return None
        if model is None:
            model = get_default_model("openai_top")
        try:
            client = openai.OpenAI(api_key=self.openai_key)
            # Use max_completion_tokens for newer models (gpt-5.x), max_tokens for older
            token_param = "max_completion_tokens" if model.startswith("gpt-5") or model.startswith("o1") or model.startswith("o3") else "max_tokens"
            create_kwargs = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are an expert Excel analyst and data integration specialist. Provide detailed reasoning with semantic traces."},
                    {"role": "user", "content": prompt}
                ],
                token_param: 2048,
                "temperature": 0.4
            }
            response = client.chat.completions.create(**create_kwargs)
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
            return None
    
    def _call_anthropic(self, prompt: str, model: str = None) -> Optional[str]:
        """Call Anthropic API"""
        if not self.anthropic_key or not ANTHROPIC_AVAILABLE:
            return None
        if model is None:
            model = get_default_model("anthropic_top")
        try:
            client = anthropic.Anthropic(api_key=self.anthropic_key)
            response = client.messages.create(
                model=model,
                max_tokens=2048,
                system="You are an expert Excel analyst and data integration specialist. Provide detailed reasoning with semantic traces.",
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text
        except Exception as e:
            logger.error(f"Anthropic error: {e}")
            return None
    
    def _call_gemini(self, prompt: str, model: str = None) -> Optional[str]:
        """Call Google Gemini API"""
        if not self.gemini_key or not GEMINI_AVAILABLE:
            return None
        if model is None:
            model = get_default_model("google_top")
        try:
            genai.configure(api_key=self.gemini_key)
            gemini_model = genai.GenerativeModel(
                model_name=model,
                system_instruction="You are an expert Excel analyst and data integration specialist. Provide detailed reasoning with semantic traces."
            )
            response = gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Gemini error: {e}")
            return None
    
    def analyze_and_plan(self, incoming_data: Dict[str, Any],
                         matcher_results: List[Dict],
                         plan: 'UpdatePlan') -> Dict[str, Any]:
        """
        Run full recursive self-intelligence analysis (ENHANCED v2.0).
        
        Now includes:
        - Confidence Convergence: Tracks and updates confidence based on evidence
        - Active Schema Probing: Verifies assumptions by reading actual data
        - Dissent Resolution Tracking: Monitors which concerns get resolved
        
        Returns comprehensive analysis with all traces, logs, and council deliberations.
        """
        print("\n" + "=" * 70)
        print("🧠 RECURSIVE SELF-INTELLIGENCE ENGINE v2.0")
        print("=" * 70)
        print("   ├─ Confidence Convergence: ✓")
        print("   ├─ Active Schema Probing: ✓")
        print("   └─ Dissent Resolution Tracking: ✓")
        
        session_id = f"rsi_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        accumulated_insights = []
        accumulated_improvements = []
        
        # Initialize prober with plan target
        if plan.targets and self.prober is None:
            target_sheet = plan.targets[0].location.sheet
            file_path = self.knowledge.get('file_info', {}).get('file_path', '')
            if file_path:
                self.prober = SchemaProber(Path(file_path), self.knowledge)
        
        for iteration in range(1, self.iterations + 1):
            print(f"\n{'─' * 60}")
            print(f"📍 ITERATION {iteration}/{self.iterations} | Confidence: {self.running_confidence:.2%}")
            print(f"{'─' * 60}")
            
            # Phase 1: Deep Analysis
            analysis_result = self._iteration_analysis(
                iteration, incoming_data, matcher_results, plan, accumulated_insights
            )
            
            # Phase 1.5: ACTIVE SCHEMA PROBING (NEW!)
            probe_result = self._active_probing(iteration, plan)
            
            # Phase 2: LLM Council Deliberation
            council_result = self._council_deliberation(
                iteration, incoming_data, matcher_results, plan, analysis_result
            )
            
            # Phase 2.5: DISSENT TRACKING (NEW!)
            dissent_update = self._track_dissents(iteration, council_result)
            
            # Phase 3: Self-Critique & Improvement
            improvement_result = self._self_critique(
                iteration, analysis_result, council_result, accumulated_improvements
            )
            
            # Accumulate
            accumulated_insights.extend(analysis_result.get('insights', []))
            accumulated_improvements.extend(improvement_result.get('improvements', []))
            
            # Record confidence trajectory
            self.confidence_trajectory.append(self.running_confidence)
            
            # Log this iteration (enhanced)
            log = ReasoningLog(
                iteration=iteration,
                phase="complete",
                traces=[t for t in self.all_traces if t.iteration == iteration],
                insights=analysis_result.get('insights', []),
                recommendations=analysis_result.get('recommendations', []),
                self_critique=improvement_result.get('critique', ''),
                improvement_actions=improvement_result.get('improvements', []),
                confidence_delta=improvement_result.get('confidence_delta', 0),
                running_confidence=self.running_confidence,
                probes_performed=probe_result.get('probes_count', 0),
                dissents_resolved=dissent_update.get('resolved_count', 0)
            )
            self.all_logs.append(log)
            
            # Save iteration results (enhanced)
            self._save_iteration(session_id, iteration, {
                'analysis': analysis_result,
                'probing': probe_result,
                'council': council_result,
                'dissent_update': dissent_update,
                'improvement': improvement_result,
                'running_confidence': self.running_confidence,
                'confidence_trajectory': self.confidence_trajectory.copy()
            })
        
        # FINALIZATION PHASE (Enhanced)
        print(f"\n{'═' * 60}")
        print("🏁 FINALIZATION PHASE")
        print(f"{'═' * 60}")
        
        # Get dissent-based escalation recommendation
        should_escalate, escalation_reasons = self.dissent_tracker.should_escalate_to_human()
        
        final_result = self._finalization(
            incoming_data, matcher_results, plan,
            accumulated_insights, accumulated_improvements,
            should_escalate, escalation_reasons
        )
        
        # Cleanup prober
        if self.prober:
            self.prober.close()
        
        # Save complete session (enhanced)
        self._save_session(session_id, final_result)
        
        return final_result
    
    # =========================================================================
    # ENHANCEMENT 2: ACTIVE SCHEMA PROBING
    # =========================================================================
    
    def _active_probing(self, iteration: int, plan: 'UpdatePlan') -> Dict[str, Any]:
        """Perform active schema probing to verify assumptions"""
        print(f"\n  🔍 Phase 1.5: Active Schema Probing...")
        
        result = {
            'probes_count': 0,
            'verified_count': 0,
            'issues_found': [],
            'confidence_impact': 0.0,
            'insertion_safe': None
        }
        
        if not self.prober or not plan.targets:
            print(f"    → Probing disabled (no Excel path)")
            return result
        
        target = plan.targets[0]
        target_sheet = target.location.sheet
        insert_row = target.location.row
        
        # Verify insertion point
        verification = self.prober.verify_insertion_point(target_sheet, insert_row)
        result['probes_count'] = len(verification['probes'])
        result['insertion_safe'] = verification['safe']
        result['issues_found'] = verification['issues']
        
        for probe in verification['probes']:
            self.all_probes.append(probe)
            if probe.verified:
                result['verified_count'] += 1
        
        # Update confidence based on probing
        probe_impact = verification['confidence_impact']
        result['confidence_impact'] = probe_impact
        
        if verification['safe']:
            self._update_confidence(
                source="active_probing",
                signal_type="positive",
                delta=probe_impact,
                evidence=f"Insertion point {target_sheet}!A{insert_row} verified safe",
                iteration=iteration
            )
            print(f"    ✓ Insertion point verified SAFE | Confidence +{probe_impact:.2f}")
            
            # Resolve any dissents about insertion point
            resolved = self.dissent_tracker.resolve_with_probe(
                "insertion", 
                verification['probes'][0] if verification['probes'] else None
            )
            if resolved > 0:
                print(f"    ✓ Resolved {resolved} dissent(s) via probing")
        else:
            self._update_confidence(
                source="active_probing",
                signal_type="negative",
                delta=probe_impact,
                evidence=f"Issues found: {verification['issues']}",
                iteration=iteration
            )
            print(f"    ⚠ Issues found: {verification['issues']} | Confidence {probe_impact:.2f}")
        
        return result
    
    # =========================================================================
    # ENHANCEMENT 3: DISSENT TRACKING
    # =========================================================================
    
    def _track_dissents(self, iteration: int, council_result: Dict) -> Dict[str, Any]:
        """Track and analyze dissenting points from council"""
        print(f"\n  📋 Phase 2.5: Dissent Tracking...")
        
        result = {
            'new_dissents': 0,
            'persisted_dissents': 0,
            'resolved_count': 0,
            'critical_count': 0,
            'scoreboard': {}
        }
        
        # Extract dissents from votes
        for vote_data in council_result.get('votes', []):
            model = vote_data.get('model', 'unknown')
            dissenting_points = vote_data.get('dissenting_points', [])
            
            for content in dissenting_points:
                if isinstance(content, str) and len(content) > 10:
                    dissent = self.dissent_tracker.add_dissent(content, model, iteration)
                    
                    if dissent.persistence_count == 1:
                        result['new_dissents'] += 1
                    else:
                        result['persisted_dissents'] += 1
                        # Penalty for persistent dissents
                        self._update_confidence(
                            source="dissent_tracking",
                            signal_type="negative",
                            delta=-0.03,
                            evidence=f"Dissent persisted ({dissent.persistence_count}x): {content[:50]}...",
                            iteration=iteration
                        )
                    
                    if dissent.severity == DissentSeverity.CRITICAL:
                        result['critical_count'] += 1
        
        # Get scoreboard
        scoreboard = self.dissent_tracker.get_scoreboard()
        result['scoreboard'] = scoreboard
        
        print(f"    → New: {result['new_dissents']} | Persisted: {result['persisted_dissents']} | Critical: {result['critical_count']}")
        print(f"    → Resolution rate: {scoreboard['resolution_rate']:.0%}")
        
        return result
    
    def _iteration_analysis(self, iteration: int, data: Dict, 
                           matches: List[Dict], plan: 'UpdatePlan',
                           prior_insights: List[str]) -> Dict[str, Any]:
        """Deep analysis phase for an iteration (enhanced with confidence tracking)"""
        print(f"\n  📊 Phase 1: Deep Analysis...")
        
        # Build context
        sheets_summary = self._build_sheets_summary()
        prior_context = "\n".join(f"  - {i}" for i in prior_insights[-5:]) if prior_insights else "None"
        
        prompt = f"""## RECURSIVE SELF-INTELLIGENCE - ITERATION {iteration}

### TASK
Analyze this Excel update scenario with deep semantic understanding.

### SPREADSHEET KNOWLEDGE BASE
{sheets_summary}

### INCOMING DATA
- Source: {data.get('source', 'unknown')}
- Format: {data.get('format', 'unknown')}
- Headers: {data.get('headers', [])}
- Row Count: {data.get('row_count', 0)}
- Inferred Types: {json.dumps(data.get('inferred_types', {}), indent=2)}
- Sample (first row): {json.dumps(data.get('rows', [{}])[0], indent=2) if data.get('rows') else 'N/A'}

### CURRENT MATCHING RESULTS
Best Match: {matches[0]['sheet'] if matches else 'None'} (confidence: {matches[0]['confidence'] if matches else 0:.2f})
All Matches: {json.dumps(matches[:5], indent=2)}

### PROPOSED UPDATE PLAN
- Target Sheet: {plan.targets[0].location.sheet if plan.targets else 'N/A'}
- Update Count: {len(plan.targets)}
- Insert Point: {plan.targets[0].location.cell if plan.targets else 'N/A'}

### PRIOR INSIGHTS FROM PREVIOUS ITERATIONS
{prior_context}

### YOUR ANALYSIS
Provide deep semantic analysis with the following structure:

**SEMANTIC TRACE 1: Data Understanding**
- THOUGHT: [What is this data semantically?]
- OBSERVATION: [Key patterns and characteristics]
- CONFIDENCE: [0-1 score]

**SEMANTIC TRACE 2: Destination Analysis**  
- THOUGHT: [Where should this data go and why?]
- OBSERVATION: [Evidence from spreadsheet structure]
- CONFIDENCE: [0-1 score]

**SEMANTIC TRACE 3: Mapping Quality**
- THOUGHT: [Is the column mapping correct?]
- OBSERVATION: [Any mismatches or improvements needed?]
- CONFIDENCE: [0-1 score]

**SEMANTIC TRACE 4: Risk Assessment**
- THOUGHT: [What could go wrong?]
- OBSERVATION: [Potential issues with this update]
- CONFIDENCE: [0-1 score for safety]

**KEY INSIGHTS**
1. [Insight 1]
2. [Insight 2]
3. [Insight 3]

**RECOMMENDATIONS**
1. [Recommendation 1]
2. [Recommendation 2]

**OVERALL CONFIDENCE**: [0-1 score with justification]"""

        # Get analysis from primary model
        response = self._call_openai(prompt) if self.openai_key else self._call_anthropic(prompt)
        
        if response:
            print(f"  ✓ Analysis complete")
            
            # Parse semantic traces from response
            traces = self._parse_traces(response, iteration)
            insights = self._parse_list(response, "KEY INSIGHTS")
            recommendations = self._parse_list(response, "RECOMMENDATIONS")
            confidence = self._parse_confidence(response)
            
            for trace in traces:
                self._add_trace(iteration, trace['step'], trace['thought'], 
                               trace['observation'], trace['confidence'])
            
            return {
                'response': response,
                'traces': traces,
                'insights': insights,
                'recommendations': recommendations,
                'confidence': confidence
            }
        
        return {'insights': [], 'recommendations': [], 'confidence': 0.5}
    
    def _council_deliberation(self, iteration: int, data: Dict,
                             matches: List[Dict], plan: 'UpdatePlan',
                             analysis: Dict) -> Dict[str, Any]:
        """LLM Council deliberation phase"""
        print(f"\n  🏛️ Phase 2: LLM Council Deliberation...")
        
        if len(self.council_models) < 2:
            print(f"  ⚠ Only {len(self.council_models)} council member(s) available")
            if len(self.council_models) == 0:
                return {'consensus': 'No council available', 'votes': []}
        
        votes = []
        
        council_prompt = f"""## LLM COUNCIL DELIBERATION - ITERATION {iteration}

You are a member of an AI council deliberating on an Excel update decision.

### CONTEXT
- Data Source: {data.get('source', 'unknown')}
- Target Sheet: {matches[0]['sheet'] if matches else 'None'}
- Proposed Updates: {len(plan.targets)}
- Prior Analysis Confidence: {analysis.get('confidence', 0.5):.2f}

### PRIOR ANALYSIS INSIGHTS
{chr(10).join(f'- {i}' for i in analysis.get('insights', [])[:5])}

### YOUR DELIBERATION
As a council member, provide:

**VOTE**: APPROVE / APPROVE_WITH_CHANGES / REJECT / DEFER

**REASONING**: [2-3 sentences explaining your vote]

**CONFIDENCE**: [0-1 score]

**DISSENTING POINTS**: [Any concerns even if voting approve]
1. [Point 1]
2. [Point 2]

**SUGGESTED IMPROVEMENTS**: [If any]
1. [Improvement 1]"""

        for provider, model in self.council_models:
            if provider == "openai":
                response = self._call_openai(council_prompt, model)
            elif provider == "anthropic":
                response = self._call_anthropic(council_prompt, model)
            elif provider == "gemini":
                response = self._call_gemini(council_prompt, model)
            else:
                response = None
            
            if response:
                vote = self._parse_vote(response, provider, model)
                votes.append(vote)
                print(f"    → {model}: {vote.decision} (confidence: {vote.confidence:.2f})")
        
        # Determine consensus
        if votes:
            approve_votes = sum(1 for v in votes if 'APPROVE' in v.decision.upper())
            consensus = "APPROVED" if approve_votes > len(votes) / 2 else "NEEDS_REVIEW"
            avg_confidence = sum(v.confidence for v in votes) / len(votes)
            
            deliberation = CouncilDeliberation(
                votes=votes,
                consensus=consensus,
                consensus_confidence=avg_confidence,
                key_agreements=[],
                key_disagreements=[v.dissenting_points for v in votes if v.dissenting_points],
                final_recommendation={'decision': consensus, 'confidence': avg_confidence}
            )
            self.all_deliberations.append(deliberation)
            
            print(f"  ✓ Council consensus: {consensus} (confidence: {avg_confidence:.2f})")
            
            return {
                'consensus': consensus,
                'confidence': avg_confidence,
                'votes': [asdict(v) for v in votes]
            }
        
        return {'consensus': 'NO_QUORUM', 'confidence': 0.0, 'votes': []}
    
    def _self_critique(self, iteration: int, analysis: Dict, 
                       council: Dict, prior_improvements: List[str]) -> Dict[str, Any]:
        """Self-critique and improvement phase"""
        print(f"\n  🔍 Phase 3: Self-Critique & Improvement...")
        
        prompt = f"""## SELF-CRITIQUE - ITERATION {iteration}

### ANALYSIS SUMMARY
Confidence: {analysis.get('confidence', 0.5):.2f}
Insights: {len(analysis.get('insights', []))}
Recommendations: {len(analysis.get('recommendations', []))}

### COUNCIL RESULT
Consensus: {council.get('consensus', 'N/A')}
Council Confidence: {council.get('confidence', 0):.2f}

### PRIOR IMPROVEMENTS ATTEMPTED
{chr(10).join(f'- {i}' for i in prior_improvements[-3:]) if prior_improvements else 'None'}

### SELF-CRITIQUE
Critically evaluate this iteration:

**WHAT WENT WELL**:
1. [Strength 1]
2. [Strength 2]

**WHAT COULD BE IMPROVED**:
1. [Weakness 1]
2. [Weakness 2]

**BLIND SPOTS IDENTIFIED**:
1. [Blind spot 1]

**IMPROVEMENT ACTIONS FOR NEXT ITERATION**:
1. [Action 1]
2. [Action 2]

**CONFIDENCE ADJUSTMENT**: [+/- 0.0 to 0.2]

**OVERALL CRITIQUE**: [2-3 sentence summary]"""

        response = self._call_anthropic(prompt) if self.anthropic_key else self._call_openai(prompt)
        
        if response:
            improvements = self._parse_list(response, "IMPROVEMENT ACTIONS")
            critique = self._extract_section(response, "OVERALL CRITIQUE")
            confidence_delta = self._parse_confidence_delta(response)
            
            new_confidence = min(1.0, max(0.0, analysis.get('confidence', 0.5) + confidence_delta))
            
            print(f"  ✓ Self-critique complete (confidence: {new_confidence:.2f})")
            
            return {
                'critique': critique,
                'improvements': improvements,
                'confidence': new_confidence,
                'confidence_delta': confidence_delta
            }
        
        return {'critique': '', 'improvements': [], 'confidence': 0.5, 'confidence_delta': 0}
    
    def _finalization(self, data: Dict, matches: List[Dict], plan: 'UpdatePlan',
                      all_insights: List[str], all_improvements: List[str],
                      should_escalate: bool, escalation_reasons: List[str]) -> Dict[str, Any]:
        """Final reasoning and decision phase after all iterations (ENHANCED)"""
        
        # Get dissent scoreboard for context
        dissent_scoreboard = self.dissent_tracker.get_scoreboard()
        
        # Build confidence trajectory description
        trajectory_desc = " → ".join(f"{c:.2f}" for c in self.confidence_trajectory)
        
        prompt = f"""## FINALIZATION - RECURSIVE SELF-INTELLIGENCE v2.0 COMPLETE

After {self.iterations} iterations of recursive self-improvement with ACTIVE PROBING and DISSENT TRACKING.

### CONFIDENCE TRAJECTORY
{trajectory_desc}
Final Confidence: {self.running_confidence:.2%}

### PROBING RESULTS
Total probes performed: {len(self.all_probes)}
Verified safe: {sum(1 for p in self.all_probes if p.verified and p.confidence_impact > 0)}

### DISSENT RESOLUTION SCOREBOARD
- Total dissents raised: {dissent_scoreboard['total']}
- Critical unresolved: {dissent_scoreboard['critical_unresolved']}
- Resolution rate: {dissent_scoreboard['resolution_rate']:.0%}
- High-persistence issues: {len(dissent_scoreboard['high_persistence'])}

### ESCALATION ANALYSIS
Should escalate to human: {'YES' if should_escalate else 'NO'}
Reasons: {', '.join(escalation_reasons) if escalation_reasons else 'None'}

### ACCUMULATED INSIGHTS ({len(all_insights)} total)
{chr(10).join(f'{i+1}. {insight}' for i, insight in enumerate(all_insights[:10]))}

### IMPROVEMENT JOURNEY
{chr(10).join(f'- {imp}' for imp in all_improvements[:5])}

### FINAL CONFIDENCE: {self.running_confidence:.2f}

### UPDATE SUMMARY
- Source: {data.get('source', 'unknown')}
- Target: {matches[0]['sheet'] if matches else 'N/A'}
- Updates: {len(plan.targets)}

### FINAL DECISION
Provide your final authoritative decision:

**DECISION**: EXECUTE / EXECUTE_WITH_MONITORING / DEFER_TO_HUMAN / REJECT

**CONFIDENCE**: [0-1]

**RATIONALE**: [Comprehensive reasoning for this decision]

**CRITICAL OBSERVATIONS**:
1. [Most important observation]
2. [Second most important]
3. [Third]

**RISK ASSESSMENT**: LOW / MEDIUM / HIGH

**RECOMMENDED NEXT STEPS**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**HUMAN REVIEW REQUIRED**: YES / NO
If YES, what specifically should human review?"""

        # Get final decision from all available models
        responses = []
        
        if self.openai_key:
            resp = self._call_openai(prompt)
            if resp:
                responses.append(('OpenAI', resp))
        
        if self.anthropic_key:
            resp = self._call_anthropic(prompt)
            if resp:
                responses.append(('Claude', resp))
        
        if self.gemini_key:
            resp = self._call_gemini(prompt)
            if resp:
                responses.append(('Gemini', resp))
        
        # ENHANCED DECISION LOGIC
        final_decision = "DEFER_TO_HUMAN"
        final_rationale = ""
        requires_human = True
        
        # Get dissent scoreboard
        dissent_scoreboard = self.dissent_tracker.get_scoreboard()
        
        if responses:
            # Parse decisions from LLMs
            decisions = []
            for provider, resp in responses:
                decision = self._extract_section(resp, "DECISION").strip().split()[0] if resp else "DEFER"
                decisions.append(decision)
                final_rationale += f"\n\n### {provider} Analysis:\n{resp}"
            
            # ENHANCED DECISION RULES (using all three systems)
            
            # Rule 1: Force escalation if dissent tracker says so
            if should_escalate:
                final_decision = "DEFER_TO_HUMAN"
                requires_human = True
                final_rationale += f"\n\n### ESCALATION REQUIRED\nReasons: {', '.join(escalation_reasons)}"
            
            # Rule 2: High confidence + verified probes + resolved dissents = EXECUTE
            elif (self.running_confidence >= 0.75 and 
                  dissent_scoreboard['critical_unresolved'] == 0 and
                  dissent_scoreboard['resolution_rate'] >= 0.5):
                final_decision = "EXECUTE"
                requires_human = False
            
            # Rule 3: Medium-high confidence + probes verified = EXECUTE_WITH_MONITORING
            elif (self.running_confidence >= 0.60 and 
                  any(p.verified and p.confidence_impact > 0 for p in self.all_probes) and
                  dissent_scoreboard['critical_unresolved'] == 0):
                final_decision = "EXECUTE_WITH_MONITORING"
                requires_human = False
            
            # Rule 4: All LLMs agree on execute
            elif all('EXECUTE' in d for d in decisions) and self.running_confidence >= 0.50:
                final_decision = "EXECUTE_WITH_MONITORING"
                requires_human = False
            
            # Rule 5: Any LLM says reject
            elif any('REJECT' in d for d in decisions):
                final_decision = "REJECT"
                requires_human = True
            
            # Rule 6: Default to human review
            else:
                final_decision = "DEFER_TO_HUMAN"
                requires_human = True
        
        # Print enhanced summary
        print(f"\n  🏁 FINAL DECISION: {final_decision}")
        print(f"  📊 Confidence Trajectory: {' → '.join(f'{c:.0%}' for c in self.confidence_trajectory)}")
        print(f"  📊 Final Confidence: {self.running_confidence:.2%}")
        print(f"  🔍 Probes Performed: {len(self.all_probes)}")
        print(f"  📋 Dissents: {dissent_scoreboard['total']} (Critical: {dissent_scoreboard['critical_unresolved']}, Resolution: {dissent_scoreboard['resolution_rate']:.0%})")
        print(f"  👤 Human Review Required: {'Yes' if requires_human else 'No'}")
        if should_escalate:
            print(f"  ⚠️ Escalation Reasons: {', '.join(escalation_reasons)}")
        
        return {
            'session_complete': True,
            'iterations_completed': self.iterations,
            'decision': final_decision,
            'confidence': self.running_confidence,
            'confidence_trajectory': self.confidence_trajectory,
            'requires_human_review': requires_human,
            'escalation_required': should_escalate,
            'escalation_reasons': escalation_reasons,
            'total_traces': len(self.all_traces),
            'total_insights': len(all_insights),
            'total_probes': len(self.all_probes),
            'all_insights': all_insights,
            'all_improvements': all_improvements,
            'council_deliberations': len(self.all_deliberations),
            'dissent_scoreboard': dissent_scoreboard,
            'confidence_updates': [asdict(u) for u in self.confidence_history],
            'rationale': final_rationale,
            'recommendation': {
                'action': final_decision,
                'target_sheet': matches[0]['sheet'] if matches else None,
                'update_count': len(plan.targets),
                'confidence': self.running_confidence,
                'probes_verified': sum(1 for p in self.all_probes if p.verified),
                'critical_dissents': dissent_scoreboard['critical_unresolved']
            }
        }
    
    def _build_sheets_summary(self) -> str:
        """Build a summary of spreadsheet structure"""
        sheets = self.knowledge.get('sheets', {})
        lines = []
        for name, data in list(sheets.items())[:15]:
            dims = data.get('dimensions', {})
            formulas = data.get('statistics', {}).get('total_formulas', 0)
            lines.append(f"- {name}: {dims.get('max_row', 0)} rows, {dims.get('max_col', 0)} cols, {formulas} formulas")
        return "\n".join(lines)
    
    def _parse_traces(self, response: str, iteration: int) -> List[Dict]:
        """Parse semantic traces from response"""
        traces = []
        # Simple extraction of trace patterns
        for i in range(1, 5):
            section = f"SEMANTIC TRACE {i}"
            if section in response:
                traces.append({
                    'step': section,
                    'thought': self._extract_section(response, "THOUGHT", section),
                    'observation': self._extract_section(response, "OBSERVATION", section),
                    'confidence': 0.7  # Default
                })
        return traces
    
    def _parse_list(self, response: str, section_name: str) -> List[str]:
        """Parse a numbered list from response"""
        items = []
        lines = response.split('\n')
        in_section = False
        for line in lines:
            if section_name in line.upper():
                in_section = True
                continue
            if in_section:
                if line.strip().startswith(('1.', '2.', '3.', '4.', '5.', '-')):
                    item = re.sub(r'^[\d\.\-\s]+', '', line.strip())
                    if item and len(item) > 3:
                        items.append(item)
                elif line.strip() and not line.strip().startswith('*') and '**' in line:
                    break
        return items[:5]
    
    def _parse_confidence(self, response: str) -> float:
        """Parse overall confidence from response"""
        match = re.search(r'OVERALL CONFIDENCE[:\s]*([0-9.]+)', response, re.IGNORECASE)
        if match:
            try:
                return min(1.0, max(0.0, float(match.group(1))))
            except ValueError:
                pass
        return 0.5
    
    def _parse_confidence_delta(self, response: str) -> float:
        """Parse confidence adjustment"""
        match = re.search(r'CONFIDENCE ADJUSTMENT[:\s]*([+-]?[0-9.]+)', response, re.IGNORECASE)
        if match:
            try:
                return min(0.2, max(-0.2, float(match.group(1))))
            except ValueError:
                pass
        return 0.0
    
    def _parse_vote(self, response: str, provider: str, model: str) -> CouncilVote:
        """Parse a council vote from response"""
        decision = "APPROVE"
        if "REJECT" in response.upper():
            decision = "REJECT"
        elif "DEFER" in response.upper():
            decision = "DEFER"
        elif "APPROVE_WITH" in response.upper():
            decision = "APPROVE_WITH_CHANGES"
        
        confidence = self._parse_confidence(response)
        dissenting = self._parse_list(response, "DISSENTING")
        
        return CouncilVote(
            model=model,
            provider=provider,
            decision=decision,
            reasoning=self._extract_section(response, "REASONING"),
            confidence=confidence,
            dissenting_points=dissenting
        )
    
    def _extract_section(self, response: str, section_name: str, after_marker: str = None) -> str:
        """Extract a section from response"""
        lines = response.split('\n')
        result = []
        in_section = False
        passed_marker = after_marker is None
        
        for line in lines:
            if after_marker and after_marker in line:
                passed_marker = True
            if passed_marker and section_name.upper() in line.upper():
                in_section = True
                # Get content after the section name if on same line
                if ':' in line:
                    content = line.split(':', 1)[1].strip()
                    if content:
                        result.append(content)
                continue
            if in_section:
                if line.strip().startswith('**') and section_name.upper() not in line.upper():
                    break
                if line.strip():
                    result.append(line.strip())
                if len(result) >= 5:
                    break
        
        return ' '.join(result)
    
    def _save_iteration(self, session_id: str, iteration: int, data: Dict):
        """Save iteration results to file"""
        path = self.output_dir / f"{session_id}_iteration_{iteration}.json"
        with open(path, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    
    def _save_session(self, session_id: str, final_result: Dict):
        """Save complete session to file"""
        path = self.output_dir / f"{session_id}_final.json"
        with open(path, 'w') as f:
            json.dump({
                'session_id': session_id,
                'final_result': final_result,
                'all_traces': [asdict(t) for t in self.all_traces],
                'all_logs': [asdict(l) for l in self.all_logs],
                'all_deliberations': [asdict(d) for d in self.all_deliberations]
            }, f, indent=2, default=str)
        
        # Also save human-readable report
        report_path = self.output_dir / f"{session_id}_report.md"
        self._save_report(report_path, session_id, final_result)
        
        print(f"\n  📁 Session saved to: {self.output_dir}")
        print(f"     - {session_id}_final.json")
        print(f"     - {session_id}_report.md")
    
    def _save_report(self, path: Path, session_id: str, result: Dict):
        """Save human-readable markdown report (ENHANCED v2.0)"""
        
        trajectory = result.get('confidence_trajectory', [0.5])
        dissent_board = result.get('dissent_scoreboard', {})
        
        lines = [
            f"# Recursive Self-Intelligence Report v2.0",
            f"",
            f"**Session ID:** {session_id}",
            f"**Iterations:** {result.get('iterations_completed', 0)}",
            f"**Final Decision:** {result.get('decision', 'N/A')}",
            f"**Human Review Required:** {'Yes' if result.get('requires_human_review') else 'No'}",
            f"",
            f"## 📊 Confidence Convergence",
            f"",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Starting Confidence | {trajectory[0]:.2%} |",
            f"| Final Confidence | {result.get('confidence', 0):.2%} |",
            f"| Trajectory | {' → '.join(f'{c:.0%}' for c in trajectory)} |",
            f"| Confidence Updates | {len(result.get('confidence_updates', []))} |",
            f"",
            f"## 🔍 Active Schema Probing",
            f"",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Total Probes | {result.get('total_probes', 0)} |",
            f"| Verified | {result.get('recommendation', {}).get('probes_verified', 0)} |",
            f"",
        ]
        
        # Add probe details
        if self.all_probes:
            lines.append("### Probe Results")
            lines.append("")
            for probe in self.all_probes:
                status = "✅" if probe.verified and probe.confidence_impact > 0 else "⚠️" if probe.verified else "❌"
                lines.append(f"- {status} **{probe.probe_type}** `{probe.target}`: {probe.result}")
            lines.append("")
        
        lines.extend([
            f"## 📋 Dissent Resolution Tracking",
            f"",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Total Dissents | {dissent_board.get('total', 0)} |",
            f"| Critical Unresolved | {dissent_board.get('critical_unresolved', 0)} |",
            f"| Resolution Rate | {dissent_board.get('resolution_rate', 0):.0%} |",
            f"",
        ])
        
        # Add dissent details
        if dissent_board.get('high_persistence'):
            lines.append("### ⚠️ High-Persistence Dissents (appeared 2+ times)")
            lines.append("")
            for hp in dissent_board['high_persistence']:
                lines.append(f"- **{hp['status'].upper()}** ({hp['count']}x): {hp['content']}...")
            lines.append("")
        
        # Add escalation info
        if result.get('escalation_required'):
            lines.extend([
                f"## ⚠️ ESCALATION REQUIRED",
                f"",
                f"**Reasons:**",
            ])
            for reason in result.get('escalation_reasons', []):
                lines.append(f"- {reason}")
            lines.append("")
        
        lines.extend([
            f"## Semantic Traces ({len(self.all_traces)})",
            f""
        ])
        
        for trace in self.all_traces:
            lines.append(f"### Iteration {trace.iteration} - {trace.step}")
            lines.append(f"- **Thought:** {trace.thought}")
            lines.append(f"- **Observation:** {trace.observation}")
            lines.append(f"- **Confidence:** {trace.confidence:.2f}")
            if trace.confidence_impact != 0:
                lines.append(f"- **Impact:** {trace.confidence_impact:+.2f}")
            lines.append("")
        
        lines.extend([
            f"## Key Insights",
            ""
        ])
        for i, insight in enumerate(result.get('all_insights', []), 1):
            lines.append(f"{i}. {insight}")
        
        lines.extend([
            f"",
            f"## Council Deliberations ({len(self.all_deliberations)})",
            ""
        ])
        for i, delib in enumerate(self.all_deliberations, 1):
            lines.append(f"### Iteration {i}")
            lines.append(f"- Consensus: **{delib.consensus}** (confidence: {delib.consensus_confidence:.2f})")
            for vote in delib.votes:
                lines.append(f"  - {vote.model}: {vote.decision}")
        
        # Add confidence update log
        lines.extend([
            f"",
            f"## 📈 Confidence Update Log",
            f"",
            f"| Iteration | Source | Signal | Delta | Evidence |",
            f"|-----------|--------|--------|-------|----------|",
        ])
        for update in result.get('confidence_updates', [])[:20]:
            lines.append(f"| {update.get('iteration', '-')} | {update.get('source', '-')[:15]} | {update.get('signal_type', '-')} | {update.get('delta', 0):+.3f} | {update.get('evidence', '-')[:40]}... |")
        
        lines.extend([
            f"",
            f"## Final Recommendation",
            f"",
            f"```json",
            json.dumps(result.get('recommendation', {}), indent=2),
            f"```"
        ])
        
        with open(path, 'w') as f:
            f.write('\n'.join(lines))


# Legacy compatibility
class ExcelReasoningEngine(RecursiveSelfIntelligence):
    """Legacy wrapper for backward compatibility"""
    
    def __init__(self, knowledge_base: Dict[str, Any], 
                 provider: str = "openai",
                 model: str = None):
        super().__init__(knowledge_base, iterations=3)
        self.provider = provider
        self.model = model or get_default_model("openai_top")
    
    def reason_about_update(self, incoming_data: Dict[str, Any],
                           matcher_results: List[Dict]) -> Dict[str, Any]:
        """Legacy method - use analyze_and_plan for full RSI"""
        return {'reasoning': [], 'recommendation': matcher_results[0] if matcher_results else None}


# =============================================================================
# MAIN ORCHESTRATOR
# =============================================================================

class ExcelAutoUpdater:
    """
    Main orchestrator that ties all tools together.
    
    Now supports RSI v3.0 - THE 1000% ENGINE with:
    - Self-Resolving Dissent Engine
    - Metacognitive Probe Synthesis
    - Semantic Bridge
    - Sandbox Execution
    - LLM Verification Code Generation
    - Confidence-Gated Auto-Execute
    """
    
    def __init__(self, excel_path: Path, knowledge_path: Path,
                 mode: str = 'review',
                 use_ai: bool = True,
                 provider: str = 'openai',
                 rsi_iterations: int = 3,
                 use_rsi: bool = False,
                 use_rsi_v3: bool = False,
                 use_sandbox: bool = False):
        """
        Initialize the auto-updater.
        
        Args:
            excel_path: Path to the Excel file to update
            knowledge_path: Path to the analyzer output JSON
            mode: 'auto' (no approval), 'review' (human approval), 'plan' (just show plan)
            use_ai: Whether to use LLM for enhanced reasoning
            provider: LLM provider ('openai' or 'anthropic')
            rsi_iterations: Number of RSI iterations (default 3)
            use_rsi: Whether to use Recursive Self-Intelligence
        """
        self.excel_path = Path(excel_path)
        self.knowledge_path = Path(knowledge_path)
        self.mode = mode
        self.use_ai = use_ai
        self.use_rsi = use_rsi
        self.use_rsi_v3 = use_rsi_v3
        self.use_sandbox = use_sandbox
        self.rsi_iterations = rsi_iterations
        
        # Load knowledge base
        with open(knowledge_path, 'r') as f:
            self.knowledge = json.load(f)
        
        # Initialize tools
        self.ingester = DataIngester()
        self.matcher = SchemaMatcher(self.knowledge)
        self.planner = UpdatePlanner(self.knowledge, self.matcher)
        self.reviewer = HumanReview(mode='auto' if mode == 'auto' else 'cli')
        self.executor = Executor()
        self.validator = Validator()
        
        # Initialize RSI v3.0 engine if requested - THE 1000% ENGINE
        self.rsi_v3_engine = None
        if use_rsi_v3 and RSI_V3_AVAILABLE:
            logger.info("🧠 RSI v3.0 - THE 1000% ENGINE will be initialized per-update")
        elif use_rsi_v3 and not RSI_V3_AVAILABLE:
            logger.warning("RSI v3.0 requested but rsi_v3_engine.py not found. Falling back to v2.0")
            use_rsi = True
            self.use_rsi = True
            self.use_rsi_v3 = False
        
        # Initialize RSI v2.0 engine if requested (ENHANCED with excel_path for probing)
        if use_rsi and not use_rsi_v3:
            self.rsi_engine = RecursiveSelfIntelligence(
                self.knowledge,
                iterations=rsi_iterations,
                excel_path=self.excel_path  # Enable active schema probing!
            )
        else:
            self.rsi_engine = None
        
        if use_ai and not use_rsi and not use_rsi_v3:
            self.reasoning_engine = ExcelReasoningEngine(
                self.knowledge, 
                provider=provider
            )
        else:
            self.reasoning_engine = None
        
        logger.info(f"🚀 ExcelAutoUpdater initialized")
        logger.info(f"   Excel: {self.excel_path.name}")
        logger.info(f"   Knowledge: {self.knowledge_path.name}")
        logger.info(f"   Mode: {mode}")
        if use_rsi_v3:
            logger.info(f"   🧠 RSI v3.0 THE 1000% ENGINE: Enabled ({rsi_iterations} iterations)")
            logger.info(f"   ├─ Self-Resolving Dissents: ✓")
            logger.info(f"   ├─ Metacognitive Probes: ✓")
            logger.info(f"   ├─ Semantic Bridge: ✓")
            logger.info(f"   ├─ Sandbox Execution: {'✓' if use_sandbox else '○'}")
            logger.info(f"   └─ Confidence-Gated Auto-Execute: ✓")
        elif use_rsi:
            logger.info(f"   RSI v2.0: Enabled ({rsi_iterations} iterations)")
    
    def update(self, input_path: Path) -> Dict[str, Any]:
        """
        Run the full update pipeline.
        
        Args:
            input_path: Path to incoming data file
            
        Returns:
            Dictionary with results
        """
        input_path = Path(input_path)
        
        print("\n" + "=" * 70)
        print("🔄 EXCEL AUTO-UPDATER" + (" + RECURSIVE SELF-INTELLIGENCE" if self.use_rsi else ""))
        print("=" * 70)
        
        # Step 1: Ingest data
        print("\n📄 Step 1: Ingesting data...")
        data = self.ingester.ingest(input_path)
        print(f"   ✓ Parsed {data['row_count']} rows with {len(data['headers'])} columns")
        
        # Step 2: Match to schema
        print("\n🎯 Step 2: Matching to spreadsheet...")
        matches = self.matcher.match_data(data)
        
        if not matches:
            print("   ✗ No matches found!")
            return {'success': False, 'error': 'No matching sheets found'}
        
        best_match = matches[0]
        print(f"   ✓ Best match: {best_match['sheet']} (confidence: {best_match['confidence']:.2f})")
        print(f"   → {best_match['reasoning']}")
        
        # Step 3: Create plan
        print("\n📋 Step 3: Creating update plan...")
        plan = self.planner.create_plan(data, best_match, mode='append')
        print(f"   ✓ Plan created with {len(plan.targets)} updates")
        
        # Step 4: RECURSIVE SELF-INTELLIGENCE (if enabled)
        rsi_result = None
        
        # RSI v3.0 - THE 1000% ENGINE
        if self.use_rsi_v3 and RSI_V3_AVAILABLE:
            print("\n🧠 Step 4: RSI v3.0 - THE 1000% ENGINE")
            print("=" * 60)
            
            # Create RSI v3.0 engine with all components
            rsi_v3 = create_rsi_v3_engine(
                excel_path=self.excel_path,
                knowledge_base=self.knowledge,
                incoming_data=data,
                iterations=self.rsi_iterations
            )
            
            # Run the full v3.0 pipeline
            rsi_result = self._run_rsi_v3_pipeline(rsi_v3, data, matches, plan)
            
            # Check decision
            decision = rsi_result.get('decision', 'DEFER_TO_HUMAN')
            
            if decision == 'REJECT':
                print("\n❌ RSI v3.0 Decision: REJECT")
                print(f"   Confidence: {rsi_result.get('confidence', 0):.2%}")
                return {
                    'success': False,
                    'rsi_decision': 'REJECT',
                    'rsi_result': rsi_result
                }
            
            if decision == 'AUTO_EXECUTE':
                self.mode = 'auto'
                print(f"\n   ✓ RSI v3.0 AUTO_EXECUTE - all conditions met")
            elif decision == 'EXECUTE_WITH_MONITORING':
                self.mode = 'auto'
                print(f"\n   ✓ RSI v3.0 EXECUTE_WITH_MONITORING")
            elif not rsi_result.get('requires_human_review'):
                self.mode = 'auto'
                print(f"\n   ✓ RSI v3.0 confidence {rsi_result.get('confidence', 0):.2%} - auto-approving")
        
        # RSI v2.0 (legacy)
        elif self.use_rsi and self.rsi_engine:
            rsi_result = self.rsi_engine.analyze_and_plan(data, matches, plan)
            
            # Check RSI decision
            if rsi_result.get('decision') == 'REJECT':
                print("\n❌ RSI Decision: REJECT")
                print(f"   Confidence: {rsi_result.get('confidence', 0):.2%}")
                return {
                    'success': False,
                    'rsi_decision': 'REJECT',
                    'rsi_result': rsi_result
                }
            
            # If RSI says no human review needed and high confidence
            if not rsi_result.get('requires_human_review') and rsi_result.get('confidence', 0) >= 0.85:
                self.mode = 'auto'  # Override to auto-approve
                print(f"\n   ✓ RSI confidence {rsi_result.get('confidence', 0):.2%} - auto-approving")
        
        # Generate diff
        diff = self.planner.generate_diff(plan)
        
        # Step 5: Review (if not in plan-only mode)
        if self.mode == 'plan':
            print("\n" + diff)
            result_dict = {'success': True, 'plan': plan, 'mode': 'plan_only'}
            if rsi_result:
                result_dict['rsi_result'] = rsi_result
            return result_dict
        
        # Check if RSI recommends human review
        if rsi_result and rsi_result.get('requires_human_review'):
            print("\n👤 Step 5: Human Review (RSI recommended)...")
            print(f"   RSI Confidence: {rsi_result.get('confidence', 0):.2%}")
            print(f"   RSI Decision: {rsi_result.get('decision', 'N/A')}")
            approval = self.reviewer.request_approval(plan, diff)
        elif self.mode == 'auto':
            print("\n✓ Step 5: Auto-approved (RSI high confidence)")
            approval = ApprovalStatus.APPROVED
        else:
            print("\n👤 Step 5: Review...")
            approval = self.reviewer.request_approval(plan, diff)
        
        if approval != ApprovalStatus.APPROVED:
            print(f"   ✗ Update {approval.value}")
            return {'success': False, 'approval': approval.value}
        
        print(f"   ✓ Approved")
        
        # Step 6: Execute
        print("\n🔧 Step 6: Executing updates...")
        result = self.executor.execute(self.excel_path, plan)
        
        if not result.success:
            print(f"   ✗ Execution failed: {result.errors}")
            return {'success': False, 'result': result}
        
        print(f"   ✓ Applied {result.updates_applied} updates")
        print(f"   ✓ Output: {Path(result.output_path).name}")
        
        # Step 7: Validate
        print("\n✅ Step 7: Validating...")
        validation = self.validator.validate(
            self.excel_path,
            Path(result.output_path),
            plan
        )
        
        if not validation.valid:
            print(f"   ⚠ Validation issues: {validation.issues}")
        else:
            print(f"   ✓ All {validation.checks_passed} checks passed")
        
        # Create audit log
        audit = self.validator.create_audit_log(plan, result, validation)
        
        print("\n" + "=" * 70)
        print("✅ UPDATE COMPLETE")
        print("=" * 70)
        print(f"   Output file: {result.output_path}")
        print(f"   Backup: {result.backup_path}")
        print(f"   Audit log: audit_logs/{audit.id}.json")
        if rsi_result:
            print(f"   RSI logs: rsi_logs/")
            print(f"   RSI confidence: {rsi_result.get('confidence', 0):.2%}")
            print(f"   RSI insights: {rsi_result.get('total_insights', 0)}")
        
        return {
            'success': True,
            'result': result,
            'validation': validation,
            'audit_id': audit.id,
            'rsi_result': rsi_result
        }
    
    def _run_rsi_v3_pipeline(self, rsi_v3: 'RSIv3Engine', 
                              data: Dict, matches: List[Dict], 
                              plan: 'UpdatePlan') -> Dict[str, Any]:
        """
        Run the full RSI v3.0 pipeline - THE 1000% ENGINE.
        
        This orchestrates all v3.0 components:
        1. Self-Resolving Dissent Engine
        2. Metacognitive Probe Synthesis
        3. Semantic Bridge
        4. Sandbox Execution
        5. LLM Verification Code
        6. Confidence-Gated Auto-Execute
        """
        
        session_id = f"rsi_v3_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        all_dissents = []
        all_council_votes = []
        
        # Run the base RSI v2.0 iterations first to gather dissents
        print("\n  📊 Phase 1: Running base analysis iterations...")
        
        if self.rsi_engine is None:
            self.rsi_engine = RecursiveSelfIntelligence(
                self.knowledge,
                iterations=self.rsi_iterations,
                excel_path=self.excel_path
            )
        
        # Run standard RSI to collect dissents and council votes
        base_result = self.rsi_engine.analyze_and_plan(data, matches, plan)
        
        # Extract dissents from RSI result
        for delib in self.rsi_engine.all_deliberations:
            for vote in delib.votes:
                all_council_votes.append(asdict(vote))
                for point in vote.dissenting_points:
                    all_dissents.append({
                        'id': hashlib.md5(point.encode()).hexdigest()[:12],
                        'content': point,
                        'model': vote.model
                    })
        
        # Register probe results with SRDE
        for probe in self.rsi_engine.all_probes:
            rsi_v3.srde.register_probe_result(probe.target, {
                'verified': probe.verified,
                'result': probe.result,
                'confidence_impact': probe.confidence_impact
            })
        
        # === PHASE 2: SELF-RESOLVING DISSENT ENGINE ===
        print("\n  🔧 Phase 2: Self-Resolving Dissent Engine...")
        resolution_result = rsi_v3.run_phase_resolve_dissents(all_dissents)
        print(f"     Resolved: {resolution_result['resolved']}/{resolution_result['total']}")
        print(f"     Resolution rate: {resolution_result['resolution_rate']:.0%}")
        
        # Update confidence based on resolutions
        rsi_v3.running_confidence = self.rsi_engine.running_confidence
        for resolution in rsi_v3.all_resolutions:
            rsi_v3.running_confidence = min(1.0, max(0.0, 
                rsi_v3.running_confidence + resolution.confidence_impact))
        rsi_v3.confidence_trajectory.append(rsi_v3.running_confidence)
        
        # === PHASE 3: METACOGNITIVE PROBE SYNTHESIS ===
        print("\n  🔬 Phase 3: Metacognitive Probe Synthesis...")
        synthesized_tools = rsi_v3.run_phase_synthesize_probes(all_council_votes)
        
        if synthesized_tools:
            target_sheet = matches[0]['sheet'] if matches else 'Unknown'
            probe_results = rsi_v3.run_phase_execute_synthesized_probes(
                synthesized_tools, target_sheet
            )
            print(f"     Executed {len(probe_results)} synthesized probes")
        
        # === PHASE 4: SANDBOX VERIFICATION (if enabled) ===
        if self.use_sandbox and plan.targets:
            print("\n  📦 Phase 4: Sandbox Verification...")
            sandbox_result = rsi_v3.run_phase_sandbox_verification(plan)
            
            if sandbox_result and sandbox_result.verification_passed:
                print(f"     ✓ Sandbox verification PASSED")
                rsi_v3.running_confidence = min(1.0, rsi_v3.running_confidence + 0.15)
            elif sandbox_result:
                print(f"     ✗ Sandbox verification FAILED: {sandbox_result.issues}")
                rsi_v3.running_confidence = max(0.0, rsi_v3.running_confidence - 0.10)
        else:
            print("\n  📦 Phase 4: Sandbox Verification... SKIPPED (use --sandbox)")
        
        # === PHASE 5: LLM VERIFICATION CODE ===
        if plan.targets:
            print("\n  🤖 Phase 5: LLM Verification Code Generation...")
            target_sheet = matches[0]['sheet'] if matches else 'Unknown'
            column_mapping = {}  # Would come from planner
            insert_row = plan.targets[0].location.row if plan.targets else 1
            
            verification_results = rsi_v3.run_phase_llm_verification(
                target_sheet=target_sheet,
                update_count=len(plan.targets),
                column_mapping=column_mapping,
                insert_row=insert_row
            )
        
        rsi_v3.confidence_trajectory.append(rsi_v3.running_confidence)
        
        # === PHASE 6: CONFIDENCE-GATED FINAL DECISION ===
        print("\n  🏁 Phase 6: Confidence-Gated Final Decision...")
        
        # Build dissent scoreboard
        total_dissents = len(all_dissents)
        resolved_dissents = sum(1 for r in rsi_v3.all_resolutions 
                                if r.status.value == 'resolved')
        critical_unresolved = sum(1 for d in all_dissents 
                                  if 'critical' in d.get('content', '').lower())
        
        dissent_scoreboard = {
            'total': total_dissents,
            'resolved': resolved_dissents,
            'critical_unresolved': max(0, critical_unresolved - resolved_dissents),
            'resolution_rate': resolved_dissents / max(total_dissents, 1)
        }
        
        decision, reasoning = rsi_v3.run_phase_final_decision(dissent_scoreboard)
        
        # Save v3.0 report
        rsi_v3.save_report(session_id, {
            'decision': decision,
            'confidence': rsi_v3.running_confidence,
            'reasoning': reasoning,
            'base_result': {
                'decision': base_result.get('decision'),
                'confidence': base_result.get('confidence'),
                'total_insights': base_result.get('total_insights')
            }
        })
        
        # Print summary
        print("\n" + "=" * 60)
        print("🧠 RSI v3.0 - THE 1000% ENGINE COMPLETE")
        print("=" * 60)
        print(f"   Decision: {decision}")
        print(f"   Confidence: {rsi_v3.running_confidence:.0%}")
        print(f"   Trajectory: {' → '.join(f'{c:.0%}' for c in rsi_v3.confidence_trajectory)}")
        print(f"   Dissents resolved: {resolved_dissents}/{total_dissents}")
        print(f"   Tools synthesized: {len(rsi_v3.probe_factory.synthesized_tools)}")
        print(f"   Bridge coverage: {rsi_v3.semantic_bridge.get_bridge_summary()['coverage']:.0%}")
        if rsi_v3.sandbox_result:
            print(f"   Sandbox verified: {'✓' if rsi_v3.sandbox_result.verification_passed else '✗'}")
        print(f"   Auto-executable: {'YES' if reasoning.get('auto_executable') else 'NO'}")
        
        return {
            'decision': decision,
            'confidence': rsi_v3.running_confidence,
            'confidence_trajectory': rsi_v3.confidence_trajectory,
            'requires_human_review': not reasoning.get('auto_executable', False),
            'reasoning': reasoning,
            'dissent_scoreboard': dissent_scoreboard,
            'resolutions': len(rsi_v3.all_resolutions),
            'synthesized_tools': len(rsi_v3.probe_factory.synthesized_tools),
            'sandbox_verified': rsi_v3.sandbox_result.verification_passed if rsi_v3.sandbox_result else None,
            'base_result': base_result,
            'total_insights': base_result.get('total_insights', 0),
            'all_insights': base_result.get('all_insights', [])
        }


# =============================================================================
# CLI
# =============================================================================

def create_parser() -> argparse.ArgumentParser:
    """Create CLI argument parser"""
    parser = argparse.ArgumentParser(
        description='Excel Auto-Updater: AI-powered spreadsheet updates with Recursive Self-Intelligence',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-update with new Schwab statement
  %(prog)s --excel "Net Worth.xlsm" --knowledge "analysis.json" --input "schwab.csv"
  
  # Just show the update plan (no execution)
  %(prog)s --excel "file.xlsx" --knowledge "analysis.json" --input "data.csv" --mode plan
  
  # Auto-approve (no human review)
  %(prog)s --excel "file.xlsx" --knowledge "analysis.json" --input "data.csv" --mode auto
  
  # Use Recursive Self-Intelligence with 3 iterations
  %(prog)s --excel "file.xlsx" --knowledge "analysis.json" --input "data.csv" --rsi
  
  # RSI with 5 iterations
  %(prog)s --excel "file.xlsx" --knowledge "analysis.json" --input "data.csv" --rsi --rsi-iterations 5
  
  # Use Claude instead of GPT
  %(prog)s --excel "file.xlsx" --knowledge "analysis.json" --input "data.csv" --provider anthropic
        """
    )
    
    parser.add_argument(
        '--excel', '-e',
        required=True,
        help='Path to the Excel file to update'
    )
    
    parser.add_argument(
        '--knowledge', '-k',
        required=True,
        help='Path to the analyzer output JSON (knowledge base)'
    )
    
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Path to the incoming data file (CSV, JSON, TSV)'
    )
    
    parser.add_argument(
        '--mode', '-m',
        choices=['auto', 'review', 'plan'],
        default='plan',
        help='Mode: auto (no approval), review (human approval), plan (just show plan)'
    )
    
    parser.add_argument(
        '--rsi',
        action='store_true',
        help='Enable Recursive Self-Intelligence with semantic tracers, reasoning logs, and LLM councils'
    )
    
    parser.add_argument(
        '--rsi-iterations',
        type=int,
        default=3,
        help='Number of RSI iterations (default: 3)'
    )
    
    parser.add_argument(
        '--rsi-v3',
        action='store_true',
        help='Enable RSI v3.0 THE 1000%% ENGINE: Self-Resolving Dissents, Metacognitive Probes, Sandbox Verification, LLM Code Gen, Confidence-Gated Auto-Execute'
    )
    
    parser.add_argument(
        '--sandbox',
        action='store_true',
        help='Enable sandbox execution: copy Excel, apply changes, verify outcomes before committing'
    )
    
    parser.add_argument(
        '--no-ai',
        action='store_true',
        help='Disable AI reasoning (use rule-based matching only)'
    )
    
    parser.add_argument(
        '--provider',
        choices=['openai', 'anthropic'],
        default='openai',
        help='LLM provider for AI reasoning'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )
    
    return parser


def main():
    """Main entry point"""
    parser = create_parser()
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Validate paths
    excel_path = Path(args.excel)
    knowledge_path = Path(args.knowledge)
    input_path = Path(args.input)
    
    if not excel_path.exists():
        logger.error(f"Excel file not found: {excel_path}")
        return 1
    
    if not knowledge_path.exists():
        logger.error(f"Knowledge base not found: {knowledge_path}")
        logger.info("Run excel_analyzer.py first to generate the knowledge base")
        return 1
    
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        return 1
    
    try:
        # Initialize and run
        updater = ExcelAutoUpdater(
            excel_path=excel_path,
            knowledge_path=knowledge_path,
            mode=args.mode,
            use_ai=not args.no_ai,
            provider=args.provider,
            use_rsi=args.rsi,
            rsi_iterations=args.rsi_iterations,
            use_rsi_v3=args.rsi_v3,
            use_sandbox=args.sandbox
        )
        
        result = updater.update(input_path)
        
        return 0 if result.get('success') else 1
        
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        return 1
    except Exception as e:
        logger.exception(f"Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

