/**
 * Quick database test
 */

import { createDatabase } from './src/shared/db';

async function testDb() {
  console.log('🗄️  Testing sql.js database...\n');

  const db = await createDatabase();
  
  // Create a test run
  const runId = await db.createTestRun('manual');
  console.log(`✅ Created test run: ${runId}`);

  // Save a screenshot
  const screenshotId = await db.saveScreenshot(runId, {
    path: '/test/screenshot.png',
    hash: 'abc123',
    fileSize: 12345,
    width: 1920,
    height: 1080,
    timestamp: new Date().toISOString(),
    url: 'https://example.com',
  });
  console.log(`✅ Saved screenshot: ID ${screenshotId}`);

  // Save some elements
  await db.saveElementDetections(screenshotId, [
    {
      elementType: 'button',
      elementLabel: 'Submit',
      boundingBox: { x: 100, y: 100, width: 80, height: 30 },
      confidence: 0.95,
      isInteractive: true,
      isVisible: true,
    },
    {
      elementType: 'input',
      elementLabel: 'Email',
      boundingBox: { x: 100, y: 50, width: 200, height: 30 },
      confidence: 0.92,
      isInteractive: true,
      isVisible: true,
    },
  ]);
  console.log(`✅ Saved 2 element detections`);

  // Save an episode
  await db.saveEpisode('interaction', ['click button'], 'success', screenshotId);
  console.log(`✅ Saved episodic memory`);

  // Complete the run
  await db.completeTestRun(runId, {
    totalPages: 1,
    totalScreenshots: 1,
    totalElements: 2,
    totalTestsGenerated: 0,
    featuresTested: ['button_click'],
    geminiCalls: 0,
    costEstimate: 0,
    coveragePct: 50,
  });
  console.log(`✅ Completed test run`);

  // Query back
  const runs = await db.getAllTestRuns();
  console.log(`\n📊 Total test runs in DB: ${runs.length}`);

  const elements = await db.getElementsForScreenshot(screenshotId);
  console.log(`📊 Elements for screenshot: ${elements.length}`);

  db.close();
  console.log('\n✅ Database test complete!');
}

testDb().catch(console.error);

