/**
 * Report Generator
 * 
 * Generates comprehensive testing reports from SQLite data
 */

import fs from 'fs';
import path from 'path';
import { TestingDatabase } from '../../shared/db';
import { artifactPath, config } from '../../shared/config';
import { createLogger } from '../../shared/logging';
import type { TestReport, ReportSummary, GeminiUsage, TestDetail } from './types';

const logger = createLogger('reporting:generator');

export class ReportGenerator {
  private db: TestingDatabase;

  constructor(db: TestingDatabase) {
    this.db = db;
  }

  /**
   * Generate a complete test report
   */
  async generateReport(): Promise<TestReport> {
    logger.info('Generating test report');

    const runs = await this.db.getAllTestRuns();
    const tests = await this.db.getGeneratedTests();
    const latestRun = runs.length > 0 ? runs[0] : null;

    const coverage = latestRun
      ? await this.db.getCoverageMetrics(latestRun.id)
      : [];

    const passingTests = tests.filter((t) => t.status === 'passing').length;
    const failingTests = tests.filter((t) => t.status === 'failing').length;
    const pendingTests = tests.filter((t) => t.status === 'pending').length;

    const summary: ReportSummary = {
      totalRuns: runs.length,
      latestRunId: latestRun?.id || 'none',
      totalTests: tests.length,
      passingTests,
      failingTests,
      pendingTests,
      successRate: tests.length > 0 ? (passingTests / tests.length) * 100 : 0,
      totalCost: runs.reduce((sum, r) => sum + (r.total_cost_estimate || 0), 0),
      averageCoverage:
        coverage.length > 0
          ? coverage.reduce((sum, c) => sum + (c.coverage_pct || 0), 0) / coverage.length
          : 0,
    };

    const testDetails: TestDetail[] = tests.map((t) => ({
      name: t.test_name,
      status: t.status as 'pending' | 'passing' | 'failing',
      priority: (t.priority as 'critical' | 'high' | 'medium' | 'low') || 'medium',
      passCount: t.pass_count,
      failCount: t.fail_count,
      lastRun: t.last_run || undefined,
      lastError: t.last_error || undefined,
    }));

    const report: TestReport = {
      generatedAt: new Date().toISOString(),
      summary,
      components: coverage.map((c) => ({
        name: c.component_name || 'Unknown',
        testCount: 0,
        passCount: 0,
        failCount: 0,
        successRate: c.coverage_pct || 0,
        coverage: c.coverage_pct || 0,
      })),
      testDetails,
      geminiUsage: await this._calculateGeminiUsage(runs),
      coverage: {
        overallCoverage: summary.averageCoverage,
        byComponent: coverage.map((c) => ({
          component: c.component_name || 'Unknown',
          coverage: c.coverage_pct || 0,
          testedFeatures: c.features_tested || 0,
          totalFeatures: c.features_total || 0,
        })),
      },
      failures: [],
    };

    logger.info('Report generated', { tests: tests.length, runs: runs.length });
    return report;
  }

  /**
   * Export report to HTML
   */
  exportHTML(report: TestReport, outputPath?: string): string {
    const resolvedPath = outputPath || artifactPath(config.artifacts.reports, 'index.html');
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    const html = this._generateHTMLReport(report);
    fs.writeFileSync(resolvedPath, html);

    logger.info('HTML report exported', { path: resolvedPath });
    return resolvedPath;
  }

