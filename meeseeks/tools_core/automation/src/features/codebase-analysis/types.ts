/**
 * Type definitions for codebase analysis results
 */

export interface ComponentInfo {
  name: string;
  file_path: string;
  component_type: 'functional' | 'class' | 'hook';
  line_number: number;
  props_interface?: string;
  methods?: string[];
  hooks_used?: string[];
}

export interface InterfaceInfo {
  name: string;
  file_path: string;
  properties: Record<string, string>;
  line_number: number;
}

export interface ConstraintInfo {
  constraint_type: 'min' | 'max' | 'required' | 'pattern' | 'enum' | 'email' | 'url' | 'positive' | 'negative';
  target: string;
  value: string;
  line_number: number;
}

export interface APIEndpointInfo {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  file_path: string;
  line_number: number;
}

export interface HookUsage {
  hook: string;
  type: string;
  initial_value: string;
  line: number;
}

export interface CodebaseAnalysisSummary {
  total_components: number;
  total_interfaces: number;
  total_constraints: number;
  total_api_endpoints: number;
  components: string[];
  interfaces: string[];
  api_endpoints: string[];
}

export interface CodebaseAnalysisResult {
  components: Record<string, ComponentInfo>;
  interfaces: Record<string, InterfaceInfo>;
  constraints: ConstraintInfo[];
  api_endpoints: APIEndpointInfo[];
  summary: CodebaseAnalysisSummary;
}

