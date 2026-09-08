/**
 * Type definitions for all database entities
 */

// ==============================================
// CODEBASE ANALYSIS
// ==============================================

export interface CodebaseAnalysisRow {
  id: number;
  component_name: string;
  file_path: string | null;
  component_type: 'functional' | 'class' | 'hook' | null;
  interface_name: string | null;
  props_schema: string; // JSON string
  constraints: string; // JSON string
  api_endpoints: string; // JSON string
  state_management: string | null; // JSON string
  validations: string | null; // JSON string
  analysis_hash: string;
  analyzed_at: string;
}

export interface ComponentAnalysis {
  componentName: string;
  filePath?: string;
  componentType?: 'functional' | 'class' | 'hook';
  interfaceName?: string;
  propsSchema: Record<string, any>;
  constraints: Record<string, any>;
  apiEndpoints: Array<{ method: string; endpoint: string }>;
  stateManagement?: Record<string, any>;
  validations?: Record<string, any>;
}

// ==============================================
// TEST RUNS
// ==============================================

export interface TestRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  run_type: 'manual' | 'scheduled' | 'agentic';
  total_pages: number | null;
  total_screenshots: number | null;
  total_elements_detected: number | null;
  total_tests_generated: number | null;
  features_tested: string | null; // JSON string
  gemini_calls: number;
  total_cost_estimate: number;
  coverage_pct: number;
  notes: string | null;
}

export interface TestRunSummary {
  totalPages: number;
  totalScreenshots: number;
  totalElements: number;
  totalTestsGenerated: number;
  featuresTested: string[];
  geminiCalls: number;
  costEstimate: number;
  coveragePct: number;
}

// ==============================================
// SCREENSHOTS
// ==============================================

export interface ScreenshotRow {
  id: number;
  test_run_id: string;
  url: string;
  path: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  hash: string;
  captured_at: string;
}

export interface ScreenshotMetadata {
  path: string;
  hash: string;
  fileSize: number;
  width: number;
  height: number;
  timestamp: string;
  url: string;
}

// ==============================================
// ELEMENT DETECTIONS
// ==============================================

export interface ElementDetectionRow {
  id: number;
  screenshot_id: number;
  element_type: string;
  element_label: string | null;
  element_id: string | null;
  element_class: string | null;
  bounding_box: string; // JSON string
  confidence: number;
  is_interactive: number; // SQLite boolean
  is_visible: number; // SQLite boolean
  detected_at: string;
}

export interface DetectedElement {
  elementType: string;
  elementLabel?: string;
  elementId?: string;
  elementClass?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  isInteractive: boolean;
  isVisible: boolean;
}

// ==============================================
// UI ANALYSIS
// ==============================================

export interface UIAnalysisRow {
  id: number;
  screenshot_id: number;
  page_url: string | null;
  tested_features: string; // JSON string
  learned_patterns: string; // JSON string
  interactions: string; // JSON string
  assertions: string; // JSON string
  reflection_notes: string | null;
  state_detected: string | null; // JSON string
  errors_found: string | null; // JSON string
  analyzed_at: string;
}

export interface UIAnalysis {
  testedFeatures: string[];
  learnedPatterns: Array<Record<string, any>>;
  interactions: Array<{ step: number; action: string; result: string }>;
  assertions: { passed: number; failed: number };
  reflectionNotes: string;
  stateDetected: Record<string, any>;
  errorsFound: string[];
}

// ==============================================
// GEMINI CALLS
// ==============================================

export interface GeminiCallRow {
  id: number;
  run_id: string;
  call_number: number;
  call_type: 'schema_validation' | 'test_strategy' | 'failure_analysis' | 'test_generation';
  prompt_preview: string | null;
  response_preview: string | null;
  thinking_enabled: number | null; // SQLite boolean
  budget_tokens: number | null;
  tokens_used: number | null;
  cost_estimate: number | null;
  called_at: string;
}

// ==============================================
// GENERATED TESTS
// ==============================================

export interface GeneratedTestRow {
  id: number;
  test_name: string;
  test_code: string;
  source_feature: string | null; // JSON string
  generated_by: 'gemini' | 'ui_tars2';
  status: 'pending' | 'passing' | 'failing';
  priority: 'critical' | 'high' | 'medium' | 'low' | null;
  last_run: string | null;
  pass_count: number;
  fail_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ==============================================
// EPISODIC MEMORY
// ==============================================

export interface EpisodicMemoryRow {
  id: number;
  episode_type: 'success' | 'failure' | 'edge_case' | 'interaction';
  screenshot_id: number | null;
  action_sequence: string; // JSON string
  outcome: string | null;
  root_cause: string | null;
  retry_strategy: string | null;
  confidence: number;
  created_at: string;
}

// ==============================================
// TEST FAILURES
// ==============================================

export interface TestFailureRow {
  id: number;
  test_id: number;
  run_id: string;
  error_message: string | null;
  error_classification: 'timing' | 'element_missing' | 'state_mismatch' | 'logic_error' | 'other' | null;
  screenshot_at_failure: number | null;
  gemini_analysis: string | null; // JSON string
  retry_strategy: string | null;
  preconditions: string | null; // JSON string
  failed_at: string;
}

// ==============================================
// COVERAGE METRICS
// ==============================================

export interface CoverageMetricsRow {
  id: number;
  run_id: string;
  component_name: string | null;
  features_tested: number | null;
  features_total: number | null;
  coverage_pct: number | null;
  critical_paths_tested: number | null;
  edge_cases_found: number | null;
  edge_cases_tested: number | null;
  calculated_at: string;
}

// ==============================================
// AGENTIC WORKFLOWS (Future)
// ==============================================

export interface AgenticWorkflowRow {
  id: string;
  name: string;
  description: string | null;
  workflow_type: 'fetch_document' | 'sync_data' | 'monitor_page' | 'custom';
  trigger_type: 'manual' | 'scheduled' | 'webhook' | 'event';
  schedule_cron: string | null;
  config: string; // JSON string
  last_run_id: string | null;
  last_run_at: string | null;
  status: 'active' | 'paused' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface AgenticRunRow {
  id: string;
  workflow_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps_completed: number;
  steps_total: number | null;
  artifacts: string | null; // JSON string
  error_message: string | null;
}

