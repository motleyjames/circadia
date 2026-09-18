/**
 * Load and process codebase analysis results
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { config, artifactPath, pythonScriptPath } from '../../shared/config';
import { TestingDatabase } from '../../shared/db';
import type { CodebaseAnalysisResult, ComponentInfo } from './types';

const execAsync = promisify(exec);

/**
 * Get the path where analysis JSON is stored
 */
export function getAnalysisPath(): string {
  return artifactPath(config.artifacts.analysis, 'codebase_analysis.json');
}

/**
 * Run the Python codebase analyzer on a directory
 */
export async function runCodebaseAnalysis(
  sourceDir: string,
  outputPath?: string
): Promise<CodebaseAnalysisResult> {
  const resolvedOutput = outputPath || getAnalysisPath();
  const scriptPath = pythonScriptPath('codebase-analysis', 'analyze_codebase.py');

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });

  // Run the Python analyzer
  const command = `${config.vision.pythonPath} "${scriptPath}" "${sourceDir}" "${resolvedOutput}"`;
  
  try {
    const { stderr } = await execAsync(command);
    if (stderr) {
      console.log(stderr); // Python prints status to stderr
    }

    // Load and return the result
    return loadAnalysis(resolvedOutput);
  } catch (error: any) {
    throw new Error(`Codebase analysis failed: ${error.message}`);
  }
}

/**
 * Load analysis from a JSON file
 */
export function loadAnalysis(filePath?: string): CodebaseAnalysisResult {
  const resolvedPath = filePath || getAnalysisPath();

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Analysis file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return JSON.parse(content) as CodebaseAnalysisResult;
}

/**
 * Check if analysis file exists
 */
export function hasAnalysis(filePath?: string): boolean {
  const resolvedPath = filePath || getAnalysisPath();
  return fs.existsSync(resolvedPath);
}

/**
 * Persist analysis to database
 */
export function persistAnalysisToDb(
  db: TestingDatabase,
  analysis: CodebaseAnalysisResult
): void {
  // Save each component to the database
  for (const [name, component] of Object.entries(analysis.components)) {
    db.saveCodebaseAnalysis({
      componentName: name,
      filePath: component.file_path,
      componentType: component.component_type,
      interfaceName: component.props_interface,
      propsSchema: {},
      constraints: {},
      apiEndpoints: analysis.api_endpoints
        .filter((e) => e.file_path === component.file_path)
        .map((e) => ({ method: e.method, endpoint: e.path })),
    });
  }
}

/**
 * Get components that need testing based on analysis
 */
export function getTestableComponents(analysis: CodebaseAnalysisResult): ComponentInfo[] {
  return Object.values(analysis.components).filter((comp) => {
    // Filter out utility components, hooks, etc.
    return (
      comp.component_type === 'functional' &&
      !comp.name.startsWith('use') &&
      !comp.name.endsWith('Provider') &&
      !comp.name.endsWith('Context')
    );
  });
}

/**
 * Get API endpoints grouped by method
 */
export function getEndpointsByMethod(
  analysis: CodebaseAnalysisResult
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const endpoint of analysis.api_endpoints) {
    if (!grouped[endpoint.method]) {
      grouped[endpoint.method] = [];
    }
    grouped[endpoint.method].push(endpoint.path);
  }

  return grouped;
}

/**
 * Get constraints grouped by target
 */
export function getConstraintsByTarget(
  analysis: CodebaseAnalysisResult
): Record<string, Array<{ type: string; value: string }>> {
  const grouped: Record<string, Array<{ type: string; value: string }>> = {};

  for (const constraint of analysis.constraints) {
    if (!grouped[constraint.target]) {
      grouped[constraint.target] = [];
    }
    grouped[constraint.target].push({
      type: constraint.constraint_type,
      value: constraint.value,
    });
  }

  return grouped;
}

