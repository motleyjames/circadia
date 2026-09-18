/**
 * Screenshot utility for consistent capture, storage, and management
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Page } from 'playwright';
import { config, artifactPath } from '../config';
import type { ScreenshotMetadata } from '../db/types';

export type ScreenshotCategory = 'raw' | 'annotated' | 'comparisons';

export class ScreenshotHandler {
  private metadata: Map<string, ScreenshotMetadata> = new Map();

  constructor() {
    this._ensureDirectories();
  }

  /**
   * Capture and save screenshot with automatic naming
   */
  async captureScreenshot(
    page: Page,
    name: string,
    category: ScreenshotCategory = 'raw'
  ): Promise<ScreenshotMetadata> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${name}_${timestamp}.png`;
    const filepath = this._getPath(category, filename);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(filepath), { recursive: true });

    // Capture screenshot
    await page.screenshot({ path: filepath, fullPage: false });

    // Read file and calculate metadata
    const buffer = fs.readFileSync(filepath);
    const fileSize = buffer.length;
    const hash = crypto.createHash('md5').update(buffer).digest('hex');

    // Get page dimensions
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    const metadata: ScreenshotMetadata = {
      path: filepath,
      hash,
      fileSize,
      width: dimensions.width,
      height: dimensions.height,
      timestamp: new Date().toISOString(),
      url: page.url(),
    };

    this.metadata.set(filepath, metadata);
    return metadata;
  }

  /**
   * Capture full page screenshot
   */
  async captureFullPage(
    page: Page,
    name: string,
    category: ScreenshotCategory = 'raw'
  ): Promise<ScreenshotMetadata> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${name}_full_${timestamp}.png`;
    const filepath = this._getPath(category, filename);

    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    await page.screenshot({ path: filepath, fullPage: true });

    const buffer = fs.readFileSync(filepath);

    const metadata: ScreenshotMetadata = {
      path: filepath,
      hash: crypto.createHash('md5').update(buffer).digest('hex'),
      fileSize: buffer.length,
      width: 0, // Full page has dynamic dimensions
      height: 0,
      timestamp: new Date().toISOString(),
      url: page.url(),
    };

    this.metadata.set(filepath, metadata);
    return metadata;
  }

  /**
   * Compare two screenshots by hash
   */
  compareScreenshots(
    before: ScreenshotMetadata,
    after: ScreenshotMetadata
  ): { identical: boolean; hashDiff: string; sizeDiff: number } {
    return {
      identical: before.hash === after.hash,
      hashDiff: `${before.hash} -> ${after.hash}`,
      sizeDiff: after.fileSize - before.fileSize,
    };
  }

  /**
   * Create an HTML comparison viewer for two screenshots
   */
  createComparisonView(
    beforePath: string,
    afterPath: string,
    outputName: string
  ): string {
    const comparisonDir = this._getPath('comparisons', outputName);
    fs.mkdirSync(comparisonDir, { recursive: true });

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Screenshot Comparison - ${outputName}</title>
    <style>
        body { font-family: system-ui; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .comparison { display: flex; gap: 20px; margin: 20px 0; }
        .image-box { flex: 1; }
        .image-box h3 { margin: 0 0 10px 0; }
        .image-box img { max-width: 100%; border: 1px solid #ddd; }
        .metadata { background: white; padding: 10px; border-radius: 4px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Screenshot Comparison</h1>
        <div class="comparison">
            <div class="image-box">
                <h3>Before</h3>
                <img src="${path.basename(beforePath)}" alt="Before">
            </div>
            <div class="image-box">
                <h3>After</h3>
                <img src="${path.basename(afterPath)}" alt="After">
            </div>
        </div>
    </div>
</body>
</html>`;

    const htmlPath = path.join(comparisonDir, 'comparison.html');
    fs.writeFileSync(htmlPath, html);

    // Copy images to comparison directory
    fs.copyFileSync(beforePath, path.join(comparisonDir, path.basename(beforePath)));
    fs.copyFileSync(afterPath, path.join(comparisonDir, path.basename(afterPath)));

    return htmlPath;
  }

  /**
   * Get all captured screenshot metadata
   */
  getAllMetadata(): ScreenshotMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Clean up old screenshots (older than maxAgeDays)
   */
  cleanup(maxAgeDays: number = 7): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [filepath, metadata] of this.metadata.entries()) {
      const fileTime = new Date(metadata.timestamp).getTime();
      if (fileTime < cutoff && fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        this.metadata.delete(filepath);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get the path for a screenshot in a specific category
   */
  private _getPath(category: ScreenshotCategory, filename: string): string {
    const categoryPath = config.artifacts.screenshots[category];
    return artifactPath(categoryPath, filename);
  }

  private _ensureDirectories(): void {
    for (const category of ['raw', 'annotated', 'comparisons'] as const) {
      const dir = artifactPath(config.artifacts.screenshots[category]);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Create a screenshot handler instance
 */
export function createScreenshotHandler(): ScreenshotHandler {
  return new ScreenshotHandler();
}

