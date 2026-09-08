/**
 * Quick standalone test - just Playwright, no database
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function quickTest() {
  const args = process.argv.slice(2);
  const fullPage = args.includes('--full') || args.includes('-f');
  const url = args.find(a => !a.startsWith('-')) || 'https://news.ycombinator.com';
  
  console.log('\n🚀 Quick Automation Test');
  console.log('='.repeat(50));
  console.log(`URL: ${url}`);
  console.log(`Full Page: ${fullPage ? 'Yes' : 'No (use --full)'}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate
    console.log('📡 Navigating...');
    await page.goto(url, { waitUntil: 'networkidle' });
    console.log(`✅ Page loaded: ${await page.title()}`);

    // Screenshot
    const screenshotDir = path.join(__dirname, 'artifacts', 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const screenshotPath = path.join(screenshotDir, `screenshot_${timestamp}.png`);
    
    await page.screenshot({ path: screenshotPath, fullPage });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    // Basic element detection
    console.log('\n🔍 Detecting elements...');
    const elements = await page.evaluate(() => {
      const results: Array<{type: string; label: string; visible: boolean}> = [];
      
      // Buttons
      const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      buttons.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        results.push({
          type: 'button',
          label: (el as any).innerText?.slice(0, 30) || el.getAttribute('aria-label') || `button_${i}`,
          visible: rect.width > 0 && rect.height > 0,
        });
      });

      // Links
      const links = document.querySelectorAll('a');
      links.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            type: 'link',
            label: (el as any).innerText?.slice(0, 50) || el.getAttribute('href')?.slice(0, 30) || `link_${i}`,
            visible: true,
          });
        }
      });

      // Inputs
      const inputs = document.querySelectorAll('input, textarea');
      inputs.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        results.push({
          type: 'input',
          label: el.getAttribute('placeholder') || el.getAttribute('name') || `input_${i}`,
          visible: rect.width > 0 && rect.height > 0,
        });
      });

      return results;
    });

    console.log(`   Found ${elements.length} elements:`);
    const byType: Record<string, number> = {};
    elements.forEach(e => byType[e.type] = (byType[e.type] || 0) + 1);
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   • ${type}: ${count}`);
    });

    // Sample of detected elements
    console.log('\n📋 Sample elements:');
    elements.slice(0, 10).forEach((el, i) => {
      console.log(`   ${i + 1}. [${el.type}] ${el.label}`);
    });

    console.log('\n' + '='.repeat(50));
    console.log('✅ Test complete!');
    console.log(`📁 Screenshot: ${screenshotPath}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

quickTest().catch(console.error);

