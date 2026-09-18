/**
 * Type definitions for vision analysis
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedElement {
  type: ElementType;
  label?: string;
  id?: string;
  class?: string;
  bbox: BoundingBox;
  confidence: number;
  interactive: boolean;
  visible: boolean;
}

export type ElementType =
  | 'button'
  | 'input'
  | 'link'
  | 'text'
  | 'form'
  | 'image'
  | 'dropdown'
  | 'container';

export type LayoutType = 'desktop' | 'mobile' | 'tablet';

export interface VisionAnalysisResult {
  elements: DetectedElement[];
  layout: LayoutType;
  primary_actions: string[];
  form_fields: string[];
  _note?: string; // Present when using fallback heuristic
  error?: string;
}

export interface AnnotationResult {
  status: 'success' | 'error';
  output_path?: string;
  elements_annotated?: number;
  error?: string;
}

