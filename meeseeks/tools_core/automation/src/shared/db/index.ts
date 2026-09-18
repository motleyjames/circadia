/**
 * Database module exports
 * 
 * Note: createDatabase is async - uses sql.js (pure JS, no native build)
 */

export { TestingDatabase, createDatabase } from './client';
export * from './types';

