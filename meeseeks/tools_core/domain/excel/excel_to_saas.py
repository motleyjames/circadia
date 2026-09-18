#!/usr/bin/env python3
"""
Excel to SaaS Blueprint Generator
Reverse-engineers Excel workbooks into complete SaaS application specifications

Based on the SAAS MODE from 00_MODES_OF_THOUGHT.md, this tool extracts:
- PART 1: UI & Component Inventory (colors, fonts, component patterns)
- PART 2: Screen & Feature Breakdown (screen-by-screen specs)
- PART 3: User Workflows (UX) (step-by-step user journeys)
- PART 4: Inferred Data Model (database schema, API contracts)

Features:
- Deep extraction of formulas, dependencies, validation rules
- Placeholder formula analysis (e.g., ="Total SF" → required data source)
- UI component detection from cell styling
- Color palette and design token extraction
- Mermaid diagram generation for workflows
- TypeScript/Python schema generation
- Comprehensive SaaS blueprint output
"""

import openpyxl
import json
import re
import argparse
import logging
import sys
import zipfile
import subprocess
import shutil
import os
import time
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Load .env from current directory or parent directories
    load_dotenv()
    DOTENV_LOADED = True
except ImportError:
    DOTENV_LOADED = False

# Optional: LLM API support
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
    from tools_core.core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Comprehensive Excel functions list including financial functions
EXCEL_FUNCTIONS = {
    # Math & Trig
    'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'PRODUCT',
    'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'MEDIAN', 'MODE',
    'COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'COUNTBLANK',
    'MAX', 'MAXA', 'MIN', 'MINA', 'LARGE', 'SMALL',
    'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'MROUND', 'CEILING', 'FLOOR',
    'ABS', 'SQRT', 'POWER', 'EXP', 'LN', 'LOG', 'LOG10',
    'MOD', 'QUOTIENT', 'INT', 'TRUNC', 'SIGN',
    'RAND', 'RANDBETWEEN',
    'PI', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2',
    'DEGREES', 'RADIANS',
    'SUBTOTAL', 'AGGREGATE',
    
    # Financial Functions (comprehensive)
    'PMT', 'PPMT', 'IPMT', 'CUMIPMT', 'CUMPRINC',
    'PV', 'FV', 'NPV', 'XNPV',
    'RATE', 'NPER',
    'IRR', 'XIRR', 'MIRR',
    'SLN', 'SYD', 'DB', 'DDB', 'VDB',  # Depreciation
    'EFFECT', 'NOMINAL',
    'DOLLARDE', 'DOLLARFR',
    'DISC', 'INTRATE', 'RECEIVED',
    'PRICE', 'PRICEDISC', 'PRICEMAT',
    'YIELD', 'YIELDDISC', 'YIELDMAT',
    'ACCRINT', 'ACCRINTM',
    'COUPDAYBS', 'COUPDAYS', 'COUPDAYSNC', 'COUPNCD', 'COUPNUM', 'COUPPCD',
    'DURATION', 'MDURATION',
    'TBILLEQ', 'TBILLPRICE', 'TBILLYIELD',
    'ODDFPRICE', 'ODDFYIELD', 'ODDLPRICE', 'ODDLYIELD',
    'FVSCHEDULE', 'PDURATION', 'RRI',
    
    # Lookup & Reference
    'VLOOKUP', 'HLOOKUP', 'XLOOKUP',
    'INDEX', 'MATCH', 'XMATCH',
    'OFFSET', 'INDIRECT', 'ADDRESS',
    'ROW', 'ROWS', 'COLUMN', 'COLUMNS',
    'CHOOSE', 'LOOKUP',
    'TRANSPOSE', 'UNIQUE', 'FILTER', 'SORT', 'SORTBY',
    'HYPERLINK', 'FORMULATEXT',
    
    # Logical
    'IF', 'IFS', 'IFERROR', 'IFNA',
    'AND', 'OR', 'NOT', 'XOR',
    'TRUE', 'FALSE',
    'SWITCH', 'LET', 'LAMBDA',
    
    # Text
    'CONCATENATE', 'CONCAT', 'TEXTJOIN',
    'TEXT', 'VALUE', 'NUMBERVALUE',
    'LEN', 'LEFT', 'RIGHT', 'MID',
    'FIND', 'SEARCH', 'REPLACE', 'SUBSTITUTE',
    'TRIM', 'CLEAN', 'PROPER', 'UPPER', 'LOWER',
    'REPT', 'CHAR', 'CODE', 'UNICODE', 'UNICHAR',
    'EXACT', 'T', 'N',
    'DOLLAR', 'FIXED',
    
    # Date & Time
    'DATE', 'DATEVALUE', 'TIME', 'TIMEVALUE',
    'TODAY', 'NOW',
    'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'WEEKNUM', 'ISOWEEKNUM',
    'HOUR', 'MINUTE', 'SECOND',
    'DAYS', 'DAYS360', 'DATEDIF',
    'EDATE', 'EOMONTH',
    'NETWORKDAYS', 'NETWORKDAYS.INTL',
    'WORKDAY', 'WORKDAY.INTL',
    'YEARFRAC',
    
    # Statistical
    'STDEV', 'STDEV.S', 'STDEV.P', 'STDEVP',
    'VAR', 'VAR.S', 'VAR.P', 'VARP',
    'CORREL', 'COVAR', 'COVARIANCE.P', 'COVARIANCE.S',
    'SLOPE', 'INTERCEPT', 'RSQ', 'STEYX',
    'TREND', 'GROWTH', 'FORECAST', 'FORECAST.LINEAR',
    'PERCENTILE', 'PERCENTRANK', 'QUARTILE', 'RANK',
    'NORM.DIST', 'NORM.INV', 'NORM.S.DIST', 'NORM.S.INV',
    'T.DIST', 'T.INV', 'T.TEST',
    'CONFIDENCE', 'CONFIDENCE.NORM', 'CONFIDENCE.T',
    'GEOMEAN', 'HARMEAN', 'TRIMMEAN',
    'FREQUENCY', 'LINEST', 'LOGEST',
    
    # Information
    'ISBLANK', 'ISERROR', 'ISERR', 'ISNA', 'ISTEXT', 'ISNUMBER',
    'ISLOGICAL', 'ISREF', 'ISFORMULA', 'ISEVEN', 'ISODD',
    'TYPE', 'ERROR.TYPE', 'NA', 'INFO', 'CELL',
    
    # Database
    'DSUM', 'DAVERAGE', 'DCOUNT', 'DCOUNTA', 'DMAX', 'DMIN',
    'DGET', 'DPRODUCT', 'DSTDEV', 'DVAR',
    
    # Engineering
    'CONVERT', 'BIN2DEC', 'DEC2BIN', 'HEX2DEC', 'DEC2HEX',
    'COMPLEX', 'IMAGINARY', 'IMREAL', 'IMABS', 'IMSUM',
    
    # Array/Dynamic
    'SEQUENCE', 'RANDARRAY', 'MAKEARRAY', 'MAP', 'REDUCE', 'SCAN',
    'BYROW', 'BYCOL', 'WRAPCOLS', 'WRAPROWS', 'TOCOL', 'TOROW',
    'EXPAND', 'DROP', 'TAKE', 'CHOOSECOLS', 'CHOOSEROWS',
    'HSTACK', 'VSTACK', 'TEXTSPLIT', 'TEXTBEFORE', 'TEXTAFTER',
}


