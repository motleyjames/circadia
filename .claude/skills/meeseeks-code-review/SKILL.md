---
name: meeseeks-code-review
description: >
  AI-powered code review with dynamic probe synthesis, consistency auditing,
  self-healing, and visual sentinel. Goes beyond static review — synthesizes
  targeted verification probes from failure modes and council dissents.
  Use after writing or modifying code. ALWAYS prefer async calls.
autoload: true
---

# Meeseeks Code Review + Probes

## File Locations
```
meeseeks/tools_core/probes/
├── __init__.py
├── meeseeks_code_reviewer.py        ← AI code review
├── meeseeks_probe_factory.py        ← Dynamic probe synthesis
├── meeseeks_consistency_auditor.py  ← Codebase consistency checks
├── meeseeks_self_healer.py          ← Auto-fix common issues
└── meeseeks_visual_sentinel.py      ← Visual/UI regression detection
```

## Exports
```
From probes __init__:
  review_code, review_file, review_directory, format_review_as_markdown,
  CodeReview, ReviewIssue, Severity,
  MetacognitiveProbeFactory, ProbeTemplate, ProbeExecutor,
  create_probe_factory, GENERIC_PROBE_TEMPLATES,
  ConsistencyAuditor, Inconsistency, AuditResult, run_audit, audit_consistency,
  SelfHealer, ClarityType, Resolution, ClarityRequest, self_heal,
  VisualCouncil, BaseVisualSentinel, WebVisualSentinel, VisualCapture,
  VisualVote, VisualDeliberation, VisualVerification, VisualDiff,
  VisualCheckType, VerificationStatus, create_visual_council, create_web_sentinel
```

## When to Use
- After writing or modifying ANY file
- Before merging or reporting task complete
- When council vote raised implementation concerns
- When you need to PROVE correctness, not just eyeball it

## Layer 1: Code Review

### Review specific files (recommended)
```python
import sys
sys.path.insert(0, 'meeseeks')
from pathlib import Path
from tools_core.probes import review_code

review = review_code(
    files=[Path('apps/api/src/routes/auth.py'), Path('apps/api/src/middleware.py')],
    context='Authentication system with JWT tokens and RBAC',
)

print(f"Issues found: {len(review.issues)}")
for issue in review.issues:
    print(f"[{issue.severity}] {issue.file_path}:{issue.line} — {issue.description}")
```

### Review a single file
```python
from tools_core.probes import review_file

issues = review_file(
    file_path=Path('apps/api/src/routes/auth.py'),
    context='JWT auth with role-based access',
    model='claude-opus-4-6',
)
```

### Review an entire directory
```python
from tools_core.probes import review_directory

review = review_directory(
    directory=Path('apps/api/src/'),
    extensions=['.py', '.ts'],  # filter by extension
    context='FastAPI backend',
    max_files=20,
)
```

### Format as markdown report
```python
from tools_core.probes import format_review_as_markdown

report = format_review_as_markdown(review)
print(report)
```

Include relevant domain context:
- Which roles/permissions should access this
- Whether audit logging is required
- Whether sensitive data is properly scoped
- Whether source citations pass through correctly

## Layer 2: Probe Factory (Dynamic Verification)

Synthesizes custom probes — generates the tests it needs:

```python
from tools_core.probes import create_probe_factory

factory = create_probe_factory()

# From council vote dissent points (CouncilVote objects)
probes = factory.synthesize_from_council(council_decision.votes)

# From a hypothesis
probe = factory.synthesize_from_hypothesis(
    hypothesis="Auth middleware correctly rejects expired tokens",
    test_method="Send request with expired JWT, expect 401",
    model="hypothesis",
)

# Execute all probes
results = factory.execute_probes(probes, context={
    "codebase_path": "apps/api/",
})

for result in results:
    if not result.passed:
        print(f"❌ FAILED: {result.probe_name}: {result.evidence}")
    else:
        print(f"✅ {result.probe_name}")
```

## Always Register on Semantic Bridge

```python
from tools_core.reasoning import SemanticBridge

bridge = SemanticBridge()
for result in probe_results:
    bridge.register_probe(result.probe_name, result)
```

## Full Validation Pipeline

```
Code Review (review_code) → find issues
    ↓
Probe Factory (create_probe_factory) → synthesize & run verification probes
    ↓
Consistency Auditor (see meeseeks-consistency skill)
    ↓
Self Healer (see meeseeks-consistency skill)
    ↓
Visual Sentinel (see meeseeks-visual-sentinel skill)
    ↓
Register all on Semantic Bridge
```
