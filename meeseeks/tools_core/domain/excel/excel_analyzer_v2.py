#!/usr/bin/env python3
"""
Excel Deep Analyzer for Agentic OS Migration
Extracts all formulas, logic, dependencies, and structure from Excel files
"""

import openpyxl
import pandas as pd
import json
import re
from pathlib import Path
from collections import defaultdict
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

class ExcelAnalyzer:
    """Deep analysis tool for Excel files to extract all logic and formulas"""
    
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self.file_name = self.file_path.name
        
        print(f"Loading Excel file: {self.file_name}")
        print("Loading workbook with formulas...")
        self.formula_workbook = openpyxl.load_workbook(
            file_path, 
            data_only=False, 
            keep_vba=True,
            keep_links=True
        )
        
        print("Loading workbook with calculated values...")
        self.value_workbook = openpyxl.load_workbook(
            file_path, 
            data_only=True
        )
        
        self.analysis_results = {}
        
    def extract_all_logic(self):
        """Extract complete Excel logic and structure"""
        print("\n=== Starting Deep Excel Analysis ===\n")
        
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
            print(f"Analyzing sheet {idx}/{total_sheets}: {sheet_name}")
            sheet_analysis = self.analyze_sheet(sheet_name)
            analysis['sheets'][sheet_name] = sheet_analysis
            
        # Extract cross-sheet dependencies
        analysis['cross_sheet_references'] = self.extract_cross_sheet_references(analysis['sheets'])
        
        # Generate summary statistics
        analysis['summary_stats'] = self.generate_summary_stats(analysis)
        
        self.analysis_results = analysis
        return analysis
    
    def extract_file_info(self):
        """Extract basic file information"""
        return {
            'file_name': self.file_name,
            'file_path': str(self.file_path),
            'file_size_mb': round(self.file_path.stat().st_size / (1024 * 1024), 2),
            'analysis_timestamp': datetime.now().isoformat()
        }
    
    def extract_metadata(self):
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
    
    def analyze_sheet(self, sheet_name):
        """Deep analysis of a single sheet"""
        formula_sheet = self.formula_workbook[sheet_name]
        value_sheet = self.value_workbook[sheet_name]
        
        print(f"  - Extracting formulas...")
        formulas = self.extract_formulas(formula_sheet)
        
        print(f"  - Extracting values...")
        values = self.extract_values(value_sheet)
        
        print(f"  - Mapping dependencies...")
        dependencies = self.map_dependencies(formula_sheet)
        
        print(f"  - Extracting validation rules...")
        validation = self.extract_validation_rules(formula_sheet)
        
        print(f"  - Extracting conditional formatting...")
        conditional_fmt = self.extract_conditional_formatting(formula_sheet)
        
        print(f"  - Detecting tables and pivot tables...")
        tables = self.detect_tables(formula_sheet)
        
        print(f"  - Detecting charts...")
        charts = self.detect_charts(formula_sheet)
        
        return {
            'sheet_name': sheet_name,
            'formulas': formulas,
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
                'total_formulas': len(formulas),
                'total_cells_with_values': len(values),
                'total_dependencies': len(dependencies),
                'total_validation_rules': len(validation),
                'total_conditional_formats': len(conditional_fmt)
            }
        }
    
    def extract_formulas(self, sheet):
        """Extract all formulas with their locations and details"""
        formulas = {}
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str) and cell.value.startswith('='):
                    formulas[cell.coordinate] = {
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
        return formulas
    
    def extract_values(self, sheet, sample_size=1000):
        """Extract cell values (limited sample for large sheets)"""
        values = {}
        cell_count = 0
        
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    values[cell.coordinate] = {
                        'value': str(cell.value)[:500] if cell.value else None,  # Limit string length
                        'data_type': cell.data_type,
                        'number_format': cell.number_format
                    }
                    cell_count += 1
                    
                    # Limit sample size for very large sheets
                    if cell_count >= sample_size:
                        values['_truncated'] = True
                        return values
        
        return values
    
    def map_dependencies(self, sheet):
        """Map formula dependencies between cells"""
        dependencies = defaultdict(list)
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
    
    def parse_cell_references(self, formula):
        """Extract cell references from a formula"""
        if not formula:
            return []
        
        # Pattern for various cell reference formats
        patterns = [
            r"(?P<sheet>[\w\s]+!)?(?P<cell>\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)",  # Regular references
            r"(?P<sheet>'[^']+')!(?P<cell>\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)",   # Sheet names with spaces
        ]
        
        references = []
        for pattern in patterns:
            matches = re.finditer(pattern, formula, re.IGNORECASE)
            for match in matches:
                ref = match.group(0)
                if ref and not ref.startswith('$'):  # Avoid duplicates from absolute refs
                    references.append(ref)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_refs = []
        for ref in references:
            if ref not in seen:
                seen.add(ref)
                unique_refs.append(ref)
        
        return unique_refs
    
    def extract_functions(self, formula):
        """Extract Excel functions used in a formula"""
        if not formula:
            return []
        
        # Pattern for Excel functions
        pattern = r'\b([A-Z][A-Z0-9\.]*)\s*\('
        functions = re.findall(pattern, formula, re.IGNORECASE)
        
        # Common Excel functions to validate against
        excel_functions = {
            'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'COUNTIF', 'SUMIF', 'IF', 'IFERROR',
            'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'OFFSET', 'INDIRECT',
            'MAX', 'MIN', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'ABS', 'SQRT',
            'CONCATENATE', 'TEXT', 'VALUE', 'LEN', 'LEFT', 'RIGHT', 'MID',
            'DATE', 'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY',
            'AND', 'OR', 'NOT', 'XOR', 'TRUE', 'FALSE',
            'PMT', 'PV', 'FV', 'NPV', 'IRR', 'RATE', 'NPER',
            'SUBTOTAL', 'SUMPRODUCT', 'TRANSPOSE', 'UNIQUE', 'FILTER', 'SORT'
        }
        
        # Filter to only include valid Excel functions
        valid_functions = [f.upper() for f in functions if f.upper() in excel_functions]
        return list(set(valid_functions))
    
    def extract_named_ranges(self):
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
        except:
            pass  # No named ranges defined
        return named_ranges
    
    def extract_validation_rules(self, sheet):
        """Extract data validation rules"""
        validation_rules = {}
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
        return validation_rules
    
    def extract_conditional_formatting(self, sheet):
        """Extract conditional formatting rules"""
        cf_rules = []
        for cf in sheet.conditional_formatting:
            rule_info = {
                'cells': str(cf.cells),
                'rules': []
            }
            for rule in cf.cfRule:
                rule_data = {
                    'type': rule.type,
                    'priority': rule.priority,
                    'formula': rule.formula if hasattr(rule, 'formula') else None,
                    'operator': rule.operator if hasattr(rule, 'operator') else None,
                    'text': rule.text if hasattr(rule, 'text') else None,
                    'dxf_id': rule.dxfId if hasattr(rule, 'dxfId') else None
                }
                rule_info['rules'].append(rule_data)
            cf_rules.append(rule_info)
        return cf_rules
    
    def detect_tables(self, sheet):
        """Detect Excel tables in the sheet"""
        tables = []
        if hasattr(sheet, 'tables'):
            for table in sheet.tables.values():
                tables.append({
                    'name': table.displayName,
                    'ref': table.ref,
                    'table_style': table.tableStyleInfo.name if table.tableStyleInfo else None,
                    'totals_row': table.totalsRowCount > 0 if hasattr(table, 'totalsRowCount') else False
                })
        return tables
    
    def detect_pivot_tables(self, sheet):
        """Detect pivot tables in the sheet"""
        pivot_tables = []
        # Check for pivot tables (simplified detection)
        if hasattr(sheet, '_pivots'):
            for pivot in sheet._pivots:
                pivot_tables.append({
                    'location': str(pivot.location) if hasattr(pivot, 'location') else 'Unknown',
                    'cache_id': pivot.cacheId if hasattr(pivot, 'cacheId') else None
                })
        return pivot_tables
    
    def detect_charts(self, sheet):
        """Detect charts in the sheet"""
        charts = []
        if hasattr(sheet, '_charts'):
            for chart in sheet._charts:
                chart_info = {
                    'type': type(chart).__name__,
                    'title': chart.title if hasattr(chart, 'title') else None,
                }
                charts.append(chart_info)
        return charts
    
    def check_for_vba(self):
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
        except:
            vba_info['message'] = "No VBA macros detected or unable to check"
        
        return vba_info
    
    def extract_external_links(self):
        """Extract external links and references"""
        external_links = []
        
        # Check for external links in formulas
        for sheet_name in self.formula_workbook.sheetnames:
            sheet = self.formula_workbook[sheet_name]
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.value and isinstance(cell.value, str) and '[' in cell.value:
                        # External reference pattern
                        pattern = r'\[([^\]]+)\]'
                        matches = re.findall(pattern, cell.value)
                        for match in matches:
                            external_links.append({
                                'sheet': sheet_name,
                                'cell': cell.coordinate,
                                'external_file': match,
                                'formula': cell.value
                            })
        
        return external_links
    
    def extract_cross_sheet_references(self, sheets_analysis):
        """Extract references between sheets"""
        cross_refs = defaultdict(list)
        
        for sheet_name, sheet_data in sheets_analysis.items():
            for cell, formula_data in sheet_data.get('formulas', {}).items():
                references = formula_data.get('references', [])
                for ref in references:
                    if '!' in ref:
                        # This is a cross-sheet reference
                        target_sheet = ref.split('!')[0].strip("'")
                        if target_sheet != sheet_name:
                            cross_refs[sheet_name].append({
                                'source_cell': cell,
                                'target_sheet': target_sheet,
                                'target_reference': ref,
                                'formula': formula_data['formula']
                            })
        
        return dict(cross_refs)
    
    def generate_summary_stats(self, analysis):
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
            'formula_complexity_score': 0
        }
        
        # Find most complex sheet
        max_formulas = 0
        for sheet_name, sheet_data in analysis['sheets'].items():
            formula_count = sheet_data['statistics']['total_formulas']
            if formula_count > max_formulas:
                max_formulas = formula_count
                stats['most_complex_sheet'] = sheet_name
        
        # Calculate complexity score
        stats['formula_complexity_score'] = self.calculate_complexity_score(analysis)
        
        return stats
    
    def calculate_complexity_score(self, analysis):
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
        
        return score
    
    def export_to_json(self, output_path=None):
        """Export analysis to JSON"""
        if not self.analysis_results:
            self.extract_all_logic()
        
        if output_path is None:
            output_path = self.file_path.stem + "_analysis.json"
        
        print(f"\nExporting analysis to {output_path}...")
        
        # Convert any non-serializable objects to strings
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
        
        print(f"Analysis exported successfully to {output_path}")
        return output_path
    
    def generate_report(self, output_path=None):
        """Generate a human-readable report"""
        if not self.analysis_results:
            self.extract_all_logic()
        
        if output_path is None:
            output_path = self.file_path.stem + "_report.txt"
        
        print(f"\nGenerating report to {output_path}...")
        
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
                
                # Sample formulas
                if sheet_data['formulas']:
                    f.write(f"    Sample Formulas (first 5):\n")
                    for i, (cell, formula) in enumerate(list(sheet_data['formulas'].items())[:5]):
                        f.write(f"      {cell}: {formula['formula'][:50]}...\n")
                        if i >= 4:
                            break
            
            f.write("\n" + "=" * 80 + "\n")
            f.write("END OF REPORT\n")
        
        print(f"Report generated successfully to {output_path}")
        return output_path


