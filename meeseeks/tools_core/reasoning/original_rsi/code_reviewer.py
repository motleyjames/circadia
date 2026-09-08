#!/usr/bin/env python3
"""
code_reviewer.py - AI-Powered Code Review

This module uses Claude Opus to review code changes for quality,
security, and correctness before integration.

Part of the Meeseeks RSI Toolkit.
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

from llm_caller import call_claude_opus
from tracer import Tracer, Phase, get_tracer


class Severity(Enum):
    CRITICAL = "critical"  # Blocks merge - security, crash
    HIGH = "high"          # Should fix - bugs, bad patterns
    MEDIUM = "medium"      # Should consider - style, performance
    LOW = "low"            # Nice to have - minor improvements
    INFO = "info"          # Informational - no action needed


@dataclass
class ReviewIssue:
    """A single issue found during review."""
    severity: Severity
    file: str
    line: Optional[int]
    title: str
    description: str
    suggestion: str


@dataclass
class CodeReview:
    """Complete code review result."""
    files_reviewed: List[str]
    issues: List[ReviewIssue]
    summary: str
    approval: bool  # True if no critical/high issues
    score: int      # 0-100 quality score
    key_findings: List[str]


def read_file_content(path: Path) -> str:
    """Safely read file content."""
    try:
        return path.read_text()
    except Exception as e:
        return f"Error reading file: {e}"


def review_file(
    file_path: Path,
    context: str = "",
    model: str = "claude-opus-4-6",
) -> List[ReviewIssue]:
    """
    Review a single file for issues.
    
    Args:
        file_path: Path to the file to review
        context: Additional context about the project
        model: Model to use for review
    
    Returns:
        List of issues found
    """
    content = read_file_content(file_path)
    
    if content.startswith("Error"):
        return [ReviewIssue(
            severity=Severity.INFO,
            file=str(file_path),
            line=None,
            title="Could not read file",
            description=content,
            suggestion="Check file path and permissions",
        )]
    
    prompt = f"""Review this code file for issues.

## File: {file_path.name}
## Context: {context if context else "General code review"}

```{file_path.suffix[1:] if file_path.suffix else 'text'}
{content}
```

## Review Focus
1. **Security**: XSS, injection, auth issues
2. **Bugs**: Logic errors, null/undefined handling
3. **Performance**: Inefficient patterns, memory leaks
4. **Best Practices**: TypeScript/Go/React patterns
5. **Integration**: Will this work in an Electron context?

## Output Format
Respond with a JSON array of issues:
```json
[
  {{
    "severity": "high",
    "line": 42,
    "title": "Potential null reference",
    "description": "The variable 'user' may be null here",
    "suggestion": "Add null check: if (user) {{ ... }}"
  }}
]
```

If no issues found, return: []

Be specific about line numbers and provide actionable suggestions.
"""

    system = """You are a senior code reviewer. Focus on real, actionable issues.
Don't nitpick style unless it impacts readability significantly.
Output valid JSON only."""

    try:
        response = call_claude_opus(prompt, system)
        
        # Parse JSON response
        json_start = response.find('[')
        json_end = response.rfind(']') + 1
        if json_start >= 0 and json_end > json_start:
            issues_data = json.loads(response[json_start:json_end])
            
            issues = []
            for issue in issues_data:
                issues.append(ReviewIssue(
                    severity=Severity(issue.get('severity', 'medium')),
                    file=str(file_path),
                    line=issue.get('line'),
                    title=issue.get('title', 'Issue'),
                    description=issue.get('description', ''),
                    suggestion=issue.get('suggestion', ''),
                ))
            return issues
        
        return []
        
    except Exception as e:
        return [ReviewIssue(
            severity=Severity.INFO,
            file=str(file_path),
            line=None,
            title="Review failed",
            description=str(e),
            suggestion="Manual review recommended",
        )]


def review_code(
    files: List[Path],
    context: str = "",
    tracer: Optional[Tracer] = None,
) -> CodeReview:
    """
    Review multiple files and produce a comprehensive report.
    
    Args:
        files: List of file paths to review
        context: Project context
        tracer: Optional tracer for logging
    
    Returns:
        Complete CodeReview result
    """
    tracer = tracer or get_tracer()
    
    tracer.log(
        phase=Phase.VALIDATION,
        title="Code Review Started",
        context=f"Reviewing {len(files)} files",
        reasoning="Using Claude to identify issues before integration.",
        decision_action=f"Files: {[str(f.name) for f in files[:5]]}...",
        next_steps=["Review each file", "Aggregate issues", "Generate report"],
    )
    
    all_issues = []
    files_reviewed = []
    
    for file_path in files:
        if not file_path.exists():
            continue
        
        issues = review_file(file_path, context)
        all_issues.extend(issues)
        files_reviewed.append(str(file_path))
    
    # Calculate score
    critical_count = sum(1 for i in all_issues if i.severity == Severity.CRITICAL)
    high_count = sum(1 for i in all_issues if i.severity == Severity.HIGH)
    medium_count = sum(1 for i in all_issues if i.severity == Severity.MEDIUM)
    
    score = 100 - (critical_count * 30) - (high_count * 15) - (medium_count * 5)
    score = max(0, min(100, score))
    
    # Determine approval
    approval = critical_count == 0 and high_count <= 2
    
    # Generate summary
    summary = f"""
