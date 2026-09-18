-- ==============================================
-- LOCAL-FIRST UI TESTING SYSTEM - SQLite Schema
-- Feature-sliced architecture with future agentic support
-- ==============================================

-- ==============================================
-- CODEBASE ANALYSIS
-- ==============================================
CREATE TABLE IF NOT EXISTS codebase_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_name TEXT NOT NULL,
  file_path TEXT,
  component_type TEXT,  -- 'functional' | 'class' | 'hook'
  interface_name TEXT,
  props_schema JSON,
  constraints JSON,
  api_endpoints JSON,
  state_management JSON,
  validations JSON,
  analysis_hash TEXT UNIQUE,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- TEST RUNS (Top-level container)
-- ==============================================
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  status TEXT,  -- 'running' | 'completed' | 'failed'
  run_type TEXT DEFAULT 'manual',  -- 'manual' | 'scheduled' | 'agentic'
  total_pages INTEGER,
  total_screenshots INTEGER,
  total_elements_detected INTEGER,
  total_tests_generated INTEGER,
  features_tested JSON,
  gemini_calls INTEGER DEFAULT 0,
  total_cost_estimate REAL DEFAULT 0,
  coverage_pct REAL DEFAULT 0,
  notes TEXT
);

-- ==============================================
-- SCREENSHOTS & RAW CAPTURE
-- ==============================================
CREATE TABLE IF NOT EXISTS screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  hash TEXT UNIQUE,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
);

-- ==============================================
-- FASTVLM ELEMENT DETECTION
-- ==============================================
CREATE TABLE IF NOT EXISTS element_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_id INTEGER NOT NULL,
  element_type TEXT NOT NULL,  -- 'button', 'input', 'link', 'text', 'image', 'form', 'container'
  element_label TEXT,
  element_id TEXT,
  element_class TEXT,
  bounding_box JSON,  -- {"x": 100, "y": 50, "width": 150, "height": 40}
  confidence REAL,
  is_interactive BOOLEAN,
  is_visible BOOLEAN,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (screenshot_id) REFERENCES screenshots(id)
);

CREATE INDEX IF NOT EXISTS idx_element_screenshot ON element_detections(screenshot_id);
CREATE INDEX IF NOT EXISTS idx_element_type ON element_detections(element_type);

-- ==============================================
-- UI-TARS-2 SEMANTIC ANALYSIS
-- ==============================================
CREATE TABLE IF NOT EXISTS ui_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_id INTEGER NOT NULL,
  page_url TEXT,
  tested_features JSON,  -- ["feature1", "feature2", ...]
  learned_patterns JSON,  -- patterns discovered by agent
  interactions JSON,     -- sequence of actions taken
  assertions JSON,       -- {"passed": 10, "failed": 2}
  reflection_notes TEXT,
  state_detected JSON,   -- current app state
  errors_found JSON,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (screenshot_id) REFERENCES screenshots(id)
);

-- ==============================================
-- GEMINI ORCHESTRATION CALLS
-- ==============================================
CREATE TABLE IF NOT EXISTS gemini_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  call_number INTEGER,
  call_type TEXT NOT NULL,  -- 'schema_validation' | 'test_strategy' | 'failure_analysis' | 'test_generation'
  prompt_preview TEXT,
  response_preview TEXT,
  thinking_enabled BOOLEAN,
  budget_tokens INTEGER,
  tokens_used INTEGER,
  cost_estimate REAL,
  called_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES test_runs(id)
);

-- ==============================================
-- GENERATED TESTS
-- ==============================================
CREATE TABLE IF NOT EXISTS generated_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_name TEXT NOT NULL UNIQUE,
  test_code TEXT NOT NULL,
  source_feature JSON,  -- what feature does this test
  generated_by TEXT,    -- 'gemini' | 'ui_tars2'
  status TEXT DEFAULT 'pending',  -- 'pending' | 'passing' | 'failing'
  priority TEXT,  -- 'critical' | 'high' | 'medium' | 'low'
  last_run TIMESTAMP,
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- EPISODIC MEMORY (UI-TARS-2 Learning)
-- ==============================================
CREATE TABLE IF NOT EXISTS episodic_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_type TEXT NOT NULL,  -- 'success' | 'failure' | 'edge_case' | 'interaction'
  screenshot_id INTEGER,
  action_sequence JSON,  -- step-by-step actions taken
  outcome TEXT,
  root_cause TEXT,  -- if failure, what caused it
  retry_strategy TEXT,  -- what to try next time
  confidence REAL,  -- how confident we are in this pattern
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (screenshot_id) REFERENCES screenshots(id)
);

-- ==============================================
-- TEST FAILURES & ANALYSIS
-- ==============================================
CREATE TABLE IF NOT EXISTS test_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  error_message TEXT,
  error_classification TEXT,  -- 'timing' | 'element_missing' | 'state_mismatch' | 'logic_error' | 'other'
  screenshot_at_failure INTEGER,
  gemini_analysis JSON,
  retry_strategy TEXT,
  preconditions JSON,
  failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_id) REFERENCES generated_tests(id),
  FOREIGN KEY (run_id) REFERENCES test_runs(id)
);

-- ==============================================
-- COVERAGE METRICS
-- ==============================================
CREATE TABLE IF NOT EXISTS coverage_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  component_name TEXT,
  features_tested INTEGER,
  features_total INTEGER,
  coverage_pct REAL,
  critical_paths_tested INTEGER,
  edge_cases_found INTEGER,
  edge_cases_tested INTEGER,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES test_runs(id)
);

-- ==============================================
-- AGENTIC WORKFLOWS (Future: Skyvern-like)
-- ==============================================
CREATE TABLE IF NOT EXISTS agentic_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT,  -- 'fetch_document' | 'sync_data' | 'monitor_page' | 'custom'
  trigger_type TEXT,   -- 'manual' | 'scheduled' | 'webhook' | 'event'
  schedule_cron TEXT,  -- cron expression for scheduled triggers
  config JSON,         -- workflow-specific configuration
  last_run_id TEXT,
  last_run_at TIMESTAMP,
  status TEXT DEFAULT 'active',  -- 'active' | 'paused' | 'disabled'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agentic_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  status TEXT,  -- 'running' | 'completed' | 'failed' | 'cancelled'
  steps_completed INTEGER DEFAULT 0,
  steps_total INTEGER,
  artifacts JSON,  -- paths to fetched files, extracted data, etc.
  error_message TEXT,
  FOREIGN KEY (workflow_id) REFERENCES agentic_workflows(id)
);

-- ==============================================
-- INDICES FOR PERFORMANCE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_test_run_status ON test_runs(status);
CREATE INDEX IF NOT EXISTS idx_screenshot_run ON screenshots(test_run_id);
CREATE INDEX IF NOT EXISTS idx_ui_analysis_screenshot ON ui_analysis(screenshot_id);
CREATE INDEX IF NOT EXISTS idx_gemini_calls_run ON gemini_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_episodic_type ON episodic_memory(episode_type);
CREATE INDEX IF NOT EXISTS idx_test_failures_run ON test_failures(run_id);
CREATE INDEX IF NOT EXISTS idx_agentic_workflow_status ON agentic_workflows(status);
CREATE INDEX IF NOT EXISTS idx_agentic_runs_workflow ON agentic_runs(workflow_id);

