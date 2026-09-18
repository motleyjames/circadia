/**
 * Data Visualizer
 * 
 * Generates interactive dashboards with Chart.js
 */

import fs from 'fs';
import path from 'path';
import { TestingDatabase } from '../../shared/db';
import { artifactPath, config } from '../../shared/config';
import { createLogger } from '../../shared/logging';
import type { DashboardData } from './types';

const logger = createLogger('reporting:visualizer');

export class DataVisualizer {
  private db: TestingDatabase;

  constructor(db: TestingDatabase) {
    this.db = db;
  }

  /**
   * Gather data for the dashboard
   */
  async gatherDashboardData(): Promise<DashboardData> {
    const runs = await this.db.getAllTestRuns();
    const tests = await this.db.getGeneratedTests();

    return {
      testsByStatus: {
        passing: tests.filter((t) => t.status === 'passing').length,
        failing: tests.filter((t) => t.status === 'failing').length,
        pending: tests.filter((t) => t.status === 'pending').length,
      },
      testsPerRun: runs.slice(-10).map((r, i) => ({
        runId: `Run ${i + 1}`,
        count: r.total_tests_generated || 0,
      })),
      coverageOverTime: runs.slice(-10).map((r, i) => ({
        runId: `Run ${i + 1}`,
        coverage: r.coverage_pct || 0,
      })),
      costOverTime: runs.slice(-10).map((r, i) => ({
        runId: `Run ${i + 1}`,
        cost: r.total_cost_estimate || 0,
      })),
    };
  }

  /**
   * Generate the main dashboard HTML
   */
  async generateDashboard(outputPath?: string): Promise<string> {
    const resolvedPath = outputPath || artifactPath('dashboard.html');
    const data = await this.gatherDashboardData();

    const html = this._generateDashboardHTML(data);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, html);

    logger.info('Dashboard generated', { path: resolvedPath });
    return resolvedPath;
  }

  /**
   * Generate a comparison view between two test runs
   */
  generateComparisonView(runId1: string, runId2: string, outputPath?: string): string {
    const resolvedPath = outputPath || artifactPath('comparison.html');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Test Run Comparison</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: #0a0a0a; 
            color: #e0e0e0;
            padding: 2rem;
        }
        h1 { color: #00ff88; margin-bottom: 2rem; }
        .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
        .card { 
            background: #1a1a1a; 
            padding: 1.5rem; 
            border-radius: 12px; 
            border: 1px solid #333;
        }
        .card h2 { color: #00d4ff; margin-bottom: 1rem; }
        .metric { margin: 1rem 0; padding: 1rem; background: #252525; border-radius: 8px; }
        .metric-label { font-size: 0.9rem; color: #888; }
        .metric-value { font-size: 1.8rem; font-weight: bold; color: #00ff88; }
    </style>
</head>
<body>
    <h1>🔄 Test Run Comparison</h1>
    <div class="comparison">
        <div class="card">
            <h2>Run: ${runId1.substring(0, 8)}...</h2>
            <div class="metric">
                <div class="metric-label">Tests Generated</div>
                <div class="metric-value">--</div>
            </div>
            <div class="metric">
                <div class="metric-label">Coverage</div>
                <div class="metric-value">--%</div>
            </div>
            <div class="metric">
                <div class="metric-label">Cost</div>
                <div class="metric-value">$--</div>
            </div>
        </div>
        
        <div class="card">
            <h2>Run: ${runId2.substring(0, 8)}...</h2>
            <div class="metric">
                <div class="metric-label">Tests Generated</div>
                <div class="metric-value">--</div>
            </div>
            <div class="metric">
                <div class="metric-label">Coverage</div>
                <div class="metric-value">--%</div>
            </div>
            <div class="metric">
                <div class="metric-label">Cost</div>
                <div class="metric-value">$--</div>
            </div>
        </div>
    </div>
</body>
</html>`;

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, html);

    logger.info('Comparison view generated', { path: resolvedPath });
    return resolvedPath;
  }

  private _generateDashboardHTML(data: DashboardData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Testing Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: #0a0a0a; 
            color: #e0e0e0;
            padding: 2rem;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #00ff88; margin-bottom: 2rem; }
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); 
            gap: 2rem; 
        }
        .chart-container { 
            background: #1a1a1a; 
            padding: 1.5rem; 
            border-radius: 12px; 
            border: 1px solid #333;
        }
        .chart-container h3 { 
            color: #00d4ff; 
            margin-bottom: 1rem; 
            font-size: 1.1rem;
        }
        canvas { max-height: 300px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Testing Dashboard</h1>
        
        <div class="grid">
            <div class="chart-container">
                <h3>Test Status Distribution</h3>
                <canvas id="statusChart"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Tests Per Run</h3>
                <canvas id="testsPerRunChart"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Coverage Trend</h3>
                <canvas id="coverageChart"></canvas>
            </div>
            
            <div class="chart-container">
                <h3>Cost Per Run</h3>
                <canvas id="costChart"></canvas>
            </div>
        </div>
    </div>

    <script>
        Chart.defaults.color = '#888';
        Chart.defaults.borderColor = '#333';
        
        // Test Status Distribution (Doughnut)
        new Chart(document.getElementById('statusChart'), {
            type: 'doughnut',
            data: {
                labels: ['Passing', 'Failing', 'Pending'],
                datasets: [{
                    data: [${data.testsByStatus.passing}, ${data.testsByStatus.failing}, ${data.testsByStatus.pending}],
                    backgroundColor: ['#00ff88', '#ff4444', '#ffaa00'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'bottom',
                        labels: { color: '#888' }
                    }
                }
            }
        });

        // Tests Per Run (Bar)
        new Chart(document.getElementById('testsPerRunChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(data.testsPerRun.map((r) => r.runId))},
                datasets: [{
                    label: 'Tests Generated',
                    data: ${JSON.stringify(data.testsPerRun.map((r) => r.count))},
                    backgroundColor: '#00d4ff',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        grid: { color: '#333' }
                    },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Coverage Trend (Line)
        new Chart(document.getElementById('coverageChart'), {
            type: 'line',
            data: {
                labels: ${JSON.stringify(data.coverageOverTime.map((r) => r.runId))},
                datasets: [{
                    label: 'Coverage %',
                    data: ${JSON.stringify(data.coverageOverTime.map((r) => r.coverage))},
                    borderColor: '#00ff88',
                    backgroundColor: '#00ff8820',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        max: 100,
                        grid: { color: '#333' }
                    },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Cost Per Run (Bar)
        new Chart(document.getElementById('costChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(data.costOverTime.map((r) => r.runId))},
                datasets: [{
                    label: 'Cost ($)',
                    data: ${JSON.stringify(data.costOverTime.map((r) => r.cost))},
                    backgroundColor: '#ffaa00',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        grid: { color: '#333' }
                    },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    </script>
</body>
</html>`;
  }
}

/**
 * Create a data visualizer instance
 */
export function createDataVisualizer(db: TestingDatabase): DataVisualizer {
  return new DataVisualizer(db);
}
