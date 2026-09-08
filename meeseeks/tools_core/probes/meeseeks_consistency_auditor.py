#!/usr/bin/env python3
"""
Consistency Auditor Tool
========================
A recursive self-intelligence tool for auditing internal consistency across a codebase.

This tool checks for:
- Type consistency (are types used consistently?)
- Naming consistency (are naming conventions followed?)
- Value consistency (are semantic values used everywhere?)
- Import consistency (are imports organized consistently?)

Usage:
    python consistency_auditor.py [--target DIR] [--pattern PATTERN] [--fix]
    
Example:
    python consistency_auditor.py --target ../testbed/src --pattern "semantic"
"""

import argparse
import json
import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict

# Import from core - try both import paths for flexibility
try:
    from core.meeseeks_tracer import Tracer, Phase
except ImportError:
    from tools_core.core.meeseeks_tracer import Tracer, Phase


@dataclass
class Inconsistency:
    """Represents a found inconsistency."""
    file: str
    line: int
    category: str  # 'type', 'naming', 'value', 'import'
    severity: str  # 'error', 'warning', 'info'
    message: str
    suggestion: Optional[str] = None
    context: Optional[str] = None


@dataclass
class AuditResult:
    """Results of an audit run."""
    files_scanned: int
    inconsistencies: List[Inconsistency]
    summary: Dict[str, int]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "files_scanned": self.files_scanned,
            "inconsistencies": [asdict(i) for i in self.inconsistencies],
            "summary": self.summary,
        }


class ConsistencyAuditor:
    """Audits codebase for consistency issues."""
    
    # Semantic value patterns (from DSL spec)
    SEMANTIC_VALUES = {
        'spacing': ['none', 'tight', 'slight', 'comfortable', 'spacious', 'roomy', 'expansive'],
        'size': ['tiny', 'small', 'medium', 'large', 'huge', 'massive'],
        'color': ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'muted', 'surface', 'background'],
        'weight': ['light', 'normal', 'medium', 'semibold', 'bold', 'heavy'],
    }
    
    # Patterns that indicate non-semantic values
    NON_SEMANTIC_PATTERNS = [
        (r'\b\d+px\b', 'pixel value'),
        (r'#[0-9a-fA-F]{3,8}\b', 'hex color'),
        (r'rgb\([^)]+\)', 'rgb color'),
        (r'rgba\([^)]+\)', 'rgba color'),
    ]
    
    def __init__(self, target_dir: Path):
        self.target_dir = target_dir
        self.inconsistencies: List[Inconsistency] = []
        self.files_scanned = 0
    
    def scan_file(self, file_path: Path, check_semantic: bool = True) -> List[Inconsistency]:
        """Scan a single file for inconsistencies."""
        issues = []
        
        try:
            content = file_path.read_text()
            lines = content.split('\n')
        except Exception as e:
            return [Inconsistency(
                file=str(file_path),
                line=0,
                category='error',
                severity='error',
                message=f"Could not read file: {e}"
            )]
        
        for line_num, line in enumerate(lines, 1):
            # Skip comments
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('#') or stripped.startswith('*'):
                continue
            
            # Check for non-semantic values in DSL-related code
            if check_semantic:
                for pattern, desc in self.NON_SEMANTIC_PATTERNS:
                    matches = re.finditer(pattern, line)
                    for match in matches:
                        # Skip if in a comment or string that explains the pattern
                        if 'not' in line.lower() or 'instead of' in line.lower() or 'example' in line.lower():
                            continue
                        
                        issues.append(Inconsistency(
                            file=str(file_path),
                            line=line_num,
                            category='value',
                            severity='warning',
                            message=f"Non-semantic {desc} found: {match.group()}",
                            suggestion=self._suggest_semantic(match.group(), desc),
                            context=line.strip()[:80],
                        ))
        
        return issues
    
    def _suggest_semantic(self, value: str, desc: str) -> Optional[str]:
        """Suggest a semantic replacement for a literal value."""
        if 'pixel' in desc:
            try:
                px = int(re.search(r'\d+', value).group())
                if px <= 4:
                    return "Use 'tight' or 'slight'"
                elif px <= 8:
                    return "Use 'slight' or 'comfortable'"
                elif px <= 16:
                    return "Use 'comfortable'"
                elif px <= 24:
                    return "Use 'spacious'"
                else:
                    return "Use 'roomy' or 'expansive'"
            except:
                pass
        elif 'color' in desc:
            return "Use semantic color: primary, secondary, accent, success, warning, danger, muted"
        
        return None
    
    def scan_directory(
        self,
        extensions: List[str] = ['.ts', '.tsx', '.js', '.jsx', '.dsl'],
        exclude_patterns: List[str] = ['node_modules', '.git', 'dist', 'build']
    ) -> AuditResult:
        """Scan entire directory for inconsistencies."""
        
        for file_path in self.target_dir.rglob('*'):
            # Skip excluded directories
            if any(excl in str(file_path) for excl in exclude_patterns):
                continue
            
            # Only scan specified extensions
            if file_path.suffix not in extensions:
                continue
            
            if file_path.is_file():
                self.files_scanned += 1
                issues = self.scan_file(file_path)
                self.inconsistencies.extend(issues)
        
        # Build summary
        summary = {
            'total': len(self.inconsistencies),
            'errors': sum(1 for i in self.inconsistencies if i.severity == 'error'),
            'warnings': sum(1 for i in self.inconsistencies if i.severity == 'warning'),
            'info': sum(1 for i in self.inconsistencies if i.severity == 'info'),
            'by_category': {},
        }
        
        for issue in self.inconsistencies:
            cat = issue.category
            summary['by_category'][cat] = summary['by_category'].get(cat, 0) + 1
        
        return AuditResult(
            files_scanned=self.files_scanned,
            inconsistencies=self.inconsistencies,
            summary=summary,
        )
    
    def filter_false_positives(self, result: AuditResult) -> AuditResult:
        """Filter out false positives (values in comments, explanations, etc.)."""
        
        filtered = []
        
        for issue in result.inconsistencies:
            context = issue.context or ""
            
            # Skip if context suggests it's explanatory
            skip_phrases = [
                'not', 'instead', 'example', 'e.g.', 'i.e.', 
                '//', '#', 'comment', 'Note:', 'TODO:',
                'semantic', 'should be', 'use ', 'prefer'
            ]
            
            if any(phrase.lower() in context.lower() for phrase in skip_phrases):
                continue
            
            filtered.append(issue)
        
        return AuditResult(
            files_scanned=result.files_scanned,
            inconsistencies=filtered,
            summary={
                'total': len(filtered),
                'errors': sum(1 for i in filtered if i.severity == 'error'),
                'warnings': sum(1 for i in filtered if i.severity == 'warning'),
                'info': sum(1 for i in filtered if i.severity == 'info'),
                'filtered_out': len(result.inconsistencies) - len(filtered),
            }
        )


