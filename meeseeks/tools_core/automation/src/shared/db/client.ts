/**
 * SQLite database client using sql.js (pure JavaScript, no native build)
 */

// @ts-ignore - sql.js doesn't have types
import initSqlJs from 'sql.js';

type SqlJsDatabase = any;
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import type {
  ComponentAnalysis,
  ScreenshotRow,
  ScreenshotMetadata,
  DetectedElement,
  UIAnalysis,
  TestRunSummary,
  GeneratedTestRow,
  CoverageMetricsRow,
  EpisodicMemoryRow,
} from './types';

let SQL: any = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export class TestingDatabase {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || config.db.path;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
  }

  private async getDb(): Promise<SqlJsDatabase> {
    if (!this.db) {
      const SQL = await getSql();
      
      // Load existing database if it exists
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
      }
    }
    return this.db;
  }

  private save(): void {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  /**
   * Initialize database with schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const db = await this.getDb();
    
    if (!fs.existsSync(config.db.schemaPath)) {
      throw new Error(`Schema file not found: ${config.db.schemaPath}`);
    }
    
    const schema = fs.readFileSync(config.db.schemaPath, 'utf-8');
    db.run(schema);
    this.save();
    this.initialized = true;
  }

  // ==============================================
  // TEST RUN MANAGEMENT
  // ==============================================

  async createTestRun(runType: 'manual' | 'scheduled' | 'agentic' = 'manual'): Promise<string> {
    const db = await this.getDb();
    const runId = uuidv4();
    db.run(`INSERT INTO test_runs (id, status, run_type) VALUES (?, 'running', ?)`, [runId, runType]);
    this.save();
    return runId;
  }

  async completeTestRun(runId: string, summary: TestRunSummary): Promise<void> {
    const db = await this.getDb();
    db.run(`
      UPDATE test_runs
      SET completed_at = datetime('now'),
          status = 'completed',
          total_pages = ?,
          total_screenshots = ?,
          total_elements_detected = ?,
          total_tests_generated = ?,
          features_tested = ?,
          gemini_calls = ?,
          total_cost_estimate = ?,
          coverage_pct = ?
      WHERE id = ?
    `, [
      summary.totalPages,
      summary.totalScreenshots,
      summary.totalElements,
      summary.totalTestsGenerated,
      JSON.stringify(summary.featuresTested),
      summary.geminiCalls,
      summary.costEstimate,
      summary.coveragePct,
      runId
    ]);
    this.save();
  }

  async failTestRun(runId: string, error: string): Promise<void> {
    const db = await this.getDb();
    db.run(`
      UPDATE test_runs
      SET completed_at = datetime('now'),
          status = 'failed',
          notes = ?
      WHERE id = ?
    `, [error, runId]);
    this.save();
  }

  async getLatestTestRun(): Promise<any> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM test_runs ORDER BY started_at DESC LIMIT 1`);
    return result.length > 0 ? this.rowToObject(result[0]) : null;
  }

  async getAllTestRuns(limit: number = 50): Promise<any[]> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM test_runs ORDER BY started_at DESC LIMIT ${limit}`);
    return result.length > 0 ? this.rowsToObjects(result[0]) : [];
  }

  // ==============================================
  // CODEBASE ANALYSIS
  // ==============================================

  async saveCodebaseAnalysis(analysis: ComponentAnalysis): Promise<void> {
    const db = await this.getDb();
    const hash = crypto.createHash('md5').update(JSON.stringify(analysis)).digest('hex');

    try {
      db.run(`
        INSERT INTO codebase_analysis 
        (component_name, file_path, component_type, interface_name, props_schema, constraints, api_endpoints, analysis_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        analysis.componentName,
        analysis.filePath || null,
        analysis.componentType || null,
        analysis.interfaceName || null,
        JSON.stringify(analysis.propsSchema),
        JSON.stringify(analysis.constraints),
        JSON.stringify(analysis.apiEndpoints),
        hash
      ]);
      this.save();
    } catch (e: any) {
      if (!e.message.includes('UNIQUE')) throw e;
    }
  }

  async getCodebaseAnalysis(): Promise<ComponentAnalysis[]> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM codebase_analysis ORDER BY analyzed_at DESC`);
    if (result.length === 0) return [];
    
    return this.rowsToObjects(result[0]).map((row: any) => ({
      componentName: row.component_name,
      filePath: row.file_path,
      componentType: row.component_type,
      interfaceName: row.interface_name,
      propsSchema: JSON.parse(row.props_schema || '{}'),
      constraints: JSON.parse(row.constraints || '{}'),
      apiEndpoints: JSON.parse(row.api_endpoints || '[]'),
    }));
  }

  // ==============================================
  // SCREENSHOT MANAGEMENT
  // ==============================================

  async saveScreenshot(testRunId: string, metadata: ScreenshotMetadata): Promise<number> {
    const db = await this.getDb();
    db.run(`
      INSERT INTO screenshots (test_run_id, url, path, file_size, width, height, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      testRunId,
      metadata.url,
      metadata.path,
      metadata.fileSize,
      metadata.width,
      metadata.height,
      metadata.hash
    ]);
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  async getScreenshot(id: number): Promise<ScreenshotRow | undefined> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM screenshots WHERE id = ${id}`);
    return result.length > 0 ? this.rowToObject(result[0]) : undefined;
  }

  async getScreenshotsByRun(runId: string): Promise<ScreenshotRow[]> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM screenshots WHERE test_run_id = '${runId}'`);
    return result.length > 0 ? this.rowsToObjects(result[0]) : [];
  }

  // ==============================================
  // ELEMENT DETECTIONS
  // ==============================================

  async saveElementDetections(screenshotId: number, elements: DetectedElement[]): Promise<void> {
    const db = await this.getDb();
    
    for (const element of elements) {
      db.run(`
        INSERT INTO element_detections 
        (screenshot_id, element_type, element_label, element_id, element_class, bounding_box, confidence, is_interactive, is_visible)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        screenshotId,
        element.elementType,
        element.elementLabel || null,
        element.elementId || null,
        element.elementClass || null,
        JSON.stringify(element.boundingBox),
        element.confidence,
        element.isInteractive ? 1 : 0,
        element.isVisible ? 1 : 0
      ]);
    }
    this.save();
  }

  async getElementsForScreenshot(screenshotId: number): Promise<DetectedElement[]> {
    const db = await this.getDb();
    const result = db.exec(`
      SELECT * FROM element_detections 
      WHERE screenshot_id = ${screenshotId} 
      ORDER BY confidence DESC
    `);
    
    if (result.length === 0) return [];
    
    return this.rowsToObjects(result[0]).map((row: any) => ({
      elementType: row.element_type,
      elementLabel: row.element_label,
      elementId: row.element_id,
      elementClass: row.element_class,
      boundingBox: JSON.parse(row.bounding_box),
      confidence: row.confidence,
      isInteractive: !!row.is_interactive,
      isVisible: !!row.is_visible,
    }));
  }

  // ==============================================
  // UI ANALYSIS
  // ==============================================

  async saveUIAnalysis(screenshotId: number, pageUrl: string, analysis: UIAnalysis): Promise<number> {
    const db = await this.getDb();
    db.run(`
      INSERT INTO ui_analysis 
      (screenshot_id, page_url, tested_features, learned_patterns, interactions, assertions, reflection_notes, state_detected, errors_found)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      screenshotId,
      pageUrl,
      JSON.stringify(analysis.testedFeatures),
      JSON.stringify(analysis.learnedPatterns),
      JSON.stringify(analysis.interactions),
      JSON.stringify(analysis.assertions),
      analysis.reflectionNotes,
      JSON.stringify(analysis.stateDetected),
      JSON.stringify(analysis.errorsFound)
    ]);
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  // ==============================================
  // GEMINI CALLS TRACKING
  // ==============================================

  async recordGeminiCall(
    runId: string,
    callNumber: number,
    callType: 'schema_validation' | 'test_strategy' | 'failure_analysis' | 'test_generation',
    promptPreview: string,
    responsePreview: string,
    tokensUsed: number,
    costEstimate: number
  ): Promise<number> {
    const db = await this.getDb();
    db.run(`
      INSERT INTO gemini_calls 
      (run_id, call_number, call_type, prompt_preview, response_preview, tokens_used, cost_estimate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      runId,
      callNumber,
      callType,
      promptPreview.substring(0, 500),
      responsePreview.substring(0, 500),
      tokensUsed,
      costEstimate
    ]);
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  async getGeminiCallsByRun(runId: string): Promise<any[]> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM gemini_calls WHERE run_id = '${runId}' ORDER BY call_number ASC`);
    return result.length > 0 ? this.rowsToObjects(result[0]) : [];
  }

  // ==============================================
  // TEST GENERATION
  // ==============================================

  async saveGeneratedTest(
    testName: string,
    testCode: string,
    sourceFeature: any,
    generatedBy: 'gemini' | 'ui_tars2',
    priority: 'critical' | 'high' | 'medium' | 'low'
  ): Promise<number> {
    const db = await this.getDb();
    
    // Try insert, update on conflict
    try {
      db.run(`
        INSERT INTO generated_tests 
        (test_name, test_code, source_feature, generated_by, priority)
        VALUES (?, ?, ?, ?, ?)
      `, [testName, testCode, JSON.stringify(sourceFeature), generatedBy, priority]);
    } catch (e: any) {
      if (e.message.includes('UNIQUE')) {
        db.run(`
          UPDATE generated_tests 
          SET test_code = ?, source_feature = ?, updated_at = datetime('now')
          WHERE test_name = ?
        `, [testCode, JSON.stringify(sourceFeature), testName]);
      } else {
        throw e;
      }
    }
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  async updateTestResult(testId: number, status: 'passing' | 'failing', error?: string): Promise<void> {
    const db = await this.getDb();
    const passIncrement = status === 'passing' ? 1 : 0;
    const failIncrement = status === 'failing' ? 1 : 0;
    
    db.run(`
      UPDATE generated_tests 
      SET status = ?,
          last_run = datetime('now'),
          updated_at = datetime('now'),
          pass_count = pass_count + ?,
          fail_count = fail_count + ?,
          last_error = ?
      WHERE id = ?
    `, [status, passIncrement, failIncrement, error || null, testId]);
    this.save();
  }

  async getGeneratedTests(status?: 'pending' | 'passing' | 'failing'): Promise<GeneratedTestRow[]> {
    const db = await this.getDb();
    const query = status
      ? `SELECT * FROM generated_tests WHERE status = '${status}' ORDER BY priority DESC, created_at DESC`
      : `SELECT * FROM generated_tests ORDER BY priority DESC, created_at DESC`;
    const result = db.exec(query);
    return result.length > 0 ? this.rowsToObjects(result[0]) as GeneratedTestRow[] : [];
  }

  // ==============================================
  // EPISODIC MEMORY
  // ==============================================

  async saveEpisode(
    episodeType: 'success' | 'failure' | 'edge_case' | 'interaction',
    actionSequence: any,
    outcome: string,
    screenshotId?: number,
    rootCause?: string,
    retryStrategy?: string,
    confidence: number = 1.0
  ): Promise<number> {
    const db = await this.getDb();
    db.run(`
      INSERT INTO episodic_memory 
      (episode_type, screenshot_id, action_sequence, outcome, root_cause, retry_strategy, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      episodeType,
      screenshotId || null,
      JSON.stringify(actionSequence),
      outcome,
      rootCause || null,
      retryStrategy || null,
      confidence
    ]);
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  async getRecentEpisodes(limit: number = 20, episodeType?: string): Promise<EpisodicMemoryRow[]> {
    const db = await this.getDb();
    const query = episodeType
      ? `SELECT * FROM episodic_memory WHERE episode_type = '${episodeType}' ORDER BY created_at DESC LIMIT ${limit}`
      : `SELECT * FROM episodic_memory ORDER BY created_at DESC LIMIT ${limit}`;
    const result = db.exec(query);
    return result.length > 0 ? this.rowsToObjects(result[0]) as EpisodicMemoryRow[] : [];
  }

  // ==============================================
  // TEST FAILURES
  // ==============================================

  async recordFailure(
    testId: number,
    runId: string,
    errorMessage: string,
    classification: 'timing' | 'element_missing' | 'state_mismatch' | 'logic_error' | 'other',
    screenshotId?: number,
    geminiAnalysis?: any,
    retryStrategy?: string
  ): Promise<number> {
    const db = await this.getDb();
    db.run(`
      INSERT INTO test_failures 
      (test_id, run_id, error_message, error_classification, screenshot_at_failure, gemini_analysis, retry_strategy)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      testId,
      runId,
      errorMessage,
      classification,
      screenshotId || null,
      geminiAnalysis ? JSON.stringify(geminiAnalysis) : null,
      retryStrategy || null
    ]);
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  // ==============================================
  // COVERAGE METRICS
  // ==============================================

  async saveCoverageMetrics(
    runId: string,
    componentName: string,
    featuresTested: number,
    featuresTotal: number,
    edgeCasesFound: number,
    edgeCasesTested: number,
    criticalPathsTested: number
  ): Promise<number> {
    const db = await this.getDb();
    const coveragePct = featuresTotal > 0 ? (featuresTested / featuresTotal) * 100 : 0;
    
    db.run(`
      INSERT INTO coverage_metrics 
      (run_id, component_name, features_tested, features_total, coverage_pct, 
       critical_paths_tested, edge_cases_found, edge_cases_tested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      runId,
      componentName,
      featuresTested,
      featuresTotal,
      coveragePct,
      criticalPathsTested,
      edgeCasesFound,
      edgeCasesTested
    ]);
    this.save();
    
    const result = db.exec(`SELECT last_insert_rowid() as id`);
    return result[0].values[0][0] as number;
  }

  async getCoverageMetrics(runId: string): Promise<CoverageMetricsRow[]> {
    const db = await this.getDb();
    const result = db.exec(`SELECT * FROM coverage_metrics WHERE run_id = '${runId}'`);
    return result.length > 0 ? this.rowsToObjects(result[0]) as CoverageMetricsRow[] : [];
  }

  // ==============================================
  // UTILITIES
  // ==============================================

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }

  private rowToObject(result: { columns: string[]; values: any[][] }): any {
    if (result.values.length === 0) return null;
    const obj: any = {};
    result.columns.forEach((col, i) => {
      obj[col] = result.values[0][i];
    });
    return obj;
  }

  private rowsToObjects(result: { columns: string[]; values: any[][] }): any[] {
    return result.values.map(row => {
      const obj: any = {};
      result.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }
}

/**
 * Create and initialize a new database instance
 */
export async function createDatabase(dbPath?: string): Promise<TestingDatabase> {
  const db = new TestingDatabase(dbPath);
  await db.initialize();
  return db;
}
