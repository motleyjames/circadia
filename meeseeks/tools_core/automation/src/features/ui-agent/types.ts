/**
 * Type definitions for UI agent analysis
 */

import type { DetectedElement } from '../vision/types';

export interface InteractionStep {
  step: number;
  action: 'click' | 'type' | 'hover' | 'scroll' | 'wait' | 'assert';
  target?: string;
  value?: string;
  result: 'success' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
}

export interface PlannedInteraction {
  action: 'click' | 'type' | 'hover' | 'scroll';
  targetElement: DetectedElement;
  value?: string;
  reason: string;
}

export interface LearnedPattern {
  pattern: string;
  confidence: number;
  implication: string;
  occurrences?: number;
  failures?: number;
}

export interface PageState {
  url: string;
  title: string;
  timestamp: string;
  hasErrors?: boolean;
  loadTime?: number;
}

export interface UIAnalysisResult {
  testedFeatures: string[];
  learnedPatterns: LearnedPattern[];
  interactions: InteractionStep[];
  assertions: {
    passed: number;
    failed: number;
  };
  reflectionNotes: string;
  stateDetected: PageState;
  errorsFound: string[];
}

export interface AgentCapabilities {
  canClick: boolean;
  canType: boolean;
  canScroll: boolean;
  canHover: boolean;
  canWait: boolean;
  canAssert: boolean;
}