  /**
   * Export report to JSON
   */
  exportJSON(report: TestReport, outputPath?: string): string {
    const resolvedPath = outputPath || artifactPath(config.artifacts.reports, 'report.json');
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2));

    logger.info('JSON report exported', { path: resolvedPath });
    return resolvedPath;
  }

  private async _calculateGeminiUsage(runs: any[]): Promise<GeminiUsage> {
    let totalCalls = 0;
    const callsByType: Record<string, number> = {};

    for (const run of runs) {
      totalCalls += run.gemini_calls || 0;
      
      // Get detailed calls for this run
      const calls = await this.db.getGeminiCallsByRun(run.id);
      for (const call of calls) {
        callsByType[call.call_type] = (callsByType[call.call_type] || 0) + 1;
      }
    }

    const totalCost = runs.reduce((sum, r) => sum + (r.total_cost_estimate || 0), 0);

    return {
      totalCalls,
      callsByType,
      estimatedCost: totalCost,
      averageCostPerRun: runs.length > 0 ? totalCost / runs.length : 0,
    };
  }

  private _generateHTMLReport(report: TestReport): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI Testing Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: #0a0a0a; 
            color: #e0e0e0;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        h1 { color: #00ff88; margin-bottom: 0.5rem; font-size: 2.5rem; }
        h2 { 
            color: #00d4ff; 
            margin: 2rem 0 1rem; 
            font-size: 1.5rem;
            border-bottom: 2px solid #333;
            padding-bottom: 0.5rem;
        }
        .subtitle { color: #888; margin-bottom: 2rem; }
        
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 1rem; 
            margin-bottom: 2rem; 
        }
        .stat-card { 
            background: #1a1a1a; 
            padding: 1.5rem; 
            border-radius: 8px; 
            border: 1px solid #333;
        }
        .stat-card .label { font-size: 0.875rem; color: #888; margin-bottom: 0.5rem; }
        .stat-card .value { font-size: 2rem; font-weight: bold; color: #00ff88; }
        .stat-card.success .value { color: #00ff88; }
        .stat-card.warning .value { color: #ffaa00; }
        .stat-card.danger .value { color: #ff4444; }
        
        table { 
            width: 100%; 
            border-collapse: collapse; 
            background: #1a1a1a; 
            border-radius: 8px;
            overflow: hidden;
            margin: 1rem 0;
        }
        th { 
            background: #252525; 
            color: #00d4ff; 
            padding: 1rem; 
            text-align: left; 
            font-weight: 600;
        }
        td { padding: 1rem; border-bottom: 1px solid #333; }
        tr:hover { background: #252525; }
        
        .badge { 
            display: inline-block; 
            padding: 0.25rem 0.75rem; 
            border-radius: 4px; 
            font-size: 0.75rem; 
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge.success { background: #00ff8820; color: #00ff88; }
        .badge.warning { background: #ffaa0020; color: #ffaa00; }
        .badge.danger { background: #ff444420; color: #ff4444; }
        .badge.info { background: #00d4ff20; color: #00d4ff; }
        
        .progress { 
            width: 100%; 
            height: 8px; 
            background: #333; 
            border-radius: 4px; 
            overflow: hidden; 
        }
        .progress-bar { 
            height: 100%; 
            background: linear-gradient(90deg, #00ff88, #00d4ff); 
            transition: width 0.3s; 
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 UI Testing Report</h1>
        <p class="subtitle">Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
        
        <h2>Summary</h2>
        <div class="stats">
            <div class="stat-card">
                <div class="label">Total Tests</div>
                <div class="value">${report.summary.totalTests}</div>
            </div>
            <div class="stat-card success">
                <div class="label">Passing</div>
                <div class="value">${report.summary.passingTests}</div>
            </div>
            <div class="stat-card ${report.summary.failingTests > 0 ? 'danger' : 'success'}">
                <div class="label">Failing</div>
                <div class="value">${report.summary.failingTests}</div>
            </div>
            <div class="stat-card">
                <div class="label">Success Rate</div>
                <div class="value">${report.summary.successRate.toFixed(1)}%</div>
            </div>
            <div class="stat-card">
                <div class="label">Coverage</div>
                <div class="value">${report.summary.averageCoverage.toFixed(1)}%</div>
            </div>
            <div class="stat-card">
                <div class="label">Total Cost</div>
                <div class="value">$${report.summary.totalCost.toFixed(4)}</div>
            </div>
        </div>
        
        <h2>Test Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Test Name</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Passed</th>
                    <th>Failed</th>
                </tr>
            </thead>
            <tbody>
                ${report.testDetails.map((test) => `
                <tr>
                    <td><strong>${test.name}</strong></td>
                    <td><span class="badge ${test.status === 'passing' ? 'success' : test.status === 'failing' ? 'danger' : 'warning'}">${test.status}</span></td>
                    <td><span class="badge ${test.priority === 'critical' ? 'danger' : 'info'}">${test.priority}</span></td>
                    <td>${test.passCount}</td>
                    <td>${test.failCount}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        
        <h2>Gemini Usage</h2>
        <div class="stats">
            <div class="stat-card">
                <div class="label">Total API Calls</div>
                <div class="value">${report.geminiUsage.totalCalls}</div>
            </div>
            <div class="stat-card">
                <div class="label">Estimated Cost</div>
                <div class="value">$${report.geminiUsage.estimatedCost.toFixed(4)}</div>
            </div>
            <div class="stat-card">
                <div class="label">Avg Cost/Run</div>
                <div class="value">$${report.geminiUsage.averageCostPerRun.toFixed(4)}</div>
            </div>
        </div>
        
        ${report.coverage.byComponent.length > 0 ? `
        <h2>Coverage by Component</h2>
        ${report.coverage.byComponent.map((comp) => `
        <div style="margin: 1rem 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span><strong>${comp.component}</strong></span>
                <span>${comp.coverage.toFixed(1)}%</span>
            </div>
            <div class="progress">
                <div class="progress-bar" style="width: ${comp.coverage}%"></div>
            </div>
        </div>
        `).join('')}
        ` : ''}
    </div>
</body>
</html>`;
  }
}

/**
 * Create a report generator instance
 */
export function createReportGenerator(db: TestingDatabase): ReportGenerator {
  return new ReportGenerator(db);
}
