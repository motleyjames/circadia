#!/usr/bin/env python3
"""
Codebase analyzer for TypeScript/React projects.
Extracts components, interfaces, constraints, validations, and API endpoints.
"""

import json
import os
import re
import sys
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Any, Optional


@dataclass
class ComponentInfo:
    name: str
    file_path: str
    component_type: str  # 'functional' | 'class' | 'hook'
    line_number: int
    props_interface: Optional[str] = None
    methods: List[str] = field(default_factory=list)
    hooks_used: List[str] = field(default_factory=list)


@dataclass
class InterfaceInfo:
    name: str
    file_path: str
    properties: Dict[str, str] = field(default_factory=dict)
    line_number: int = 0


@dataclass
class ConstraintInfo:
    constraint_type: str  # 'min' | 'max' | 'required' | 'pattern' | 'enum'
    target: str
    value: str
    line_number: int


@dataclass
class APIEndpointInfo:
    method: str  # 'GET' | 'POST' | 'PUT' | 'DELETE'
    path: str
    file_path: str
    line_number: int


class TypeScriptAnalyzer:
    """Analyze TypeScript/TSX files."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.content = ""
        self.components: List[ComponentInfo] = []
        self.interfaces: List[InterfaceInfo] = []
        self.constraints: List[ConstraintInfo] = []
        self.api_endpoints: List[APIEndpointInfo] = []
        self.hooks: List[Dict[str, Any]] = []

        try:
            self.content = Path(file_path).read_text(encoding='utf-8')
        except Exception as e:
            print(f"Warning: Could not read {file_path}: {e}", file=sys.stderr)

    def analyze(self) -> Dict[str, Any]:
        """Run all analyzers."""
        if not self.content:
            return {
                'file': self.file_path,
                'components': [],
                'interfaces': [],
                'constraints': [],
                'api_endpoints': [],
                'hooks': []
            }

        self._extract_interfaces()
        self._extract_components()
        self._extract_constraints()
        self._extract_api_endpoints()
        self._extract_hooks()

        return {
            'file': self.file_path,
            'components': [asdict(c) for c in self.components],
            'interfaces': [asdict(i) for i in self.interfaces],
            'constraints': [asdict(c) for c in self.constraints],
            'api_endpoints': [asdict(e) for e in self.api_endpoints],
            'hooks': self.hooks
        }

    def _extract_interfaces(self) -> None:
        """Extract TypeScript interfaces."""
        pattern = r'interface\s+(\w+)\s*(?:extends\s+[\w\s,<>]+)?\s*\{([^}]+)\}'
        
        for match in re.finditer(pattern, self.content, re.MULTILINE | re.DOTALL):
            interface_name = match.group(1)
            interface_body = match.group(2)
            line_number = self.content[:match.start()].count('\n') + 1

            # Parse properties
            properties = {}
            prop_pattern = r'(\w+)\s*\??:\s*([^;,\n]+)[;,\n]'
            for prop_match in re.finditer(prop_pattern, interface_body):
                prop_name = prop_match.group(1).strip()
                prop_type = prop_match.group(2).strip()
                properties[prop_name] = prop_type

            self.interfaces.append(InterfaceInfo(
                name=interface_name,
                file_path=self.file_path,
                properties=properties,
                line_number=line_number
            ))

    def _extract_components(self) -> None:
        """Extract React components (functional and class)."""
        # Functional components
        func_patterns = [
            r'(?:export\s+)?(?:const|function)\s+(\w+)\s*(?::\s*(?:React\.)?FC<(\w+)>)?\s*=\s*(?:\(|{)',
            r'(?:export\s+)?function\s+(\w+)\s*\(\s*(?:props\s*:\s*(\w+))?',
        ]
        
        for pattern in func_patterns:
            for match in re.finditer(pattern, self.content):
                comp_name = match.group(1)
                # Skip if it's a lowercase function (not a component)
                if comp_name[0].islower() and not comp_name.startswith('use'):
                    continue
                    
                props_interface = match.group(2) if len(match.groups()) > 1 else None
                line_number = self.content[:match.start()].count('\n') + 1
                hooks = self._extract_hooks_from_component(comp_name)

                self.components.append(ComponentInfo(
                    name=comp_name,
                    file_path=self.file_path,
                    component_type='functional',
                    line_number=line_number,
                    props_interface=props_interface,
                    hooks_used=hooks
                ))

    def _extract_constraints(self) -> None:
        """Extract validation rules and constraints (Zod, Yup patterns)."""
        zod_patterns = [
            (r'z\.string\(\)\.min\((\d+)\)', 'min'),
            (r'z\.string\(\)\.max\((\d+)\)', 'max'),
            (r'z\.number\(\)\.min\((\d+)\)', 'min'),
            (r'z\.number\(\)\.max\((\d+)\)', 'max'),
            (r'z\.number\(\)\.positive\(\)', 'positive'),
            (r'z\.number\(\)\.negative\(\)', 'negative'),
            (r'z\.enum\(\[(.*?)\]\)', 'enum'),
            (r'z\.string\(\)\.email\(\)', 'email'),
            (r'z\.string\(\)\.url\(\)', 'url'),
            (r'z\.string\(\)\.regex\((.*?)\)', 'pattern'),
        ]

        for pattern, constraint_type in zod_patterns:
            for match in re.finditer(pattern, self.content):
                line_number = self.content[:match.start()].count('\n') + 1
                value = match.group(1) if match.groups() else 'true'
                target = self._find_constraint_target(match.start())

                self.constraints.append(ConstraintInfo(
                    constraint_type=constraint_type,
                    target=target or 'unknown',
                    value=str(value),
                    line_number=line_number
                ))

        # Required fields
        required_pattern = r'\.required\(\)|required:\s*true'
        for match in re.finditer(required_pattern, self.content, re.IGNORECASE):
            line_number = self.content[:match.start()].count('\n') + 1
            target = self._find_constraint_target(match.start())

            self.constraints.append(ConstraintInfo(
                constraint_type='required',
                target=target or 'unknown',
                value='true',
                line_number=line_number
            ))

    def _extract_api_endpoints(self) -> None:
        """Extract API calls and endpoints."""
        methods = ['get', 'post', 'put', 'delete', 'patch']
        
        for method in methods:
            patterns = [
                rf'(?:axios|fetch)\s*\.?\s*{method}\s*\(\s*["\']([^"\']+)["\']',
                rf'fetch\s*\(\s*`([^`]+)`',
                rf'\.{method}\s*\(\s*["\']([^"\']+)["\']',
            ]

            for pattern in patterns:
                for match in re.finditer(pattern, self.content, re.IGNORECASE):
                    endpoint = match.group(1)
                    line_number = self.content[:match.start()].count('\n') + 1

                    self.api_endpoints.append(APIEndpointInfo(
                        method=method.upper(),
                        path=endpoint,
                        file_path=self.file_path,
                        line_number=line_number
                    ))

    def _extract_hooks(self) -> None:
        """Extract React hooks usage."""
        hook_names = ['useState', 'useReducer', 'useContext', 'useEffect', 
                      'useCallback', 'useMemo', 'useRef', 'useLayoutEffect']
        
        for hook in hook_names:
            pattern = rf'{hook}\s*<([^>]*)>\s*\(([^)]*)\)'
            for match in re.finditer(pattern, self.content):
                line_number = self.content[:match.start()].count('\n') + 1
                type_arg = match.group(1)
                initial_value = match.group(2).split(',')[0].strip() if match.group(2) else 'undefined'

                self.hooks.append({
                    'hook': hook,
                    'type': type_arg or 'any',
                    'initial_value': initial_value[:50],  # Truncate long values
                    'line': line_number
                })

    def _find_constraint_target(self, position: int, context_length: int = 100) -> Optional[str]:
        """Find what a constraint applies to by looking backwards."""
        start = max(0, position - context_length)
        context = self.content[start:position]
        
        prop_match = re.search(r'(\w+)\s*[:{]', context)
        if prop_match:
            return prop_match.group(1)
        return None

    def _extract_hooks_from_component(self, component_name: str) -> List[str]:
        """Extract hooks used in a specific component."""
        comp_start = self.content.find(f'function {component_name}')
        if comp_start == -1:
            comp_start = self.content.find(f'const {component_name}')

        if comp_start == -1:
            return []

        # Find component end (simplified)
        next_export = self.content.find('export ', comp_start + 1)
        next_const = self.content.find('\nconst ', comp_start + 50)
        comp_end = min(x for x in [next_export, next_const, len(self.content)] if x > comp_start)

        component_body = self.content[comp_start:comp_end]

        hooks = []
        for hook in ['useState', 'useReducer', 'useContext', 'useEffect', 'useCallback', 'useMemo', 'useRef']:
            if hook in component_body:
                hooks.append(hook)

        return hooks


class ProjectAnalyzer:
    """Analyze entire project."""

    def __init__(self, project_root: str):
        self.project_root = project_root
        self.all_components: Dict[str, Any] = {}
        self.all_interfaces: Dict[str, Any] = {}
        self.all_constraints: List[Dict[str, Any]] = []
        self.all_api_endpoints: List[Dict[str, Any]] = []
        self.summary: Dict[str, Any] = {}

    def analyze(self) -> Dict[str, Any]:
        """Run complete project analysis."""
        typescript_files = self._find_typescript_files()
        print(f"Found {len(typescript_files)} TypeScript files", file=sys.stderr)

        for file_path in typescript_files:
            print(f"  Analyzing: {file_path}", file=sys.stderr)
            analyzer = TypeScriptAnalyzer(file_path)
            result = analyzer.analyze()

            # Aggregate results
            for component in result['components']:
                self.all_components[component['name']] = component

            for interface in result['interfaces']:
                self.all_interfaces[interface['name']] = interface

            self.all_constraints.extend(result['constraints'])
            self.all_api_endpoints.extend(result['api_endpoints'])

        # Generate summary
        self.summary = {
            'total_components': len(self.all_components),
            'total_interfaces': len(self.all_interfaces),
            'total_constraints': len(self.all_constraints),
            'total_api_endpoints': len(self.all_api_endpoints),
            'components': list(self.all_components.keys()),
            'interfaces': list(self.all_interfaces.keys()),
            'api_endpoints': [f"{e['method']} {e['path']}" for e in self.all_api_endpoints]
        }

        return {
            'components': self.all_components,
            'interfaces': self.all_interfaces,
            'constraints': self.all_constraints,
            'api_endpoints': self.all_api_endpoints,
            'summary': self.summary
        }

    def _find_typescript_files(self) -> List[str]:
        """Find all .ts and .tsx files."""
        files = []
        skip_dirs = {'node_modules', 'dist', 'build', '.next', '.git', 'coverage'}

        for root, dirs, filenames in os.walk(self.project_root):
            dirs[:] = [d for d in dirs if d not in skip_dirs]

            for filename in filenames:
                if filename.endswith(('.ts', '.tsx')) and not filename.endswith('.d.ts'):
                    files.append(os.path.join(root, filename))

        return sorted(files)


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze_codebase.py <project_root> [output_file]", file=sys.stderr)
        sys.exit(1)

    project_root = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.isdir(project_root):
        print(f"Error: {project_root} is not a directory", file=sys.stderr)
        sys.exit(1)

    print(f"\n📊 Analyzing project: {project_root}", file=sys.stderr)
    analyzer = ProjectAnalyzer(project_root)
    analysis = analyzer.analyze()

    # Output JSON
    output = json.dumps(analysis, indent=2)

    if output_file:
        with open(output_file, 'w') as f:
            f.write(output)
        print(f"\n✅ Analysis saved to: {output_file}", file=sys.stderr)
    else:
        print(output)

    print(f"\n📦 Components: {analysis['summary']['total_components']}", file=sys.stderr)
    print(f"🔧 Interfaces: {analysis['summary']['total_interfaces']}", file=sys.stderr)
    print(f"📏 Constraints: {analysis['summary']['total_constraints']}", file=sys.stderr)
    print(f"🌐 API Endpoints: {analysis['summary']['total_api_endpoints']}", file=sys.stderr)


if __name__ == '__main__':
    main()

