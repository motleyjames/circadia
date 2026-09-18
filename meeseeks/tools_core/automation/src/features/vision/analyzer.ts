/**
 * FastVLM Vision Analyzer
 * Wraps Python scripts for screenshot analysis and annotation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { config, pythonScriptPath, artifactPath } from '../../shared/config';
import { createLogger } from '../../shared/logging';
import type {
  VisionAnalysisResult,
  DetectedElement,
  AnnotationResult,
  BoundingBox,
} from './types';

const execAsync = promisify(exec);
const logger = createLogger('vision');

/**
 * Normalize raw element data from Python to TypeScript format
 */
function normalizeElement(raw: any): DetectedElement {
  return {
    type: raw.type || 'container',
    label: raw.label,
    id: raw.id,
    class: raw.class,
    bbox: {
      x: raw.bbox?.x || 0,
      y: raw.bbox?.y || 0,
      width: raw.bbox?.width || 0,
      height: raw.bbox?.height || 0,
    },
    confidence: raw.confidence || 0.5,
    interactive: raw.interactive !== false,
    visible: raw.visible !== false,
  };
}

export class FastVLMAnalyzer {
  private analyzeScript: string;
  private annotateScript: string;

  constructor() {
    this.analyzeScript = pythonScriptPath('vision', 'analyze_screenshot.py');
    this.annotateScript = pythonScriptPath('vision', 'annotate_screenshot.py');
  }

  /**
   * Analyze a screenshot and detect UI elements
   */
  async analyzeScreenshot(screenshotPath: string): Promise<DetectedElement[]> {
    logger.info('Analyzing screenshot', { path: screenshotPath });

    try {
      const command = `${config.vision.pythonPath} "${this.analyzeScript}" "${screenshotPath}"`;
      const { stdout, stderr } = await execAsync(command, { timeout: 60000 });

      if (stderr) {
        logger.debug('Python stderr', { stderr });
      }

      const result: VisionAnalysisResult = JSON.parse(stdout);

      if (result.error) {
        logger.error('Vision analysis error', { error: result.error });
        return [];
      }

      const elements = (result.elements || []).map(normalizeElement);
      logger.info('Elements detected', { count: elements.length });

      if (result._note === 'heuristic_fallback') {
        logger.warn('Using heuristic fallback - FastVLM model not available');
      }

      return elements;
    } catch (error: any) {
      logger.error('Screenshot analysis failed', { error: error.message });
      return [];
    }
  }

  /**
   * Annotate a screenshot with bounding boxes
   */
  async annotateScreenshot(
    screenshotPath: string,
    elements: DetectedElement[],
    outputPath?: string
  ): Promise<string | null> {
    // Generate output path if not provided
    const resolvedOutput =
      outputPath ||
      artifactPath(
        config.artifacts.screenshots.annotated,
        `annotated_${path.basename(screenshotPath)}`
      );

    logger.info('Annotating screenshot', {
      input: screenshotPath,
      output: resolvedOutput,
      elementCount: elements.length,
    });

    try {
      // Convert elements to format expected by Python script
      const elementsForPython = elements.map((el) => ({
        type: el.type,
        label: el.label,
        bbox: el.bbox,
        confidence: el.confidence,
      }));

      const elementsJson = JSON.stringify(elementsForPython);
      const command = `${config.vision.pythonPath} "${this.annotateScript}" "${screenshotPath}" "${resolvedOutput}" '${elementsJson}'`;

      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        logger.debug('Annotation stderr', { stderr });
      }

      const result: AnnotationResult = JSON.parse(stdout);

      if (result.error) {
        logger.error('Annotation error', { error: result.error });
        return null;
      }

      logger.info('Screenshot annotated', { output: result.output_path });
      return result.output_path || resolvedOutput;
    } catch (error: any) {
      logger.error('Screenshot annotation failed', { error: error.message });
      return null;
    }
  }

  /**
   * Analyze and annotate in one step
   */
  async analyzeAndAnnotate(
    screenshotPath: string,
    outputPath?: string
  ): Promise<{ elements: DetectedElement[]; annotatedPath: string | null }> {
    const elements = await this.analyzeScreenshot(screenshotPath);
    const annotatedPath = await this.annotateScreenshot(
      screenshotPath,
      elements,
      outputPath
    );

    return { elements, annotatedPath };
  }

  /**
   * Get interactive elements only
   */
  filterInteractiveElements(elements: DetectedElement[]): DetectedElement[] {
    return elements.filter((el) => el.interactive && el.visible);
  }

  /**
   * Get elements by type
   */
  getElementsByType(
    elements: DetectedElement[],
    type: DetectedElement['type']
  ): DetectedElement[] {
    return elements.filter((el) => el.type === type);
  }

  /**
   * Find element by label (case-insensitive partial match)
   */
  findElementByLabel(
    elements: DetectedElement[],
    labelPattern: string
  ): DetectedElement | undefined {
    const pattern = labelPattern.toLowerCase();
    return elements.find((el) =>
      el.label?.toLowerCase().includes(pattern)
    );
  }

  /**
   * Get element at a specific point
   */
  getElementAtPoint(
    elements: DetectedElement[],
    x: number,
    y: number
  ): DetectedElement | undefined {
    return elements.find((el) => {
      const bbox = el.bbox;
      return (
        x >= bbox.x &&
        x <= bbox.x + bbox.width &&
        y >= bbox.y &&
        y <= bbox.y + bbox.height
      );
    });
  }
}

/**
 * Create a FastVLM analyzer instance
 */
export function createVisionAnalyzer(): FastVLMAnalyzer {
  return new FastVLMAnalyzer();
}

