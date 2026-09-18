/**
 * Reporting Feature
 * 
 * Test reports and visualization:
 * - HTML and JSON report generation
 * - Interactive dashboards with Chart.js
 * - Common database queries
 */

export * from './types';
export { ReportGenerator, createReportGenerator } from './generator';
export { DataVisualizer, createDataVisualizer } from './visualizer';
export { DatabaseQueries, createDatabaseQueries } from './queries';

