/**
 * Local-First Browser Automation System
 * 
 * Main entrypoint for the automation framework.
 * 
 * Capabilities:
 * - UI Testing: Automated test generation and execution
 * - Vision Analysis: Local element detection with FastVLM
 * - Agentic Workflows: Self-healing automations (Skyvern-style)
 * - Interactive Control: Live streaming with browser controls (future)
 * 
 * Feature-sliced architecture:
 * - shared/: Database, logging, screenshots, config
 * - features/codebase-analysis: Python AST analyzer + TS bridge
 * - features/vision: FastVLM local vision analysis
 * - features/ui-agent: UI-TARS-2 style semantic agent
 * - features/orchestration: Gemini 3 Pro + main testing cycle
 * - features/reporting: HTML/JSON reports + dashboards
 */

// Re-export shared modules
export { config, artifactPath, projectPath, pythonScriptPath } from './shared/config';
export { TestingDatabase, createDatabase } from './shared/db';
export { Logger, createLogger, ErrorHandler, createErrorHandler } from './shared/logging';
export { ScreenshotHandler, createScreenshotHandler } from './shared/screenshots';
export { renderAnsiShadowBanner } from './shared/ascii';

// Re-export features
export * from './features/codebase-analysis';
export * from './features/vision';
export * from './features/ui-agent';
export * from './features/orchestration';
export * from './features/reporting';

// CLI handling
import { runTestingCycle, runSmokeTest } from './features/orchestration';
import { createDatabase } from './shared/db';
import { createReportGenerator, createDataVisualizer } from './features/reporting';
import { runCodebaseAnalysis } from './features/codebase-analysis';
import { config } from './shared/config';

async function main(): Promise<void> {
  const command = process.argv[2] || 'help';

  switch (command) {
    case 'init-db': {
      console.log('🗄️  Initializing database...');
      const db = await createDatabase();
      db.close();
      console.log(`✅ Database initialized at: ${config.db.path}`);
      break;
    }

    case 'analyze': {
      const sourceDir = process.argv[3] || '../src';
      console.log(`📊 Analyzing codebase: ${sourceDir}`);
      const result = await runCodebaseAnalysis(sourceDir);
      console.log(`✅ Analysis complete:`);
      console.log(`   Components: ${result.summary.total_components}`);
      console.log(`   Interfaces: ${result.summary.total_interfaces}`);
      console.log(`   Constraints: ${result.summary.total_constraints}`);
      console.log(`   API Endpoints: ${result.summary.total_api_endpoints}`);
      break;
    }

    case 'test': {
      const pages = process.argv.slice(3);
      await runTestingCycle({
        pagesToTest: pages.length > 0 ? pages : ['/', '/dashboard'],
        generateTests: true,
      });
      break;
    }

    case 'smoke': {
      const url = process.argv[3] || config.playwright.baseUrl;
      console.log(`🔥 Running smoke test on: ${url}`);
      const result = await runSmokeTest(url);
      console.log(`✅ Smoke test complete:`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Elements: ${result.elements}`);
      console.log(`   Features: ${result.features.join(', ')}`);
      break;
    }

    case 'report': {
      console.log('📝 Generating reports...');
      const db = await createDatabase();
      const generator = createReportGenerator(db);
      const report = await generator.generateReport();
      const htmlPath = generator.exportHTML(report);
      const jsonPath = generator.exportJSON(report);
      db.close();
      console.log(`✅ Reports generated:`);
      console.log(`   HTML: ${htmlPath}`);
      console.log(`   JSON: ${jsonPath}`);
      break;
    }

    case 'dashboard': {
      console.log('📊 Generating dashboard...');
      const db = await createDatabase();
      const visualizer = createDataVisualizer(db);
      const path = await visualizer.generateDashboard();
      db.close();
      console.log(`✅ Dashboard generated: ${path}`);
      break;
    }

    case 'full-cycle': {
      console.log('🚀 Running full testing cycle...');
      
      // Run tests
      await runTestingCycle({
        pagesToTest: ['/', '/dashboard'],
        runCodebaseAnalysis: true,
        generateTests: true,
      });

      // Generate reports
      const db = await createDatabase();
      const generator = createReportGenerator(db);
      const visualizer = createDataVisualizer(db);
      
      const report = await generator.generateReport();
      generator.exportHTML(report);
      generator.exportJSON(report);
      await visualizer.generateDashboard();
      
      db.close();
      console.log('\n✅ Full cycle complete!');
      break;
    }

    case 'help':
    default: {
      console.log(`
🤖 Local-First Browser Automation System

Capabilities:
  • UI Testing - Automated test generation and execution
  • Vision Analysis - Local element detection with FastVLM
  • Agentic Workflows - Self-healing automations (coming soon)
  • Interactive Control - Live streaming with controls (coming soon)

Usage: npx ts-node src/index.ts <command> [options]

Commands:
  init-db              Initialize the SQLite database
  analyze [dir]        Analyze codebase (default: ../src)
  test [pages...]      Run testing cycle on specified pages
  smoke [url]          Quick smoke test on a single URL
  report               Generate HTML and JSON reports
  dashboard            Generate interactive dashboard
  full-cycle           Run complete workflow (analyze + test + report)
  help                 Show this help message

Examples:
  npx ts-node src/index.ts init-db
  npx ts-node src/index.ts analyze ../my-app/src
  npx ts-node src/index.ts test / /dashboard /settings
  npx ts-node src/index.ts smoke http://localhost:3000
  npx ts-node src/index.ts full-cycle

Environment Variables:
  GEMINI_API_KEY       Required for AI-assisted features
  PLAYWRIGHT_BASE_URL  Base URL for automation (default: http://localhost:3000)
  TEST_DB_PATH         Custom database path
  LOG_LEVEL            DEBUG | INFO | WARN | ERROR
      `);
      break;
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

