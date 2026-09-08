/**
 * Full integration test - Playwright + SQLite + Element Detection
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createDatabase } from './src/shared/db';
import { config, artifactPath } from './src/shared/config';

async function runFullTest() {
  const args = process.argv.slice(2);
  const fullPage = args.includes('--full') || args.includes('-f');
  const url = args.find(a => !a.startsWith('-')) || 'https://news.ycombinator.com';
  
  console.log('\n🚀 Full Automation Test');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Full Page: ${fullPage ? 'Yes' : 'No (use --full for entire page)'}`);
  console.log(`DB Path: ${config.db.path}`);
  console.log('='.repeat(60) + '\n');

  // Initialize database
  console.log('📦 Initializing database...');
  const db = await createDatabase();
  const runId = await db.createTestRun('manual');
  console.log(`   Run ID: ${runId}\n`);

  // Launch browser
  console.log('🌐 Launching browser...');
  const browser = await chromium.launch({ headless: config.playwright.headless });
  const page = await browser.newPage();

  let totalElements = 0;
  let screenshotId: number | undefined;

  try {
    // Navigate
    console.log(`📡 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log(`   Page loaded: ${title}`);

    // Take screenshot
    const screenshotDir = artifactPath('screenshots', 'raw');
    fs.mkdirSync(screenshotDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const screenshotPath = path.join(screenshotDir, `${timestamp}_${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}.png`);
    
    await page.screenshot({ path: screenshotPath, fullPage });
    const stats = fs.statSync(screenshotPath);
    const hash = crypto.createHash('md5').update(fs.readFileSync(screenshotPath)).digest('hex');
    
    console.log(`\n📸 Screenshot saved:`);
    console.log(`   Path: ${screenshotPath}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);

    // Save to database
    screenshotId = await db.saveScreenshot(runId, {
      path: screenshotPath,
      hash,
      fileSize: stats.size,
      width: 1280, // viewport default
      height: 720,
      timestamp: new Date().toISOString(),
      url,
    });
    console.log(`   DB ID: ${screenshotId}`);

    // Detect elements
    console.log('\n🔍 Detecting UI elements...');
    const elements = await page.evaluate(() => {
      const results: Array<{
        type: string;
        label: string;
        id: string | null;
        className: string | null;
        bbox: { x: number; y: number; width: number; height: number };
        interactive: boolean;
        visible: boolean;
      }> = [];

      const getLabel = (el: Element): string => {
        return (
          el.getAttribute('aria-label') ||
          (el as any).innerText?.slice(0, 50) ||
          el.getAttribute('placeholder') ||
          el.getAttribute('name') ||
          el.getAttribute('title') ||
          'unlabeled'
        );
      };

      // Buttons
      document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            type: 'button',
            label: getLabel(el),
            id: el.id || null,
            className: el.className?.toString() || null,
            bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            interactive: true,
            visible: true,
          });
        }
      });

      // Links
      document.querySelectorAll('a').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            type: 'link',
            label: getLabel(el) || el.getAttribute('href')?.slice(0, 50) || 'link',
            id: el.id || null,
            className: el.className?.toString() || null,
            bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            interactive: true,
            visible: true,
          });
        }
      });

      // Inputs
      document.querySelectorAll('input, textarea, select').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const inputType = el.getAttribute('type') || 'text';
          results.push({
            type: `input_${inputType}`,
            label: getLabel(el),
            id: el.id || null,
            className: el.className?.toString() || null,
            bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            interactive: true,
            visible: true,
          });
        }
      });

      // Images
      document.querySelectorAll('img').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            type: 'image',
            label: el.getAttribute('alt') || el.getAttribute('src')?.split('/').pop() || 'image',
            id: el.id || null,
            className: el.className?.toString() || null,
            bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            interactive: false,
            visible: true,
          });
        }
      });

      return results;
    });

    totalElements = elements.length;
    console.log(`   Found ${totalElements} elements\n`);

    // Element breakdown
    const byType: Record<string, number> = {};
    elements.forEach(e => byType[e.type] = (byType[e.type] || 0) + 1);
    console.log('   Element breakdown:');
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`     • ${type}: ${count}`);
    });

    // Save elements to database
    console.log('\n💾 Saving elements to database...');
    await db.saveElementDetections(screenshotId, elements.map(el => ({
      elementType: el.type,
      elementLabel: el.label,
      elementId: el.id || undefined,
      elementClass: el.className || undefined,
      boundingBox: el.bbox,
      confidence: 0.95, // High confidence for direct detection
      isInteractive: el.interactive,
      isVisible: el.visible,
    })));
    console.log(`   Saved ${totalElements} elements`);

    // Save episodic memory
    await db.saveEpisode(
      'interaction',
      [{ action: 'navigate', url }, { action: 'screenshot' }, { action: 'detect_elements' }],
      'success',
      screenshotId
    );

    // Complete test run
    await db.completeTestRun(runId, {
      totalPages: 1,
      totalScreenshots: 1,
      totalElements,
      totalTestsGenerated: 0,
      featuresTested: Object.keys(byType),
      geminiCalls: 0,
      costEstimate: 0,
      coveragePct: 100,
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test complete!');
    console.log('='.repeat(60));
    console.log(`📁 Screenshot: ${screenshotPath}`);
    console.log(`🗄️  Database: ${config.db.path}`);
    console.log(`📊 Elements detected: ${totalElements}`);
    console.log(`🆔 Run ID: ${runId}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    await db.failTestRun(runId, error.message);
  } finally {
    await browser.close();
    db.close();
  }
}

runFullTest().catch(console.error);

