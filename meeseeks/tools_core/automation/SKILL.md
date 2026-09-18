---
name: Browser Automation & Vision Intelligence
description: Local-first browser automation with AI vision analysis, UI-TARS-2 style semantic agents, and self-healing workflows
domains: [automation, testing, browser, vision, ui, playwright, web]
keywords: [playwright, screenshot, vision, ui-tars, gemini, testing, automation, browser, web, element, detection]
when_to_use: When you need to automate browser interactions, analyze UI screenshots, generate tests, or build self-healing automation workflows
priority: high
max_tokens: 3000
---

# 🤖 Browser Automation & Vision Intelligence

> "I'M MR. MEESEEKS! I CAN SEE AND INTERACT WITH BROWSERS!"

## Key Mental Models

1. **Screenshots are STRUCTURED DATA**, not just images - they contain a semantic hierarchy of interactive elements
2. **Browser automation is CONVERSATION** - plan → observe → act → learn → repeat
3. **Tests should be SELF-HEALING** - use semantic selectors, not brittle CSS
4. **Vision models REPLACE DOM parsing** - faster, more robust, works on any page

## Elevated Thinking Prompts

Before automating, ask yourself:

1. Can I analyze this UI from a screenshot instead of parsing DOM?
2. Should I use semantic reasoning (UI-TARS style) instead of hard-coded selectors?
3. Is this a candidate for self-healing automation?
4. Can I generate tests from visual analysis instead of manual scripting?
5. Would codebase analysis help me understand what to test?
6. Should I capture before/after screenshots for visual regression?

## Capabilities

### 1. Vision Analysis (FastVLM)
Detect UI elements from screenshots - no DOM parsing needed:

```bash
# From meeseeks/tools_core/automation/
npm run analyze:screenshot -- path/to/screenshot.png
```

```python
# Or call the Python analyzer directly
python tools/process_screenshot.py screenshot.png --output elements.json
```

### 2. UI-TARS-2 Style Agent
Semantic reasoning over UI - identifies features, plans interactions:

```typescript
import { UITarsAgent } from './src/features/ui-agent';

const agent = new UITarsAgent(page);
const result = await agent.analyzeAndTest(detectedElements);
// Returns: features identified, interactions planned, patterns learned
```

### 3. Full Testing Cycle
End-to-end: analyze codebase → screenshot → detect elements → plan tests → execute → report:

```bash
# Initialize database
npm run db:init

# Run full cycle
npm run cycle:full

# Or step by step:
npm run capture:quick      # Quick screenshot capture
npm run analyze            # Analyze codebase
npm run report             # Generate reports
npm run dashboard          # Interactive dashboard
```

### 4. Orchestration with Gemini
AI-powered test planning and analysis:

```typescript
import { runTestingCycle } from './src/features/orchestration';

await runTestingCycle({
  pagesToTest: ['/', '/dashboard', '/settings'],
  runCodebaseAnalysis: true,
  generateTests: true,
});
```

## Novel Applications (Connecting the Dots)

### 1. Visual Regression for ANY App
Don't just test your app - test COMPETITOR apps:

```bash
# Screenshot competitor
npx playwright screenshot https://competitor.com/pricing -o competitor.png

# Analyze their UI
python tools/process_screenshot.py competitor.png

# Compare to yours
python tools/render_improvements.py --before yours.png --after competitor.png
```

### 2. Automated Accessibility Audit
Vision analysis can identify accessibility issues:

```python
# Elements without labels, low contrast, missing alt text
# Vision model sees what screen readers can't
```

### 3. Generate E2E Tests from Figma
Screenshot Figma designs → detect interactive elements → generate tests before code exists!

### 4. Self-Healing Selectors
When tests break, use vision to find the element again:

```typescript
// Instead of: await page.click('#old-button-id')
// Use semantic: await agent.findAndClick('Submit order button')
```

### 5. Documentation Generation
Vision analysis + LLM = automatic user documentation:

```bash
# Screenshot each page → analyze elements → generate user guide
```

### 6. Performance Visual Diff
Compare load states:

```bash
# Screenshot at 0ms, 100ms, 500ms, 1000ms
# Visualize rendering waterfall
```

### 7. Cross-Browser Visual QA
Same page, different browsers → diff the screenshots:

```bash
npx playwright screenshot --browser=chromium -o chrome.png
npx playwright screenshot --browser=firefox -o firefox.png
python tools/render_improvements.py --before chrome.png --after firefox.png
```

### 8. Composability with System Tools
Chain with other Meeseeks tools:

```bash
# Screenshot → Vision → Gemini → Mermaid diagram of UI flow
# Screenshot → Vision → Generate SVG wireframe
# Screenshot → Vision → Extract color palette
```

## CLI Reference

```bash
# Quick smoke test
npm run capture:quick

# Full test cycle
npm run cycle:full

# Individual commands
npx ts-node src/index.ts init-db          # Initialize database
npx ts-node src/index.ts analyze [dir]    # Analyze codebase
npx ts-node src/index.ts test [pages]     # Run tests
npx ts-node src/index.ts smoke [url]      # Quick smoke test
npx ts-node src/index.ts report           # Generate reports
npx ts-node src/index.ts dashboard        # Interactive dashboard

# Python tools
python tools/process_screenshot.py <image>      # Analyze screenshot
python tools/apply_improvements.py              # Apply suggested improvements
python tools/render_improvements.py             # Render visual diffs
```

## Prompts Available

The system includes carefully crafted prompts in `tools/prompts/`:

1. `step1_ui_transcription.txt` - Describe what you see
2. `step2_element_detection.txt` - Identify interactive elements
3. `step3_semantic_analysis.txt` - Understand relationships
4. `step4_test_plan.txt` - Generate test cases
5. `step5_design_commentary.txt` - UX critique
6. `step6_improvement_hypotheses.txt` - Suggest improvements

## Architecture

```
automation/
├── src/
│   ├── features/
│   │   ├── codebase-analysis/  # Python AST analyzer
│   │   ├── orchestration/      # Gemini + test cycles
│   │   ├── reporting/          # HTML/JSON reports
│   │   ├── ui-agent/           # UI-TARS-2 style agent
│   │   └── vision/             # FastVLM screenshot analysis
│   └── shared/
│       ├── db/                 # SQLite persistence
│       ├── logging/            # Structured logging
│       └── screenshots/        # Screenshot handling
├── tools/
│   ├── prompts/                # LLM prompts
│   └── *.py                    # Python utilities
└── artifacts/                  # Generated reports, screenshots
```

## Environment Variables

```bash
GEMINI_API_KEY=...              # Required for AI features
PLAYWRIGHT_BASE_URL=http://localhost:3000
TEST_DB_PATH=./db/testing.db
LOG_LEVEL=INFO
```

## Integration with Meeseeks

```python
# From a Meeseeks loop, you can:
import subprocess

# Run smoke test on target URL
result = subprocess.run(
    ['npx', 'ts-node', 'src/index.ts', 'smoke', 'http://localhost:3000'],
    cwd='tools_core/automation',
    capture_output=True
)

# Analyze screenshot
result = subprocess.run(
    ['python', 'tools/process_screenshot.py', 'screenshot.png'],
    cwd='tools_core/automation',
    capture_output=True
)
elements = json.loads(result.stdout)
```

---

*"LOOK AT ME! I CAN SEE YOUR UI!"* 🔵
