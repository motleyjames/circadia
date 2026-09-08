---
name: meeseeks-consistency
description: >
  Codebase consistency auditing and self-healing. Checks naming conventions,
  patterns, structure consistency across the project. Self-healer auto-fixes
  common issues found by the auditor. Use after large refactors, when
  multiple teammates modified the same codebase, or periodically for hygiene.
---

# Meeseeks Consistency Auditor + Self Healer

## File Locations
```
meeseeks/tools_core/probes/
├── meeseeks_consistency_auditor.py  ← Pattern/naming consistency
└── meeseeks_self_healer.py          ← Auto-fix common issues
```

## Exports
```
From probes __init__:
  ConsistencyAuditor, Inconsistency, AuditResult, run_audit, audit_consistency,
  SelfHealer, ClarityType, Resolution, ClarityRequest, self_heal
```

## Consistency Audit

### Quick audit (standalone function)
```python
import sys
sys.path.insert(0, 'meeseeks')
from pathlib import Path
from tools_core.probes import audit_consistency

result = audit_consistency(
    directory=Path("apps/api/"),
    pattern=None,           # optional glob filter
    smart_filter=True,      # filter false positives
    output_file=None,       # optional file to write results
)

for issue in result.issues:
    print(f"[{issue.severity}] {issue.description}")
    print(f"  File: {issue.file_path}:{issue.line}")
```

### Full auditor (more control)
```python
from tools_core.probes import ConsistencyAuditor

auditor = ConsistencyAuditor(target_dir=Path("apps/api/"))

# Scan a single file
issues = auditor.scan_file(
    file_path=Path("apps/api/src/routes/auth.py"),
    check_semantic=True,
)

# Scan entire directory
result = auditor.scan_directory(
    extensions=[".py", ".ts"],
    exclude_patterns=["node_modules", "__pycache__", ".git"],
)

# Filter false positives
cleaned = auditor.filter_false_positives(result)

for issue in cleaned.issues:
    print(f"[{issue.severity}] {issue.description}")
    print(f"  File: {issue.file_path}:{issue.line}")
```

## Self-Healing

The self-healer resolves ambiguous or inconsistent values using fuzzy matching
and optional LLM assistance:

```python
from tools_core.probes import SelfHealer, self_heal

healer = SelfHealer()

# Heal a single inconsistent value
request = healer.heal(
    value="usr_name",           # the inconsistent value found
    attribute="variable_name",  # what kind of thing it is
    context="Python module using snake_case convention",
    line=42,                    # optional line number
    use_llm=True,              # use LLM for suggestions
)

print(f"Type: {request.clarity_type}")  # e.g. ClarityType.TYPO
for resolution in request.resolutions:
    print(f"  Suggestion: {resolution.value} (confidence: {resolution.confidence})")

# Or use the convenience function
request = self_heal(
    value="usr_name",
    attribute="variable_name",
    context="snake_case Python module",
)
```

### ClarityType enum
- `TYPO` — likely misspelling
- `AMBIGUOUS` — multiple valid interpretations
- `INCONSISTENT` — doesn't match surrounding patterns
- `UNKNOWN` — can't determine the issue

## For Agent Teams
After multiple teammates modify the codebase in parallel:
- Run consistency audit on the full project
- Check naming conventions match across modules
- Verify API types match client-side hooks/consumers
- Self-heal formatting, import ordering, missing type annotations
