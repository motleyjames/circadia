"""
Data Ingester - Parse incoming data from various sources

Supports: CSV, JSON, TSV
"""

import re
import csv
import json
import logging
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class DataIngester:
    """
    Extracts structured data from various input sources.
    
    Supports:
    - CSV files
    - JSON files
    - Tab-delimited files
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
            sample = f.read(8192)
            f.seek(0)
            
            try:
                dialect = csv.Sniffer().sniff(sample)
            except csv.Error:
                dialect = csv.excel
            
            reader = csv.DictReader(f, dialect=dialect)
            headers = reader.fieldnames or []
            
            for row in reader:
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
        
        numeric_str = re.sub(r'[$,€£¥]', '', value)
        
        if value.endswith('%'):
            try:
                return float(numeric_str.rstrip('%')) / 100
            except ValueError:
                pass
        
        if numeric_str.startswith('(') and numeric_str.endswith(')'):
            numeric_str = '-' + numeric_str[1:-1]
        
        try:
            num = float(numeric_str)
            if num.is_integer():
                return int(num)
            return num
        except ValueError:
            pass
        
        date_patterns = [
            r'^\d{4}-\d{2}-\d{2}$',
            r'^\d{2}/\d{2}/\d{4}$',
            r'^\d{2}-\d{2}-\d{4}$'
        ]
        for pattern in date_patterns:
            if re.match(pattern, value):
                return value
        
        return value
    
    def _infer_column_types(self, rows: List[Dict], headers: List[str]) -> Dict[str, str]:
        """Infer data types for each column"""
        types = {}
        
        for header in headers:
            values = [row.get(header) for row in rows if row.get(header) is not None]
            
            if not values:
                types[header] = 'empty'
                continue
            
            all_int = all(isinstance(v, int) for v in values)
            all_float = all(isinstance(v, (int, float)) for v in values)
            all_str = all(isinstance(v, str) for v in values)
            
            if all_int:
                types[header] = 'integer'
            elif all_float:
                types[header] = 'number'
            elif all_str:
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
        
        name_lower = path.stem.lower()
        source_map = {
            'schwab': 'Schwab',
            'merrill': 'Merrill Lynch',
            'etrade': 'E*Trade',
            'fidelity': 'Fidelity',
            'quicken': 'Quicken'
        }
        
        for key, source in source_map.items():
            if key in name_lower:
                metadata['inferred_source'] = source
                break
        
        return metadata

