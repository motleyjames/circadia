/**
 * Centralized configuration for the testing framework
 * All paths are relative to project root and configurable via environment
 */

import path from 'path';

// Get the project root (automation/ directory)
const getProjectRoot = (): string => {
  // __dirname is at automation/src/shared/config
  // Go up 3 levels to reach automation/
  return path.resolve(__dirname, '../../..');
};

const PROJECT_ROOT = process.env.TEST_PROJECT_ROOT || getProjectRoot();

export interface TestingConfig {
  projectRoot: string;
  db: {
    path: string;
    schemaPath: string;
  };
  artifacts: {
    baseDir: string;
    screenshots: {
      raw: string;
      annotated: string;
      comparisons: string;
    };
    analysis: string;
    generatedTests: string;
    reports: string;
    logs: string;
  };
  playwright: {
    baseUrl: string;
    headless: boolean;
    timeout: number;
  };
  gemini: {
    apiKey: string;
    model: string;
    maxCallsPerRun: number;
  };
  vision: {
    modelSize: '3b' | '7b';
    pythonPath: string;
  };
  logging: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    persistToFile: boolean;
  };
}

const resolveFromRoot = (...segments: string[]): string => {
  return path.join(PROJECT_ROOT, ...segments);
};

export const config: TestingConfig = {
  projectRoot: PROJECT_ROOT,

  db: {
    path: process.env.TEST_DB_PATH || resolveFromRoot('db', 'testing.db'),
    schemaPath: resolveFromRoot('src', 'shared', 'db', 'schema.sql'),
  },

  artifacts: {
    baseDir: process.env.TEST_ARTIFACTS_DIR || resolveFromRoot('artifacts'),
    screenshots: {
      raw: 'screenshots/raw',
      annotated: 'screenshots/annotated',
      comparisons: 'screenshots/comparisons',
    },
    analysis: 'analysis',
    generatedTests: 'generated_tests',
    reports: 'reports',
    logs: 'logs',
  },

  playwright: {
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000', 10),
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
    maxCallsPerRun: parseInt(process.env.GEMINI_MAX_CALLS || '5', 10),
  },

  vision: {
    modelSize: (process.env.FASTVLM_MODEL_SIZE as '3b' | '7b') || '3b',
    pythonPath: process.env.PYTHON_PATH || 'python3',
  },

  logging: {
    level: (process.env.LOG_LEVEL as TestingConfig['logging']['level']) || 'INFO',
    persistToFile: process.env.LOG_PERSIST !== 'false',
  },
};

/**
 * Resolve a path relative to artifacts directory
 */
export const artifactPath = (...segments: string[]): string => {
  return path.join(config.artifacts.baseDir, ...segments);
};

/**
 * Resolve a path relative to project root
 */
export const projectPath = (...segments: string[]): string => {
  return path.join(config.projectRoot, ...segments);
};

/**
 * Get the path to a Python script in a feature folder
 */
export const pythonScriptPath = (feature: string, scriptName: string): string => {
  return projectPath('src', 'features', feature, 'python', scriptName);
};

export default config;

