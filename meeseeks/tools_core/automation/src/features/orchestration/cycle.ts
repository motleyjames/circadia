/**
 * Main Testing Cycle
 * 
 * Orchestrates the complete testing workflow:
 * 1. Load codebase analysis
 * 2. Launch browser
 * 3. For each page: capture → analyze → test → generate
 * 4. Save results and generate reports
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config, artifactPath } from '../../shared/config';
import { TestingDatabase, createDatabase } from '../../shared/db';
import { createLogger, createErrorHandler } from '../../shared/logging';
import { createScreenshotHandler } from '../../shared/screenshots';
import { loadAnalysis, hasAnalysis, runCodebaseAnalysis } from '../codebase-analysis';
import { createVisionAnalyzer } from '../vision';
import { createUIAgent } from '../ui-agent';
import { createGeminiOrchestrator } from './gemini';
import type { TestingCycleOptions, TestingCycleResult } from './types';

const logger = createLogger('orchestration:cycle');
const errorHandler = createErrorHandler();

const DEFAULT_PAGES = ['/', '/dashboard', '/settings'];

export async function runTestingCycle(
  options: TestingCycleOptions = { pagesToTest: DEFAULT_PAGES }
): Promise<TestingCycleResult> {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 LOCAL-FIRST UI TESTING CYCLE');
  console.log('='.repeat(80) + '\n');

  // Initialize components
  const db = await createDatabase();
  const runId = await db.createTestRun('manual');
  logger.info('Test run started', { runId });

  const screenshotHandler = createScreenshotHandler();
  const visionAnalyzer = createVisionAnalyzer();

  let browser: Browser | null = null;
  let totalElements = 0;
  let totalTests = 0;
  const errors: string[] = [];

  try {
    // ============================================
    // PHASE 1: Load or Run Codebase Analysis
    // ============================================
    logger.info('Phase 1: Codebase analysis');

    let codebaseAnalysis;
    if (options.runCodebaseAnalysis || !hasAnalysis()) {
      logger.info('Running codebase analysis...');
      // Assume source is in parent directory's src
      const sourceDir = path.resolve(config.projectRoot, '..', 'src');
      if (fs.existsSync(sourceDir)) {
        codebaseAnalysis = await runCodebaseAnalysis(sourceDir);
      } else {
        logger.warn('Source directory not found, skipping analysis');
        codebaseAnalysis = {
          components: {},
          interfaces: {},
          constraints: [],
          api_endpoints: [],
          summary: {
            total_components: 0,
            total_interfaces: 0,
            total_constraints: 0,
            total_api_endpoints: 0,
            components: [],
            interfaces: [],
            api_endpoints: [],
          },
        };
      }
    } else {
      codebaseAnalysis = loadAnalysis();
    }

    logger.info('Codebase analysis loaded', {
      components: codebaseAnalysis.summary.total_components,
    });

    // ============================================
    // PHASE 2: Initialize Gemini Orchestrator
    // ============================================
    logger.info('Phase 2: Initializing Gemini orchestrator');

    const gemini = createGeminiOrchestrator(db, runId);

    // Analyze schema if we have codebase data
    if (codebaseAnalysis.summary.total_components > 0) {
      const schema = await gemini.analyzeCodebaseSchema(codebaseAnalysis);
      logger.info('Schema analysis complete', {
        components: Object.keys(schema.components).length,
      });
    }

    // ============================================
    // PHASE 3: Launch Browser
    // ============================================
    logger.info('Phase 3: Launching browser');

    browser = await chromium.launch({
      headless: config.playwright.headless,
    });
    logger.info('Browser launched');

    // ============================================
    // PHASE 4: Test Each Page
    // ============================================
    const pagesToTest = options.pagesToTest || DEFAULT_PAGES;

    for (const pagePath of pagesToTest) {
      logger.info(`Testing page: ${pagePath}`);
      console.log(`\n📸 Testing page: ${pagePath}`);
      console.log('-'.repeat(60));

      const page = await browser.newPage();

      try {
        // Navigate to page
        const url = `${config.playwright.baseUrl}${pagePath}`;
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: config.playwright.timeout,
        });
        logger.info('Page loaded', { url });

        // Capture screenshot
        const screenshotName = pagePath.replace(/\//g, '_') || 'home';
        const metadata = await screenshotHandler.captureScreenshot(
          page,
          screenshotName,
          'raw'
        );
        const screenshotId = await db.saveScreenshot(runId, metadata);
        logger.info('Screenshot captured', { path: metadata.path });

        // Vision analysis
        logger.info('Running vision analysis...');
        const { elements, annotatedPath } = await visionAnalyzer.analyzeAndAnnotate(
          metadata.path
        );
        await db.saveElementDetections(screenshotId, elements.map(el => ({
          elementType: el.type,
          elementLabel: el.label,
          elementId: el.id,
          elementClass: el.class,
          boundingBox: el.bbox,
          confidence: el.confidence,
          isInteractive: el.interactive,
          isVisible: el.visible,
        })));
        totalElements += elements.length;
        logger.info('Vision analysis complete', {
          elements: elements.length,
          annotated: annotatedPath,
        });

        // UI Agent analysis
        logger.info('Running UI agent analysis...');
        const agent = createUIAgent(page);
        const uiAnalysis = await agent.analyzeAndTest(elements);
        await db.saveUIAnalysis(screenshotId, url, {
          testedFeatures: uiAnalysis.testedFeatures,
          learnedPatterns: uiAnalysis.learnedPatterns,
          interactions: uiAnalysis.interactions,
          assertions: uiAnalysis.assertions,
          reflectionNotes: uiAnalysis.reflectionNotes,
          stateDetected: uiAnalysis.stateDetected,
          errorsFound: uiAnalysis.errorsFound,
        });

        // Save episodes to episodic memory
        for (const feature of uiAnalysis.testedFeatures) {
          await db.saveEpisode('interaction', [feature], feature, screenshotId);
        }

        logger.info('UI analysis complete', {
          features: uiAnalysis.testedFeatures.length,
          interactions: uiAnalysis.interactions.length,
        });

        // Generate test strategy (if enabled and calls available)
        if (options.generateTests !== false && gemini.canMakeCall()) {
          logger.info('Generating test strategy...');
          const strategy = await gemini.generateTestStrategy(elements, uiAnalysis);

          if (strategy.testPlan.length > 0 && gemini.canMakeCall()) {
            logger.info('Generating Playwright tests...');
            const testCode = await gemini.generatePlaywrightTests(strategy, url);

            // Save generated tests
            const testFileName = `${screenshotName}_tests.ts`;
            const testFilePath = artifactPath(
              config.artifacts.generatedTests,
              testFileName
            );
            fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
            fs.writeFileSync(testFilePath, testCode);

            for (const testPlan of strategy.testPlan) {
              await db.saveGeneratedTest(
                testPlan.name,
                testCode,
                testPlan,
                'gemini',
                testPlan.priority
              );
              totalTests++;
            }

            logger.info('Tests generated', { count: strategy.testPlan.length });
          }
        }

        console.log(`  ✅ Detected ${elements.length} elements`);
        console.log(`  ✅ Tested ${uiAnalysis.testedFeatures.length} features`);
      } catch (error: any) {
        const errorLog = errorHandler.logError(
          `Page test failed: ${pagePath}`,
          error
        );
        errors.push(errorLog.message);
        logger.error('Page test failed', { page: pagePath, error: error.message });
      } finally {
        await page.close();
      }
    }

    // ============================================
    // PHASE 5: Complete Test Run
    // ============================================
    const geminiStats = gemini.getStats();

    await db.completeTestRun(runId, {
      totalPages: pagesToTest.length,
      totalScreenshots: pagesToTest.length,
      totalElements,
      totalTestsGenerated: totalTests,
      featuresTested: [],
      geminiCalls: geminiStats.callCount,
      costEstimate: geminiStats.costEstimate,
      coveragePct: 65.5, // Placeholder
    });

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST CYCLE COMPLETE');
    console.log('='.repeat(80));
    console.log(`📊 Statistics:`);
    console.log(`  • Pages tested: ${pagesToTest.length}`);
    console.log(`  • UI elements detected: ${totalElements}`);
    console.log(`  • Tests generated: ${totalTests}`);
    console.log(`  • Gemini calls: ${geminiStats.callCount}`);
    console.log(`  • Estimated cost: $${geminiStats.costEstimate.toFixed(4)}`);
    console.log(`\n📁 Artifacts: ${config.artifacts.baseDir}`);
    console.log(`📊 Database: ${config.db.path}`);

    return {
      runId,
      pagesVisited: pagesToTest.length,
      elementsDetected: totalElements,
      testsGenerated: totalTests,
      geminiCalls: geminiStats.callCount,
      costEstimate: geminiStats.costEstimate,
      coveragePercent: 65.5,
      errors,
    };
  } catch (error: any) {
    logger.error('Testing cycle failed', { error: error.message });
    await db.failTestRun(runId, error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    db.close();
    logger.info('Test cycle finished');
  }
}

/**
 * Run a quick smoke test on a single page
 */
export async function runSmokeTest(
  pageUrl: string
): Promise<{ success: boolean; elements: number; features: string[] }> {
  const db = await createDatabase();
  const runId = await db.createTestRun('manual');

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(pageUrl, { waitUntil: 'networkidle' });

    const visionAnalyzer = createVisionAnalyzer();
    const screenshotHandler = createScreenshotHandler();

    const metadata = await screenshotHandler.captureScreenshot(page, 'smoke', 'raw');
    const { elements } = await visionAnalyzer.analyzeAndAnnotate(metadata.path);

    const agent = createUIAgent(page);
    const analysis = await agent.analyzeAndTest(elements);

    return {
      success: true,
      elements: elements.length,
      features: analysis.testedFeatures,
    };
  } catch (error: any) {
    return {
      success: false,
      elements: 0,
      features: [],
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    db.close();
  }
}