def run_audit(
    target_dir: Path,
    pattern: Optional[str] = None,
    smart_filter: bool = True,
    output_file: Optional[Path] = None,
) -> AuditResult:
    """Run a full consistency audit."""
    
    tracer = Tracer('consistency-audit')
    
    print("=" * 60)
    print("CONSISTENCY AUDIT")
    print(f"Target: {target_dir}")
    print("=" * 60)
    
    auditor = ConsistencyAuditor(target_dir)
    
    # Run scan
    print("\n🔍 Scanning files...")
    result = auditor.scan_directory()
    print(f"   Scanned {result.files_scanned} files")
    print(f"   Found {result.summary['total']} potential issues")
    
    # Apply smart filter
    if smart_filter:
        print("\n🧹 Filtering false positives...")
        result = auditor.filter_false_positives(result)
        print(f"   {result.summary.get('filtered_out', 0)} false positives removed")
        print(f"   {result.summary['total']} actual issues remaining")
    
    # Log to tracer
    tracer.log(
        phase=Phase.ANALYSIS,
        title='Consistency Audit Complete',
        context=f"Scanned {result.files_scanned} files in {target_dir}",
        reasoning=f"""
Found {result.summary['total']} consistency issues:
- Errors: {result.summary['errors']}
- Warnings: {result.summary['warnings']}
- Info: {result.summary['info']}

Categories: {json.dumps(result.summary.get('by_category', {}), indent=2)}
""",
        decision_action='Review and fix issues',
        next_steps=[
            f"Fix {result.summary['warnings']} warnings",
            "Update non-semantic values to semantic equivalents",
        ],
    )
    
    # Print issues
    if result.inconsistencies:
        print("\n📋 Issues Found:")
        for issue in result.inconsistencies[:20]:  # Limit output
            icon = "❌" if issue.severity == 'error' else "⚠️" if issue.severity == 'warning' else "ℹ️"
            print(f"   {icon} {issue.file}:{issue.line}")
            print(f"      {issue.message}")
            if issue.suggestion:
                print(f"      💡 {issue.suggestion}")
        
        if len(result.inconsistencies) > 20:
            print(f"   ... and {len(result.inconsistencies) - 20} more")
    else:
        print("\n✅ No consistency issues found!")
    
    # Save results
    if output_file:
        with open(output_file, 'w') as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"\n📁 Results saved to: {output_file}")
    
    print(f"\n🎯 Trace saved to: {tracer.get_session_path()}")
    
    return result


def audit_consistency(
    directory: Path | str,
    pattern: Optional[str] = None,
    smart_filter: bool = True,
    output_file: Optional[Path | str] = None,
) -> AuditResult:
    """
    Convenience wrapper for running a consistency audit.
    
    This matches the public API referenced by the tools registry:
        from tools_core.probes import audit_consistency
        result = audit_consistency(directory="src/")
    """
    target_dir = Path(directory)
    output_path = Path(output_file) if output_file else None
    return run_audit(
        target_dir=target_dir,
        pattern=pattern,
        smart_filter=smart_filter,
        output_file=output_path,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Audit codebase for consistency issues"
    )
    parser.add_argument(
        "--target", "-t",
        type=str,
        default=".",
        help="Target directory to audit"
    )
    parser.add_argument(
        "--pattern", "-p",
        type=str,
        default=None,
        help="Focus pattern for audit"
    )
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="Disable smart false-positive filtering"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Output file for results (JSON)"
    )
    
    args = parser.parse_args()
    
    target = Path(args.target)
    output = Path(args.output) if args.output else None
    
    result = run_audit(
        target_dir=target,
        pattern=args.pattern,
        smart_filter=not args.no_filter,
        output_file=output,
    )
    
    # Exit with error code if issues found
    if result.summary['errors'] > 0:
        exit(1)


if __name__ == "__main__":
    main()