## Code Review Summary

**Files Reviewed:** {len(files_reviewed)}
**Total Issues:** {len(all_issues)}
**Score:** {score}/100
**Approval:** {'✅ Approved' if approval else '❌ Needs Work'}

### Issue Breakdown
- Critical: {critical_count}
- High: {high_count}
- Medium: {medium_count}
- Low: {sum(1 for i in all_issues if i.severity == Severity.LOW)}
- Info: {sum(1 for i in all_issues if i.severity == Severity.INFO)}
"""
    
    # Extract key findings
    key_findings = [
        f"[{i.severity.value.upper()}] {i.file}: {i.title}"
        for i in all_issues
        if i.severity in [Severity.CRITICAL, Severity.HIGH]
    ][:5]
    
    review = CodeReview(
        files_reviewed=files_reviewed,
        issues=all_issues,
        summary=summary,
        approval=approval,
        score=score,
        key_findings=key_findings,
    )
    
    # Log results
    tracer.log(
        phase=Phase.VALIDATION,
        title="Code Review Complete",
        context=f"Reviewed {len(files_reviewed)} files",
        reasoning=f"Found {len(all_issues)} issues, score {score}/100",
        decision_action="Approved" if approval else "Needs fixes",
        metadata={
            "score": score,
            "issue_count": len(all_issues),
            "critical": critical_count,
            "high": high_count,
        },
    )
    
    return review


def review_directory(
    directory: Path,
    extensions: List[str] = ['.ts', '.tsx', '.js', '.jsx', '.go'],
    context: str = "",
    max_files: int = 20,
) -> CodeReview:
    """
    Review all files in a directory with given extensions.
    """
    files = []
    for ext in extensions:
        files.extend(directory.rglob(f'*{ext}'))
    
    # Filter out node_modules and other generated
    files = [f for f in files if 'node_modules' not in str(f) and '.git' not in str(f)]
    
    # Limit files
    files = files[:max_files]
    
    return review_code(files, context)


def format_review_as_markdown(review: CodeReview) -> str:
    """Format a code review as markdown for saving."""
    md = review.summary + "\n\n"
    
    if review.key_findings:
        md += "### Key Findings\n"
        for finding in review.key_findings:
            md += f"- {finding}\n"
        md += "\n"
    
    if review.issues:
        md += "### All Issues\n\n"
        for issue in review.issues:
            md += f"""
#### [{issue.severity.value.upper()}] {issue.title}
- **File:** {issue.file}
- **Line:** {issue.line or 'N/A'}
- **Description:** {issue.description}
- **Suggestion:** {issue.suggestion}

"""
    
    return md


if __name__ == "__main__":
    # Test with a sample file
    from pathlib import Path
    
    test_file = Path(__file__).parent / "llm_caller.py"
    
    if test_file.exists():
        print(f"Reviewing {test_file}...")
        issues = review_file(test_file, "Testing the code reviewer")
        
        print(f"\nFound {len(issues)} issues:")
        for issue in issues:
            print(f"  [{issue.severity.value}] {issue.title}")
            if issue.suggestion:
                print(f"    → {issue.suggestion}")

