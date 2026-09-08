"""
Meeseeks Probes Module

Verification tools for code review, hypothesis testing, and validation.

Components:
- code_reviewer: AI-powered code review
- probe_factory: Dynamic probe synthesis (Metacognitive Probe Synthesis)
- consistency_auditor: Codebase consistency checks
- self_healer: Auto-fix common issues
- visual_sentinel: Visual verification using VLM council
"""

from .meeseeks_code_reviewer import (
    review_code,
    review_file,
    review_directory,
    format_review_as_markdown,
    CodeReview,
    ReviewIssue,
    Severity,
)

# Metacognitive Probe Factory - Dynamic probe synthesis
from .meeseeks_probe_factory import (
    MetacognitiveProbeFactory,
    ProbeTemplate,
    ProbeExecutor,
    create_probe_factory,
    GENERIC_PROBE_TEMPLATES,
)

# Visual Sentinel - The Eyes of RSI
from .meeseeks_visual_sentinel import (
    VisualCouncil,
    BaseVisualSentinel,
    WebVisualSentinel,
    VisualCapture,
    VisualVote,
    VisualDeliberation,
    VisualVerification,
    VisualDiff,
    VisualCheckType,
    VerificationStatus,
    create_visual_council,
    create_web_sentinel,
)

# Consistency Auditor - Codebase consistency checks
from .meeseeks_consistency_auditor import (
    ConsistencyAuditor,
    Inconsistency,
    AuditResult,
    run_audit,
    audit_consistency,
)

# Self Healer - Auto-fix common issues
from .meeseeks_self_healer import (
    SelfHealer,
    ClarityType,
    Resolution,
    ClarityRequest,
    self_heal,
)

__all__ = [
    # Code Review
    'review_code',
    'review_file',
    'review_directory',
    'format_review_as_markdown',
    'CodeReview',
    'ReviewIssue',
    'Severity',
    # Probe Factory
    'MetacognitiveProbeFactory',
    'ProbeTemplate',
    'ProbeExecutor',
    'create_probe_factory',
    'GENERIC_PROBE_TEMPLATES',
    # Visual Sentinel
    'VisualCouncil',
    'BaseVisualSentinel',
    'WebVisualSentinel',
    'VisualCapture',
    'VisualVote',
    'VisualDeliberation',
    'VisualVerification',
    'VisualDiff',
    'VisualCheckType',
    'VerificationStatus',
    'create_visual_council',
    'create_web_sentinel',
    # Consistency Auditor
    'ConsistencyAuditor',
    'Inconsistency',
    'AuditResult',
    'run_audit',
    'audit_consistency',
    # Self Healer
    'SelfHealer',
    'ClarityType',
    'Resolution',
    'ClarityRequest',
    'self_heal',
]
