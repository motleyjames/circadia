---
name: Browser Automation & Vision Intelligence
description: Screenshot pages, run smoke tests, analyze UIs with vision AI
domains: [browser, testing, automation, screenshots, vision, ui]
keywords: [playwright, screenshot, smoke-test, vision, analyze, ui-testing]
when_to_use: When testing web pages, taking screenshots, or analyzing UI
priority: high
max_tokens: 1500
---

# Browser Automation for Meeseeks

> **Philosophy**: One command. One task. Done. *poof*

## Key Mental Models

1. **Screenshot is VERIFICATION** → "Show me the page" proves more than logs
2. **Smoke test is SANITY CHECK** → Does it load? Does it have expected elements?
3. **Vision analysis is UNDERSTANDING** → Ask questions about what you see
4. **Don't navigate, CAPTURE** → Take what you need, then analyze

## Quick Commands

```bash
# Take a screenshot
./tools_core/scripts/meeseeks_browser.py screenshot http://localhost:3000 page.png

# Run smoke test (is the page working?)
./tools_core/scripts/meeseeks_browser.py smoke http://localhost:3000

# Analyze a screenshot with a question
./tools_core/scripts/meeseeks_browser.py analyze page.png "Is there a login button?"

# Test multiple pages
./tools_core/scripts/meeseeks_browser.py test http://localhost:3000 / /dashboard /settings

# Check if dependencies are ready
./tools_core/scripts/meeseeks_browser.py check
```

## Python API

```python
import subprocess
from pathlib import Path

BROWSER_SCRIPT = Path("tools_core/scripts/meeseeks_browser.py")

def screenshot(url: str, output: str = "screenshot.png") -> bool:
    """Take a screenshot of a URL."""
    result = subprocess.run(
        ["python", str(BROWSER_SCRIPT), "screenshot", url, output],
        capture_output=True, text=True
    )
    return result.returncode == 0

def smoke_test(url: str) -> bool:
    """Run smoke test on URL."""
    result = subprocess.run(
        ["python", str(BROWSER_SCRIPT), "smoke", url],
        capture_output=True, text=True
    )
    return result.returncode == 0

def analyze(image: str, question: str) -> str:
    """Analyze screenshot with vision AI."""
    result = subprocess.run(
        ["python", str(BROWSER_SCRIPT), "analyze", image, question],
        capture_output=True, text=True
    )
    return result.stdout
```

## When to Use

| Scenario | Command |
|----------|---------|
| "Does the page load?" | `smoke URL` |
| "What does it look like?" | `screenshot URL output.png` |
| "Is the login form there?" | `analyze page.png "Is there a login form?"` |
| "Test the main flows" | `test URL / /dashboard /settings` |

## Setup

```bash
# Check dependencies
./tools_core/scripts/meeseeks_browser.py check

# If needed, install playwright
pip install playwright
playwright install chromium

# If using the full automation suite
cd tools_core/automation && npm install
```

## Novel Uses

1. **Verify deployments** → Screenshot before/after, compare
2. **Catch regressions** → Smoke test on every change
3. **Document UIs** → Generate screenshots for docs
4. **Debug visually** → "What's actually on the page?"

---

*"Take the shot. Answer the question. Done."* 🔵
