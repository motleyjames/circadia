---
name: meeseeks-visual-sentinel
description: >
  Visual regression detection and UI verification. Captures screenshots,
  compares before/after, detects regressions, and validates UI with multi-model
  vision council. Use after frontend changes, for dashboard verification, or
  when checking that views render correctly across roles.
---

# Meeseeks Visual Sentinel

## File Locations
```
meeseeks/tools_core/probes/
├── meeseeks_visual_sentinel.py     ← Core visual sentinel

meeseeks/tools_core/domain/excel/rsi/
├── visual_sentinel.py              ← Excel-specific visual sentinel
└── visual_dissent.py               ← Visual dissent detection

meeseeks/tools_core/automation/src/features/vision/
├── analyzer.ts                     ← Vision analysis (TypeScript)
├── python/
│   ├── analyze_screenshot.py       ← Screenshot analysis
│   └── annotate_screenshot.py      ← Screenshot annotation
```

## Exports
```
From probes __init__:
  VisualCouncil, BaseVisualSentinel, WebVisualSentinel,
  VisualCapture, VisualVote, VisualDeliberation,
  VisualVerification, VisualDiff, VisualCheckType, VerificationStatus,
  create_visual_council, create_web_sentinel
```

## Key Classes

### WebVisualSentinel — capture and verify web pages

```python
import sys
sys.path.insert(0, 'meeseeks')
from pathlib import Path
from tools_core.probes import create_web_sentinel, VisualCheckType

sentinel = create_web_sentinel(output_dir=Path("screenshots/"))

# Capture a page
capture = sentinel.capture(
    url="http://localhost:3000/dashboard",
    selector=None,       # optional CSS selector to capture
    full_page=False,     # capture full scrollable page
)

# Verify against a prompt
verification = sentinel.verify(
    capture=capture,
    prompt="Does the dashboard show all 5 status indicators?",
    check_type=VisualCheckType.CUSTOM,
)
print(f"Status: {verification.status}")  # VerificationStatus enum
print(f"Details: {verification.details}")

# Compare before/after
before = sentinel.capture(url="http://localhost:3000/dashboard")
# ... make changes ...
after = sentinel.capture(url="http://localhost:3000/dashboard")

diff = sentinel.compare(
    before=before,
    after=after,
    comparison_prompt="Did the layout change? Are any elements missing?",
)
if diff.regressions:
    for reg in diff.regressions:
        print(f"⚠️ Regression: {reg}")

# Summary of all checks
print(sentinel.get_summary())
```

### VisualCouncil — multi-model image analysis

```python
from tools_core.probes import create_visual_council

council = create_visual_council()

deliberation = council.deliberate(
    base64_image="<base64-encoded-screenshot>",
    prompt="Is the login form rendering correctly? Check spacing, alignment, colors.",
)

print(f"Consensus: {deliberation.consensus}")
for vote in deliberation.votes:
    print(f"  {vote.model}: {vote.assessment}")
```

### VisualCheckType enum
- `LAYOUT` — check element positioning/spacing
- `CONTENT` — check text/data content
- `STYLE` — check colors/fonts/themes
- `ACCESSIBILITY` — check a11y concerns
- `CUSTOM` — freeform verification prompt

### VerificationStatus enum
- `PASSED` — verification succeeded
- `FAILED` — verification failed
- `WARNING` — passed with concerns
- `ERROR` — couldn't complete verification

## Browser Automation + Visual Verification

```bash
cd meeseeks

# Take screenshot
./tools_core/scripts/meeseeks_browser.py screenshot http://localhost:3000 page.png

# Smoke test
./tools_core/scripts/meeseeks_browser.py smoke http://localhost:3000

# AI-powered visual analysis
./tools_core/scripts/meeseeks_browser.py analyze page.png "Is the dashboard showing all status types?"

# Multi-page test
./tools_core/scripts/meeseeks_browser.py test http://localhost:3000 / /dashboard /settings

# Check dependencies
./tools_core/scripts/meeseeks_browser.py check
```

## Common Use Cases
- Verify dashboard renders correctly for each user role
- Check status badges and indicators display properly
- Validate role-scoped views show only permitted data
- Ensure responsive layouts work across devices
