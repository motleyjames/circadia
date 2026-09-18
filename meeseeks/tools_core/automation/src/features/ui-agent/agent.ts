/**
 * UI-TARS-2 Style Agent
 * 
 * Semantic reasoning and interaction planning agent that:
 * - Identifies testable features from detected elements
 * - Plans interaction sequences
 * - Executes actions and collects results
 * - Learns patterns from successes and failures
 */

import type { Page } from 'playwright';
import { createLogger } from '../../shared/logging';
import type { DetectedElement } from '../vision/types';
import type {
  UIAnalysisResult,
  InteractionStep,
  PlannedInteraction,
  LearnedPattern,
  PageState,
} from './types';

const logger = createLogger('ui-agent');

// Keywords that indicate specific features
const FEATURE_KEYWORDS = {
  buy_trading: ['buy', 'purchase', 'order'],
  sell_trading: ['sell', 'sell now'],
  form_submission: ['submit', 'send', 'save'],
  authentication: ['login', 'sign in', 'register', 'sign up'],
  navigation: ['menu', 'nav', 'home', 'back'],
  search: ['search', 'find', 'filter'],
  cart: ['cart', 'basket', 'checkout'],
  settings: ['settings', 'preferences', 'options'],
};

// Test value generators by field type
const TEST_VALUES: Record<string, string> = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  name: 'Test User',
  phone: '+1234567890',
  amount: '100',
  price: '50.00',
  quantity: '1',
  search: 'test query',
  address: '123 Test Street',
  city: 'Test City',
  zip: '12345',
  default: 'test_value',
};

export class UITarsAgent {
  private page: Page;
  private episodicMemory: Map<string, LearnedPattern> = new Map();

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Main analysis method - analyze and test the page
   */
  async analyzeAndTest(elements: DetectedElement[]): Promise<UIAnalysisResult> {
    logger.info('Starting UI analysis', { elementCount: elements.length });

    // Phase 1: Identify features
    const features = this._identifyFeatures(elements);
    logger.info('Features identified', { features });

    // Phase 2: Plan interactions
    const plannedInteractions = this._planInteractions(elements, features);
    logger.info('Interactions planned', { count: plannedInteractions.length });

    // Phase 3: Execute interactions
    const results = await this._executeInteractions(plannedInteractions);

    // Phase 4: Analyze patterns
    const patterns = this._analyzePatterns(results);

    // Phase 5: Capture state and generate reflection
    const state = await this._capturePageState();
    const reflection = this._generateReflection(features, results);

    // Calculate assertions
    const passed = results.filter((r) => r.result === 'success').length;
    const failed = results.filter((r) => r.result === 'failed').length;

    return {
      testedFeatures: features,
      learnedPatterns: patterns,
      interactions: results,
      assertions: { passed, failed },
      reflectionNotes: reflection,
      stateDetected: state,
      errorsFound: results
        .filter((r) => r.error)
        .map((r) => r.error!),
    };
  }

  /**
   * Identify features based on detected elements
   */
  private _identifyFeatures(elements: DetectedElement[]): string[] {
    const features = new Set<string>();

    const buttons = elements.filter((e) => e.type === 'button');
    const inputs = elements.filter((e) => e.type === 'input');
    const forms = elements.filter((e) => e.type === 'form');
    const links = elements.filter((e) => e.type === 'link');

    // Check for interactive elements
    if (buttons.length > 0) features.add('user_interactions');
    if (inputs.length > 0) features.add('form_input');
    if (forms.length > 0) features.add('form_handling');
    if (links.length > 0) features.add('navigation');

    // Check for specific feature keywords
    for (const element of elements) {
      const label = element.label?.toLowerCase() || '';
      
      for (const [feature, keywords] of Object.entries(FEATURE_KEYWORDS)) {
        if (keywords.some((kw) => label.includes(kw))) {
          features.add(feature);
        }
      }

      // Input-specific features
      if (element.type === 'input') {
        if (label.includes('amount') || label.includes('price')) {
          features.add('numeric_input');
        }
        if (label.includes('email')) {
          features.add('email_input');
        }
        if (label.includes('password')) {
          features.add('password_input');
        }
      }
    }

    return Array.from(features);
  }

  /**
   * Plan interactions based on elements and features
   */
  private _planInteractions(
    elements: DetectedElement[],
    features: string[]
  ): PlannedInteraction[] {
    const interactions: PlannedInteraction[] = [];

    // Get interactive elements
    const interactiveElements = elements.filter(
      (e) => e.interactive && e.visible
    );

    // Plan input filling first
    const inputs = interactiveElements.filter((e) => e.type === 'input');
    for (const input of inputs) {
      interactions.push({
        action: 'type',
        targetElement: input,
        value: this._generateTestValue(input),
        reason: `Fill input: ${input.label || 'unnamed'}`,
      });
    }

    // Plan button clicks
    const buttons = interactiveElements.filter((e) => e.type === 'button');
    for (const button of buttons) {
      // Skip if it looks like a destructive action
      const label = button.label?.toLowerCase() || '';
      if (label.includes('delete') || label.includes('remove')) {
        continue;
      }

      interactions.push({
        action: 'click',
        targetElement: button,
        reason: `Test button: ${button.label || 'unnamed'}`,
      });
    }

    // Plan dropdown interactions
    const dropdowns = interactiveElements.filter((e) => e.type === 'dropdown');
    for (const dropdown of dropdowns) {
      interactions.push({
        action: 'click',
        targetElement: dropdown,
        reason: `Test dropdown: ${dropdown.label || 'unnamed'}`,
      });
    }

    return interactions;
  }

