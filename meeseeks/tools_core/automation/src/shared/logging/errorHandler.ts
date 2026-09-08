/**
 * Comprehensive error handling and classification for the testing framework
 */

import fs from 'fs';
import path from 'path';
import { config, artifactPath } from '../config';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export type ErrorCategory =
  | 'timeout'
  | 'element_not_found'
  | 'assertion'
  | 'state_mismatch'
  | 'network'
  | 'navigation'
  | 'api'
  | 'parsing'
  | 'unknown';

export interface ErrorLog {
  id: string;
  timestamp: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context: Record<string, any>;
  recovered: boolean;
  recoveryStrategy?: string;
}

const SEVERITY_ICONS: Record<ErrorSeverity, string> = {
  [ErrorSeverity.LOW]: '⚠️',
  [ErrorSeverity.MEDIUM]: '⚠️',
  [ErrorSeverity.HIGH]: '❌',
  [ErrorSeverity.CRITICAL]: '🚨',
};

const RECOVERY_STRATEGIES: Record<string, string> = {
  element_not_found: 'Wait for element to appear or verify selector is correct',
  timeout: 'Increase timeout duration or verify server responsiveness',
  assertion: 'Verify expected state matches actual state',
  state_mismatch: 'Check application state transitions',
  network: 'Verify network connectivity and API endpoints',
  navigation: 'Check URL validity and page load status',
  api: 'Verify API endpoint and request format',
  parsing: 'Check data format and schema compatibility',
  unknown: 'Review error context and retry with adjusted parameters',
};

export class ErrorHandler {
  private errors: ErrorLog[] = [];
  private errorFile: string;

  constructor() {
    this.errorFile = artifactPath(config.artifacts.logs, 'errors.jsonl');
    fs.mkdirSync(path.dirname(this.errorFile), { recursive: true });
  }

  /**
   * Log and categorize an error
   */
  logError(
    message: string,
    error: Error | string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: Record<string, any> = {},
    recovered: boolean = false,
    recoveryStrategy?: string
  ): ErrorLog {
    const category = this._categorizeError(error);
    
    const errorLog: ErrorLog = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      severity,
      category,
      message,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      recovered,
      recoveryStrategy: recoveryStrategy || RECOVERY_STRATEGIES[category],
    };

    this.errors.push(errorLog);
    this._persistError(errorLog);
    this._logToConsole(errorLog);

    return errorLog;
  }

  /**
   * Handle test failure with automatic classification
   */
  handleTestFailure(
    testName: string,
    error: Error,
    context: { screenshotPath?: string; elementInfo?: any; retryCount?: number } = {}
  ): ErrorLog {
    const category = this._categorizeError(error);
    const severity = this._severityFromCategory(category);

    return this.logError(
      `Test failed: ${testName}`,
      error,
      severity,
      { testName, ...context },
      false
    );
  }

  /**
   * Get errors filtered by severity and/or category
   */
  getErrors(options: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    limit?: number;
  } = {}): ErrorLog[] {
    let filtered = this.errors;

    if (options.severity) {
      filtered = filtered.filter((e) => e.severity === options.severity);
    }

    if (options.category) {
      filtered = filtered.filter((e) => e.category === options.category);
    }

    const limit = options.limit || 100;
    return filtered.slice(-limit);
  }

  /**
   * Generate error summary report
   */
  generateSummary(): {
    totalErrors: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCategory: Record<string, number>;
    recoveryRate: number;
  } {
    const summary = {
      totalErrors: this.errors.length,
      bySeverity: {
        [ErrorSeverity.LOW]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.CRITICAL]: 0,
      },
      byCategory: {} as Record<string, number>,
      recoveryRate: 0,
    };

    for (const error of this.errors) {
      summary.bySeverity[error.severity]++;
      summary.byCategory[error.category] = (summary.byCategory[error.category] || 0) + 1;
    }

    const recovered = this.errors.filter((e) => e.recovered).length;
    summary.recoveryRate = this.errors.length > 0 ? recovered / this.errors.length : 0;

    return summary;
  }

  /**
   * Export errors in specified format
   */
  exportErrors(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.errors, null, 2);
    }

    const headers = ['timestamp', 'severity', 'category', 'message', 'recovered'];
    const rows = this.errors.map((e) => [
      e.timestamp,
      e.severity,
      e.category,
      `"${e.message.replace(/"/g, '""')}"`,
      e.recovered ? 'yes' : 'no',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  private _categorizeError(error: Error | string): ErrorCategory {
    const msg = (error instanceof Error ? error.message : error).toLowerCase();

    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('element not found') || msg.includes('locator') || msg.includes('selector')) {
      return 'element_not_found';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
      return 'network';
    }
    if (msg.includes('assertion')) return 'assertion';
    if (msg.includes('state') || msg.includes('mismatch')) return 'state_mismatch';
    if (msg.includes('navigation') || msg.includes('navigate')) return 'navigation';
    if (msg.includes('api') || msg.includes('endpoint') || msg.includes('request')) return 'api';
    if (msg.includes('parse') || msg.includes('json') || msg.includes('syntax')) return 'parsing';

    return 'unknown';
  }

  private _severityFromCategory(category: ErrorCategory): ErrorSeverity {
    switch (category) {
      case 'element_not_found':
      case 'assertion':
      case 'state_mismatch':
        return ErrorSeverity.HIGH;
      case 'timeout':
      case 'network':
        return ErrorSeverity.MEDIUM;
      case 'navigation':
      case 'api':
        return ErrorSeverity.MEDIUM;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private _logToConsole(errorLog: ErrorLog): void {
    console.error(
      `${SEVERITY_ICONS[errorLog.severity]} [${errorLog.severity.toUpperCase()}] ${errorLog.message}`
    );
    if (errorLog.stack && errorLog.severity === ErrorSeverity.CRITICAL) {
      console.error(errorLog.stack);
    }
  }

  private _persistError(errorLog: ErrorLog): void {
    fs.appendFileSync(this.errorFile, JSON.stringify(errorLog) + '\n');
  }
}

/**
 * Create an error handler instance
 */
export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}

