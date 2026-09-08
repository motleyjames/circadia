/**
 * Vision Feature
 * 
 * Local vision analysis using FastVLM for:
 * - UI element detection
 * - Bounding box extraction
 * - Screenshot annotation
 */

export * from './types';
export { FastVLMAnalyzer, createVisionAnalyzer } from './analyzer';