class ExcelAnalyzer:
    """Deep analysis tool for Excel files to extract all logic and formulas"""
    
    def __init__(self, file_path: str, sample_size: int = 1000):
        self.file_path = Path(file_path)
        self.file_name = self.file_path.name
        self.sample_size = sample_size
        
        if not self.file_path.exists():
            raise FileNotFoundError(f"Excel file not found: {self.file_path}")
        
        logger.info(f"Loading Excel file: {self.file_name}")
        
        try:
            logger.info("Loading workbook with formulas...")
            self.formula_workbook = openpyxl.load_workbook(
                file_path, 
                data_only=False, 
                keep_vba=True,
                keep_links=True
            )
        except Exception as e:
            logger.error(f"Failed to load workbook with formulas: {e}")
            raise
        
        try:
            logger.info("Loading workbook with calculated values...")
            self.value_workbook = openpyxl.load_workbook(
                file_path, 
                data_only=True
            )
        except Exception as e:
            logger.error(f"Failed to load workbook with values: {e}")
            raise
        
        self.analysis_results: Dict[str, Any] = {}
        
    def extract_all_logic(self) -> Dict[str, Any]:
        """Extract complete Excel logic and structure"""
        logger.info("Starting Deep Excel Analysis")
        
        analysis = {
            'file_info': self.extract_file_info(),
            'metadata': self.extract_metadata(),
            'sheets': {},
            'named_ranges': self.extract_named_ranges(),
            'vba_macros': self.check_for_vba(),
            'global_dependencies': {},
            'cross_sheet_references': {},
            'external_links': self.extract_external_links(),
            'summary_stats': {}
        }
        
        # Analyze each sheet
        total_sheets = len(self.formula_workbook.sheetnames)
        for idx, sheet_name in enumerate(self.formula_workbook.sheetnames, 1):
            logger.info(f"Analyzing sheet {idx}/{total_sheets}: {sheet_name}")
            sheet_analysis = self.analyze_sheet(sheet_name)
            analysis['sheets'][sheet_name] = sheet_analysis
            
        # Extract cross-sheet dependencies
        analysis['cross_sheet_references'] = self.extract_cross_sheet_references(analysis['sheets'])
        
        # Generate summary statistics
        analysis['summary_stats'] = self.generate_summary_stats(analysis)
        
        self.analysis_results = analysis
        return analysis
    
    def extract_file_info(self) -> Dict[str, Any]:
        """Extract basic file information"""
        return {
            'file_name': self.file_name,
            'file_path': str(self.file_path),
            'file_size_mb': round(self.file_path.stat().st_size / (1024 * 1024), 2),
            'analysis_timestamp': datetime.now().isoformat()
        }
    
    def extract_metadata(self) -> Dict[str, Any]:
        """Extract workbook metadata"""
        props = self.formula_workbook.properties
        return {
            'title': props.title,
            'subject': props.subject,
            'creator': props.creator,
            'created': str(props.created) if props.created else None,
            'modified': str(props.modified) if props.modified else None,
            'last_modified_by': props.lastModifiedBy,
            'description': props.description,
            'keywords': props.keywords,
            'category': props.category,
            'content_status': props.contentStatus,
            'revision': props.revision,
            'version': props.version
        }
    
    def analyze_sheet(self, sheet_name: str) -> Dict[str, Any]:
        """Deep analysis of a single sheet"""
        formula_sheet = self.formula_workbook[sheet_name]
        value_sheet = self.value_workbook[sheet_name]
        
        logger.debug(f"  - Extracting formulas...")
        formulas_data = self.extract_formulas(formula_sheet)
        
        logger.debug(f"  - Extracting values...")
        values = self.extract_values(value_sheet)
        
        logger.debug(f"  - Mapping dependencies...")
        dependencies = self.map_dependencies(formula_sheet)
        
        logger.debug(f"  - Extracting validation rules...")
        validation = self.extract_validation_rules(formula_sheet)
        
        logger.debug(f"  - Extracting conditional formatting...")
        conditional_fmt = self.extract_conditional_formatting(formula_sheet)
        
        logger.debug(f"  - Detecting tables and pivot tables...")
        tables = self.detect_tables(formula_sheet)
        
        logger.debug(f"  - Detecting charts...")
        charts = self.detect_charts(formula_sheet)
        
        return {
            'sheet_name': sheet_name,
            'formulas': formulas_data,
            'values': values,
            'cell_dependencies': dependencies,
            'data_validation': validation,
            'conditional_formatting': conditional_fmt,
            'tables': tables,
            'pivot_tables': self.detect_pivot_tables(formula_sheet),
            'charts': charts,
            'merged_cells': [str(range) for range in formula_sheet.merged_cells.ranges],
            'dimensions': {
                'max_row': formula_sheet.max_row,
                'max_column': formula_sheet.max_column,
                'used_range': f"A1:{openpyxl.utils.get_column_letter(formula_sheet.max_column)}{formula_sheet.max_row}"
            },
            'sheet_properties': {
                'sheet_state': formula_sheet.sheet_state,
                'tab_color': formula_sheet.sheet_properties.tabColor.rgb if formula_sheet.sheet_properties.tabColor else None
            },
            'statistics': {
                'total_formulas': len(formulas_data),
                'total_cells_with_values': len(values),
                'total_dependencies': len(dependencies),
                'total_validation_rules': len(validation),
                'total_conditional_formats': len(conditional_fmt)
            }
        }
    
    def extract_formulas(self, sheet) -> Dict[str, Any]:
        """Extract all formulas with their locations and details"""
        formulas_data = {}
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str) and cell.value.startswith('='):
                    formula_info = {
                        'formula': cell.value,
                        'row': cell.row,
                        'column': cell.column,
                        'column_letter': openpyxl.utils.get_column_letter(cell.column),
                        'data_type': cell.data_type,
                        'number_format': cell.number_format,
                        'has_style': cell.has_style,
                        'font': str(cell.font) if cell.font else None,
                        'fill': str(cell.fill) if cell.fill else None,
                        'border': str(cell.border) if cell.border else None,
                        'alignment': str(cell.alignment) if cell.alignment else None,
                        'protection': str(cell.protection) if cell.protection else None,
                        'references': self.parse_cell_references(cell.value),
                        'functions_used': self.extract_functions(cell.value)
                    }
                    formulas_data[cell.coordinate] = formula_info
        return formulas_data
    
    
    def extract_values(self, sheet) -> Dict[str, Any]:
        """Extract cell values (limited sample for large sheets)"""
        values = {}
        cell_count = 0
        
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    values[cell.coordinate] = {
                        'value': str(cell.value)[:500] if cell.value else None,
                        'data_type': cell.data_type,
                        'number_format': cell.number_format
                    }
                    cell_count += 1
                    
                    if cell_count >= self.sample_size:
                        values['_truncated'] = True
                        values['_truncated_at'] = cell_count
                        return values
        
        return values
    
    def map_dependencies(self, sheet) -> Dict[str, Any]:
        """Map formula dependencies between cells"""
        dependencies = defaultdict(dict)
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str) and cell.value.startswith('='):
                    references = self.parse_cell_references(cell.value)
                    if references:
                        dependencies[cell.coordinate] = {
                            'formula': cell.value,
                            'direct_references': references,
                            'reference_count': len(references)
                        }
        return dict(dependencies)
    
    def parse_cell_references(self, formula: str) -> List[str]:
        """Extract cell references from a formula"""
        if not formula:
            return []
        
        # Pattern for various cell reference formats
        patterns = [
            r"(?P<sheet>[\w\s]+!)?(?P<cell>\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)",
            r"(?P<sheet>'[^']+')!(?P<cell>\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)",
        ]
        
        references = []
        for pattern in patterns:
            matches = re.finditer(pattern, formula, re.IGNORECASE)
            for match in matches:
                ref = match.group(0)
                if ref and not ref.startswith('$'):
                    references.append(ref)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_refs = []
        for ref in references:
            if ref not in seen:
                seen.add(ref)
                unique_refs.append(ref)
        
        return unique_refs
    
    def extract_functions(self, formula: str) -> List[str]:
        """Extract Excel functions used in a formula"""
        if not formula:
            return []
        
        # Pattern for Excel functions (handles dotted names like NORM.DIST)
        pattern = r'\b([A-Z][A-Z0-9]*(?:\.[A-Z]+)*)\s*\('
        functions = re.findall(pattern, formula, re.IGNORECASE)
        
        # Filter to only include valid Excel functions
        valid_functions = [f.upper() for f in functions if f.upper() in EXCEL_FUNCTIONS]
        return list(set(valid_functions))
    
    def extract_named_ranges(self) -> Dict[str, Any]:
        """Extract all named ranges"""
        named_ranges = {}
        try:
            for name in self.formula_workbook.defined_names.definedName:
                named_ranges[name.name] = {
                    'value': name.value,
                    'scope': name.localSheetId,
                    'comment': name.comment,
                    'hidden': name.hidden
                }
        except AttributeError as e:
            logger.debug(f"No named ranges found or error accessing them: {e}")
        except Exception as e:
            logger.warning(f"Unexpected error extracting named ranges: {e}")
        
        return named_ranges
    
    def extract_validation_rules(self, sheet) -> Dict[str, Any]:
        """Extract data validation rules"""
        validation_rules = {}
        try:
            for dv in sheet.data_validations.dataValidation:
                cells = dv.cells
                if cells:
                    validation_rules[str(cells)] = {
                        'type': dv.type,
                        'formula1': dv.formula1,
                        'formula2': dv.formula2,
                        'operator': dv.operator,
                        'allow_blank': dv.allowBlank,
                        'show_dropdown': dv.showDropDown,
                        'show_error_message': dv.showErrorMessage,
                        'error_title': dv.errorTitle,
                        'error': dv.error,
                        'prompt_title': dv.promptTitle,
                        'prompt': dv.prompt
                    }
        except Exception as e:
            logger.debug(f"Error extracting validation rules: {e}")
        
        return validation_rules
    
    def extract_conditional_formatting(self, sheet) -> List[Dict[str, Any]]:
        """Extract conditional formatting rules"""
        cf_rules = []
        try:
            for cf in sheet.conditional_formatting:
                rule_info = {
                    'cells': str(cf.cells),
                    'rules': []
                }
                for rule in cf.cfRule:
                    rule_data = {
                        'type': rule.type,
                        'priority': rule.priority,
                        'formula': list(rule.formula) if hasattr(rule, 'formula') and rule.formula else None,
                        'operator': rule.operator if hasattr(rule, 'operator') else None,
                        'text': rule.text if hasattr(rule, 'text') else None,
                        'dxf_id': rule.dxfId if hasattr(rule, 'dxfId') else None
                    }
                    rule_info['rules'].append(rule_data)
                cf_rules.append(rule_info)
        except Exception as e:
            logger.debug(f"Error extracting conditional formatting: {e}")
        
        return cf_rules
    
    def detect_tables(self, sheet) -> List[Dict[str, Any]]:
        """Detect Excel tables in the sheet"""
        tables = []
        try:
            if hasattr(sheet, 'tables'):
                for table in sheet.tables.values():
                    tables.append({
                        'name': table.displayName,
                        'ref': table.ref,
                        'table_style': table.tableStyleInfo.name if table.tableStyleInfo else None,
                        'totals_row': table.totalsRowCount > 0 if hasattr(table, 'totalsRowCount') and table.totalsRowCount else False
                    })
        except Exception as e:
            logger.debug(f"Error detecting tables: {e}")
        
        return tables
    
    def detect_pivot_tables(self, sheet) -> List[Dict[str, Any]]:
        """Detect pivot tables in the sheet"""
        pivot_tables = []
        try:
            if hasattr(sheet, '_pivots'):
                for pivot in sheet._pivots:
                    pivot_tables.append({
                        'location': str(pivot.location) if hasattr(pivot, 'location') else 'Unknown',
                        'cache_id': pivot.cacheId if hasattr(pivot, 'cacheId') else None
                    })
        except Exception as e:
            logger.debug(f"Error detecting pivot tables: {e}")
        
        return pivot_tables
    
    def detect_charts(self, sheet) -> List[Dict[str, Any]]:
        """Detect charts in the sheet"""
        charts = []
        try:
            if hasattr(sheet, '_charts'):
                for chart in sheet._charts:
                    chart_info = {
                        'type': type(chart).__name__,
                        'title': str(chart.title) if hasattr(chart, 'title') and chart.title else None,
                    }
                    charts.append(chart_info)
        except Exception as e:
            logger.debug(f"Error detecting charts: {e}")
        
        return charts
    
    def check_for_vba(self) -> Dict[str, Any]:
        """Check if the workbook contains VBA macros"""
        vba_info = {
            'has_vba': False,
            'vba_detected': False,
            'message': None
        }
        
        try:
            if self.formula_workbook.vba_archive:
                vba_info['has_vba'] = True
                vba_info['vba_detected'] = True
                vba_info['message'] = "VBA macros detected in workbook"
                logger.info("VBA macros detected in workbook")
        except AttributeError:
            vba_info['message'] = "No VBA macros detected"
        except Exception as e:
            vba_info['message'] = f"Unable to check for VBA: {e}"
            logger.warning(f"Unable to check for VBA macros: {e}")
        
        return vba_info
    
    def extract_vba_code(self, output_dir: Optional[Path] = None) -> Dict[str, str]:
        """Extract VBA code from the workbook and save to files"""
        if output_dir is None:
            output_dir = Path('.')
        
        vba_modules = {}
        
        try:
            if not self.formula_workbook.vba_archive:
                logger.info("No VBA archive found in workbook")
                return vba_modules
            
            # Read the Excel file as a zip to extract VBA
            with zipfile.ZipFile(str(self.file_path), 'r') as xlsx_zip:
                # Look for vbaProject.bin
                vba_files = [f for f in xlsx_zip.namelist() if 'vbaProject' in f or f.endswith('.bin')]
                
                for vba_file in vba_files:
                    try:
                        vba_content = xlsx_zip.read(vba_file)
                        # Try to extract readable VBA code from the binary
                        extracted = self._extract_vba_from_binary(vba_content)
                        if extracted:
                            vba_modules.update(extracted)
                    except Exception as e:
                        logger.debug(f"Could not extract VBA from {vba_file}: {e}")
            
            # Also try using openpyxl's vba_archive directly
            if hasattr(self.formula_workbook, 'vba_archive') and self.formula_workbook.vba_archive:
                try:
                    for name in self.formula_workbook.vba_archive.namelist():
                        if name.endswith('.bas') or name.endswith('.cls') or name.endswith('.frm'):
                            content = self.formula_workbook.vba_archive.read(name)
                            try:
                                decoded = content.decode('utf-8', errors='ignore')
                                module_name = Path(name).stem
                                vba_modules[module_name] = decoded
                            except Exception:
                                pass
                except Exception as e:
                    logger.debug(f"Error reading VBA archive: {e}")
            
            # Save extracted VBA to files
            if vba_modules:
                # Create a smart filename based on the Excel file
                base_name = self.file_path.stem.replace(' ', '_')
                vba_output_path = output_dir / f"{base_name}_VBA_Code.vb"
                
                with open(vba_output_path, 'w', encoding='utf-8') as f:
                    f.write(f"' VBA Code extracted from: {self.file_name}\n")
                    f.write(f"' Extraction Date: {datetime.now().isoformat()}\n")
                    f.write("' " + "=" * 70 + "\n\n")
                    
                    for module_name, code in vba_modules.items():
                        f.write(f"' {'=' * 70}\n")
                        f.write(f"' MODULE: {module_name}\n")
                        f.write(f"' {'=' * 70}\n\n")
                        f.write(code)
                        f.write("\n\n")
                
                logger.info(f"VBA code extracted to: {vba_output_path}")
            else:
                # Even if we can't decode, save info about VBA presence
                base_name = self.file_path.stem.replace(' ', '_')
                vba_output_path = output_dir / f"{base_name}_VBA_Info.txt"
                
                with open(vba_output_path, 'w', encoding='utf-8') as f:
                    f.write(f"VBA Information for: {self.file_name}\n")
                    f.write(f"Extraction Date: {datetime.now().isoformat()}\n")
                    f.write("=" * 70 + "\n\n")
                    f.write("VBA macros are present in this workbook but could not be fully decoded.\n")
                    f.write("The workbook contains a vbaProject.bin file.\n\n")
                    f.write("To view the VBA code:\n")
                    f.write("1. Open the Excel file in Microsoft Excel\n")
                    f.write("2. Press Alt+F11 to open the VBA Editor\n")
                    f.write("3. Navigate through the Project Explorer to view modules\n")
                
                logger.info(f"VBA info saved to: {vba_output_path}")
                
        except Exception as e:
            logger.warning(f"Error extracting VBA: {e}")
        
        return vba_modules
    
    def _extract_vba_from_binary(self, binary_content: bytes) -> Dict[str, str]:
        """Attempt to extract readable VBA code from binary content"""
        modules = {}
        
        try:
            # Try to find readable strings in the binary
            # VBA code often contains readable ASCII/UTF-8 sequences
            content_str = binary_content.decode('latin-1', errors='ignore')
            
            # Look for common VBA patterns
            vba_patterns = [
                r'(Sub\s+\w+\([^)]*\).*?End Sub)',
                r'(Function\s+\w+\([^)]*\).*?End Function)',
                r'(Private\s+Sub\s+\w+\([^)]*\).*?End Sub)',
                r'(Public\s+Sub\s+\w+\([^)]*\).*?End Sub)',
            ]
            
            extracted_code = []
            for pattern in vba_patterns:
                matches = re.findall(pattern, content_str, re.DOTALL | re.IGNORECASE)
                extracted_code.extend(matches)
            
            if extracted_code:
                modules['ExtractedCode'] = '\n\n'.join(extracted_code)
        except Exception as e:
            logger.debug(f"Binary VBA extraction failed: {e}")
        
        return modules
    
    def extract_external_links(self) -> List[Dict[str, Any]]:
        """Extract external links and references"""
        external_links = []
        
        try:
            for sheet_name in self.formula_workbook.sheetnames:
                sheet = self.formula_workbook[sheet_name]
                for row in sheet.iter_rows():
                    for cell in row:
                        if cell.value and isinstance(cell.value, str) and '[' in cell.value:
                            pattern = r'\[([^\]]+)\]'
                            matches = re.findall(pattern, cell.value)
                            for match in matches:
                                external_links.append({
                                    'sheet': sheet_name,
                                    'cell': cell.coordinate,
                                    'external_file': match,
                                    'formula': cell.value
                                })
        except Exception as e:
            logger.warning(f"Error extracting external links: {e}")
        
        return external_links
    
    def extract_cross_sheet_references(self, sheets_analysis: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        """Extract references between sheets"""
        cross_refs = defaultdict(list)
        
        for sheet_name, sheet_data in sheets_analysis.items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                references = formula_data.get('references', [])
                for ref in references:
                    if '!' in ref:
                        target_sheet = ref.split('!')[0].strip("'")
                        if target_sheet != sheet_name:
                            cross_refs[sheet_name].append({
                                'source_cell': cell,
                                'target_sheet': target_sheet,
                                'target_reference': ref,
                                'formula': formula_data['formula']
                            })
        
        return dict(cross_refs)
    
    def generate_summary_stats(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Generate summary statistics"""
        stats = {
            'total_sheets': len(analysis['sheets']),
            'total_formulas': sum(sheet['statistics']['total_formulas'] for sheet in analysis['sheets'].values()),
            'total_named_ranges': len(analysis['named_ranges']),
            'has_vba_macros': analysis['vba_macros']['has_vba'],
            'has_external_links': len(analysis['external_links']) > 0,
            'total_external_links': len(analysis['external_links']),
            'sheets_with_cross_references': len(analysis['cross_sheet_references']),
            'most_complex_sheet': None,
            'formula_complexity_score': 0,
            'unique_functions_used': [],
            'function_usage_counts': {}
        }
        
        # Collect all functions used
        all_functions = []
        for sheet_data in analysis['sheets'].values():
            for formula_data in sheet_data.get('formulas', {}).values():
                all_functions.extend(formula_data.get('functions_used', []))
        
        stats['unique_functions_used'] = sorted(set(all_functions))
        stats['function_usage_counts'] = {f: all_functions.count(f) for f in set(all_functions)}
        
        # Find most complex sheet
        max_formulas = 0
        for sheet_name, sheet_data in analysis['sheets'].items():
            formula_count = sheet_data['statistics']['total_formulas']
            if formula_count > max_formulas:
                max_formulas = formula_count
                stats['most_complex_sheet'] = sheet_name
        
        stats['formula_complexity_score'] = self.calculate_complexity_score(analysis)
        
        return stats
    
    def calculate_complexity_score(self, analysis: Dict[str, Any]) -> int:
        """Calculate a complexity score for the workbook"""
        score = 0
        
        # Base score from formula count
        total_formulas = sum(sheet['statistics']['total_formulas'] for sheet in analysis['sheets'].values())
        score += total_formulas * 1
        
        # Add points for named ranges
        score += len(analysis['named_ranges']) * 5
        
        # Add points for VBA
        if analysis['vba_macros']['has_vba']:
            score += 100
        
        # Add points for external links
        score += len(analysis['external_links']) * 10
        
        # Add points for cross-sheet references
        score += len(analysis['cross_sheet_references']) * 15
        
        # Add points for complex functions
        complex_functions = {'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH', 
                           'INDIRECT', 'OFFSET', 'IRR', 'XIRR', 'NPV', 'XNPV'}
        for sheet_data in analysis['sheets'].values():
            for formula_data in sheet_data.get('formulas', {}).values():
                for func in formula_data.get('functions_used', []):
                    if func in complex_functions:
                        score += 3
        
        return score
    
    def export_to_json(self, output_path: Optional[str] = None) -> str:
        """Export analysis to JSON"""
        if not self.analysis_results:
            self.extract_all_logic()
        
        if output_path is None:
            output_path = str(self.file_path.stem) + "_analysis.json"
        
        logger.info(f"Exporting analysis to {output_path}...")
        
        def clean_for_json(obj):
            if isinstance(obj, (dict, defaultdict)):
                return {k: clean_for_json(v) for k, v in obj.items()}
            elif isinstance(obj, (list, tuple)):
                return [clean_for_json(item) for item in obj]
            elif hasattr(obj, '__dict__'):
                return str(obj)
            else:
                return obj
        
        cleaned_results = clean_for_json(self.analysis_results)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(cleaned_results, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Analysis exported successfully to {output_path}")
        return output_path
    
    def generate_report(self, output_path: Optional[str] = None) -> str:
        """Generate a human-readable report"""
        if not self.analysis_results:
            self.extract_all_logic()
        
        if output_path is None:
            output_path = str(self.file_path.stem) + "_report.txt"
        
        logger.info(f"Generating report to {output_path}...")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write(f"EXCEL ANALYSIS REPORT\n")
            f.write(f"File: {self.file_name}\n")
            f.write(f"Analysis Date: {self.analysis_results['file_info']['analysis_timestamp']}\n")
            f.write("=" * 80 + "\n\n")
            
            # File Information
            f.write("FILE INFORMATION\n")
            f.write("-" * 40 + "\n")
            for key, value in self.analysis_results['file_info'].items():
                f.write(f"  {key}: {value}\n")
            f.write("\n")
            
            # Summary Statistics
            f.write("SUMMARY STATISTICS\n")
            f.write("-" * 40 + "\n")
            stats = self.analysis_results['summary_stats']
            f.write(f"  Total Sheets: {stats['total_sheets']}\n")
            f.write(f"  Total Formulas: {stats['total_formulas']}\n")
            f.write(f"  Total Named Ranges: {stats['total_named_ranges']}\n")
            f.write(f"  Has VBA Macros: {stats['has_vba_macros']}\n")
            f.write(f"  Has External Links: {stats['has_external_links']}\n")
            f.write(f"  Complexity Score: {stats['formula_complexity_score']}\n")
            f.write(f"  Most Complex Sheet: {stats['most_complex_sheet']}\n")
            f.write("\n")
            
            # Functions Used
            f.write("EXCEL FUNCTIONS USED\n")
            f.write("-" * 40 + "\n")
            if stats.get('function_usage_counts'):
                sorted_funcs = sorted(stats['function_usage_counts'].items(), 
                                     key=lambda x: x[1], reverse=True)
                for func, count in sorted_funcs[:20]:
                    f.write(f"  {func}: {count} occurrences\n")
                if len(sorted_funcs) > 20:
                    f.write(f"  ... and {len(sorted_funcs) - 20} more functions\n")
            else:
                f.write("  No Excel functions detected\n")
            f.write("\n")
            
            # Sheet Details
            f.write("SHEET ANALYSIS\n")
            f.write("-" * 40 + "\n")
            for sheet_name, sheet_data in self.analysis_results['sheets'].items():
                f.write(f"\n  Sheet: {sheet_name}\n")
                f.write(f"    Dimensions: {sheet_data['dimensions']['used_range']}\n")
                f.write(f"    Total Formulas: {sheet_data['statistics']['total_formulas']}\n")
                f.write(f"    Total Dependencies: {sheet_data['statistics']['total_dependencies']}\n")
                f.write(f"    Validation Rules: {sheet_data['statistics']['total_validation_rules']}\n")
                f.write(f"    Conditional Formats: {sheet_data['statistics']['total_conditional_formats']}\n")
                
                if sheet_data['formulas']:
                    f.write(f"    Sample Formulas (first 5):\n")
                    for i, (cell, formula) in enumerate(list(sheet_data['formulas'].items())[:5]):
                        formula_text = formula['formula'][:60]
                        if len(formula['formula']) > 60:
                            formula_text += "..."
                        f.write(f"      {cell}: {formula_text}\n")
            
            f.write("\n" + "=" * 80 + "\n")
            f.write("END OF REPORT\n")
        
        logger.info(f"Report generated successfully to {output_path}")
        return output_path
    
    def generate_mermaid_logic(self, output_path: Optional[str] = None) -> str:
        """Generate a Mermaid diagram showing workbook logic and dependencies"""
        if not self.analysis_results:
            self.extract_all_logic()
        
        if output_path is None:
            base_name = self.file_path.stem.replace(' ', '_')
            output_path = f"{base_name}_Logic_Diagram.md"
        
        logger.info(f"Generating Mermaid logic diagram to {output_path}...")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# Logic Diagram: {self.file_name}\n\n")
            f.write(f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n\n")
            
            # Overview section
            f.write("## Workbook Overview\n\n")
            stats = self.analysis_results['summary_stats']
            f.write(f"- **Total Sheets:** {stats['total_sheets']}\n")
            f.write(f"- **Total Formulas:** {stats['total_formulas']}\n")
            f.write(f"- **Has VBA Macros:** {stats['has_vba_macros']}\n")
            f.write(f"- **Complexity Score:** {stats['formula_complexity_score']}\n\n")
            
            # Sheet Structure Diagram
            f.write("## Sheet Structure\n\n")
            f.write("```mermaid\n")
            f.write("graph TB\n")
            f.write(f"    subgraph WORKBOOK[\"{self.file_name}\"]\n")
            
            for sheet_name in self.analysis_results['sheets'].keys():
                safe_name = self._sanitize_mermaid_id(sheet_name)
                sheet_data = self.analysis_results['sheets'][sheet_name]
                formula_count = sheet_data['statistics']['total_formulas']
                f.write(f"        {safe_name}[\"{sheet_name}<br/>📊 {formula_count} formulas\"]\n")
            
            f.write("    end\n")
            
            # Add cross-sheet references
            cross_refs = self.analysis_results.get('cross_sheet_references', {})
            added_edges = set()
            for source_sheet, refs in cross_refs.items():
                for ref in refs:
                    target_sheet = ref['target_sheet']
                    edge_key = f"{source_sheet}->{target_sheet}"
                    if edge_key not in added_edges:
                        safe_source = self._sanitize_mermaid_id(source_sheet)
                        safe_target = self._sanitize_mermaid_id(target_sheet)
                        f.write(f"    {safe_source} -->|references| {safe_target}\n")
                        added_edges.add(edge_key)
            
            f.write("```\n\n")
            
            # Function Usage Diagram
            if stats.get('function_usage_counts'):
                f.write("## Excel Functions Used\n\n")
                f.write("```mermaid\n")
                f.write("pie title Function Distribution\n")
                
                sorted_funcs = sorted(
                    stats['function_usage_counts'].items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:10]
                
                for func, count in sorted_funcs:
                    f.write(f"    \"{func}\" : {count}\n")
                
                f.write("```\n\n")
            
            # Per-sheet detailed flow diagrams
            f.write("## Sheet Details\n\n")
            
            for sheet_name, sheet_data in self.analysis_results['sheets'].items():
                formulas = sheet_data.get('formulas', {})
                if not formulas:
                    continue
                
                f.write(f"### {sheet_name}\n\n")
                f.write(f"- **Dimensions:** {sheet_data['dimensions']['used_range']}\n")
                f.write(f"- **Formulas:** {sheet_data['statistics']['total_formulas']}\n")
                f.write(f"- **Dependencies:** {sheet_data['statistics']['total_dependencies']}\n\n")
                
                # Create a dependency flowchart for this sheet (limit to top 20 formulas)
                if len(formulas) > 0:
                    f.write("#### Formula Dependencies\n\n")
                    f.write("```mermaid\n")
                    f.write("flowchart LR\n")
                    
                    # Collect unique nodes and edges
                    nodes = set()
                    edges = []
                    
                    formula_items = list(formulas.items())[:30]  # Limit for readability
                    
                    for cell, formula_data in formula_items:
                        safe_cell = self._sanitize_mermaid_id(cell)
                        nodes.add((safe_cell, cell))
                        
                        refs = formula_data.get('references', [])[:5]  # Limit refs per cell
                        for ref in refs:
                            # Skip external references for the diagram
                            if '!' in ref and not ref.startswith("'"):
                                continue
                            safe_ref = self._sanitize_mermaid_id(ref.split('!')[-1] if '!' in ref else ref)
                            nodes.add((safe_ref, ref.split('!')[-1] if '!' in ref else ref))
                            edges.append((safe_ref, safe_cell))
                    
                    # Write nodes with functions info
                    for safe_id, display_name in nodes:
                        # Check if this is a formula cell
                        if display_name in formulas:
                            funcs = formulas[display_name].get('functions_used', [])
                            if funcs:
                                func_str = ', '.join(funcs[:3])
                                f.write(f"    {safe_id}[[\"{display_name}<br/>{func_str}\"]]\n")
                            else:
                                f.write(f"    {safe_id}([\"{display_name}\"])\n")
                        else:
                            f.write(f"    {safe_id}[\"{display_name}\"]\n")
                    
                    # Write edges
                    for source, target in edges[:50]:  # Limit edges
                        f.write(f"    {source} --> {target}\n")
                    
                    f.write("```\n\n")
                    
                    if len(formulas) > 30:
                        f.write(f"*Note: Showing 30 of {len(formulas)} formulas for readability*\n\n")
                
                # Show sample formulas
                f.write("#### Sample Formulas\n\n")
                f.write("| Cell | Formula | Functions |\n")
                f.write("|------|---------|----------|\n")
                
                for cell, formula_data in list(formulas.items())[:10]:
                    formula = formula_data['formula'][:50]
                    if len(formula_data['formula']) > 50:
                        formula += "..."
                    formula = formula.replace('|', '\\|')
                    funcs = ', '.join(formula_data.get('functions_used', [])[:3])
                    f.write(f"| {cell} | `{formula}` | {funcs} |\n")
                
                f.write("\n")
            
            # Data Flow Summary
            f.write("## Data Flow Summary\n\n")
            f.write("```mermaid\n")
            f.write("flowchart TD\n")
            f.write("    subgraph INPUT[\"📥 Input Data\"]\n")
            
            # Identify input sheets (fewer formulas, more raw data)
            input_sheets = []
            output_sheets = []
            for sheet_name, sheet_data in self.analysis_results['sheets'].items():
                formula_ratio = sheet_data['statistics']['total_formulas'] / max(sheet_data['statistics']['total_cells_with_values'], 1)
                if formula_ratio < 0.3:
                    input_sheets.append(sheet_name)
                else:
                    output_sheets.append(sheet_name)
            
            for sheet in input_sheets[:5]:
                safe_name = self._sanitize_mermaid_id(sheet)
                f.write(f"        {safe_name}_in[\"{sheet}\"]\n")
            
            f.write("    end\n\n")
            
            f.write("    subgraph PROCESS[\"⚙️ Processing\"]\n")
            if stats.get('unique_functions_used'):
                funcs = stats['unique_functions_used'][:8]
                for i, func in enumerate(funcs):
                    f.write(f"        func{i}[[\"{func}\"]]\n")
            f.write("    end\n\n")
            
            f.write("    subgraph OUTPUT[\"📤 Output/Results\"]\n")
            for sheet in output_sheets[:5]:
                safe_name = self._sanitize_mermaid_id(sheet)
                f.write(f"        {safe_name}_out[\"{sheet}\"]\n")
            f.write("    end\n\n")
            
            f.write("    INPUT --> PROCESS --> OUTPUT\n")
            f.write("```\n\n")
            
            # External links if any
            if self.analysis_results.get('external_links'):
                f.write("## External Links\n\n")
                f.write("| Sheet | Cell | External File |\n")
                f.write("|-------|------|---------------|\n")
                for link in self.analysis_results['external_links'][:20]:
                    f.write(f"| {link['sheet']} | {link['cell']} | {link['external_file']} |\n")
                f.write("\n")
        
        logger.info(f"Mermaid logic diagram generated successfully to {output_path}")
        return output_path
    
    def _sanitize_mermaid_id(self, text: str) -> str:
        """Convert text to a valid Mermaid node ID"""
        # Remove or replace characters that cause issues in Mermaid
        sanitized = re.sub(r'[^a-zA-Z0-9]', '_', text)
        # Ensure it starts with a letter
        if sanitized and sanitized[0].isdigit():
            sanitized = 'n' + sanitized
        return sanitized or 'node'
    
    def validate_with_ai(self, output_dir: Optional[Path] = None, 
                         iterations: int = 3,
                         model: str = None,
                         provider: str = "openai") -> List[str]:
        """
        Use LLM to perform deep semantic validation and analysis of the Excel file.
        
        Runs multiple iterations, each building on previous insights.
        Outputs semantic tracing and reasoning logs.
        
        Args:
            output_dir: Directory for validation output files
            iterations: Number of validation iterations (default: 3)
            model: LLM model to use
            provider: API provider ('openai' or 'anthropic')
        
        Returns:
            List of generated validation file paths
        """
        if model is None:
            model = get_default_model("openai_top")
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        # ============================================================
        # API KEY LOADING (from .env or environment)
        # ============================================================
        api_key = None
        
        if DOTENV_LOADED:
            logger.debug("Loaded environment from .env file")
        
        if provider == "openai":
            # Look for OPENAI_API_KEY in environment (loaded from .env or shell)
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                logger.error("OPENAI_API_KEY not found in environment or .env file")
                logger.info("Add to .env: OPENAI_API_KEY=sk-your-key-here")
                logger.info("Or set: export OPENAI_API_KEY='sk-your-key-here'")
                return []
            if not OPENAI_AVAILABLE:
                logger.error("openai package not installed. Run: pip install openai")
                return []
            logger.info(f"Using OpenAI API with model: {model}")
            
        elif provider == "anthropic":
            # Look for ANTHROPIC_API_KEY in environment (loaded from .env or shell)
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                logger.error("ANTHROPIC_API_KEY not found in environment or .env file")
                logger.info("Add to .env: ANTHROPIC_API_KEY=sk-ant-your-key-here")
                return []
            if not ANTHROPIC_AVAILABLE:
                logger.error("anthropic package not installed. Run: pip install anthropic")
                return []
            logger.info(f"Using Anthropic API with model: {model}")
        
        # ============================================================
        
        base_name = self.file_path.stem.replace(' ', '_')
        generated_files = []
        
        # Prepare analysis summary for the LLM
        analysis_summary = self._prepare_analysis_for_llm()
        
        # Store iteration results for building context
        iteration_results = []
        
        logger.info(f"Starting AI validation with {iterations} iterations using {provider}/{model}")
        
        for iteration in range(1, iterations + 1):
            logger.info(f"\n{'='*60}")
            logger.info(f"VALIDATION ITERATION {iteration}/{iterations}")
            logger.info(f"{'='*60}")
            
            # Build prompt with previous iteration context
            prompt = self._build_validation_prompt(
                analysis_summary, 
                iteration, 
                iterations,
                iteration_results
            )
            
            # Call LLM
            try:
                response = self._call_llm(prompt, provider, model, api_key)
                
                if response:
                    # Run LLM Judge to evaluate this iteration
                    logger.info(f"  → Running LLM Judge evaluation...")
                    judge_response = self._run_llm_judge(
                        iteration, response, iteration_results, 
                        provider, model, api_key
                    )
                    
                    iteration_results.append({
                        'iteration': iteration,
                        'response': response,
                        'judge_evaluation': judge_response,
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    # Save iteration output (includes judge evaluation)
                    output_file = output_dir / f"{base_name}_AI_Validation_Iteration_{iteration}.md"
                    self._save_validation_output_with_judge(
                        output_file, iteration, iterations, response, prompt, judge_response
                    )
                    generated_files.append(str(output_file))
                    
                    logger.info(f"  ✓ Saved: {output_file.name}")
                else:
                    logger.warning(f"  ✗ No response for iteration {iteration}")
                    
            except Exception as e:
                logger.error(f"  ✗ Error in iteration {iteration}: {e}")
        
        # Generate final consolidated report
        if iteration_results:
            final_report = output_dir / f"{base_name}_AI_Validation_FINAL.md"
            self._save_final_validation_report(final_report, iteration_results, analysis_summary)
            generated_files.append(str(final_report))
            logger.info(f"\n✓ Final validation report: {final_report.name}")
        
        return generated_files
    
    def _prepare_analysis_for_llm(self) -> str:
        """Prepare a condensed analysis summary for the LLM prompt"""
        analysis = self.analysis_results
        stats = analysis['summary_stats']
        
        summary = f"""
## Excel File Analysis Summary

**File:** {analysis['file_info']['file_name']}
**Size:** {analysis['file_info']['file_size_mb']} MB
**Analysis Date:** {analysis['file_info']['analysis_timestamp']}

### Statistics
- Total Sheets: {stats['total_sheets']}
- Total Formulas: {stats['total_formulas']}
- Total Named Ranges: {stats['total_named_ranges']}
- Has VBA Macros: {stats['has_vba_macros']}
- Has External Links: {stats['has_external_links']}
- Complexity Score: {stats['formula_complexity_score']}
- Most Complex Sheet: {stats['most_complex_sheet']}

### Functions Used
"""
        if stats.get('function_usage_counts'):
            for func, count in sorted(stats['function_usage_counts'].items(), 
                                      key=lambda x: x[1], reverse=True)[:15]:
                summary += f"- {func}: {count} occurrences\n"
        
        summary += "\n### Sheet Details\n"
        for sheet_name, sheet_data in analysis['sheets'].items():
            summary += f"\n#### {sheet_name}\n"
            summary += f"- Dimensions: {sheet_data['dimensions']['used_range']}\n"
            summary += f"- Formulas: {sheet_data['statistics']['total_formulas']}\n"
            summary += f"- Dependencies: {sheet_data['statistics']['total_dependencies']}\n"
            
            # Add sample formulas
            if sheet_data['formulas']:
                summary += "- Sample Formulas:\n"
                for cell, formula_data in list(sheet_data['formulas'].items())[:5]:
                    formula = formula_data['formula'][:80]
                    summary += f"  - {cell}: `{formula}`\n"
        
        # Add cross-sheet references
        if analysis.get('cross_sheet_references'):
            summary += "\n### Cross-Sheet References\n"
            for source, refs in list(analysis['cross_sheet_references'].items())[:5]:
                summary += f"- {source} references:\n"
                for ref in refs[:3]:
                    summary += f"  - {ref['source_cell']} → {ref['target_reference']}\n"
        
        # Add external links
        if analysis.get('external_links'):
            summary += "\n### External Links\n"
            for link in analysis['external_links'][:10]:
                summary += f"- {link['sheet']}/{link['cell']}: [{link['external_file']}]\n"
        
        return summary
    
    def _build_validation_prompt(self, analysis_summary: str, iteration: int, 
                                  total_iterations: int, previous_results: List[Dict]) -> str:
        """Build the validation prompt for a specific iteration"""
        
        base_prompt = f"""You are an expert Excel analyst and financial modeling auditor performing a deep semantic validation of an Excel workbook.

This is iteration {iteration} of {total_iterations}. Your task is to provide detailed analysis with semantic tracing and reasoning.

{analysis_summary}

"""
        
        if iteration == 1:
            prompt = base_prompt + """
## ITERATION 1 TASK: Initial Deep Analysis

Please perform a comprehensive initial analysis:

### 1. SEMANTIC TRACE: Understanding the Model
- What is the apparent PURPOSE of this workbook?
- What DOMAIN does it operate in (finance, accounting, operations, etc.)?
- What are the KEY INPUTS the model expects?
- What are the KEY OUTPUTS or results it produces?

### 2. REASONING LOG: Formula Logic Analysis
- Analyze the formula patterns you see
- Identify any CALCULATION CHAINS (A depends on B depends on C)
- Note any CIRCULAR REFERENCES or potential issues
- Evaluate the COMPLEXITY and MAINTAINABILITY

### 3. INITIAL FINDINGS
- List any POTENTIAL ISSUES or RED FLAGS
- Identify any BEST PRACTICES being followed or violated
- Note any ASSUMPTIONS the model appears to make

### 4. QUESTIONS FOR DEEPER INVESTIGATION
- What aspects need more scrutiny in the next iteration?
- What patterns are unclear or potentially problematic?

Please structure your response with clear headers and provide detailed reasoning for each finding.
"""
        
        elif iteration == 2:
            # Include findings from iteration 1
            prev_findings = previous_results[-1]['response'] if previous_results else "No previous findings"
            
            prompt = base_prompt + f"""
## ITERATION 2 TASK: Deep Dive Investigation

### Previous Iteration Findings:
{prev_findings[:3000]}...

---

Now perform a deeper investigation based on the initial findings:

### 1. SEMANTIC TRACE: Validation of Model Logic
- Are the formulas MATHEMATICALLY CORRECT for their apparent purpose?
- Do the DEPENDENCIES make logical sense?
- Are there any HIDDEN ASSUMPTIONS in the calculations?

### 2. REASONING LOG: Risk Assessment
- Identify HIGH-RISK formulas (complex, critical, or fragile)
- Evaluate ERROR HANDLING (are IFERRORs used appropriately?)
- Check for HARDCODED VALUES that should be parameters
- Assess SENSITIVITY to input changes

### 3. CROSS-REFERENCE VALIDATION
- Do cross-sheet references form a COHERENT data flow?
- Are there any ORPHANED calculations (outputs not used)?
- Are there DUPLICATE calculations that could cause inconsistency?

### 4. DETAILED FINDINGS
- Expand on issues found in iteration 1
- Rate each issue: CRITICAL / WARNING / INFO
- Provide SPECIFIC CELL REFERENCES where possible

Please provide detailed semantic traces for your reasoning process.
"""
        
        else:
            # Final iteration(s) - synthesis and recommendations
            all_findings = "\n---\n".join([
                f"### Iteration {r['iteration']} Findings:\n{r['response'][:2000]}..."
                for r in previous_results
            ])
            
            prompt = base_prompt + f"""
## ITERATION {iteration} TASK: Final Synthesis & Recommendations

### All Previous Findings:
{all_findings[:5000]}...

---

Now provide final synthesis and actionable recommendations:

### 1. SEMANTIC TRACE: Model Confidence Assessment
- Rate overall MODEL VALIDITY (1-10) with reasoning
- Rate DATA INTEGRITY confidence (1-10)
- Rate FORMULA ACCURACY confidence (1-10)
- Rate MAINTAINABILITY (1-10)

### 2. REASONING LOG: Issue Priority Matrix
Create a prioritized list of all issues found:

| Priority | Issue | Location | Impact | Recommended Fix |
|----------|-------|----------|--------|-----------------|
| ...      | ...   | ...      | ...    | ...             |

### 3. MIGRATION CONSIDERATIONS
If this workbook is to be migrated to a software system:
- What are the KEY BUSINESS RULES embedded in the formulas?
- What EDGE CASES need to be handled?
- What VALIDATION RULES should be implemented?
- What TESTING SCENARIOS are essential?

### 4. FINAL RECOMMENDATIONS
- List TOP 5 CRITICAL actions needed
- Provide SPECIFIC IMPROVEMENTS for key formulas
- Suggest ARCHITECTURAL CHANGES if migrating to code

### 5. EXECUTIVE SUMMARY
Provide a brief (3-5 sentence) executive summary of the validation findings.

Please ensure all reasoning is traced and documented.
"""
        
        return prompt
    
    def _call_llm(self, prompt: str, provider: str, model: str, api_key: str) -> Optional[str]:
        """Call the LLM API and return the response"""
        
        if provider == "openai":
            return self._call_openai(prompt, model, api_key)
        elif provider == "anthropic":
            return self._call_anthropic(prompt, model, api_key)
        else:
            logger.error(f"Unknown provider: {provider}")
            return None
    
    def _call_openai(self, prompt: str, model: str, api_key: str) -> Optional[str]:
        """Call OpenAI API"""
        try:
            client = openai.OpenAI(api_key=api_key)
            
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert Excel analyst and financial modeling auditor. Provide detailed, structured analysis with clear reasoning traces."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=4096,
                temperature=0.7
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return None
    
    def _call_anthropic(self, prompt: str, model: str, api_key: str) -> Optional[str]:
        """Call Anthropic API"""
        try:
            client = anthropic.Anthropic(api_key=api_key)
            
            response = client.messages.create(
                model=model if model != get_default_model("openai_top") else get_default_model("anthropic_top"),
                max_tokens=4096,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                system="You are an expert Excel analyst and financial modeling auditor. Provide detailed, structured analysis with clear reasoning traces."
            )
            
            return response.content[0].text
            
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return None
    
    def _run_llm_judge(self, iteration: int, current_response: str, 
                       previous_results: List[Dict], provider: str, 
                       model: str, api_key: str) -> Optional[str]:
        """
        Run an LLM Judge to evaluate the quality of the validation iteration.
        Compares against previous iterations and provides meta-analysis.
        """
        
        # Build judge prompt
        judge_prompt = self._build_judge_prompt(iteration, current_response, previous_results)
        
        try:
            # Call the same LLM as judge
            judge_response = self._call_llm(judge_prompt, provider, model, api_key)
            return judge_response
        except Exception as e:
            logger.warning(f"Judge evaluation failed: {e}")
            return None
    
    def _build_judge_prompt(self, iteration: int, current_response: str, 
                            previous_results: List[Dict]) -> str:
        """Build the prompt for the LLM Judge evaluation"""
        
        prompt = f"""You are an expert LLM Judge evaluating the quality of an Excel validation analysis.

## YOUR ROLE
You are a meta-evaluator providing semantic tracing and reasoning about the QUALITY of the analysis provided.

## CURRENT ITERATION: {iteration}

## ANALYSIS TO EVALUATE:
{current_response[:4000]}{'...[truncated]' if len(current_response) > 4000 else ''}

"""
        
        # Add previous iterations for comparison
        if previous_results:
            prompt += "\n## PREVIOUS ITERATIONS FOR COMPARISON:\n"
            for prev in previous_results[-2:]:  # Last 2 iterations
                prev_response = prev.get('response', '')[:1500]
                prompt += f"\n### Iteration {prev['iteration']}:\n{prev_response}...\n"
        
        prompt += """
## JUDGE EVALUATION REQUIREMENTS

Please provide a structured evaluation with semantic traces:

### 1. 📊 QUALITY SCORES (1-10 with reasoning)

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| **Completeness** | ?/10 | Did the analysis cover all important aspects? |
| **Accuracy** | ?/10 | Are the findings technically correct? |
| **Depth** | ?/10 | How deep did the analysis go? |
| **Actionability** | ?/10 | Are recommendations specific and actionable? |
| **Clarity** | ?/10 | Is the analysis clear and well-structured? |

### 2. 🔍 SEMANTIC TRACE: What Was Done Well
- List specific strengths with examples from the analysis
- Note effective reasoning patterns used

### 3. ⚠️ SEMANTIC TRACE: Gaps & Missed Opportunities
- What important aspects were NOT covered?
- What questions should have been asked?
- What deeper analysis could have been done?

### 4. 📈 ITERATION COMPARISON
"""
        
        if previous_results:
            prompt += """- How does this iteration IMPROVE on previous iterations?
- What NEW insights were discovered?
- Is there redundancy or circular reasoning?
"""
        else:
            prompt += """- This is the first iteration - evaluate it as a foundation
- What should subsequent iterations focus on?
"""
        
        prompt += """
### 5. 🎯 RECOMMENDED FOCUS FOR NEXT ITERATION
- List 3-5 specific areas that need deeper investigation
- Prioritize by impact

### 6. 📝 JUDGE'S SUMMARY
Provide a 2-3 sentence executive assessment of this iteration's quality and value.

---
*Remember: You are the JUDGE, not the analyst. Evaluate the work, don't redo it.*
"""
        
        return prompt
    
    def _save_validation_output_with_judge(self, output_file: Path, iteration: int, 
                                            total_iterations: int, response: str, 
                                            prompt: str, judge_response: Optional[str]):
        """Save validation iteration output with judge evaluation to a markdown file"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"# AI Validation - Iteration {iteration}/{total_iterations}\n\n")
            f.write(f"**File:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            # Include the prompt for traceability
            f.write("## 📋 Validation Prompt\n\n")
            f.write("<details>\n<summary>Click to expand prompt</summary>\n\n")
            f.write("```\n")
            f.write(prompt[:2000] + "..." if len(prompt) > 2000 else prompt)
            f.write("\n```\n</details>\n\n")
            
            f.write("---\n\n")
            
            # The actual response
            f.write("## 🔍 Analysis & Reasoning\n\n")
            f.write(response)
            
            # Judge evaluation section
            f.write("\n\n---\n\n")
            f.write("## ⚖️ LLM JUDGE EVALUATION\n\n")
            
            if judge_response:
                f.write(judge_response)
            else:
                f.write("*Judge evaluation not available for this iteration.*\n")
            
            f.write("\n\n---\n")
            f.write(f"\n*End of Iteration {iteration}*\n")
    
    def _save_validation_output(self, output_file: Path, iteration: int, 
                                 total_iterations: int, response: str, prompt: str):
        """Save validation iteration output to a markdown file"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"# AI Validation - Iteration {iteration}/{total_iterations}\n\n")
            f.write(f"**File:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            # Include the prompt for traceability
            f.write("## 📋 Validation Prompt\n\n")
            f.write("<details>\n<summary>Click to expand prompt</summary>\n\n")
            f.write("```\n")
            f.write(prompt[:2000] + "..." if len(prompt) > 2000 else prompt)
            f.write("\n```\n</details>\n\n")
            
            f.write("---\n\n")
            
            # The actual response
            f.write("## 🔍 Analysis & Reasoning\n\n")
            f.write(response)
            f.write("\n\n---\n")
            f.write(f"\n*End of Iteration {iteration}*\n")
    
    def extract_human_hints(self, output_dir: Optional[Path] = None) -> str:
        """
        Extract human-readable hints, documentation, and cognitive clarity tips from the workbook.
        
        Looks for:
        - Sheets with names like 'help', 'instructions', 'readme', 'cognitive clarity', 'notes'
        - Cells containing documentation patterns (Purpose, How to, Note:, etc.)
        - Cell comments
        - Text-heavy cells that appear to be instructions
        
        Returns:
            Path to the generated hints file
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        base_name = self.file_path.stem.replace(' ', '_')
        output_file = output_dir / f"{base_name}_Human_Hints.md"
        
        logger.info("Extracting human hints and cognitive clarity documentation...")
        
        # Patterns that indicate documentation/hints
        hint_sheet_patterns = [
            'help', 'instruction', 'readme', 'read me', 'cognitive', 'clarity',
            'notes', 'documentation', 'doc', 'guide', 'how to', 'howto',
            'overview', 'intro', 'introduction', 'about', 'info'
        ]
        
        hint_cell_patterns = [
            r'^purpose\s*[:\-•]',
            r'^note[s]?\s*[:\-•]',
            r'^how to\s*[:\-•]',
            r'^instruction[s]?\s*[:\-•]',
            r'^tip[s]?\s*[:\-•]',
            r'^warning\s*[:\-•]',
            r'^important\s*[:\-•]',
            r'^step\s*\d',
            r'^definition\s*[:\-•]',
            r'^logic\s*[:\-•]',
            r'^structure\s*[:\-•]',
            r'^→',
            r'^•\s+',
            r'^\d+\.\s+\w',
        ]
        
        hints_found = {
            'documentation_sheets': [],
            'inline_hints': [],
            'semantic_traces': []
        }
        
        # ============================================================
        # SEMANTIC TRACE: Scanning for Documentation Sheets
        # ============================================================
        logger.info("  → Semantic trace: Scanning sheet names for documentation patterns...")
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            sheet_lower = sheet_name.lower()
            
            # Check if sheet name matches hint patterns
            is_doc_sheet = any(pattern in sheet_lower for pattern in hint_sheet_patterns)
            
            if is_doc_sheet:
                hints_found['semantic_traces'].append({
                    'type': 'sheet_detection',
                    'reasoning': f"Sheet '{sheet_name}' matches documentation pattern",
                    'evidence': f"Name contains hint keyword",
                    'confidence': 'HIGH'
                })
                
                # Extract all text content from this sheet
                doc_content = self._extract_sheet_documentation(sheet_name, sheet_data)
                if doc_content:
                    hints_found['documentation_sheets'].append({
                        'sheet_name': sheet_name,
                        'content': doc_content,
                        'cell_count': len(doc_content)
                    })
                    logger.info(f"  ✓ Found documentation sheet: {sheet_name} ({len(doc_content)} hints)")
        
        # ============================================================
        # SEMANTIC TRACE: Scanning All Sheets for Inline Hints
        # ============================================================
        logger.info("  → Semantic trace: Scanning all cells for inline documentation...")
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            inline_hints = self._extract_inline_hints(sheet_name, sheet_data, hint_cell_patterns)
            if inline_hints:
                hints_found['inline_hints'].extend(inline_hints)
                hints_found['semantic_traces'].append({
                    'type': 'inline_detection',
                    'reasoning': f"Found {len(inline_hints)} inline hints in '{sheet_name}'",
                    'evidence': f"Cells matching documentation patterns",
                    'confidence': 'MEDIUM'
                })
        
        # ============================================================
        # REASONING LOG: Generate Output
        # ============================================================
        self._save_human_hints_report(output_file, hints_found)
        
        total_hints = (
            sum(len(d['content']) for d in hints_found['documentation_sheets']) +
            len(hints_found['inline_hints'])
        )
        logger.info(f"  ✓ Extracted {total_hints} human hints to: {output_file.name}")
        
        return str(output_file)
    
    def _extract_sheet_documentation(self, sheet_name: str, sheet_data: Dict) -> List[Dict]:
        """Extract documentation content from a sheet"""
        docs = []
        values = sheet_data.get('values', {})
        
        for cell, cell_data in values.items():
            if cell.startswith('_'):
                continue
            
            value = cell_data.get('value', '')
            if value and len(value) > 10:  # Skip short values
                docs.append({
                    'cell': cell,
                    'content': value,
                    'type': self._classify_hint_type(value)
                })
        
        return docs
    
    def _extract_inline_hints(self, sheet_name: str, sheet_data: Dict, 
                              patterns: List[str]) -> List[Dict]:
        """Extract inline hints from regular sheets"""
        hints = []
        values = sheet_data.get('values', {})
        
        for cell, cell_data in values.items():
            if cell.startswith('_'):
                continue
            
            value = cell_data.get('value', '')
            if not value or len(value) < 20:
                continue
            
            # Check if value matches hint patterns
            value_lower = value.lower()
            for pattern in patterns:
                if re.search(pattern, value_lower, re.IGNORECASE):
                    hints.append({
                        'sheet': sheet_name,
                        'cell': cell,
                        'content': value,
                        'type': self._classify_hint_type(value),
                        'pattern_matched': pattern
                    })
                    break
        
        return hints
    
    def _classify_hint_type(self, text: str) -> str:
        """Classify the type of hint based on content"""
        text_lower = text.lower()
        
        if 'purpose' in text_lower:
            return 'PURPOSE'
        elif 'how to' in text_lower or 'step' in text_lower:
            return 'INSTRUCTION'
        elif 'warning' in text_lower or 'important' in text_lower:
            return 'WARNING'
        elif 'note' in text_lower:
            return 'NOTE'
        elif 'logic' in text_lower or 'structure' in text_lower:
            return 'LOGIC'
        elif 'definition' in text_lower:
            return 'DEFINITION'
        elif '•' in text or '→' in text:
            return 'BULLET_POINT'
        else:
            return 'GENERAL'
    
    def extract_saas_specification(self, output_dir: Optional[Path] = None) -> str:
        """
        Extract SaaS specification from the Excel workbook.
        
        Analyzes:
        - Placeholder formulas (quoted strings = required data sources)
        - Data model requirements
        - Calculation logic specifications
        - UI/UX hints from cognitive clarity notes
        
        Returns:
            Path to the generated specification file
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        base_name = self.file_path.stem.replace(' ', '_')
        output_file = output_dir / f"{base_name}_SaaS_Specification.md"
        
        logger.info("Extracting SaaS specification from workbook...")
        
        spec = {
            'data_model': {
                'required_inputs': {},
                'calculated_fields': {},
                'labels': {}
            },
            'screens': {},
            'calculation_chains': [],
            'semantic_traces': []
        }
        
        # ============================================================
        # SEMANTIC TRACE: Extracting Placeholder Specifications
        # ============================================================
        logger.info("  → Semantic trace: Scanning formulas for placeholder specifications...")
        
        placeholders = {}
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                formula = formula_data.get('formula', '')
                
                # Find quoted strings in formulas (these are placeholders/specs)
                matches = re.findall(r'\"([^\"]+)\"', formula)
                
                for match in matches:
                    if match not in placeholders:
                        placeholders[match] = {
                            'name': match,
                            'usages': [],
                            'type': self._classify_placeholder(match, formula)
                        }
                    placeholders[match]['usages'].append({
                        'sheet': sheet_name,
                        'cell': cell,
                        'formula': formula
                    })
        
        # Classify placeholders
        for name, data in placeholders.items():
            ptype = data['type']
            if ptype == 'INPUT':
                spec['data_model']['required_inputs'][name] = data
            elif ptype == 'CALCULATED':
                spec['data_model']['calculated_fields'][name] = data
            else:
                spec['data_model']['labels'][name] = data
        
        spec['semantic_traces'].append({
            'type': 'placeholder_extraction',
            'reasoning': f"Found {len(placeholders)} placeholder specifications in formulas",
            'evidence': f"Quoted strings in formulas indicate required data sources",
            'confidence': 'HIGH'
        })
        
        logger.info(f"  ✓ Found {len(spec['data_model']['required_inputs'])} required inputs")
        logger.info(f"  ✓ Found {len(spec['data_model']['calculated_fields'])} calculated field specs")
        
        # ============================================================
        # SEMANTIC TRACE: Extracting Screen/View Specifications
        # ============================================================
        logger.info("  → Semantic trace: Analyzing sheets as screen specifications...")
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            screen_spec = self._extract_screen_spec(sheet_name, sheet_data)
            spec['screens'][sheet_name] = screen_spec
            
            spec['semantic_traces'].append({
                'type': 'screen_analysis',
                'reasoning': f"Sheet '{sheet_name}' represents a screen/view in the SaaS app",
                'evidence': f"{screen_spec['formula_count']} formulas, {screen_spec['section_count']} sections detected",
                'confidence': 'MEDIUM'
            })
        
        # ============================================================
        # SEMANTIC TRACE: Mapping Calculation Chains
        # ============================================================
        logger.info("  → Semantic trace: Mapping calculation dependencies...")
        
        spec['calculation_chains'] = self._extract_calculation_chains()
        
        # ============================================================
        # Generate Specification Document
        # ============================================================
        self._save_saas_spec_report(output_file, spec, placeholders)
        
        logger.info(f"  ✓ SaaS specification exported to: {output_file.name}")
        
        return str(output_file)
    
    def _classify_placeholder(self, name: str, formula: str) -> str:
        """Classify a placeholder as INPUT, CALCULATED, or LABEL"""
        name_lower = name.lower()
        
        # Inputs are typically nouns without operators
        if name_lower in ['total sf', 'total units', 'total equity', 'purchase price']:
            return 'INPUT'
        
        # Calculated fields start with = or contain operators
        if name.startswith('=') or name.startswith('+') or name.startswith('-'):
            return 'CALCULATED'
        
        # If the formula is just ="label", it's a label
        if formula.strip() == f'="{name}"':
            return 'LABEL'
        
        # If used in division/multiplication, likely an input
        if f'/"{name}"' in formula or f'"{name}"/' in formula:
            return 'INPUT'
        
        return 'LABEL'
    
    def _extract_screen_spec(self, sheet_name: str, sheet_data: Dict) -> Dict:
        """Extract screen/view specification from a sheet"""
        values = sheet_data.get('values', {})
        formulas = sheet_data.get('formulas', {})
        
        # Detect sections (rows with bold text or specific patterns)
        sections = []
        current_section = None
        
        for cell, cell_data in sorted(values.items()):
            value = cell_data.get('value', '') or ''
            if value and isinstance(value, str) and len(value) > 3:
                # Check for section headers (often in column A or B, uppercase or with markers)
                if re.match(r'^[A-B]\d+$', cell):
                    if value.isupper() or value.startswith('Section') or re.match(r'^[A-Z]\.\s', value):
                        sections.append({
                            'cell': cell,
                            'name': value,
                            'type': 'SECTION_HEADER'
                        })
        
        # Detect UI hints
        ui_hints = []
        for cell, cell_data in values.items():
            raw_value = cell_data.get('value', '') or ''
            value = str(raw_value).lower() if raw_value else ''
            if 'cognitive clarity' in value or 'nav' in value or 'header' in value:
                ui_hints.append({
                    'cell': cell,
                    'hint': cell_data.get('value', '')
                })
        
        return {
            'sheet_name': sheet_name,
            'dimensions': sheet_data.get('dimensions', {}),
            'formula_count': len(formulas),
            'section_count': len(sections),
            'sections': sections[:10],  # Limit for output
            'ui_hints': ui_hints[:5],
            'has_navigation': any('nav' in h['hint'].lower() for h in ui_hints),
            'input_cells': self._detect_input_cells(sheet_data),
            'output_cells': self._detect_output_cells(sheet_data)
        }
    
    def _detect_input_cells(self, sheet_data: Dict) -> List[Dict]:
        """Detect cells that appear to be user inputs"""
        inputs = []
        values = sheet_data.get('values', {})
        formulas = sheet_data.get('formulas', {})
        
        for cell, cell_data in values.items():
            # Input cells have values but no formulas
            if cell not in formulas:
                value = cell_data.get('value', '') or ''
                value_str = str(value) if value else ''
                # Look for patterns indicating user input
                if value_str in ['$ user entry', '$ per SF', '$', 'user entry']:
                    inputs.append({'cell': cell, 'type': value_str})
        
        return inputs[:20]
    
    def _detect_output_cells(self, sheet_data: Dict) -> List[Dict]:
        """Detect cells that appear to be calculated outputs"""
        outputs = []
        formulas = sheet_data.get('formulas', {})
        
        for cell, formula_data in list(formulas.items())[:20]:
            formula = formula_data.get('formula', '')
            funcs = formula_data.get('functions_used', [])
            
            if funcs or '/' in formula or '*' in formula:
                outputs.append({
                    'cell': cell,
                    'formula': formula[:50],
                    'functions': funcs
                })
        
        return outputs
    
    def _extract_calculation_chains(self) -> List[Dict]:
        """Extract calculation dependency chains"""
        chains = []
        
        # Find formulas that reference other sheets
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                refs = formula_data.get('references', [])
                cross_sheet_refs = [r for r in refs if '!' in r]
                
                if cross_sheet_refs:
                    chains.append({
                        'source': f"{sheet_name}/{cell}",
                        'formula': formula_data.get('formula', '')[:60],
                        'depends_on': cross_sheet_refs[:5]
                    })
        
        return chains[:30]  # Limit output
    
    def _save_saas_spec_report(self, output_file: Path, spec: Dict, placeholders: Dict):
        """Save the SaaS specification report"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 🚀 SaaS Application Specification\n\n")
            f.write(f"**Extracted from:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            f.write("> **Note:** This specification was automatically extracted from an Excel workbook\n")
            f.write("> that uses placeholder formulas and cognitive clarity hints to define requirements.\n\n")
            
            # Table of Contents
            f.write("## 📑 Table of Contents\n\n")
            f.write("1. [Semantic Traces](#semantic-traces)\n")
            f.write("2. [Data Model](#data-model)\n")
            f.write("3. [Screens & Views](#screens--views)\n")
            f.write("4. [Calculation Logic](#calculation-logic)\n")
            f.write("5. [Implementation Notes](#implementation-notes)\n\n")
            f.write("---\n\n")
            
            # Semantic Traces
            f.write("## 🔍 Semantic Traces\n\n")
            f.write("*How this specification was extracted:*\n\n")
            
            for trace in spec['semantic_traces']:
                f.write(f"### {trace['type'].replace('_', ' ').title()}\n\n")
                f.write(f"- **Reasoning:** {trace['reasoning']}\n")
                f.write(f"- **Evidence:** {trace['evidence']}\n")
                f.write(f"- **Confidence:** {trace['confidence']}\n\n")
            
            f.write("---\n\n")
            
            # Data Model
            f.write("## 📊 Data Model\n\n")
            
            # Required Inputs
            f.write("### Required Inputs (Core Data Sources)\n\n")
            f.write("These variables MUST be provided by the application:\n\n")
            f.write("| Variable Name | Usage Count | Example Formula | Type |\n")
            f.write("|--------------|-------------|-----------------|------|\n")
            
            for name, data in sorted(spec['data_model']['required_inputs'].items(), 
                                     key=lambda x: len(x[1]['usages']), reverse=True):
                usage_count = len(data['usages'])
                example = data['usages'][0]['formula'][:40] if data['usages'] else ''
                f.write(f"| `{name}` | {usage_count} | `{example}` | INPUT |\n")
            
            f.write("\n")
            
            # Calculated Fields
            if spec['data_model']['calculated_fields']:
                f.write("### Calculated Fields\n\n")
                f.write("These are derived values shown as labels:\n\n")
                
                for name, data in spec['data_model']['calculated_fields'].items():
                    f.write(f"- **{name}**\n")
                    for usage in data['usages'][:2]:
                        f.write(f"  - `{usage['sheet']}/{usage['cell']}`: `{usage['formula'][:50]}`\n")
                
                f.write("\n")
            
            f.write("---\n\n")
            
            # Screens & Views
            f.write("## 🖥️ Screens & Views\n\n")
            
            for screen_name, screen_spec in spec['screens'].items():
                f.write(f"### {screen_name}\n\n")
                
                f.write(f"- **Dimensions:** {screen_spec['dimensions'].get('used_range', 'N/A')}\n")
                f.write(f"- **Formulas:** {screen_spec['formula_count']}\n")
                f.write(f"- **Sections:** {screen_spec['section_count']}\n")
                f.write(f"- **Has Navigation:** {'Yes' if screen_spec['has_navigation'] else 'No'}\n\n")
                
                if screen_spec['sections']:
                    f.write("**Sections:**\n")
                    for section in screen_spec['sections'][:5]:
                        f.write(f"- {section['name']}\n")
                    f.write("\n")
                
                if screen_spec['ui_hints']:
                    f.write("**UI Hints:**\n")
                    for hint in screen_spec['ui_hints'][:3]:
                        f.write(f"- `{hint['cell']}`: {hint['hint'][:80]}...\n")
                    f.write("\n")
                
                if screen_spec['input_cells']:
                    f.write("**User Input Cells:**\n")
                    for inp in screen_spec['input_cells'][:5]:
                        f.write(f"- `{inp['cell']}`: {inp['type']}\n")
                    f.write("\n")
            
            f.write("---\n\n")
            
            # Calculation Logic
            f.write("## ⚙️ Calculation Logic\n\n")
            
            f.write("### Cross-Sheet Dependencies\n\n")
            f.write("*How data flows between screens:*\n\n")
            
            if spec['calculation_chains']:
                f.write("| Source | Formula | Depends On |\n")
                f.write("|--------|---------|------------|\n")
                
                for chain in spec['calculation_chains'][:15]:
                    deps = ', '.join(chain['depends_on'][:3])
                    f.write(f"| `{chain['source']}` | `{chain['formula']}` | {deps} |\n")
                
                f.write("\n")
            
            # Key Formulas by Placeholder
            f.write("### Key Formulas Using Placeholders\n\n")
            
            for name, data in sorted(placeholders.items(), 
                                     key=lambda x: len(x[1]['usages']), reverse=True)[:5]:
                f.write(f"#### `{name}` ({len(data['usages'])} usages)\n\n")
                f.write("```\n")
                for usage in data['usages'][:5]:
                    f.write(f"{usage['sheet']}/{usage['cell']}: {usage['formula']}\n")
                f.write("```\n\n")
            
            f.write("---\n\n")
            
            # Implementation Notes
            f.write("## 📝 Implementation Notes\n\n")
            
            f.write("### Required Backend Variables\n\n")
            f.write("```python\n")
            f.write("# Core data model based on placeholder analysis\n")
            f.write("class PropertyData:\n")
            for name in spec['data_model']['required_inputs'].keys():
                var_name = name.lower().replace(' ', '_').replace('-', '_')
                f.write(f"    {var_name}: float  # Used in {len(spec['data_model']['required_inputs'][name]['usages'])} calculations\n")
            f.write("```\n\n")
            
            f.write("### Screen Navigation\n\n")
            f.write("Based on cognitive clarity hints, implement:\n")
            f.write("- Frozen header row with tab navigation\n")
            f.write("- Active tab highlighting\n")
            f.write("- Secondary navigation for sub-views (e.g., Proforma vs Leases)\n\n")
            
            f.write("---\n")
            f.write("*This specification was auto-generated from Excel placeholder formulas and cognitive clarity documentation.*\n")
    
    # =========================================================================
    # SAAS BLUEPRINT EXTRACTION - PHASE 1: UI & COMPONENT INVENTORY
    # =========================================================================
    
    def extract_ui_inventory(self, output_dir: Optional[Path] = None) -> str:
        """
        PHASE 1: Extract UI & Component Inventory from Excel workbook.
        
        Extracts:
        - Color palette (design tokens)
        - Typography (fonts, sizes)
        - Component patterns (buttons, inputs, tables, etc.)
        - Layout patterns (frozen rows, merged cells, sections)
        
        Returns:
            Path to the generated UI inventory file
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        base_name = self.file_path.stem.replace(' ', '_')
        output_file = output_dir / f"{base_name}_01_UI_Component_Inventory.md"
        
        logger.info("=" * 60)
        logger.info("PHASE 1: Extracting UI & Component Inventory")
        logger.info("=" * 60)
        
        inventory = {
            'color_palette': self._extract_color_palette(),
            'typography': self._extract_typography(),
            'components': self._extract_component_patterns(),
            'layout_patterns': self._extract_layout_patterns(),
            'semantic_traces': []
        }
        
        inventory['semantic_traces'].append({
            'type': 'ui_extraction',
            'reasoning': f"Extracted {len(inventory['color_palette'])} colors, {len(inventory['components'])} component patterns",
            'confidence': 'HIGH'
        })
        
        self._save_ui_inventory_report(output_file, inventory)
        
        logger.info(f"  ✓ UI Inventory exported to: {output_file.name}")
        return str(output_file)
    
    def _extract_color_palette(self) -> Dict[str, Any]:
        """Extract all colors used in the workbook"""
        colors = {
            'background_colors': {},
            'font_colors': {},
            'border_colors': {},
            'tab_colors': {}
        }
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            # Extract tab color
            tab_color = sheet_data.get('sheet_properties', {}).get('tab_color')
            if tab_color:
                colors['tab_colors'][sheet_name] = tab_color
            
            # Extract cell colors from formulas (which have style info)
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                fill_str = formula_data.get('fill', '')
                if fill_str and 'fgColor' in fill_str:
                    color_match = re.search(r"fgColor=<Color rgb='([A-Fa-f0-9]+)'", fill_str)
                    if color_match:
                        color = color_match.group(1)
                        if color not in colors['background_colors']:
                            colors['background_colors'][color] = {'count': 0, 'cells': []}
                        colors['background_colors'][color]['count'] += 1
                        if len(colors['background_colors'][color]['cells']) < 5:
                            colors['background_colors'][color]['cells'].append(f"{sheet_name}/{cell}")
                
                font_str = formula_data.get('font', '')
                if font_str and 'color' in font_str:
                    color_match = re.search(r"color=<Color rgb='([A-Fa-f0-9]+)'", font_str)
                    if color_match:
                        color = color_match.group(1)
                        if color not in colors['font_colors']:
                            colors['font_colors'][color] = {'count': 0, 'cells': []}
                        colors['font_colors'][color]['count'] += 1
        
        # Generate design tokens
        colors['design_tokens'] = self._generate_design_tokens(colors)
        
        return colors
    
    def _generate_design_tokens(self, colors: Dict) -> Dict[str, str]:
        """Generate CSS/design tokens from extracted colors"""
        tokens = {}
        
        # Sort by usage count
        bg_sorted = sorted(colors['background_colors'].items(), 
                          key=lambda x: x[1]['count'], reverse=True)
        font_sorted = sorted(colors['font_colors'].items(), 
                            key=lambda x: x[1]['count'], reverse=True)
        
        # Assign semantic names
        for i, (color, data) in enumerate(bg_sorted[:10]):
            if color.lower() not in ['00000000', 'ffffffff']:  # Skip transparent/white
                tokens[f'--color-bg-{i+1}'] = f'#{color[-6:]}'  # Last 6 chars (RGB)
        
        for i, (color, data) in enumerate(font_sorted[:10]):
            if color.lower() not in ['00000000', 'ff000000']:  # Skip transparent/black
                tokens[f'--color-text-{i+1}'] = f'#{color[-6:]}'
        
        return tokens
    
    def _extract_typography(self) -> Dict[str, Any]:
        """Extract typography patterns from the workbook"""
        typography = {
            'fonts': {},
            'sizes': {},
            'styles': {'bold': 0, 'italic': 0, 'underline': 0}
        }
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                font_str = formula_data.get('font', '')
                if font_str:
                    # Extract font name
                    name_match = re.search(r"name='([^']+)'", font_str)
                    if name_match:
                        font_name = name_match.group(1)
                        typography['fonts'][font_name] = typography['fonts'].get(font_name, 0) + 1
                    
                    # Extract size
                    size_match = re.search(r"sz=(\d+\.?\d*)", font_str)
                    if size_match:
                        size = size_match.group(1)
                        typography['sizes'][size] = typography['sizes'].get(size, 0) + 1
                    
                    # Extract styles
                    if 'b=True' in font_str:
                        typography['styles']['bold'] += 1
                    if 'i=True' in font_str:
                        typography['styles']['italic'] += 1
                    if 'u=' in font_str and "u='single'" in font_str:
                        typography['styles']['underline'] += 1
        
        return typography
    
    def _extract_component_patterns(self) -> List[Dict[str, Any]]:
        """Extract UI component patterns from cell patterns"""
        components = []
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            values = sheet_data.get('values', {})
            formulas = sheet_data.get('formulas', {})
            
            # Detect input fields (cells expecting user entry)
            input_patterns = ['$ user entry', 'user entry', 'enter here', 'input']
            for cell, cell_data in values.items():
                value = str(cell_data.get('value', '') or '').lower()
                if any(p in value for p in input_patterns):
                    components.append({
                        'type': 'INPUT_FIELD',
                        'subtype': 'currency' if '$' in value else 'text',
                        'location': f"{sheet_name}/{cell}",
                        'label': cell_data.get('value', '')
                    })
            
            # Detect buttons (merged cells with specific styling)
            merged = sheet_data.get('merged_cells', [])
            for merge_range in merged[:20]:  # Limit
                components.append({
                    'type': 'MERGED_REGION',
                    'subtype': 'potential_button_or_header',
                    'location': f"{sheet_name}/{merge_range}",
                    'size': merge_range
                })
            
            # Detect dropdowns (data validation)
            for cells, rule in sheet_data.get('data_validation', {}).items():
                if rule.get('type') == 'list':
                    components.append({
                        'type': 'DROPDOWN',
                        'location': f"{sheet_name}/{cells}",
                        'options_source': rule.get('formula1', ''),
                        'allow_blank': rule.get('allow_blank', True)
                    })
            
            # Detect calculated displays
            for cell, formula_data in list(formulas.items())[:30]:
                format_str = formula_data.get('number_format', '')
                if format_str and format_str != 'General':
                    display_type = 'currency' if '$' in format_str else 'percentage' if '%' in format_str else 'number'
                    components.append({
                        'type': 'CALCULATED_DISPLAY',
                        'subtype': display_type,
                        'location': f"{sheet_name}/{cell}",
                        'format': format_str,
                        'formula': formula_data.get('formula', '')[:50]
                    })
        
        return components
    
    def _extract_layout_patterns(self) -> Dict[str, Any]:
        """Extract layout patterns from the workbook"""
        layouts = {
            'frozen_regions': [],
            'section_headers': [],
            'navigation_hints': [],
            'grid_structures': []
        }
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            values = sheet_data.get('values', {})
            
            # Detect section headers (rows with cognitive clarity hints)
            for cell, cell_data in values.items():
                value = str(cell_data.get('value', '') or '')
                value_lower = value.lower()
                
                # Cognitive clarity = frozen row hints
                if 'cognitive clarity' in value_lower or 'always visible' in value_lower:
                    layouts['frozen_regions'].append({
                        'sheet': sheet_name,
                        'cell': cell,
                        'hint': value[:100]
                    })
                
                # Navigation hints
                if 'header' in value_lower or 'nav' in value_lower or 'tab' in value_lower:
                    layouts['navigation_hints'].append({
                        'sheet': sheet_name,
                        'cell': cell,
                        'hint': value[:100]
                    })
                
                # Section headers (A., B., C. patterns or ALL CAPS)
                if re.match(r'^[A-Z]\.\s+', value) or (value.isupper() and len(value) > 5):
                    layouts['section_headers'].append({
                        'sheet': sheet_name,
                        'cell': cell,
                        'name': value
                    })
        
        return layouts
    
    def _save_ui_inventory_report(self, output_file: Path, inventory: Dict):
        """Save the UI inventory report"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 🎨 UI & Component Inventory\n\n")
            f.write(f"**Source:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            f.write("> **PART 1 of SaaS Blueprint**: This document catalogs all UI components,\n")
            f.write("> design tokens, and layout patterns extracted from the Excel workbook.\n\n")
            
            # Design Tokens
            f.write("## 🎨 Design Tokens (CSS Variables)\n\n")
            f.write("```css\n")
            f.write(":root {\n")
            for token, value in inventory['color_palette'].get('design_tokens', {}).items():
                f.write(f"  {token}: {value};\n")
            f.write("}\n")
            f.write("```\n\n")
            
            # Color Palette
            f.write("## 🌈 Color Palette\n\n")
            f.write("### Background Colors\n\n")
            f.write("| Color | Hex | Usage Count | Sample Cells |\n")
            f.write("|-------|-----|-------------|-------------|\n")
            for color, data in sorted(inventory['color_palette']['background_colors'].items(),
                                     key=lambda x: x[1]['count'], reverse=True)[:15]:
                hex_color = f"#{color[-6:]}"
                cells = ', '.join(data['cells'][:3])
                f.write(f"| 🟦 | `{hex_color}` | {data['count']} | {cells} |\n")
            f.write("\n")
            
            # Typography
            f.write("## 📝 Typography\n\n")
            f.write("### Font Families\n\n")
            for font, count in sorted(inventory['typography']['fonts'].items(),
                                     key=lambda x: x[1], reverse=True)[:10]:
                f.write(f"- **{font}**: {count} uses\n")
            f.write("\n")
            
            f.write("### Font Sizes\n\n")
            for size, count in sorted(inventory['typography']['sizes'].items(),
                                     key=lambda x: float(x[0]) if x[0] else 0):
                f.write(f"- `{size}pt`: {count} uses\n")
            f.write("\n")
            
            # Components
            f.write("## 🧩 Component Patterns\n\n")
            
            # Group by type
            by_type = {}
            for comp in inventory['components']:
                ctype = comp['type']
                if ctype not in by_type:
                    by_type[ctype] = []
                by_type[ctype].append(comp)
            
            for ctype, comps in by_type.items():
                f.write(f"### {ctype.replace('_', ' ').title()}\n\n")
                f.write(f"*Found {len(comps)} instances*\n\n")
                
                f.write("| Location | Subtype | Details |\n")
                f.write("|----------|---------|--------|\n")
                for comp in comps[:15]:
                    subtype = comp.get('subtype', '-')
                    details = comp.get('label', comp.get('format', comp.get('size', '-')))
                    details = str(details)[:40]
                    f.write(f"| `{comp['location']}` | {subtype} | {details} |\n")
                f.write("\n")
            
            # Layout Patterns
            f.write("## 📐 Layout Patterns\n\n")
            
            if inventory['layout_patterns']['frozen_regions']:
                f.write("### Frozen Regions (Fixed Headers)\n\n")
                for region in inventory['layout_patterns']['frozen_regions'][:10]:
                    f.write(f"- **{region['sheet']}/{region['cell']}**: {region['hint'][:60]}...\n")
                f.write("\n")
            
            if inventory['layout_patterns']['section_headers']:
                f.write("### Section Headers\n\n")
                for header in inventory['layout_patterns']['section_headers'][:20]:
                    f.write(f"- `{header['sheet']}/{header['cell']}`: **{header['name']}**\n")
                f.write("\n")
            
            if inventory['layout_patterns']['navigation_hints']:
                f.write("### Navigation Hints\n\n")
                for nav in inventory['layout_patterns']['navigation_hints'][:10]:
                    f.write(f"- `{nav['sheet']}/{nav['cell']}`: {nav['hint'][:60]}...\n")
                f.write("\n")
            
            f.write("---\n")
            f.write("*End of UI & Component Inventory*\n")
    
    # =========================================================================
    # SAAS BLUEPRINT EXTRACTION - PHASE 2: SCREEN & FEATURE BREAKDOWN
    # =========================================================================
    
    def extract_screen_breakdown(self, output_dir: Optional[Path] = None) -> str:
        """
        PHASE 2: Extract Screen & Feature Breakdown.
        
        For each sheet (screen), extracts:
        - Screen purpose and function
        - Component list
        - Functionality description
        - Section breakdown
        
        Returns:
            Path to the generated screen breakdown file
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        base_name = self.file_path.stem.replace(' ', '_')
        output_file = output_dir / f"{base_name}_02_Screen_Breakdown.md"
        
        logger.info("=" * 60)
        logger.info("PHASE 2: Extracting Screen & Feature Breakdown")
        logger.info("=" * 60)
        
        screens = {}
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            logger.info(f"  → Analyzing screen: {sheet_name}")
            screens[sheet_name] = self._analyze_screen(sheet_name, sheet_data)
        
        self._save_screen_breakdown_report(output_file, screens)
        
        logger.info(f"  ✓ Screen Breakdown exported to: {output_file.name}")
        return str(output_file)
    
    def _analyze_screen(self, sheet_name: str, sheet_data: Dict) -> Dict[str, Any]:
        """Deep analysis of a sheet as a screen/view"""
        values = sheet_data.get('values', {})
        formulas = sheet_data.get('formulas', {})
        
        screen = {
            'name': sheet_name,
            'inferred_purpose': self._infer_screen_purpose(sheet_name, values),
            'dimensions': sheet_data.get('dimensions', {}),
            'statistics': sheet_data.get('statistics', {}),
            'sections': [],
            'features': [],
            'inputs': [],
            'outputs': [],
            'navigation': [],
            'cognitive_clarity_hints': []
        }
        
        # Extract sections (A., B., C. patterns)
        for cell, cell_data in sorted(values.items()):
            value = str(cell_data.get('value', '') or '')
            
            # Section detection
            if re.match(r'^[A-Z]\.\s+', value) or (value.isupper() and len(value) > 5 and len(value) < 80):
                screen['sections'].append({
                    'cell': cell,
                    'title': value,
                    'type': 'major_section' if re.match(r'^[A-Z]\.\s+', value) else 'header'
                })
            
            # Cognitive clarity hints
            if 'cognitive clarity' in value.lower():
                screen['cognitive_clarity_hints'].append({
                    'cell': cell,
                    'hint': value
                })
            
            # Navigation elements
            if 'nav' in value.lower() or 'tab' in value.lower() or 'button' in value.lower():
                screen['navigation'].append({
                    'cell': cell,
                    'element': value
                })
        
        # Extract input cells
        input_markers = ['$ user entry', 'user entry', '$', '$ per sf', 'enter']
        for cell, cell_data in values.items():
            value = str(cell_data.get('value', '') or '').lower()
            if any(m in value for m in input_markers) and cell not in formulas:
                screen['inputs'].append({
                    'cell': cell,
                    'type': self._classify_input_type(cell_data.get('value', ''))
                })
        
        # Extract output/calculated cells
        for cell, formula_data in list(formulas.items())[:50]:
            funcs = formula_data.get('functions_used', [])
            if funcs or '/' in formula_data.get('formula', '') or '*' in formula_data.get('formula', ''):
                screen['outputs'].append({
                    'cell': cell,
                    'formula': formula_data.get('formula', '')[:60],
                    'functions': funcs,
                    'format': formula_data.get('number_format', 'General')
                })
        
        # Infer features from formula patterns
        screen['features'] = self._infer_screen_features(formulas, values)
        
        return screen
    
    def _infer_screen_purpose(self, sheet_name: str, values: Dict) -> str:
        """Infer the purpose of a screen from its name and content"""
        name_lower = sheet_name.lower()
        
        # Common patterns
        if 'summary' in name_lower:
            return "Dashboard/Overview screen showing key metrics and summary data"
        elif 'rent' in name_lower and 'proforma' in name_lower:
            return "Proforma rent input and projections screen"
        elif 'rent' in name_lower and 'lease' in name_lower:
            return "Lease and renewal tracking screen"
        elif 'noi' in name_lower:
            return "Net Operating Income calculation screen"
        elif 'return' in name_lower or 'buyer' in name_lower:
            return "Investment returns and buyer analysis screen"
        elif 'split' in name_lower or 'lp' in name_lower or 'gp' in name_lower:
            return "LP/GP distribution and waterfall splits screen"
        elif 'help' in name_lower or 'clarity' in name_lower:
            return "Help/Documentation screen with cognitive clarity guides"
        elif 'setting' in name_lower or 'config' in name_lower:
            return "Settings and configuration screen"
        else:
            return "Data entry and calculation screen"
    
    def _classify_input_type(self, value: str) -> str:
        """Classify the type of input field"""
        value_str = str(value or '').lower()
        if '$' in value_str or 'dollar' in value_str:
            return 'currency'
        elif '%' in value_str or 'percent' in value_str:
            return 'percentage'
        elif 'date' in value_str:
            return 'date'
        elif 'sf' in value_str or 'sqft' in value_str:
            return 'square_footage'
        else:
            return 'text'
    
    def _infer_screen_features(self, formulas: Dict, values: Dict) -> List[Dict]:
        """Infer features available on a screen from formulas"""
        features = []
        
        # Detect calculation features
        all_functions = []
        for formula_data in formulas.values():
            all_functions.extend(formula_data.get('functions_used', []))
        
        func_counts = {}
        for f in all_functions:
            func_counts[f] = func_counts.get(f, 0) + 1
        
        if 'SUM' in func_counts:
            features.append({
                'name': 'Aggregation/Totals',
                'description': f"SUM calculations ({func_counts['SUM']} instances)"
            })
        
        if any(f in func_counts for f in ['IF', 'IFS', 'CHOOSE']):
            features.append({
                'name': 'Conditional Logic',
                'description': "IF/conditional formulas for dynamic calculations"
            })
        
        if any(f in func_counts for f in ['VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH']):
            features.append({
                'name': 'Data Lookup',
                'description': "Lookup formulas referencing other data"
            })
        
        if any(f in func_counts for f in ['PMT', 'NPV', 'IRR', 'XIRR']):
            features.append({
                'name': 'Financial Calculations',
                'description': "Financial modeling formulas"
            })
        
        return features
    
    def _save_screen_breakdown_report(self, output_file: Path, screens: Dict):
        """Save the screen breakdown report"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 🖥️ Screen & Feature Breakdown\n\n")
            f.write(f"**Source:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            f.write("> **PART 2 of SaaS Blueprint**: Screen-by-screen analysis of the application.\n\n")
            
            # Screen summary table
            f.write("## 📋 Screen Summary\n\n")
            f.write("| Screen | Purpose | Inputs | Outputs | Sections |\n")
            f.write("|--------|---------|--------|---------|----------|\n")
            for name, screen in screens.items():
                purpose = screen['inferred_purpose'][:40] + "..." if len(screen['inferred_purpose']) > 40 else screen['inferred_purpose']
                f.write(f"| {name} | {purpose} | {len(screen['inputs'])} | {len(screen['outputs'])} | {len(screen['sections'])} |\n")
            f.write("\n")
            
            # Detailed screen analysis
            f.write("---\n\n")
            f.write("## 📱 Detailed Screen Analysis\n\n")
            
            for name, screen in screens.items():
                f.write(f"### 🖥️ {name}\n\n")
                f.write(f"**Purpose:** {screen['inferred_purpose']}\n\n")
                f.write(f"**Dimensions:** {screen['dimensions'].get('used_range', 'N/A')}\n\n")
                
                # Cognitive Clarity Hints
                if screen['cognitive_clarity_hints']:
                    f.write("#### 🧠 Cognitive Clarity Hints\n\n")
                    for hint in screen['cognitive_clarity_hints'][:5]:
                        f.write(f"- `{hint['cell']}`: {hint['hint'][:100]}...\n")
                    f.write("\n")
                
                # Sections
                if screen['sections']:
                    f.write("#### 📑 Sections\n\n")
                    for section in screen['sections'][:10]:
                        icon = "📌" if section['type'] == 'major_section' else "📝"
                        f.write(f"- {icon} `{section['cell']}`: **{section['title']}**\n")
                    f.write("\n")
                
                # Features
                if screen['features']:
                    f.write("#### ⚙️ Features\n\n")
                    for feature in screen['features']:
                        f.write(f"- **{feature['name']}**: {feature['description']}\n")
                    f.write("\n")
                
                # Inputs
                if screen['inputs']:
                    f.write("#### 📥 Input Fields\n\n")
                    f.write("| Cell | Type |\n")
                    f.write("|------|------|\n")
                    for inp in screen['inputs'][:15]:
                        f.write(f"| `{inp['cell']}` | {inp['type']} |\n")
                    f.write("\n")
                
                # Outputs
                if screen['outputs']:
                    f.write("#### 📤 Calculated Outputs\n\n")
                    f.write("| Cell | Formula | Functions | Format |\n")
                    f.write("|------|---------|-----------|--------|\n")
                    for out in screen['outputs'][:15]:
                        formula = out['formula'].replace('|', '\\|')[:40]
                        funcs = ', '.join(out['functions'][:3])
                        f.write(f"| `{out['cell']}` | `{formula}` | {funcs} | {out['format']} |\n")
                    f.write("\n")
                
                f.write("---\n\n")
            
            f.write("*End of Screen & Feature Breakdown*\n")
    
    # =========================================================================
    # SAAS BLUEPRINT EXTRACTION - PHASE 3: USER WORKFLOWS (UX)
    # =========================================================================
    
    def extract_user_workflows(self, output_dir: Optional[Path] = None) -> str:
        """
        PHASE 3: Extract User Workflows (UX journeys).
        
        Maps:
        - Data entry flows
        - Calculation chains (what triggers what)
        - Cross-screen navigation
        - Decision points
        
        Returns:
            Path to the generated workflows file
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        base_name = self.file_path.stem.replace(' ', '_')
        output_file = output_dir / f"{base_name}_03_User_Workflows.md"
        
        logger.info("=" * 60)
        logger.info("PHASE 3: Extracting User Workflows (UX)")
        logger.info("=" * 60)
        
        workflows = {
            'data_entry_flows': self._extract_data_entry_flows(),
            'calculation_chains': self._extract_workflow_chains(),
            'cross_screen_navigation': self._extract_navigation_flows(),
            'decision_points': self._extract_decision_points(),
            'mermaid_diagrams': []
        }
        
        # Generate Mermaid diagrams
        workflows['mermaid_diagrams'] = self._generate_workflow_diagrams(workflows)
        
        self._save_workflows_report(output_file, workflows)
        
        logger.info(f"  ✓ User Workflows exported to: {output_file.name}")
        return str(output_file)
    
    def _extract_data_entry_flows(self) -> List[Dict]:
        """Extract data entry workflow patterns"""
        flows = []
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            values = sheet_data.get('values', {})
            formulas = sheet_data.get('formulas', {})
            
            # Find input cells and what depends on them
            for cell, cell_data in values.items():
                value = str(cell_data.get('value', '') or '').lower()
                if 'user entry' in value or 'enter' in value:
                    # Find formulas that reference this cell
                    dependents = []
                    for f_cell, f_data in formulas.items():
                        refs = f_data.get('references', [])
                        if cell in refs or any(cell in r for r in refs):
                            dependents.append({
                                'cell': f_cell,
                                'formula': f_data.get('formula', '')[:50]
                            })
                    
                    if dependents:
                        flows.append({
                            'type': 'DATA_ENTRY',
                            'input_cell': f"{sheet_name}/{cell}",
                            'input_type': value,
                            'triggers': dependents[:5],
                            'impact_count': len(dependents)
                        })
        
        return flows[:20]
    
    def _extract_workflow_chains(self) -> List[Dict]:
        """Extract calculation chains showing data flow"""
        chains = []
        
        # Build a dependency graph
        dep_graph = {}
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                full_cell = f"{sheet_name}/{cell}"
                refs = formula_data.get('references', [])
                dep_graph[full_cell] = {
                    'formula': formula_data.get('formula', '')[:50],
                    'depends_on': refs[:5],
                    'functions': formula_data.get('functions_used', [])
                }
        
        # Find chains (cells with multiple dependencies)
        for cell, data in dep_graph.items():
            if len(data['depends_on']) > 1:
                chains.append({
                    'result_cell': cell,
                    'formula': data['formula'],
                    'inputs': data['depends_on'],
                    'functions': data['functions']
                })
        
        return sorted(chains, key=lambda x: len(x['inputs']), reverse=True)[:20]
    
    def _extract_navigation_flows(self) -> List[Dict]:
        """Extract cross-screen navigation patterns from cross-sheet references"""
        nav_flows = []
        
        cross_refs = self.analysis_results.get('cross_sheet_references', {})
        
        for source_sheet, refs in cross_refs.items():
            targets = {}
            for ref in refs:
                target = ref['target_sheet']
                if target not in targets:
                    targets[target] = 0
                targets[target] += 1
            
            for target, count in targets.items():
                nav_flows.append({
                    'from_screen': source_sheet,
                    'to_screen': target,
                    'reference_count': count,
                    'type': 'DATA_DEPENDENCY'
                })
        
        return nav_flows
    
    def _extract_decision_points(self) -> List[Dict]:
        """Extract decision points from IF/IFS formulas"""
        decisions = []
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                formula = formula_data.get('formula', '')
                funcs = formula_data.get('functions_used', [])
                
                if 'IF' in funcs or 'IFS' in funcs or 'CHOOSE' in funcs:
                    decisions.append({
                        'cell': f"{sheet_name}/{cell}",
                        'formula': formula[:80],
                        'type': 'CONDITIONAL',
                        'functions': [f for f in funcs if f in ['IF', 'IFS', 'CHOOSE']]
                    })
        
        return decisions[:30]
    
    def _generate_workflow_diagrams(self, workflows: Dict) -> List[Dict]:
        """Generate Mermaid diagrams for workflows"""
        diagrams = []
        
        # Data Flow Diagram
        data_flow = "flowchart TD\n"
        data_flow += "    subgraph INPUTS[\"📥 User Inputs\"]\n"
        for i, flow in enumerate(workflows['data_entry_flows'][:5]):
            safe_id = f"input{i}"
            data_flow += f"        {safe_id}[\"{flow['input_cell']}\"]\n"
        data_flow += "    end\n\n"
        
        data_flow += "    subgraph CALC[\"⚙️ Calculations\"]\n"
        for i, chain in enumerate(workflows['calculation_chains'][:5]):
            safe_id = f"calc{i}"
            data_flow += f"        {safe_id}([\"{chain['result_cell']}\"])\n"
        data_flow += "    end\n\n"
        
        data_flow += "    INPUTS --> CALC\n"
        
        diagrams.append({
            'name': 'Data Flow Overview',
            'type': 'flowchart',
            'code': data_flow
        })
        
        # Screen Navigation Diagram
        if workflows['cross_screen_navigation']:
            nav_diagram = "flowchart LR\n"
            screens = set()
            for nav in workflows['cross_screen_navigation']:
                screens.add(nav['from_screen'])
                screens.add(nav['to_screen'])
            
            for screen in screens:
                safe_id = re.sub(r'[^a-zA-Z0-9]', '_', screen)
                nav_diagram += f"    {safe_id}[\"{screen}\"]\n"
            
            for nav in workflows['cross_screen_navigation'][:15]:
                safe_from = re.sub(r'[^a-zA-Z0-9]', '_', nav['from_screen'])
                safe_to = re.sub(r'[^a-zA-Z0-9]', '_', nav['to_screen'])
                nav_diagram += f"    {safe_from} -->|{nav['reference_count']} refs| {safe_to}\n"
            
            diagrams.append({
                'name': 'Screen Navigation',
                'type': 'flowchart',
                'code': nav_diagram
            })
        
        return diagrams
    
    def _save_workflows_report(self, output_file: Path, workflows: Dict):
        """Save the workflows report"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 🔄 User Workflows (UX)\n\n")
            f.write(f"**Source:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            f.write("> **PART 3 of SaaS Blueprint**: User journey maps and workflow documentation.\n\n")
            
            # Workflow Summary
            f.write("## 📊 Workflow Summary\n\n")
            f.write(f"- **Data Entry Flows:** {len(workflows['data_entry_flows'])}\n")
            f.write(f"- **Calculation Chains:** {len(workflows['calculation_chains'])}\n")
            f.write(f"- **Cross-Screen Navigation:** {len(workflows['cross_screen_navigation'])}\n")
            f.write(f"- **Decision Points:** {len(workflows['decision_points'])}\n\n")
            
            # Mermaid Diagrams
            f.write("## 📈 Workflow Diagrams\n\n")
            for diagram in workflows['mermaid_diagrams']:
                f.write(f"### {diagram['name']}\n\n")
                f.write("```mermaid\n")
                f.write(diagram['code'])
                f.write("```\n\n")
            
            # Data Entry Flows
            f.write("## 📥 Data Entry Flows\n\n")
            f.write("*When users enter data, these calculations are triggered:*\n\n")
            
            for flow in workflows['data_entry_flows'][:15]:
                f.write(f"### Input: `{flow['input_cell']}`\n\n")
                f.write(f"**Type:** {flow['input_type']}\n\n")
                f.write(f"**Triggers {flow['impact_count']} calculations:**\n\n")
                for trigger in flow['triggers'][:5]:
                    f.write(f"- `{trigger['cell']}`: `{trigger['formula']}`\n")
                f.write("\n")
            
            # Calculation Chains
            f.write("---\n\n")
            f.write("## ⛓️ Calculation Chains\n\n")
            f.write("*Complex formulas with multiple inputs:*\n\n")
            
            f.write("| Result Cell | Formula | Inputs | Functions |\n")
            f.write("|-------------|---------|--------|----------|\n")
            for chain in workflows['calculation_chains'][:20]:
                inputs = ', '.join(chain['inputs'][:3])
                funcs = ', '.join(chain['functions'][:3])
                f.write(f"| `{chain['result_cell']}` | `{chain['formula']}` | {inputs} | {funcs} |\n")
            f.write("\n")
            
            # Decision Points
            f.write("---\n\n")
            f.write("## 🔀 Decision Points\n\n")
            f.write("*Conditional logic in the application:*\n\n")
            
            for decision in workflows['decision_points'][:15]:
                f.write(f"- **`{decision['cell']}`** ({', '.join(decision['functions'])})\n")
                f.write(f"  - Formula: `{decision['formula']}`\n\n")
            
            f.write("---\n")
            f.write("*End of User Workflows*\n")
    
    # =========================================================================
    # SAAS BLUEPRINT EXTRACTION - PHASE 4: INFERRED DATA MODEL
    # =========================================================================
    
    def extract_data_model(self, output_dir: Optional[Path] = None) -> str:
        """
        PHASE 4: Extract Inferred Data Model.
        
        Generates:
        - Entity definitions from placeholders
        - Database schema (SQL)
        - TypeScript interfaces
        - Python dataclasses
        - API contract specifications
        
        Returns:
            Path to the generated data model file
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        if not self.analysis_results:
            self.extract_all_logic()
        
        base_name = self.file_path.stem.replace(' ', '_')
        output_file = output_dir / f"{base_name}_04_Data_Model.md"
        
        logger.info("=" * 60)
        logger.info("PHASE 4: Extracting Inferred Data Model")
        logger.info("=" * 60)
        
        model = {
            'entities': self._extract_entities(),
            'relationships': self._extract_relationships(),
            'validation_rules': self._extract_model_validation_rules(),
            'computed_fields': self._extract_computed_fields(),
            'schema': {}
        }
        
        # Generate schemas
        model['schema']['sql'] = self._generate_sql_schema(model)
        model['schema']['typescript'] = self._generate_typescript_schema(model)
        model['schema']['python'] = self._generate_python_schema(model)
        model['schema']['mermaid_erd'] = self._generate_mermaid_erd(model)
        
        self._save_data_model_report(output_file, model)
        
        logger.info(f"  ✓ Data Model exported to: {output_file.name}")
        return str(output_file)
    
    def _extract_entities(self) -> List[Dict]:
        """Extract data entities from placeholder patterns and structure"""
        entities = []
        
        # Primary entity from file name
        file_base = self.file_path.stem.lower()
        primary_entity = {
            'name': 'Property' if 'property' in file_base or 'equity' in file_base else 'Project',
            'type': 'PRIMARY',
            'fields': [],
            'source': 'file_name_inference'
        }
        
        # Extract fields from placeholders
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                formula = formula_data.get('formula', '')
                
                # Find quoted strings (placeholders)
                matches = re.findall(r'\"([^\"]+)\"', formula)
                for match in matches:
                    # Skip labels (formulas that are just ="label")
                    if formula.strip() == f'="{match}"':
                        continue
                    
                    # Classify as field
                    field = {
                        'name': match,
                        'snake_name': match.lower().replace(' ', '_').replace('-', '_'),
                        'type': self._infer_field_type(match, formula),
                        'source_formula': formula[:60],
                        'usage_count': 0
                    }
                    
                    # Count usage
                    for s_name, s_data in self.analysis_results['sheets'].items():
                        for f_data in s_data.get('formulas', {}).values():
                            if f'"{match}"' in f_data.get('formula', ''):
                                field['usage_count'] += 1
                    
                    # Add to primary entity if not duplicate
                    if not any(f['name'] == match for f in primary_entity['fields']):
                        primary_entity['fields'].append(field)
        
        entities.append(primary_entity)
        
        # Create entities for each sheet with significant data
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            if sheet_data['statistics']['total_formulas'] > 5:
                entity = {
                    'name': sheet_name.replace(' ', '').replace('_', ''),
                    'type': 'VIEW' if 'summary' in sheet_name.lower() else 'DATA',
                    'fields': self._extract_fields_from_sheet(sheet_name, sheet_data),
                    'source': f'sheet:{sheet_name}'
                }
                entities.append(entity)
        
        return entities
    
    def _infer_field_type(self, field_name: str, formula: str) -> str:
        """Infer the data type of a field"""
        name_lower = field_name.lower()
        
        if 'sf' in name_lower or 'sqft' in name_lower or 'square' in name_lower:
            return 'float'  # Square footage
        elif 'unit' in name_lower or 'count' in name_lower or 'qty' in name_lower:
            return 'integer'
        elif 'date' in name_lower:
            return 'date'
        elif 'rate' in name_lower or '%' in field_name or 'percent' in name_lower:
            return 'decimal(5,4)'  # Percentage
        elif '$' in formula or 'price' in name_lower or 'rent' in name_lower or 'cost' in name_lower:
            return 'decimal(12,2)'  # Currency
        else:
            return 'float'
    
    def _extract_fields_from_sheet(self, sheet_name: str, sheet_data: Dict) -> List[Dict]:
        """Extract fields from a sheet's structure"""
        fields = []
        values = sheet_data.get('values', {})
        formulas = sheet_data.get('formulas', {})
        
        # Find column headers (usually row 1 or first non-empty row)
        headers = {}
        for cell, cell_data in values.items():
            if re.match(r'^[A-Z]+1$', cell):  # Row 1
                value = cell_data.get('value', '')
                if value and isinstance(value, str) and len(value) > 2:
                    col = re.match(r'^([A-Z]+)', cell).group(1)
                    headers[col] = value
        
        for col, header in list(headers.items())[:15]:
            fields.append({
                'name': header,
                'snake_name': re.sub(r'[^a-z0-9]', '_', header.lower()),
                'column': col,
                'type': 'string'  # Default
            })
        
        return fields
    
    def _extract_relationships(self) -> List[Dict]:
        """Extract relationships between entities from cross-sheet references"""
        relationships = []
        
        cross_refs = self.analysis_results.get('cross_sheet_references', {})
        
        for source, refs in cross_refs.items():
            targets = {}
            for ref in refs:
                target = ref['target_sheet']
                if target not in targets:
                    targets[target] = 0
                targets[target] += 1
            
            for target, count in targets.items():
                relationships.append({
                    'from_entity': source.replace(' ', '').replace('_', ''),
                    'to_entity': target.replace(' ', '').replace('_', ''),
                    'type': 'REFERENCES',
                    'cardinality': 'many-to-one' if count > 5 else 'one-to-one',
                    'reference_count': count
                })
        
        return relationships
    
    def _extract_model_validation_rules(self) -> List[Dict]:
        """Extract validation rules from data validation settings"""
        rules = []
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cells, rule in sheet_data.get('data_validation', {}).items():
                rules.append({
                    'entity': sheet_name.replace(' ', ''),
                    'cells': cells,
                    'rule_type': rule.get('type', 'unknown'),
                    'formula1': rule.get('formula1'),
                    'formula2': rule.get('formula2'),
                    'error_message': rule.get('error')
                })
        
        return rules
    
    def _extract_computed_fields(self) -> List[Dict]:
        """Extract computed/derived field definitions"""
        computed = []
        
        for sheet_name, sheet_data in self.analysis_results['sheets'].items():
            for cell, formula_data in list(sheet_data.get('formulas', {}).items())[:30]:
                funcs = formula_data.get('functions_used', [])
                if funcs:  # Has Excel functions = computed
                    computed.append({
                        'location': f"{sheet_name}/{cell}",
                        'formula': formula_data.get('formula', '')[:80],
                        'functions': funcs,
                        'dependencies': formula_data.get('references', [])[:5]
                    })
        
        return computed
    
    def _generate_sql_schema(self, model: Dict) -> str:
        """Generate SQL CREATE TABLE statements"""
        sql = "-- SQL Schema generated from Excel workbook\n"
        sql += f"-- Source: {self.file_name}\n"
        sql += f"-- Generated: {datetime.now().isoformat()}\n\n"
        
        for entity in model['entities']:
            if entity['type'] == 'PRIMARY':
                table_name = entity['name'].lower()
                sql += f"CREATE TABLE {table_name} (\n"
                sql += f"    id SERIAL PRIMARY KEY,\n"
                
                for field in entity['fields']:
                    sql_type = self._to_sql_type(field['type'])
                    sql += f"    {field['snake_name']} {sql_type},\n"
                
                sql += f"    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n"
                sql += f"    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n"
                sql += f");\n\n"
        
        return sql
    
    def _to_sql_type(self, field_type: str) -> str:
        """Convert field type to SQL type"""
        type_map = {
            'float': 'REAL',
            'integer': 'INTEGER',
            'decimal(12,2)': 'DECIMAL(12,2)',
            'decimal(5,4)': 'DECIMAL(5,4)',
            'date': 'DATE',
            'string': 'VARCHAR(255)'
        }
        return type_map.get(field_type, 'VARCHAR(255)')
    
    def _generate_typescript_schema(self, model: Dict) -> str:
        """Generate TypeScript interfaces"""
        ts = "// TypeScript interfaces generated from Excel workbook\n"
        ts += f"// Source: {self.file_name}\n\n"
        
        for entity in model['entities']:
            if entity['type'] == 'PRIMARY':
                ts += f"interface {entity['name']} {{\n"
                ts += f"  id: number;\n"
                
                for field in entity['fields']:
                    ts_type = self._to_ts_type(field['type'])
                    ts += f"  {field['snake_name']}: {ts_type};  // Used in {field['usage_count']} formulas\n"
                
                ts += f"  createdAt: Date;\n"
                ts += f"  updatedAt: Date;\n"
                ts += f"}}\n\n"
        
        return ts
    
    def _to_ts_type(self, field_type: str) -> str:
        """Convert field type to TypeScript type"""
        if 'decimal' in field_type or field_type in ['float', 'integer']:
            return 'number'
        elif field_type == 'date':
            return 'Date'
        else:
            return 'string'
    
    def _generate_python_schema(self, model: Dict) -> str:
        """Generate Python dataclasses"""
        py = "# Python dataclasses generated from Excel workbook\n"
        py += f"# Source: {self.file_name}\n\n"
        py += "from dataclasses import dataclass\n"
        py += "from datetime import datetime\n"
        py += "from typing import Optional\n\n"
        
        for entity in model['entities']:
            if entity['type'] == 'PRIMARY':
                py += "@dataclass\n"
                py += f"class {entity['name']}:\n"
                py += f"    \"\"\"Auto-generated from Excel workbook\"\"\"\n"
                
                for field in entity['fields']:
                    py_type = self._to_python_type(field['type'])
                    py += f"    {field['snake_name']}: {py_type}  # Used in {field['usage_count']} formulas\n"
                
                py += f"    id: Optional[int] = None\n"
                py += f"    created_at: Optional[datetime] = None\n"
                py += f"    updated_at: Optional[datetime] = None\n\n"
        
        return py
    
    def _to_python_type(self, field_type: str) -> str:
        """Convert field type to Python type"""
        if field_type in ['float', 'decimal(12,2)', 'decimal(5,4)']:
            return 'float'
        elif field_type == 'integer':
            return 'int'
        elif field_type == 'date':
            return 'datetime'
        else:
            return 'str'
    
    def _generate_mermaid_erd(self, model: Dict) -> str:
        """Generate Mermaid ERD diagram"""
        erd = "erDiagram\n"
        
        # Add primary entity
        for entity in model['entities']:
            if entity['type'] == 'PRIMARY':
                erd += f"    {entity['name']} {{\n"
                erd += f"        int id PK\n"
                for field in entity['fields'][:15]:
                    field_type = field['type'].split('(')[0]  # Remove precision
                    erd += f"        {field_type} {field['snake_name']}\n"
                erd += f"    }}\n\n"
        
        # Add relationships
        for rel in model['relationships'][:10]:
            cardinality = "||--o{" if 'many' in rel['cardinality'] else "||--||"
            erd += f"    {rel['from_entity']} {cardinality} {rel['to_entity']} : references\n"
        
        return erd
    
    def _save_data_model_report(self, output_file: Path, model: Dict):
        """Save the data model report"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 📊 Inferred Data Model\n\n")
            f.write(f"**Source:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            f.write("> **PART 4 of SaaS Blueprint**: Database schema and API contracts.\n\n")
            
            # Entity Relationship Diagram
            f.write("## 🗂️ Entity Relationship Diagram\n\n")
            f.write("```mermaid\n")
            f.write(model['schema']['mermaid_erd'])
            f.write("```\n\n")
            
            # Entity Definitions
            f.write("## 📋 Entity Definitions\n\n")
            
            for entity in model['entities']:
                if entity['type'] == 'PRIMARY':
                    f.write(f"### {entity['name']} (Primary Entity)\n\n")
                    f.write(f"**Source:** {entity['source']}\n\n")
                    
                    f.write("| Field | Type | Usage Count | Source Formula |\n")
                    f.write("|-------|------|-------------|----------------|\n")
                    for field in entity['fields']:
                        formula = field.get('source_formula', '-')[:40]
                        f.write(f"| `{field['snake_name']}` | {field['type']} | {field['usage_count']} | `{formula}` |\n")
                    f.write("\n")
            
            # SQL Schema
            f.write("---\n\n")
            f.write("## 🗄️ SQL Schema\n\n")
            f.write("```sql\n")
            f.write(model['schema']['sql'])
            f.write("```\n\n")
            
            # TypeScript Schema
            f.write("---\n\n")
            f.write("## 📘 TypeScript Interfaces\n\n")
            f.write("```typescript\n")
            f.write(model['schema']['typescript'])
            f.write("```\n\n")
            
            # Python Schema
            f.write("---\n\n")
            f.write("## 🐍 Python Dataclasses\n\n")
            f.write("```python\n")
            f.write(model['schema']['python'])
            f.write("```\n\n")
            
            # Validation Rules
            if model['validation_rules']:
                f.write("---\n\n")
                f.write("## ✅ Validation Rules\n\n")
                f.write("| Entity | Cells | Rule Type | Formula |\n")
                f.write("|--------|-------|-----------|--------|\n")
                for rule in model['validation_rules'][:20]:
                    f.write(f"| {rule['entity']} | {rule['cells']} | {rule['rule_type']} | {rule['formula1'] or '-'} |\n")
                f.write("\n")
            
            # Computed Fields
            if model['computed_fields']:
                f.write("---\n\n")
                f.write("## 🧮 Computed Fields\n\n")
                f.write("*These fields are calculated and should be derived in the application:*\n\n")
                
                for computed in model['computed_fields'][:20]:
                    f.write(f"- **`{computed['location']}`**\n")
                    f.write(f"  - Formula: `{computed['formula']}`\n")
                    f.write(f"  - Functions: {', '.join(computed['functions'])}\n\n")
            
            f.write("---\n")
            f.write("*End of Data Model*\n")
    
    # =========================================================================
    # SAAS BLUEPRINT - MASTER COMMAND
    # =========================================================================
    
    def generate_saas_blueprint(self, output_dir: Optional[Path] = None) -> Dict[str, str]:
        """
        Generate complete SaaS Blueprint by running all 4 phases.
        
        Creates a blueprint folder with:
        - 01_UI_Component_Inventory.md
        - 02_Screen_Breakdown.md
        - 03_User_Workflows.md
        - 04_Data_Model.md
        - 05_Implementation_Guide.md
        - assets/ (color palette JSON, etc.)
        
        Returns:
            Dictionary of generated file paths
        """
        if output_dir is None:
            output_dir = Path('.')
        output_dir = Path(output_dir)
        
        # Create blueprint directory
        base_name = self.file_path.stem.replace(' ', '_')
        blueprint_dir = output_dir / f"{base_name}_SaaS_Blueprint"
        blueprint_dir.mkdir(exist_ok=True)
        
        assets_dir = blueprint_dir / "assets"
        assets_dir.mkdir(exist_ok=True)
        
        logger.info("=" * 70)
        logger.info("🚀 GENERATING COMPLETE SAAS BLUEPRINT")
        logger.info("=" * 70)
        
        files = {}
        
        # Phase 1: UI Inventory
        logger.info("\n")
        files['ui_inventory'] = self.extract_ui_inventory(blueprint_dir)
        
        # Phase 2: Screen Breakdown
        logger.info("\n")
        files['screen_breakdown'] = self.extract_screen_breakdown(blueprint_dir)
        
        # Phase 3: User Workflows
        logger.info("\n")
        files['workflows'] = self.extract_user_workflows(blueprint_dir)
        
        # Phase 4: Data Model
        logger.info("\n")
        files['data_model'] = self.extract_data_model(blueprint_dir)
        
        # Phase 5: Implementation Guide
        logger.info("\n")
        logger.info("=" * 60)
        logger.info("PHASE 5: Generating Implementation Guide")
        logger.info("=" * 60)
        files['implementation_guide'] = self._generate_implementation_guide(blueprint_dir)
        
        # Generate assets
        self._generate_blueprint_assets(assets_dir)
        
        logger.info("\n")
        logger.info("=" * 70)
        logger.info("✅ SAAS BLUEPRINT COMPLETE")
        logger.info("=" * 70)
        logger.info(f"Output directory: {blueprint_dir}")
        
        return files
    
    def _generate_implementation_guide(self, output_dir: Path) -> str:
        """Generate implementation guide with recommendations"""
        output_file = output_dir / f"{self.file_path.stem.replace(' ', '_')}_05_Implementation_Guide.md"
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 🛠️ Implementation Guide\n\n")
            f.write(f"**Source:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            f.write("> **PART 5 of SaaS Blueprint**: Actionable implementation recommendations.\n\n")
            
            # Tech Stack Recommendations
            f.write("## 💻 Recommended Tech Stack\n\n")
            f.write("### Frontend\n")
            f.write("- **Framework:** Next.js 14+ (React)\n")
            f.write("- **Styling:** Tailwind CSS with custom design tokens\n")
            f.write("- **State Management:** Zustand or React Query\n")
            f.write("- **Charts:** Recharts or Chart.js\n")
            f.write("- **Tables:** TanStack Table (react-table)\n\n")
            
            f.write("### Backend\n")
            f.write("- **API:** FastAPI (Python) or Express (Node.js)\n")
            f.write("- **Database:** PostgreSQL\n")
            f.write("- **ORM:** SQLAlchemy (Python) or Prisma (Node.js)\n")
            f.write("- **Calculations:** Pandas/NumPy for financial formulas\n\n")
            
            f.write("### Infrastructure\n")
            f.write("- **Hosting:** Vercel (frontend) + Railway/Render (backend)\n")
            f.write("- **Auth:** Clerk or NextAuth\n")
            f.write("- **File Storage:** S3/Cloudflare R2\n\n")
            
            # Feature Priority Matrix
            stats = self.analysis_results['summary_stats']
            f.write("## 📊 Feature Priority Matrix\n\n")
            f.write("| Priority | Feature | Complexity | Sheets Affected |\n")
            f.write("|----------|---------|------------|----------------|\n")
            f.write(f"| 🔴 P0 | Core Calculations | High | {stats['most_complex_sheet']} |\n")
            f.write("| 🟠 P1 | Data Input Forms | Medium | All input sheets |\n")
            f.write("| 🟡 P2 | Dashboard/Summary | Medium | Summary Tab |\n")
            f.write("| 🟢 P3 | Reporting/Export | Low | All |\n\n")
            
            # Development Phases
            f.write("## 📅 Development Phases\n\n")
            f.write("### Phase 1: Foundation (2-3 weeks)\n")
            f.write("- [ ] Set up project structure\n")
            f.write("- [ ] Implement data model (see 04_Data_Model.md)\n")
            f.write("- [ ] Create database schema\n")
            f.write("- [ ] Build API endpoints for CRUD\n\n")
            
            f.write("### Phase 2: Core Features (3-4 weeks)\n")
            f.write("- [ ] Implement calculation engine\n")
            f.write("- [ ] Build input forms (see 02_Screen_Breakdown.md)\n")
            f.write("- [ ] Create dashboard components\n")
            f.write("- [ ] Implement cross-screen navigation\n\n")
            
            f.write("### Phase 3: Polish (2 weeks)\n")
            f.write("- [ ] Apply design tokens (see 01_UI_Component_Inventory.md)\n")
            f.write("- [ ] Add validation and error handling\n")
            f.write("- [ ] Implement user workflows (see 03_User_Workflows.md)\n")
            f.write("- [ ] Testing and QA\n\n")
            
            # Testing Scenarios
            f.write("## 🧪 Critical Testing Scenarios\n\n")
            f.write("Based on the Excel analysis, test these scenarios:\n\n")
            
            if stats.get('function_usage_counts'):
                f.write("### Calculation Tests\n")
                for func, count in sorted(stats['function_usage_counts'].items(),
                                         key=lambda x: x[1], reverse=True)[:5]:
                    f.write(f"- [ ] Test all `{func}` calculations ({count} instances)\n")
                f.write("\n")
            
            f.write("### Data Flow Tests\n")
            f.write("- [ ] Verify cross-sheet references update correctly\n")
            f.write("- [ ] Test circular dependency handling\n")
            f.write("- [ ] Validate calculation order\n\n")
            
            f.write("### Edge Case Tests\n")
            f.write("- [ ] Zero values in denominators\n")
            f.write("- [ ] Negative numbers in financial calculations\n")
            f.write("- [ ] Empty/null input handling\n\n")
            
            # Quick Reference
            f.write("## 📚 Quick Reference\n\n")
            f.write("| Document | Contents |\n")
            f.write("|----------|----------|\n")
            f.write("| `01_UI_Component_Inventory.md` | Design tokens, colors, components |\n")
            f.write("| `02_Screen_Breakdown.md` | Screen-by-screen specs |\n")
            f.write("| `03_User_Workflows.md` | UX flows and journeys |\n")
            f.write("| `04_Data_Model.md` | Database schema, TypeScript/Python types |\n")
            f.write("| `05_Implementation_Guide.md` | This file |\n\n")
            
            f.write("---\n")
            f.write("*End of Implementation Guide*\n")
        
        logger.info(f"  ✓ Implementation Guide exported to: {output_file.name}")
        return str(output_file)
    
    def _generate_blueprint_assets(self, assets_dir: Path):
        """Generate asset files (JSON configs, etc.)"""
        # Color palette JSON
        colors = self._extract_color_palette()
        with open(assets_dir / 'color_palette.json', 'w') as f:
            json.dump(colors.get('design_tokens', {}), f, indent=2)
        
        logger.info(f"  ✓ Assets exported to: {assets_dir}")
    
    def _save_human_hints_report(self, output_file: Path, hints_found: Dict):
        """Save the human hints report with semantic traces"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"# 🧠 Human Hints & Cognitive Clarity Report\n\n")
            f.write(f"**Source File:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            # Semantic Traces Section
            f.write("## 🔍 Semantic Traces & Reasoning Log\n\n")
            f.write("*How hints were discovered and classified:*\n\n")
            
            for trace in hints_found['semantic_traces']:
                f.write(f"### Trace: {trace['type'].replace('_', ' ').title()}\n\n")
                f.write(f"- **Reasoning:** {trace['reasoning']}\n")
                f.write(f"- **Evidence:** {trace['evidence']}\n")
                f.write(f"- **Confidence:** {trace['confidence']}\n\n")
            
            f.write("---\n\n")
            
            # Documentation Sheets Section
            if hints_found['documentation_sheets']:
                f.write("## 📚 Documentation Sheets\n\n")
                f.write("*Sheets specifically created to document the workbook:*\n\n")
                
                for doc_sheet in hints_found['documentation_sheets']:
                    f.write(f"### 📋 {doc_sheet['sheet_name']}\n\n")
                    
                    # Group by type
                    by_type = {}
                    for item in doc_sheet['content']:
                        hint_type = item['type']
                        if hint_type not in by_type:
                            by_type[hint_type] = []
                        by_type[hint_type].append(item)
                    
                    for hint_type, items in by_type.items():
                        f.write(f"#### {hint_type}\n\n")
                        for item in items:
                            content = item['content']
                            # Format nicely
                            if len(content) > 200:
                                f.write(f"**{item['cell']}:**\n\n")
                                f.write(f"> {content}\n\n")
                            else:
                                f.write(f"- **{item['cell']}:** {content}\n")
                        f.write("\n")
                
                f.write("---\n\n")
            
            # Inline Hints Section
            if hints_found['inline_hints']:
                f.write("## 💡 Inline Hints & Tips\n\n")
                f.write("*Documentation embedded within data sheets:*\n\n")
                
                # Group by sheet
                by_sheet = {}
                for hint in hints_found['inline_hints']:
                    sheet = hint['sheet']
                    if sheet not in by_sheet:
                        by_sheet[sheet] = []
                    by_sheet[sheet].append(hint)
                
                for sheet, hints in by_sheet.items():
                    f.write(f"### From: {sheet}\n\n")
                    for hint in hints:
                        f.write(f"- **{hint['cell']}** ({hint['type']}): {hint['content'][:200]}")
                        if len(hint['content']) > 200:
                            f.write("...")
                        f.write("\n")
                    f.write("\n")
            
            # Summary
            f.write("---\n\n")
            f.write("## 📊 Summary\n\n")
            
            total_doc_hints = sum(len(d['content']) for d in hints_found['documentation_sheets'])
            total_inline = len(hints_found['inline_hints'])
            
            f.write(f"| Metric | Count |\n")
            f.write(f"|--------|-------|\n")
            f.write(f"| Documentation Sheets Found | {len(hints_found['documentation_sheets'])} |\n")
            f.write(f"| Hints in Doc Sheets | {total_doc_hints} |\n")
            f.write(f"| Inline Hints Found | {total_inline} |\n")
            f.write(f"| **Total Human Hints** | **{total_doc_hints + total_inline}** |\n")
            f.write(f"| Semantic Traces Generated | {len(hints_found['semantic_traces'])} |\n")
            
            f.write("\n\n---\n")
            f.write("*This report extracts human-authored documentation embedded in the Excel workbook.*\n")
    
    def _save_final_validation_report(self, output_file: Path, 
                                       iteration_results: List[Dict],
                                       analysis_summary: str):
        """Save the final consolidated validation report"""
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 🎯 AI Validation Final Report\n\n")
            f.write(f"**File:** {self.file_name}\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"**Total Iterations:** {len(iteration_results)}\n\n")
            
            f.write("---\n\n")
            
            # Table of contents
            f.write("## 📑 Table of Contents\n\n")
            f.write("1. [Executive Summary](#executive-summary)\n")
            f.write("2. [Workbook Overview](#workbook-overview)\n")
            for i in range(len(iteration_results)):
                f.write(f"{i+3}. [Iteration {i+1} Analysis](#iteration-{i+1}-analysis)\n")
            f.write(f"{len(iteration_results)+3}. [Consolidated Findings](#consolidated-findings)\n\n")
            
            f.write("---\n\n")
            
            # Executive summary from last iteration
            f.write("## Executive Summary\n\n")
            if iteration_results:
                last_response = iteration_results[-1]['response']
                # Try to extract executive summary
                if "Executive Summary" in last_response:
                    start = last_response.find("Executive Summary")
                    end = last_response.find("\n#", start + 1)
                    if end == -1:
                        end = len(last_response)
                    f.write(last_response[start:end])
                else:
                    f.write("*See final iteration for executive summary.*\n")
            f.write("\n\n")
            
            # Workbook overview
            f.write("## Workbook Overview\n\n")
            f.write(analysis_summary)
            f.write("\n\n---\n\n")
            
            # Each iteration's analysis with judge evaluation
            for result in iteration_results:
                f.write(f"## Iteration {result['iteration']} Analysis\n\n")
                f.write(f"*Timestamp: {result['timestamp']}*\n\n")
                f.write(result['response'])
                
                # Include judge evaluation
                if result.get('judge_evaluation'):
                    f.write("\n\n### ⚖️ Judge Evaluation\n\n")
                    f.write(result['judge_evaluation'])
                
                f.write("\n\n---\n\n")
            
            # Consolidated findings
            f.write("## Consolidated Findings\n\n")
            f.write("### All Issues Identified\n\n")
            f.write("| Iteration | Finding Type | Description |\n")
            f.write("|-----------|--------------|-------------|\n")
            
            # Extract key findings from each iteration
            for result in iteration_results:
                response = result['response']
                iteration = result['iteration']
                
                # Simple extraction of findings (look for bullet points and issues)
                lines = response.split('\n')
                for line in lines:
                    line = line.strip()
                    if line.startswith('- ') and len(line) > 10:
                        if any(word in line.lower() for word in ['issue', 'error', 'warning', 'critical', 'risk', 'problem']):
                            finding = line[2:80] + "..." if len(line) > 82 else line[2:]
                            finding = finding.replace('|', '\\|')
                            f.write(f"| {iteration} | Finding | {finding} |\n")
            
            # Consolidated Judge Evaluations Summary
            f.write("## ⚖️ Judge Evaluations Summary\n\n")
            f.write("### Iteration-by-Iteration Judge Scores\n\n")
            f.write("| Iteration | Quality Assessment |\n")
            f.write("|-----------|--------------------|\n")
            
            for result in iteration_results:
                judge_eval = result.get('judge_evaluation', '')
                if judge_eval:
                    # Extract a brief summary from judge evaluation
                    lines = judge_eval.split('\n')
                    summary = "Evaluated"
                    for line in lines:
                        if 'summary' in line.lower() or 'overall' in line.lower():
                            summary = line[:80] + "..." if len(line) > 80 else line
                            break
                    summary = summary.replace('|', '-')
                    f.write(f"| {result['iteration']} | {summary} |\n")
                else:
                    f.write(f"| {result['iteration']} | No judge evaluation |\n")
            
            f.write("\n\n---\n\n")
            f.write("*This report was generated by AI-powered validation with LLM Judge meta-evaluation.*\n")
            f.write("*All findings should be reviewed by a human expert.*\n")
    
    def export_mermaid_to_png(self, markdown_path: str, output_dir: Optional[Path] = None, 
                               scale: int = 3, background: str = 'white') -> List[str]:
        """
        Export Mermaid diagrams from a markdown file to PNG images.
        
        Uses: npx --yes @mermaid-js/mermaid-cli -i input.mmd -o output.png -s 3 -b white
        
        Args:
            markdown_path: Path to the markdown file containing mermaid diagrams
            output_dir: Directory for output PNG files
            scale: Scale factor for high resolution (default: 3)
            background: Background color (default: 'white', can be 'transparent')
        
        Returns:
            List of generated PNG file paths
        """
        if output_dir is None:
            output_dir = Path(markdown_path).parent
        
        output_dir = Path(output_dir)
        markdown_path = Path(markdown_path)
        
        if not markdown_path.exists():
            logger.error(f"Markdown file not found: {markdown_path}")
            return []
        
        # Check if npx is available
        if not shutil.which('npx'):
            logger.error("npx not found. Please install Node.js to export PNG diagrams.")
            logger.info("Install Node.js from: https://nodejs.org/")
            return []
        
        # Extract mermaid blocks from markdown
        mermaid_blocks = self._extract_mermaid_blocks(markdown_path)
        
        if not mermaid_blocks:
            logger.info("No mermaid diagrams found in markdown file")
            return []
        
        logger.info(f"Found {len(mermaid_blocks)} mermaid diagrams to export")
        
        generated_pngs = []
        base_name = markdown_path.stem
        
        # Create a temp directory for .mmd files
        temp_dir = output_dir / '.mermaid_temp'
        temp_dir.mkdir(exist_ok=True)
        
        try:
            for idx, (diagram_name, mermaid_code) in enumerate(mermaid_blocks, 1):
                # Create a safe filename
                safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', diagram_name)
                mmd_file = temp_dir / f"{base_name}_{safe_name}.mmd"
                png_file = output_dir / f"{base_name}_{safe_name}.png"
                
                # Write mermaid code to .mmd file
                with open(mmd_file, 'w', encoding='utf-8') as f:
                    f.write(mermaid_code)
                
                logger.info(f"Exporting diagram {idx}/{len(mermaid_blocks)}: {diagram_name}")
                
                # Run mermaid-cli
                cmd = [
                    'npx', '--yes', '@mermaid-js/mermaid-cli',
                    '-i', str(mmd_file),
                    '-o', str(png_file),
                    '-s', str(scale),
                    '-b', background
                ]
                
                try:
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=120  # 2 minute timeout per diagram
                    )
                    
                    if result.returncode == 0 and png_file.exists():
                        generated_pngs.append(str(png_file))
                        logger.info(f"  ✓ Generated: {png_file.name}")
                    else:
                        logger.warning(f"  ✗ Failed to generate {png_file.name}")
                        if result.stderr:
                            logger.debug(f"    Error: {result.stderr[:200]}")
                            
                except subprocess.TimeoutExpired:
                    logger.warning(f"  ✗ Timeout generating {png_file.name}")
                except Exception as e:
                    logger.warning(f"  ✗ Error generating {png_file.name}: {e}")
        
        finally:
            # Clean up temp .mmd files
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass
        
        if generated_pngs:
            logger.info(f"Successfully generated {len(generated_pngs)} PNG diagrams")
        
        return generated_pngs
    
    def _extract_mermaid_blocks(self, markdown_path: Path) -> List[Tuple[str, str]]:
        """
        Extract mermaid code blocks from a markdown file.
        
        Returns:
            List of tuples: (diagram_name, mermaid_code)
        """
        with open(markdown_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        blocks = []
        
        # Pattern to match mermaid code blocks
        pattern = r'```mermaid\s*\n(.*?)```'
        matches = re.findall(pattern, content, re.DOTALL)
        
        # Try to find section headers before each mermaid block
        lines = content.split('\n')
        current_section = "diagram"
        
        for i, match in enumerate(matches):
            # Find the position of this match in the content
            match_start = content.find(f'```mermaid\n{match}')
            
            # Look backwards for the nearest header
            content_before = content[:match_start]
            header_matches = re.findall(r'^#+\s+(.+?)$', content_before, re.MULTILINE)
            
            if header_matches:
                current_section = header_matches[-1]
            
            # Create a diagram name
            diagram_name = f"{i+1:02d}_{current_section}"
            diagram_name = re.sub(r'[^a-zA-Z0-9_-]', '_', diagram_name)[:50]
            
            blocks.append((diagram_name, match.strip()))
        
        return blocks


def export_diagrams_to_png(markdown_path: str, output_dir: Optional[str] = None,
                           scale: int = 3, background: str = 'white') -> List[str]:
    """
    Standalone function to export Mermaid diagrams from a markdown file to PNG.
    
    This can be used independently of the ExcelAnalyzer class.
    
    Args:
        markdown_path: Path to the markdown file containing mermaid diagrams
        output_dir: Directory for output PNG files (default: same as markdown file)
        scale: Scale factor for high resolution (default: 3)
        background: Background color (default: 'white')
    
    Returns:
        List of generated PNG file paths
    """
    markdown_path = Path(markdown_path)
    
    if output_dir is None:
        output_dir = markdown_path.parent
    else:
        output_dir = Path(output_dir)
    
    if not markdown_path.exists():
        logger.error(f"Markdown file not found: {markdown_path}")
        return []
    
    # Check if npx is available
    if not shutil.which('npx'):
        logger.error("npx not found. Please install Node.js to export PNG diagrams.")
        return []
    
    # Extract mermaid blocks
    with open(markdown_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = r'```mermaid\s*\n(.*?)```'
    matches = re.findall(pattern, content, re.DOTALL)
    
    if not matches:
        logger.info("No mermaid diagrams found")
        return []
    
    # Find section headers
    blocks = []
    for i, match in enumerate(matches):
        match_start = content.find(f'```mermaid\n{match}')
        content_before = content[:match_start]
        header_matches = re.findall(r'^#+\s+(.+?)$', content_before, re.MULTILINE)
        
        section = header_matches[-1] if header_matches else f"diagram_{i+1}"
        diagram_name = f"{i+1:02d}_{section}"
        diagram_name = re.sub(r'[^a-zA-Z0-9_-]', '_', diagram_name)[:50]
        
        blocks.append((diagram_name, match.strip()))
    
    logger.info(f"Found {len(blocks)} mermaid diagrams to export")
    
    generated_pngs = []
    base_name = markdown_path.stem
    temp_dir = output_dir / '.mermaid_temp'
    temp_dir.mkdir(exist_ok=True)
    
    try:
        for idx, (diagram_name, mermaid_code) in enumerate(blocks, 1):
            mmd_file = temp_dir / f"{base_name}_{diagram_name}.mmd"
            png_file = output_dir / f"{base_name}_{diagram_name}.png"
            
            with open(mmd_file, 'w', encoding='utf-8') as f:
                f.write(mermaid_code)
            
            logger.info(f"Exporting diagram {idx}/{len(blocks)}: {diagram_name}")
            
            cmd = [
                'npx', '--yes', '@mermaid-js/mermaid-cli',
                '-i', str(mmd_file),
                '-o', str(png_file),
                '-s', str(scale),
                '-b', background
            ]
            
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                
                if result.returncode == 0 and png_file.exists():
                    generated_pngs.append(str(png_file))
                    logger.info(f"  ✓ Generated: {png_file.name}")
                else:
                    logger.warning(f"  ✗ Failed: {png_file.name}")
                    
            except subprocess.TimeoutExpired:
                logger.warning(f"  ✗ Timeout: {png_file.name}")
            except Exception as e:
                logger.warning(f"  ✗ Error: {e}")
    
    finally:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass
    
    return generated_pngs


class ExcelToAgenticMigrator:
    """Convert Excel analysis to agent-based structure for migration"""
    
    def __init__(self, excel_analyzer: ExcelAnalyzer):
        self.analyzer = excel_analyzer
        if not self.analyzer.analysis_results:
            self.analyzer.extract_all_logic()
        self.analysis = self.analyzer.analysis_results
        
    def create_agent_structure(self) -> Dict[str, Any]:
        """Convert Excel logic to agent-based structure"""
        logger.info("Creating agent-based structure for migration...")
        
        agents = {
            'metadata': {
                'source_file': self.analysis['file_info']['file_name'],
                'conversion_timestamp': datetime.now().isoformat(),
                'complexity_score': self.analysis['summary_stats']['formula_complexity_score'],
                'functions_used': self.analysis['summary_stats'].get('unique_functions_used', [])
            },
            'calculation_agents': self.create_calculation_agents(),
            'validation_agents': self.create_validation_agents(),
            'workflow_agents': self.create_workflow_agents(),
            'data_agents': self.create_data_agents(),
            'dependency_graph': self.create_dependency_graph()
        }
        
        return agents
    
    def create_calculation_agents(self) -> List[Dict[str, Any]]:
        """Convert formulas to calculation agents"""
        agents = []
        
        for sheet_name, sheet_data in self.analysis['sheets'].items():
            for cell, formula_info in sheet_data['formulas'].items():
                agent = {
                    'type': 'calculator',
                    'id': f"{sheet_name}_{cell}",
                    'sheet': sheet_name,
                    'cell': cell,
                    'formula': formula_info['formula'],
                    'dependencies': formula_info.get('references', []),
                    'functions_used': formula_info.get('functions_used', []),
                    'output_format': formula_info.get('number_format'),
                    'priority': self.calculate_agent_priority(formula_info)
                }
                agents.append(agent)
        
        return agents
    
    def create_validation_agents(self) -> List[Dict[str, Any]]:
        """Create validation agents from data validation rules"""
        agents = []
        
        for sheet_name, sheet_data in self.analysis['sheets'].items():
            for cells, rule in sheet_data.get('data_validation', {}).items():
                agent = {
                    'type': 'validator',
                    'id': f"validation_{sheet_name}_{cells[:20]}",
                    'sheet': sheet_name,
                    'cells': cells,
                    'validation_type': rule.get('type'),
                    'formula1': rule.get('formula1'),
                    'formula2': rule.get('formula2'),
                    'operator': rule.get('operator'),
                    'allow_blank': rule.get('allow_blank'),
                    'error_message': rule.get('error')
                }
                agents.append(agent)
        
        return agents
    
    def create_workflow_agents(self) -> List[Dict[str, Any]]:
        """Create workflow agents based on dependencies"""
        agents = []
        
        for source_sheet, references in self.analysis.get('cross_sheet_references', {}).items():
            for ref in references:
                agent = {
                    'type': 'workflow',
                    'id': f"workflow_{source_sheet}_to_{ref['target_sheet']}",
                    'source_sheet': source_sheet,
                    'target_sheet': ref['target_sheet'],
                    'source_cell': ref['source_cell'],
                    'target_reference': ref['target_reference'],
                    'formula': ref['formula']
                }
                agents.append(agent)
        
        return agents
    
    def create_data_agents(self) -> List[Dict[str, Any]]:
        """Create data agents for managing data flow"""
        agents = []
        
        for sheet_name, sheet_data in self.analysis['sheets'].items():
            agent = {
                'type': 'data_manager',
                'id': f"data_{sheet_name}",
                'sheet': sheet_name,
                'dimensions': sheet_data['dimensions'],
                'total_cells': sheet_data['statistics']['total_cells_with_values'],
                'has_tables': len(sheet_data.get('tables', [])) > 0,
                'has_pivot_tables': len(sheet_data.get('pivot_tables', [])) > 0,
                'merged_cells': sheet_data.get('merged_cells', [])
            }
            agents.append(agent)
        
        return agents
    
    def create_dependency_graph(self) -> Dict[str, Any]:
        """Create a dependency graph for formula execution order"""
        graph = {
            'nodes': [],
            'edges': []
        }
        
        for sheet_name, sheet_data in self.analysis['sheets'].items():
            for cell, formula_info in sheet_data['formulas'].items():
                node = {
                    'id': f"{sheet_name}_{cell}",
                    'sheet': sheet_name,
                    'cell': cell,
                    'formula': formula_info['formula']
                }
                graph['nodes'].append(node)
                
                for ref in formula_info.get('references', []):
                    edge = {
                        'source': f"{sheet_name}_{cell}",
                        'target': ref,
                        'type': 'depends_on'
                    }
                    graph['edges'].append(edge)
        
        return graph
    
    def calculate_agent_priority(self, formula_info: Dict[str, Any]) -> int:
        """Calculate priority for agent execution based on complexity"""
        priority = 0
        
        priority += len(formula_info.get('references', [])) * 2
        
        complex_functions = {'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH', 
                           'INDIRECT', 'OFFSET', 'IRR', 'XIRR', 'NPV', 'XNPV'}
        for func in formula_info.get('functions_used', []):
            if func in complex_functions:
                priority += 5
        
        return priority
    
    def export_agent_structure(self, output_path: Optional[str] = None) -> str:
        """Export agent structure to JSON"""
        if output_path is None:
            output_path = str(self.analyzer.file_path.stem) + "_agents.json"
        
        agents = self.create_agent_structure()
        
        logger.info(f"Exporting agent structure to {output_path}...")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(agents, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Agent structure exported successfully to {output_path}")
        return output_path


def create_parser() -> argparse.ArgumentParser:
    """Create command-line argument parser"""
    parser = argparse.ArgumentParser(
        description='Excel Deep Analyzer for Agentic OS Migration',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s "Debt Analyzer_New Asset Manager Tool.xlsx"
  %(prog)s "Equity Evaluator Tool.xlsx" --output-dir ./reports
  %(prog)s file.xlsx --extract-vba --mermaid
  %(prog)s file.xlsx --mermaid --png          # Generate diagrams + PNG exports
  %(prog)s file.xlsx --png --png-scale 5      # Higher resolution PNGs
  %(prog)s file.xlsx --all                    # Generate all outputs including PNG
  %(prog)s file.xlsx --validate               # AI validation with 3 iterations
  %(prog)s file.xlsx --validate --validate-iterations 5
  %(prog)s file.xlsx --validate --validate-provider anthropic --validate-model claude-3-5-sonnet-20241022
  %(prog)s file.xlsx --sample-size 5000 --verbose
  %(prog)s file.xlsx --json-only

Environment Variables:
  OPENAI_API_KEY      Required for --validate with OpenAI
  ANTHROPIC_API_KEY   Required for --validate with Anthropic
        """
    )
    
    parser.add_argument(
        'excel_file',
        nargs='?',
        help='Path to the Excel file to analyze'
    )
    
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List available Excel files in the current directory'
    )
    
    parser.add_argument(
        '--output-dir', '-o',
        type=str,
        default='.',
        help='Directory for output files (default: current directory)'
    )
    
    parser.add_argument(
        '--sample-size', '-s',
        type=int,
        default=1000,
        help='Maximum number of cells to sample for values (default: 1000)'
    )
    
    parser.add_argument(
        '--json-only',
        action='store_true',
        help='Only export JSON analysis (skip text report and agents)'
    )
    
    parser.add_argument(
        '--no-agents',
        action='store_true',
        help='Skip agent structure generation'
    )
    
    parser.add_argument(
        '--extract-vba',
        action='store_true',
        help='Extract VBA macro code to a separate file'
    )
    
    parser.add_argument(
        '--mermaid',
        action='store_true',
        help='Generate Mermaid diagram showing logic and dependencies'
    )
    
    parser.add_argument(
        '--png',
        action='store_true',
        help='Export Mermaid diagrams as high-resolution PNG images (requires Node.js)'
    )
    
    parser.add_argument(
        '--png-scale',
        type=int,
        default=3,
        help='Scale factor for PNG export (default: 3 for high resolution)'
    )
    
    parser.add_argument(
        '--png-background',
        type=str,
        default='white',
        help='Background color for PNG export (default: white, use "transparent" for transparent)'
    )
    
    parser.add_argument(
        '--all',
        action='store_true',
        help='Generate all outputs (JSON, report, agents, VBA, Mermaid, PNG)'
    )
    
    parser.add_argument(
        '--human-hints',
        action='store_true',
        help='Extract human-readable hints, documentation, and cognitive clarity tips from the workbook'
    )
    
    parser.add_argument(
        '--spec-extract',
        action='store_true',
        help='Extract SaaS specification: data model, required inputs, and calculation logic from placeholder formulas'
    )
    
    # =========================================================================
    # SAAS BLUEPRINT EXTRACTION OPTIONS
    # =========================================================================
    parser.add_argument(
        '--saas-blueprint',
        action='store_true',
        help='Generate complete SaaS application blueprint (runs all 4 phases)'
    )
    
    parser.add_argument(
        '--ui-inventory',
        action='store_true',
        help='Phase 1: Extract UI & Component Inventory (colors, fonts, patterns)'
    )
    
    parser.add_argument(
        '--screen-breakdown',
        action='store_true',
        help='Phase 2: Extract Screen & Feature Breakdown'
    )
    
    parser.add_argument(
        '--workflows',
        action='store_true',
        help='Phase 3: Extract User Workflows (UX journeys)'
    )
    
    parser.add_argument(
        '--data-model',
        action='store_true',
        help='Phase 4: Extract Inferred Data Model (schema generation)'
    )
    
    parser.add_argument(
        '--validate',
        action='store_true',
        help='Run AI-powered semantic validation with reasoning traces (requires API key)'
    )
    
    parser.add_argument(
        '--validate-iterations',
        type=int,
        default=3,
        help='Number of validation iterations (default: 3)'
    )
    
    parser.add_argument(
        '--validate-provider',
        type=str,
        default='openai',
        choices=['openai', 'anthropic'],
        help='LLM provider for validation (default: openai)'
    )
    
    parser.add_argument(
        '--validate-model',
        type=str,
        default=None,
        help='LLM model for validation (default: from model_roles)'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose (debug) logging'
    )
    
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress all output except errors'
    )
    
    return parser


def list_excel_files(directory: str = '.') -> List[Path]:
    """List Excel files in a directory"""
    path = Path(directory)
    excel_extensions = {'.xlsx', '.xlsm', '.xls', '.xlsb'}
    files = [f for f in path.iterdir() 
             if f.is_file() and f.suffix.lower() in excel_extensions]
    return sorted(files)


def main():
    """Main execution function"""
    parser = create_parser()
    args = parser.parse_args()
    
    # Configure logging level
    if args.quiet:
        logging.getLogger().setLevel(logging.ERROR)
    elif args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # List mode
    if args.list:
        files = list_excel_files()
        if files:
            print("Available Excel files:")
            for f in files:
                size_mb = f.stat().st_size / (1024 * 1024)
                print(f"  - {f.name} ({size_mb:.2f} MB)")
        else:
            print("No Excel files found in the current directory.")
        return 0
    
    # Require file argument if not in list mode
    if not args.excel_file:
        parser.print_help()
        print("\nError: Excel file path is required.")
        files = list_excel_files()
        if files:
            print("\nAvailable Excel files in current directory:")
            for f in files:
                print(f"  - {f.name}")
        return 1
    
    # Verify file exists
    excel_path = Path(args.excel_file)
    if not excel_path.exists():
        logger.error(f"File not found: {args.excel_file}")
        return 1
    
    # Create output directory if needed
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 80)
    print("EXCEL DEEP ANALYZER FOR AGENTIC OS MIGRATION")
    print("=" * 80)
    
    try:
        # Initialize analyzer
        analyzer = ExcelAnalyzer(str(excel_path), sample_size=args.sample_size)
        
        # Perform deep analysis
        analysis = analyzer.extract_all_logic()
        
        print("\n" + "=" * 80)
        print("ANALYSIS COMPLETE")
        print("=" * 80)
        
        # Export results
        json_path = analyzer.export_to_json(
            str(output_dir / (excel_path.stem + "_analysis.json"))
        )
        
        report_path = None
        agents_path = None
        vba_path = None
        mermaid_path = None
        
        if not args.json_only:
            report_path = analyzer.generate_report(
                str(output_dir / (excel_path.stem + "_report.txt"))
            )
            
            if not args.no_agents:
                migrator = ExcelToAgenticMigrator(analyzer)
                agents_path = migrator.export_agent_structure(
                    str(output_dir / (excel_path.stem + "_agents.json"))
                )
        
        # Extract VBA if requested
        if args.extract_vba or args.all:
            if analysis['vba_macros']['has_vba']:
                analyzer.extract_vba_code(output_dir)
                base_name = excel_path.stem.replace(' ', '_')
                # Check which file was created
                vba_file = output_dir / f"{base_name}_VBA_Code.vb"
                info_file = output_dir / f"{base_name}_VBA_Info.txt"
                if vba_file.exists():
                    vba_path = str(vba_file)
                elif info_file.exists():
                    vba_path = str(info_file)
            else:
                logger.info("No VBA macros found to extract")
        
        # Generate Mermaid diagram if requested
        png_paths = []
        if args.mermaid or args.png or args.all:
            base_name = excel_path.stem.replace(' ', '_')
            mermaid_path = analyzer.generate_mermaid_logic(
                str(output_dir / f"{base_name}_Logic_Diagram.md")
            )
            
            # Export to PNG if requested
            if args.png or args.all:
                png_paths = analyzer.export_mermaid_to_png(
                    mermaid_path,
                    output_dir=output_dir,
                    scale=args.png_scale,
                    background=args.png_background
                )
        
        # Extract human hints if requested
        hints_path = None
        if args.human_hints or args.all:
            hints_path = analyzer.extract_human_hints(output_dir=output_dir)
        
        # Extract SaaS specification if requested
        spec_path = None
        if args.spec_extract:
            spec_path = analyzer.extract_saas_specification(output_dir=output_dir)
        
        # =====================================================================
        # SAAS BLUEPRINT EXTRACTION
        # =====================================================================
        blueprint_files = {}
        
        # Full SaaS Blueprint (all 4 phases + implementation guide)
        if args.saas_blueprint or args.all:
            blueprint_files = analyzer.generate_saas_blueprint(output_dir=output_dir)
        else:
            # Individual phases
            if args.ui_inventory:
                blueprint_files['ui_inventory'] = analyzer.extract_ui_inventory(output_dir=output_dir)
            
            if args.screen_breakdown:
                blueprint_files['screen_breakdown'] = analyzer.extract_screen_breakdown(output_dir=output_dir)
            
            if args.workflows:
                blueprint_files['workflows'] = analyzer.extract_user_workflows(output_dir=output_dir)
            
            if args.data_model:
                blueprint_files['data_model'] = analyzer.extract_data_model(output_dir=output_dir)
        
        # Run AI validation if requested
        validation_paths = []
        if args.validate:
            validation_paths = analyzer.validate_with_ai(
                output_dir=output_dir,
                iterations=args.validate_iterations,
                model=args.validate_model,
                provider=args.validate_provider
            )
        
        # Print summary
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Total Sheets Analyzed: {analysis['summary_stats']['total_sheets']}")
        print(f"Total Formulas Extracted: {analysis['summary_stats']['total_formulas']}")
        print(f"Total Named Ranges: {analysis['summary_stats']['total_named_ranges']}")
        print(f"Has VBA Macros: {analysis['summary_stats']['has_vba_macros']}")
        print(f"Unique Functions Used: {len(analysis['summary_stats'].get('unique_functions_used', []))}")
        print(f"Complexity Score: {analysis['summary_stats']['formula_complexity_score']}")
        
        if analysis['summary_stats'].get('function_usage_counts'):
            print("\nTop 10 Functions Used:")
            sorted_funcs = sorted(
                analysis['summary_stats']['function_usage_counts'].items(),
                key=lambda x: x[1], 
                reverse=True
            )[:10]
            for func, count in sorted_funcs:
                print(f"  {func}: {count}")
        
        print(f"\nOutput Files Generated:")
        print(f"  - JSON Analysis: {json_path}")
        if report_path:
            print(f"  - Text Report: {report_path}")
        if agents_path:
            print(f"  - Agent Structure: {agents_path}")
        if vba_path:
            print(f"  - VBA Code: {vba_path}")
        if mermaid_path:
            print(f"  - Mermaid Diagram: {mermaid_path}")
        if png_paths:
            print(f"  - PNG Diagrams ({len(png_paths)} files):")
            for png in png_paths[:5]:  # Show first 5
                print(f"      • {Path(png).name}")
            if len(png_paths) > 5:
                print(f"      ... and {len(png_paths) - 5} more")
        if hints_path:
            print(f"  - Human Hints: {Path(hints_path).name}")
        if spec_path:
            print(f"  - SaaS Specification: {Path(spec_path).name}")
        if blueprint_files:
            print(f"  - SaaS Blueprint ({len(blueprint_files)} files):")
            for key, path in blueprint_files.items():
                print(f"      • {Path(path).name}")
        if validation_paths:
            print(f"  - AI Validation ({len(validation_paths)} files):")
            for vpath in validation_paths:
                print(f"      • {Path(vpath).name}")
        
        print("\n" + "=" * 80)
        print("READY FOR AGENTIC OS MIGRATION")
        print("=" * 80)
        
        return 0
        
    except FileNotFoundError as e:
        logger.error(str(e))
        return 1
    except Exception as e:
        logger.exception(f"Analysis failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
