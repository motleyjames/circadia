/**
 * Codebase Analysis Feature
 * 
 * Analyzes TypeScript/React codebases to extract:
 * - Components and their props
 * - Interfaces and type definitions
 * - Validation constraints (Zod, Yup)
 * - API endpoints
 */

export * from './types';
export {
  runCodebaseAnalysis,
  loadAnalysis,
  hasAnalysis,
  persistAnalysisToDb,
  getAnalysisPath,
  getTestableComponents,
  getEndpointsByMethod,
  getConstraintsByTarget,
} from './loader';

