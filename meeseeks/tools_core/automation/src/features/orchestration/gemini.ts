/**
 * Gemini 3 Pro Orchestrator
 * 
 * Strategic AI orchestrator for:
 * - Codebase schema analysis
 * - Test strategy generation
 * - Playwright test code generation
 * - Failure analysis
 * 
 * Designed for minimal API calls (~3-4 per test run)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../shared/config';
import { createLogger } from '../../shared/logging';
import { TestingDatabase } from '../../shared/db';
import type { CodebaseAnalysisResult } from '../codebase-analysis/types';
import type { DetectedElement } from '../vision/types';
import type { UIAnalysisResult } from '../ui-agent/types';
import type {
  TestStrategy,
  SchemaAnalysis,
  FailureAnalysis,
} from './types';

const logger = createLogger('orchestration:gemini');

// Cost estimates per 1K tokens (approximate)
const COST_PER_1K_INPUT = 0.00025;
const COST_PER_1K_OUTPUT = 0.0005;

export class GeminiOrchestrator {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private db: TestingDatabase;
  private runId: string;
  private callCount = 0;
  private totalTokensUsed = 0;
  private totalCost = 0;

  constructor(db: TestingDatabase, runId: string) {
    if (!config.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.gemini.model });
    this.db = db;
    this.runId = runId;
  }

  /**
   * CALL 1: Analyze codebase schema
   */
  async analyzeCodebaseSchema(
    codebaseAnalysis: CodebaseAnalysisResult
  ): Promise<SchemaAnalysis> {
    logger.info('Analyzing codebase schema');

    const prompt = `You are analyzing a React/TypeScript application for automated testing.

Here is the codebase structure:
${JSON.stringify(codebaseAnalysis.summary, null, 2)}

Components found:
${codebaseAnalysis.summary.components.slice(0, 10).join(', ')}${codebaseAnalysis.summary.components.length > 10 ? '...' : ''}

TASK: Extract testing schema for the major components.

For each component, determine:
1. Required Props - which props MUST be present
2. Constraints - min/max ranges, enum values, patterns
3. State Transitions - what state changes to test
4. Error Boundaries - error states to handle
5. Critical Paths - most important user journeys
6. Edge Cases - unusual but valid scenarios

Return ONLY valid JSON (no markdown, no code fences):
{
  "components": {
    "ComponentName": {
      "requiredProps": ["prop1"],
      "propConstraints": {"amount": {"type": "number", "min": 0, "max": 1000000}},
      "stateTransitions": ["idle", "loading", "success"],
      "criticalPaths": ["user_action_1"],
      "edgeCases": ["empty_state", "error_state"],
      "testPriority": "high"
    }
  },
  "apiValidation": {
    "endpoints": ${JSON.stringify(codebaseAnalysis.summary.api_endpoints.slice(0, 5))},
    "typicalSuccessCodes": [200, 201],
    "typicalErrorCodes": [400, 401, 500]
  }
}`;

    try {
      const result = await this._callGemini(prompt, 'schema_validation');
      return result as SchemaAnalysis;
    } catch (error: any) {
      logger.error('Schema analysis failed', { error: error.message });
      return {
        components: {},
        apiValidation: {
          endpoints: [],
          typicalSuccessCodes: [200],
          typicalErrorCodes: [400, 500],
        },
      };
    }
  }

  /**
   * CALL 2: Generate test strategy
   */
  async generateTestStrategy(
    elements: DetectedElement[],
    uiAnalysis: UIAnalysisResult,
    previousFailures: string[] = []
  ): Promise<TestStrategy> {
    logger.info('Generating test strategy');

    const prompt = `You are orchestrating automated UI tests.

DETECTED ELEMENTS (${elements.length} total):
${JSON.stringify(elements.slice(0, 20), null, 2)}

SEMANTIC ANALYSIS:
- Features tested: ${uiAnalysis.testedFeatures.join(', ')}
- Interactions: ${uiAnalysis.interactions.length}
- Patterns: ${JSON.stringify(uiAnalysis.learnedPatterns)}

${previousFailures.length > 0 ? `PREVIOUS FAILURES:\n${previousFailures.join('\n')}` : ''}

TASK: Create an intelligent test strategy.

Return ONLY valid JSON:
{
  "testPlan": [
    {
      "id": "test_1",
      "name": "descriptive test name",
      "steps": ["step 1", "step 2"],
      "assertions": ["assertion 1"],
      "priority": "critical|high|medium|low"
    }
  ],
  "edgeCases": [
    {
      "scenario": "description",
      "expectedBehavior": "what should happen",
      "testName": "edge_case_test_name"
    }
  ],
  "warnings": ["any warnings about the UI"]
}`;

    try {
      const result = await this._callGemini(prompt, 'test_strategy');
      return result as TestStrategy;
    } catch (error: any) {
      logger.error('Test strategy generation failed', { error: error.message });
      return { testPlan: [], edgeCases: [], warnings: [error.message] };
    }
  }

  /**
   * CALL 3: Generate Playwright test code
   */
  async generatePlaywrightTests(
    strategy: TestStrategy,
    pageUrl: string
  ): Promise<string> {
    logger.info('Generating Playwright tests');

    const prompt = `Generate production-ready Playwright test code.

TEST STRATEGY:
${JSON.stringify(strategy, null, 2)}

PAGE URL: ${pageUrl}

Requirements:
- Use modern Playwright patterns (locators, expect)
- Include proper waits (waitForLoadState, waitForSelector)
- Use data-testid selectors where possible
- Add meaningful assertions
- Include error handling
- Follow AAA pattern (Arrange, Act, Assert)

Return ONLY valid TypeScript code starting with "import":`;

    try {
      const response = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      });

      const code = response.response.text();
      this._recordCall('test_generation', prompt, code, 1200, 0.002);

      return code;
    } catch (error: any) {
      logger.error('Test generation failed', { error: error.message });
      return `// Error generating tests: ${error.message}`;
    }
  }

  /**
   * CALL 4 (Optional): Analyze test failure
   */
  async analyzeTestFailure(
    testName: string,
    error: string,
    context?: { screenshot?: string; html?: string }
  ): Promise<FailureAnalysis> {
    logger.info('Analyzing test failure', { testName });

    const prompt = `A UI test failed. Analyze the failure.

TEST NAME: ${testName}
ERROR: ${error}
${context?.html ? `RELEVANT HTML: ${context.html.substring(0, 500)}` : ''}

Analyze:
1. Root cause - what caused this failure
2. Classification - timing | element_missing | state_mismatch | logic_error | other
3. Retry strategy - how to handle this
4. Preconditions - what must be true before running

Return ONLY valid JSON:
{
  "rootCause": "explanation",
  "classification": "classification",
  "retryStrategy": "strategy",
  "preconditions": ["precondition1"],
  "confidence": 0.8
}`;

    try {
      const result = await this._callGemini(prompt, 'failure_analysis');
      return result as FailureAnalysis;
    } catch (error: any) {
      logger.error('Failure analysis failed', { error: error.message });
      return {
        rootCause: error.message,
        classification: 'other',
        retryStrategy: 'Retry with increased timeout',
        preconditions: [],
        confidence: 0.5,
      };
    }
  }

  /**
   * Get call statistics
   */
  getStats(): { callCount: number; tokensUsed: number; costEstimate: number } {
    return {
      callCount: this.callCount,
      tokensUsed: this.totalTokensUsed,
      costEstimate: this.totalCost,
    };
  }

  /**
   * Check if we can make more calls
   */
  canMakeCall(): boolean {
    return this.callCount < config.gemini.maxCallsPerRun;
  }

  /**
   * Internal: Call Gemini and parse JSON response
   */
  private async _callGemini(
    prompt: string,
    callType: 'schema_validation' | 'test_strategy' | 'failure_analysis' | 'test_generation'
  ): Promise<any> {
    if (!this.canMakeCall()) {
      throw new Error(`Max Gemini calls (${config.gemini.maxCallsPerRun}) reached`);
    }

    const response = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: callType === 'test_generation' ? 0.3 : 0.4,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4000,
      },
    });

    const text = response.response.text();
    
    // Estimate tokens (rough approximation)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);
    const cost = (inputTokens * COST_PER_1K_INPUT + outputTokens * COST_PER_1K_OUTPUT) / 1000;

    this._recordCall(callType, prompt, text, inputTokens + outputTokens, cost);

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not extract JSON from response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Internal: Record API call to database
   */
  private _recordCall(
    callType: 'schema_validation' | 'test_strategy' | 'failure_analysis' | 'test_generation',
    prompt: string,
    response: string,
    tokens: number,
    cost: number
  ): void {
    this.callCount++;
    this.totalTokensUsed += tokens;
    this.totalCost += cost;

    this.db.recordGeminiCall(
      this.runId,
      this.callCount,
      callType,
      prompt.substring(0, 500),
      response.substring(0, 500),
      tokens,
      cost
    );

    logger.info(`Gemini call ${this.callCount}: ${callType}`, {
      tokens,
      cost: cost.toFixed(4),
    });
  }
}

/**
 * Create a Gemini orchestrator instance
 */
export function createGeminiOrchestrator(
  db: TestingDatabase,
  runId: string
): GeminiOrchestrator {
  return new GeminiOrchestrator(db, runId);
}