  /**
   * Execute planned interactions
   */
  private async _executeInteractions(
    interactions: PlannedInteraction[]
  ): Promise<InteractionStep[]> {
    const results: InteractionStep[] = [];

    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      const startTime = Date.now();
      let result: 'success' | 'failed' = 'success';
      let error: string | undefined;

      try {
        await this._executeInteraction(interaction);
        await this.page.waitForTimeout(100); // Brief pause between actions
      } catch (e: any) {
        result = 'failed';
        error = e.message;
        logger.warn('Interaction failed', {
          action: interaction.action,
          target: interaction.targetElement.label,
          error: e.message,
        });
      }

      results.push({
        step: i + 1,
        action: interaction.action,
        target: interaction.targetElement.label || interaction.targetElement.type,
        value: interaction.value,
        result,
        duration: Date.now() - startTime,
        error,
      });
    }

    return results;
  }

  /**
   * Execute a single interaction
   */
  private async _executeInteraction(interaction: PlannedInteraction): Promise<void> {
    const { action, targetElement, value } = interaction;
    const bbox = targetElement.bbox;

    // Try selector-based approach first
    const selectors = this._buildSelectors(targetElement);

    for (const selector of selectors) {
      try {
        const locator = this.page.locator(selector);
        const isVisible = await locator.isVisible({ timeout: 1000 });
        
        if (isVisible) {
          if (action === 'click') {
            await locator.click({ timeout: 5000 });
          } else if (action === 'type' && value) {
            await locator.fill(value, { timeout: 5000 });
          } else if (action === 'hover') {
            await locator.hover({ timeout: 5000 });
          }
          return;
        }
      } catch {
        // Try next selector
      }
    }

    // Fallback to coordinate-based clicking
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    if (action === 'click') {
      await this.page.mouse.click(centerX, centerY);
    } else if (action === 'type' && value) {
      await this.page.mouse.click(centerX, centerY);
      await this.page.keyboard.type(value);
    } else if (action === 'hover') {
      await this.page.mouse.move(centerX, centerY);
    }
  }

  /**
   * Build possible selectors for an element
   */
  private _buildSelectors(element: DetectedElement): string[] {
    const selectors: string[] = [];

    if (element.id) {
      selectors.push(`#${element.id}`);
      selectors.push(`[data-testid="${element.id}"]`);
    }

    if (element.label) {
      selectors.push(`text="${element.label}"`);
      selectors.push(`[aria-label="${element.label}"]`);
      selectors.push(`button:has-text("${element.label}")`);
    }

    if (element.class) {
      const classes = element.class.split(' ').filter(Boolean);
      for (const cls of classes) {
        selectors.push(`.${cls}`);
      }
    }

    return selectors;
  }

  /**
   * Analyze patterns from interaction results
   */
  private _analyzePatterns(results: InteractionStep[]): LearnedPattern[] {
    const patterns: LearnedPattern[] = [];

    const successCount = results.filter((r) => r.result === 'success').length;
    const failureCount = results.filter((r) => r.result === 'failed').length;
    const total = results.length;

    if (total === 0) {
      return patterns;
    }

    // Overall success pattern
    if (successCount === total) {
      patterns.push({
        pattern: 'all_interactions_successful',
        confidence: 0.95,
        implication: 'Page is stable and responsive',
        occurrences: successCount,
      });
    } else if (failureCount > 0) {
      patterns.push({
        pattern: 'some_interactions_failed',
        confidence: 0.85,
        implication: 'Page may have state or timing issues',
        failures: failureCount,
      });
    }

    // Analyze failure patterns
    const failedByAction = new Map<string, number>();
    for (const result of results.filter((r) => r.result === 'failed')) {
      const count = failedByAction.get(result.action) || 0;
      failedByAction.set(result.action, count + 1);
    }

    for (const [action, count] of failedByAction) {
      if (count > 1) {
        patterns.push({
          pattern: `repeated_${action}_failures`,
          confidence: 0.8,
          implication: `${action} actions may need attention`,
          failures: count,
        });
      }
    }

    return patterns;
  }

  /**
   * Capture current page state
   */
  private async _capturePageState(): Promise<PageState> {
    return {
      url: this.page.url(),
      title: await this.page.title(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate reflection based on analysis
   */
  private _generateReflection(
    features: string[],
    results: InteractionStep[]
  ): string {
    const successCount = results.filter((r) => r.result === 'success').length;
    const totalCount = results.length;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

    return (
      `Tested ${features.length} features across ${totalCount} interactions. ` +
      `Success rate: ${successRate.toFixed(0)}%. ` +
      `Key features: ${features.slice(0, 5).join(', ')}.`
    );
  }

  /**
   * Generate appropriate test value based on element
   */
  private _generateTestValue(element: DetectedElement): string {
    const label = element.label?.toLowerCase() || '';

    for (const [key, value] of Object.entries(TEST_VALUES)) {
      if (label.includes(key)) {
        return value;
      }
    }

    return TEST_VALUES.default;
  }

  /**
   * Get episodic memory entries
   */
  getEpisodicMemory(): LearnedPattern[] {
    return Array.from(this.episodicMemory.values());
  }

  /**
   * Store a learned pattern in episodic memory
   */
  rememberPattern(pattern: LearnedPattern): void {
    const existing = this.episodicMemory.get(pattern.pattern);
    if (existing) {
      // Update existing pattern
      existing.occurrences = (existing.occurrences || 0) + 1;
      existing.confidence = Math.min(0.99, existing.confidence + 0.05);
    } else {
      this.episodicMemory.set(pattern.pattern, { ...pattern, occurrences: 1 });
    }
  }
}

/**
 * Create a UI agent instance
 */
export function createUIAgent(page: Page): UITarsAgent {
  return new UITarsAgent(page);
}

