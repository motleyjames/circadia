/**
 * Type definitions for reporting
 */

export interface TestReport {
  generatedAt: string;
  summary: ReportSummary;
  components: ComponentCoverage[];
  testDetails: TestDetail[];
  geminiUsage: GeminiUsage;
  coverage: CoverageReport;
  failures: FailureDetail[];
}

export interface ReportSummary {
  totalRuns: number;
  latestRunId: string;
  totalTests: number;
  passingTests: number;
  failingTests: number;
  pendingTests: number;
  successRate: number;
  totalCost: number;
  averageCoverage: number;
}

export interface ComponentCoverage {
  name: string;
  testCount: number;
  passCount: number;
  failCount: number;
  successRate: number;
  coverage: number;
}

export interface TestDetail {
  name: string;
  status: 'pending' | 'passing' | 'failing';
  priority: 'critical' | 'high' | 'medium' | 'low';
  passCount: number;
  failCount: number;
  lastRun?: string;
  lastError?: string;
}

export interface GeminiUsage {
  totalCalls: number;
  callsByType: Record<string, number>;
  estimatedCost: number;
  averageCostPerRun: number;
}

export interface CoverageReport {
  overallCoverage: number;
  byComponent: Array<{
    component: string;
    coverage: number;
    testedFeatures: number;
    totalFeatures: number;
  }>;
}

export interface FailureDetail {
  testName: string;
  errorMessage: string;
  classification: string;
  timestamp: string;
  geminiAnalysis?: any;
}

export interface DashboardData {
  testsByStatus: {
    passing: number;
    failing: number;
    pending: number;
  };
  testsPerRun: Array<{ runId: string; count: number }>;
  coverageOverTime: Array<{ runId: string; coverage: number }>;
  costOverTime: Array<{ runId: string; cost: number }>;
}

