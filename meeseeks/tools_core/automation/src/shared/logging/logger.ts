/**
 * Structured logging for the testing framework
 */

import fs from 'fs';
import path from 'path';
import { config, artifactPath } from '../config';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, any>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_ICONS: Record<LogLevel, string> = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
};

export class Logger {
  private logFile: string;
  private logs: LogEntry[] = [];
  private module: string;
  private minLevel: LogLevel;

  constructor(module: string, minLevel?: LogLevel) {
    this.module = module;
    this.minLevel = minLevel || config.logging.level;
    this.logFile = artifactPath(config.artifacts.logs, 'testing.jsonl');
    
    if (config.logging.persistToFile) {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    }
  }

  debug(message: string, data?: Record<string, any>): void {
    this._log('DEBUG', message, data);
  }

  info(message: string, data?: Record<string, any>): void {
    this._log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, any>): void {
    this._log('WARN', message, data);
  }

  error(message: string, data?: Record<string, any>): void {
    this._log('ERROR', message, data);
  }

  private _log(level: LogLevel, message: string, data?: Record<string, any>): void {
    if (!this._shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      data,
    };

    this.logs.push(entry);
    this._logToConsole(entry);

    if (config.logging.persistToFile) {
      this._persistLog(entry);
    }
  }

  private _shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private _logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `${LOG_ICONS[entry.level]} [${timestamp}] [${entry.module}]`;
    
    if (entry.data) {
      console.log(`${prefix} ${entry.message}`, entry.data);
    } else {
      console.log(`${prefix} ${entry.message}`);
    }
  }

  private _persistLog(entry: LogEntry): void {
    fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
  }

  /**
   * Get all logs for this logger instance
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Create a child logger with a sub-module name
   */
  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`, this.minLevel);
  }
}

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

