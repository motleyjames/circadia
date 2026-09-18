/**
 * Common Database Queries for Analysis
 */

import { TestingDatabase } from '../../shared/db';
import { createLogger } from '../../shared/logging';

const logger = createLogger('reporting:queries');

export class DatabaseQueries {
  private db: TestingDatabase;

  constructor(db: TestingDatabase) {
    this.db = db;
  }

  /**
   * Get tests that are consistently flaky (fail some but not all runs)
   */
  async getFlakyTests(failureThreshold: number = 0.3): Promise<any[]> {
    const tests = await this.db.getGeneratedTests();

    return tests.filter((test) => {
      const total = test.pass_count + test.fail_count;
      if (total === 0) return false;

      const failureRate = test.fail_count / total;
      return failureRate > failureThreshold && failureRate < 1.0;
    });
  }

  /**
   * Get components with lowest test coverage
   */
  async getUncoveredComponents(runId: string, threshold: number = 50): Promise<any[]> {
    const coverage = await this.db.getCoverageMetrics(runId);

    return coverage
      .filter((c) => (c.coverage_pct || 0) < threshold)
      .sort((a, b) => (a.coverage_pct || 0) - (b.coverage_pct || 0));
  }

  /**
   * Get most recent test failures
   */
  async getRecentFailures(limit: number = 10): Promise<any[]> {
    const tests = await this.db.getGeneratedTests('failing');
    return tests.slice(0, limit);
  }

  /**
   * Calculate overall test health score (0-100)
   */
  async calculateHealthScore(): Promise<number> {
    const tests = await this.db.getGeneratedTests();
    if (tests.length === 0) return 0;

    const passing = tests.filter((t) => t.status === 'passing').length;
    const passRate = (passing / tests.length) * 100;

    const runs = await this.db.getAllTestRuns();
    const avgCoverage =
      runs.length > 0
        ? runs.reduce((sum, r) => sum + (r.coverage_pct || 0), 0) / runs.length
        : 0;

    // Weighted score: 60% pass rate, 40% coverage
    return Math.round(passRate * 0.6 + avgCoverage * 0.4);
  }

  /**
   * Get Gemini API efficiency metrics
   */
  async getGeminiEfficiency(): Promise<{ testsPerCall: number; costPerTest: number }> {
    const runs = await this.db.getAllTestRuns();

    const totalTests = runs.reduce(
      (sum, r) => sum + (r.total_tests_generated || 0),
      0
    );
    const totalCalls = runs.reduce((sum, r) => sum + (r.gemini_calls || 0), 0);
    const totalCost = runs.reduce(
      (sum, r) => sum + (r.total_cost_estimate || 0),
      0
    );

    return {
      testsPerCall: totalCalls > 0 ? totalTests / totalCalls : 0,
      costPerTest: totalTests > 0 ? totalCost / totalTests : 0,
    };
  }

  /**
   * Get test execution trends
   */
  async getExecutionTrends(
    days: number = 7
  ): Promise<Array<{ date: string; runs: number; tests: number; passRate: number }>> {
    const runs = await this.db.getAllTestRuns();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const recentRuns = runs.filter(
      (r) => new Date(r.started_at).getTime() > cutoff
    );

    // Group by date
    const byDate = new Map<string, any[]>();
    for (const run of recentRuns) {
      const date = run.started_at.split('T')[0];
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(run);
    }

    return Array.from(byDate.entries()).map(([date, dateRuns]) => {
      const tests = dateRuns.reduce(
        (sum, r) => sum + (r.total_tests_generated || 0),
        0
      );
      const avgCoverage =
        dateRuns.reduce((sum, r) => sum + (r.coverage_pct || 0), 0) /
        dateRuns.length;

      return {
        date,
        runs: dateRuns.length,
        tests,
        passRate: avgCoverage,
      };
    });
  }

  /**
   * Get episodic memory patterns
   */
  async getLearnedPatterns(limit: number = 20): Promise<any[]> {
    return await this.db.getRecentEpisodes(limit);
  }
}

/**
 * Create a database queries instance
 */
export function createDatabaseQueries(db: TestingDatabase): DatabaseQueries {
  return new DatabaseQueries(db);
}