class ExcelToAgenticMigrator:
    """Convert Excel analysis to agent-based structure for migration"""
    
    def __init__(self, excel_analyzer):
        self.analyzer = excel_analyzer
        if not self.analyzer.analysis_results:
            self.analyzer.extract_all_logic()
        self.analysis = self.analyzer.analysis_results
        
    def create_agent_structure(self):
        """Convert Excel logic to agent-based structure"""
        print("\nCreating agent-based structure for migration...")
        
        agents = {
            'metadata': {
                'source_file': self.analysis['file_info']['file_name'],
                'conversion_timestamp': datetime.now().isoformat(),
                'complexity_score': self.analysis['summary_stats']['formula_complexity_score']
            },
            'calculation_agents': self.create_calculation_agents(),
            'validation_agents': self.create_validation_agents(),
            'workflow_agents': self.create_workflow_agents(),
            'data_agents': self.create_data_agents(),
            'dependency_graph': self.create_dependency_graph()
        }
        
        return agents
    
    def create_calculation_agents(self):
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
    
    def create_validation_agents(self):
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
    
    def create_workflow_agents(self):
        """Create workflow agents based on dependencies"""
        agents = []
        
        # Create workflow for cross-sheet references
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
    
    def create_data_agents(self):
        """Create data agents for managing data flow"""
        agents = []
        
        for sheet_name, sheet_data in self.analysis['sheets'].items():
            # Create a data agent for each sheet
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
    
    def create_dependency_graph(self):
        """Create a dependency graph for formula execution order"""
        graph = {
            'nodes': [],
            'edges': []
        }
        
        # Create nodes for each formula cell
        for sheet_name, sheet_data in self.analysis['sheets'].items():
            for cell, formula_info in sheet_data['formulas'].items():
                node = {
                    'id': f"{sheet_name}_{cell}",
                    'sheet': sheet_name,
                    'cell': cell,
                    'formula': formula_info['formula']
                }
                graph['nodes'].append(node)
                
                # Create edges for dependencies
                for ref in formula_info.get('references', []):
                    edge = {
                        'source': f"{sheet_name}_{cell}",
                        'target': ref,
                        'type': 'depends_on'
                    }
                    graph['edges'].append(edge)
        
        return graph
    
    def calculate_agent_priority(self, formula_info):
        """Calculate priority for agent execution based on complexity"""
        priority = 0
        
        # Higher priority for more dependencies
        priority += len(formula_info.get('references', [])) * 2
        
        # Higher priority for complex functions
        complex_functions = ['VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'INDIRECT', 'OFFSET']
        for func in formula_info.get('functions_used', []):
            if func in complex_functions:
                priority += 5
        
        return priority
    
    def export_agent_structure(self, output_path=None):
        """Export agent structure to JSON"""
        if output_path is None:
            output_path = self.analyzer.file_path.stem + "_agents.json"
        
        agents = self.create_agent_structure()
        
        print(f"\nExporting agent structure to {output_path}...")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(agents, f, indent=2, ensure_ascii=False)
        
        print(f"Agent structure exported successfully to {output_path}")
        return output_path


def main():
    """Main execution function"""
    print("=" * 80)
    print("EXCEL DEEP ANALYZER FOR AGENTIC OS MIGRATION")
    print("=" * 80)
    
    # Specify the Excel file to analyze
    excel_file = "3.4 Presenting the Preliminary Plan Template.xlsm.xlsx"
    
    # Initialize analyzer
    analyzer = ExcelAnalyzer(excel_file)
    
    # Perform deep analysis
    analysis = analyzer.extract_all_logic()
    
    print("\n" + "=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)
    
    # Export results
    json_path = analyzer.export_to_json()
    report_path = analyzer.generate_report()
    
    # Create agentic structure
    migrator = ExcelToAgenticMigrator(analyzer)
    agents_path = migrator.export_agent_structure()
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total Sheets Analyzed: {analysis['summary_stats']['total_sheets']}")
    print(f"Total Formulas Extracted: {analysis['summary_stats']['total_formulas']}")
    print(f"Total Named Ranges: {analysis['summary_stats']['total_named_ranges']}")
    print(f"Has VBA Macros: {analysis['summary_stats']['has_vba_macros']}")
    print(f"Complexity Score: {analysis['summary_stats']['formula_complexity_score']}")
    print(f"\nOutput Files Generated:")
    print(f"  - JSON Analysis: {json_path}")
    print(f"  - Text Report: {report_path}")
    print(f"  - Agent Structure: {agents_path}")
    print("\n" + "=" * 80)
    print("READY FOR AGENTIC OS MIGRATION")
    print("=" * 80)


if __name__ == "__main__":
    main()
