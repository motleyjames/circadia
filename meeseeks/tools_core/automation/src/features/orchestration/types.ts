/**
 * Type definitions for orchestration
 */

export interface TestPlanItem {
  id: string;
  name: string;
  steps: string[];
  assertions: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface EdgeCase {
  scenario: string;
  expectedBehavior: string;
  testName: string;
}

export interface TestStrategy {
  testPlan: TestPlanItem[];
  edgeCases: EdgeCase[];
  warnings: string[];
}

export interface SchemaAnalysis {
  components: Record<string, ComponentSchema>;
  apiValidation: {
    endpoints: string[];
    typicalSuccessCodes: number[];
    typicalErrorCodes: number[];
  };
}

export interface ComponentSchema {
  requiredProps: string[];
  propConstraints: Record<string, PropConstraint>;
  stateTransitions: string[];
  criticalPaths: string[];
  edgeCases: string[];
  testPriority: 'critical' | 'high' | 'medium' | 'low';
}

export interface PropConstraint {
  type: string;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
}

export interface FailureAnalysis {
  rootCause: string;
  classification: 'timing' | 'element_missing' | 'state_mismatch' | 'logic_error' | 'other';
  retryStrategy: string;
  preconditions: string[];
  confidence: number;
}

export interface TestingCycleOptions {
  pagesToTest: string[];
  runCodebaseAnalysis?: boolean;
  generateTests?: boolean;
  maxGeminiCalls?: number;
}

export interface TestingCycleResult {
  runId: string;
  pagesVisited: number;
  elementsDetected: number;
  testsGenerated: number;
  geminiCalls: number;
  costEstimate: number;
  coveragePercent: number;
  errors: string[];
}

