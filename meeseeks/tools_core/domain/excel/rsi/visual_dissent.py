"""
Visual Dissent Resolver - Resolves Dissents Using Vision

Uses the Visual Council (UI-Tars-2, GPT-4o, Claude) to resolve
concerns that CANNOT be resolved through code analysis alone:

1. "Will the formatting be preserved?"
   → Take screenshot BEFORE, simulate, take AFTER, COMPARE

2. "Is the chart readable?"
   → Capture the chart, ask council

3. "Does it look professional?"
   → Visual polish check

4. "Is conditionalormatting working?"
   → Screenshot the range, verify colors match rules

This bridges the gap between XML/formula analysis and
human visual perception.
"""

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict

from .visual_sentinel import (
    VisualSentinel,
    VisualCapture,
    VisualVerification,
    VisualDiff,
    VisualCheckType,
    VisualDeliberation
)

try:
    from ..core.data_classes import DissentPoint, DissentSeverity, DissentStatus
except ImportError:
    # Fallback if running standalone
    from enum import Enum
    
    class DissentSeverity(Enum):
        LOW = "low"
        MEDIUM = "medium"
        HIGH = "high"
        CRITICAL = "critical"
    
    class DissentStatus(Enum):
        UNRESOLVED = "unresolved"
        PARTIALLY_RESOLVED = "partially_resolved"
        FULLY_RESOLVED = "fully_resolved"
        ESCALATED = "escalated"
    
    @dataclass
    class DissentPoint:
        id: str
        content: str  # The concern text
        raised_by: str  # The model that raised it
        raised_iteration: int
        severity: DissentSeverity
        status: DissentStatus
        persistence_count: int = 1
        resolution_notes: List[str] = None
        related_probes: List[str] = None
        
        def __post_init__(self):
            if self.resolution_notes is None:
                self.resolution_notes = []
            if self.related_probes is None:
                self.related_probes = []

logger = logging.getLogger(__name__)


@dataclass
class VisualResolution:
    """Result of attempting to resolve a dissent visually"""
    dissent_id: str
    dissent_content: str
    resolved: bool
    resolution_method: str
    visual_evidence: str
    council_consensus: Optional[str]
    confidence: float
    captures_used: List[str]
    recommendations: List[str] = field(default_factory=list)


class VisualDissentResolver:
    """
    Resolves dissents using Visual Intelligence.
    
    The LLM council might raise concerns like:
    - "formatting might break"
    - "chart could become unreadable"
    - "conditional formatting won't fire"
    
    These CANNOT be resolved by reading XML or formulas.
    You have to LOOK at the spreadsheet.
    
    That's what this class does.
    """
    
    # Patterns that indicate a visual concern
    VISUAL_CONCERN_PATTERNS = [
        (r'format(?:ting)?', 'FORMATTING'),
        (r'chart|graph|visual', 'CHART'),
        (r'conditional\s*format', 'CONDITIONAL'),
        (r'professional|polish|appearance|look', 'PROFESSIONAL'),
        (r'border|color|font|style', 'FORMATTING'),
        (r'alignment|layout|spacing', 'LAYOUT'),
        (r'readab(?:le|ility)|legib(?:le|ility)', 'READABILITY'),
        (r'display|render|show', 'DISPLAY'),
        (r'cut.?off|overflow|truncat', 'ANOMALY'),
        (r'merge(?:d)?\s*cell', 'LAYOUT'),
    ]
    
    def __init__(self, sentinel: VisualSentinel):
        """
        Initialize with a Visual Sentinel.
        
        Args:
            sentinel: The Visual Sentinel to use for captures and analysis
        """
        self.sentinel = sentinel
        self.resolutions: List[VisualResolution] = []
        
        logger.info("  👁️ Visual Dissent Resolver initialized")
    
    def can_resolve_visually(self, dissent: DissentPoint) -> bool:
        """
        Determine if a dissent can be resolved using visual analysis.
        """
        content_lower = dissent.content.lower()
        
        for pattern, _ in self.VISUAL_CONCERN_PATTERNS:
            if re.search(pattern, content_lower, re.IGNORECASE):
                return True
        
        return False
    
    def classify_visual_concern(self, dissent: DissentPoint) -> Optional[VisualCheckType]:
        """
        Classify what type of visual check is needed.
        """
        content_lower = dissent.content.lower()
        
        for pattern, check_type in self.VISUAL_CONCERN_PATTERNS:
            if re.search(pattern, content_lower, re.IGNORECASE):
                if check_type == 'FORMATTING':
                    return VisualCheckType.FORMATTING
                elif check_type == 'CHART':
                    return VisualCheckType.CHART
                elif check_type == 'CONDITIONAL':
                    return VisualCheckType.CONDITIONAL
                elif check_type == 'PROFESSIONAL':
                    return VisualCheckType.PROFESSIONAL
                elif check_type in ('LAYOUT', 'DISPLAY'):
                    return VisualCheckType.LAYOUT
                elif check_type in ('READABILITY', 'ANOMALY'):
                    return VisualCheckType.ANOMALY
        
        return None
    
    def resolve(self, dissent: DissentPoint,
                sheet_name: Optional[str] = None,
                range_ref: str = "A1:M50") -> VisualResolution:
        """
        Attempt to resolve a dissent using visual analysis.
        
        Args:
            dissent: The dissent to resolve
            sheet_name: Sheet to capture (extracted from dissent if not provided)
            range_ref: Range to capture
            
        Returns:
            VisualResolution with results
        """
        logger.info(f"  👁️ Attempting visual resolution for: {dissent.id}")
        logger.info(f"     Concern: {dissent.content[:60]}...")
        
        # Extract sheet name from dissent if not provided
        if not sheet_name:
            sheet_name = self._extract_sheet_name(dissent.content)
        
        if not sheet_name:
            return VisualResolution(
                dissent_id=dissent.id,
                dissent_content=dissent.content,
                resolved=False,
                resolution_method="FAILED_NO_SHEET",
                visual_evidence="Could not determine sheet name from dissent",
                council_consensus=None,
                confidence=0.0,
                captures_used=[]
            )
        
        # Classify the type of visual check needed
        check_type = self.classify_visual_concern(dissent)
        
        logger.info(f"     Check type: {check_type}")
        logger.info(f"     Sheet: {sheet_name}")
        
        # Capture the range
        capture = self.sentinel.capture_range(sheet_name, range_ref, f"dissent_{dissent.id}")
        
        if not capture:
            return VisualResolution(
                dissent_id=dissent.id,
                dissent_content=dissent.content,
                resolved=False,
                resolution_method="CAPTURE_FAILED",
                visual_evidence="Could not capture screenshot",
                council_consensus=None,
                confidence=0.0,
                captures_used=[]
            )
        
        # Run appropriate verification
        verification = self._run_verification(check_type, capture, dissent.content)
        
        if not verification:
            return VisualResolution(
                dissent_id=dissent.id,
                dissent_content=dissent.content,
                resolved=False,
                resolution_method="VERIFICATION_FAILED",
                visual_evidence="Verification could not be performed",
                council_consensus=None,
                confidence=0.0,
                captures_used=[capture.id]
            )
        
        # Determine if resolved
        resolved = verification.passed and verification.confidence >= 0.6
        
        resolution = VisualResolution(
            dissent_id=dissent.id,
            dissent_content=dissent.content,
            resolved=resolved,
            resolution_method=f"VISUAL_{check_type.value.upper()}" if check_type else "VISUAL_GENERAL",
            visual_evidence=verification.description,
            council_consensus=verification.council_deliberation.consensus if verification.council_deliberation else None,
            confidence=verification.confidence,
            captures_used=[capture.id],
            recommendations=verification.recommendations
        )
        
        self.resolutions.append(resolution)
        
        status = "✓ RESOLVED" if resolved else "✗ NOT RESOLVED"
        logger.info(f"     {status} (confidence: {verification.confidence:.0%})")
        
        return resolution
    
    def _run_verification(self, check_type: Optional[VisualCheckType],
                           capture: VisualCapture,
                           concern: str) -> Optional[VisualVerification]:
        """Run the appropriate verification based on check type"""
        
        if check_type == VisualCheckType.FORMATTING:
            return self.sentinel.verify_formatting(capture, concern)
        
        elif check_type == VisualCheckType.CHART:
            return self.sentinel.verify_chart(capture)
        
        elif check_type == VisualCheckType.PROFESSIONAL:
            return self.sentinel.verify_professional_polish(capture)
        
        elif check_type in (VisualCheckType.ANOMALY, VisualCheckType.LAYOUT):
            return self.sentinel.detect_anomalies(capture)
        
        elif check_type == VisualCheckType.CONDITIONAL:
            # For conditional formatting, verify as formatting with specific context
            return self.sentinel.verify_formatting(capture, 
                f"Conditional formatting should apply: {concern}")
        
        else:
            # Generic check - use anomaly detection
            return self.sentinel.detect_anomalies(capture)
    
    def _extract_sheet_name(self, concern: str) -> Optional[str]:
        """Extract sheet name from a dissent concern"""
        
        # Pattern: "sheet 'SheetName'" or 'sheet "SheetName"'
        match = re.search(r"sheet\s*['\"]([^'\"]+)['\"]", concern, re.IGNORECASE)
        if match:
            return match.group(1)
        
        # Pattern: "SheetName sheet"
        match = re.search(r"([A-Za-z_][A-Za-z0-9_]*)\s+sheet", concern, re.IGNORECASE)
        if match:
            return match.group(1)
        
        # Pattern: "in SheetName" or "on SheetName"
        match = re.search(r"(?:in|on)\s+([A-Za-z_][A-Za-z0-9_]+)", concern, re.IGNORECASE)
        if match:
            return match.group(1)
        
        # Pattern: common sheet name patterns
        common_patterns = [
            r'\b(Summary|Total|Data|Main|Dashboard|Report|Settings|Config)\b',
            r'\b([A-Z][a-z]+_[A-Z][a-z]+)\b',  # Like Schwab_Data
        ]
        
        for pattern in common_patterns:
            match = re.search(pattern, concern)
            if match:
                return match.group(1)
        
        return None
    
    def resolve_batch(self, dissents: List[DissentPoint],
                       sheet_mapping: Optional[Dict[str, str]] = None) -> List[VisualResolution]:
        """
        Resolve multiple dissents using visual analysis.
        
        Args:
            dissents: List of dissents to resolve
            sheet_mapping: Optional mapping of dissent IDs to sheet names
            
        Returns:
            List of VisualResolution objects
        """
        results = []
        visual_dissents = [d for d in dissents if self.can_resolve_visually(d)]
        
        logger.info(f"  👁️ Attempting to resolve {len(visual_dissents)}/{len(dissents)} dissents visually")
        
        for dissent in visual_dissents:
            sheet_name = sheet_mapping.get(dissent.id) if sheet_mapping else None
            resolution = self.resolve(dissent, sheet_name)
            results.append(resolution)
        
        resolved_count = sum(1 for r in results if r.resolved)
        logger.info(f"  👁️ Visual resolution: {resolved_count}/{len(visual_dissents)} resolved")
        
        return results
    
    def get_visual_proof_summary(self) -> Dict[str, Any]:
        """Get summary of visual resolutions"""
        resolved = [r for r in self.resolutions if r.resolved]
        
        return {
            'total_attempts': len(self.resolutions),
            'resolved': len(resolved),
            'resolution_rate': len(resolved) / max(len(self.resolutions), 1),
            'by_method': self._count_by_method(),
            'council_consensus_breakdown': self._count_consensus()
        }
    
    def _count_by_method(self) -> Dict[str, int]:
        """Count resolutions by method"""
        counts = {}
        for r in self.resolutions:
            method = r.resolution_method
            counts[method] = counts.get(method, 0) + 1
        return counts
    
    def _count_consensus(self) -> Dict[str, int]:
        """Count by council consensus"""
        counts = {}
        for r in self.resolutions:
            if r.council_consensus:
                counts[r.council_consensus] = counts.get(r.council_consensus, 0) + 1
        return counts


# =============================================================================
# VISUAL PROOF GENERATOR
# =============================================================================

class VisualProofGenerator:
    """
    Generates Visual Proofs for the update process.
    
    Before any update:
    1. Capture BEFORE screenshots of affected areas
    2. Apply update in sandbox
    3. Capture AFTER screenshots
    4. Use Visual Council to compare
    5. Generate proof document
    
    This creates an AUDIT TRAIL of visual changes.
    """
    
    def __init__(self, sentinel: VisualSentinel):
        self.sentinel = sentinel
        self.proofs: List[Dict[str, Any]] = []
    
    def create_before_capture(self, sheet_name: str,
                               range_ref: str,
                               update_description: str) -> VisualCapture:
        """Capture the BEFORE state"""
        logger.info(f"  📸 Capturing BEFORE: {sheet_name}!{range_ref}")
        capture = self.sentinel.capture_range(
            sheet_name, range_ref, f"before_{update_description[:20]}"
        )
        return capture
    
    def create_after_capture(self, sheet_name: str,
                              range_ref: str,
                              update_description: str) -> VisualCapture:
        """Capture the AFTER state"""
        logger.info(f"  📸 Capturing AFTER: {sheet_name}!{range_ref}")
        capture = self.sentinel.capture_range(
            sheet_name, range_ref, f"after_{update_description[:20]}"
        )
        return capture
    
    def generate_proof(self, before: VisualCapture,
                        after: VisualCapture,
                        update_description: str) -> Dict[str, Any]:
        """
        Generate a complete visual proof comparing before and after.
        
        Returns a proof document with:
        - Before/after captures
        - Visual diff analysis from council
        - Pass/fail determination
        - Any detected regressions
        """
        logger.info("  📊 Generating visual proof...")
        
        # Compare using Visual Council
        diff = self.sentinel.compare_before_after(before, after)
        
        proof = {
            'update': update_description,
            'before': {
                'id': before.id,
                'sheet': before.sheet_name,
                'range': before.range_ref,
                'path': before.image_path
            },
            'after': {
                'id': after.id,
                'sheet': after.sheet_name,
                'range': after.range_ref,
                'path': after.image_path
            },
            'analysis': {
                'changes_detected': diff.changes_detected,
                'formatting_preserved': diff.formatting_preserved,
                'layout_preserved': diff.layout_preserved,
                'issues': diff.issues,
                'assessment': diff.overall_assessment
            },
            'passed': diff.overall_assessment in ('ACCEPTABLE', 'PASS'),
            'requires_review': diff.overall_assessment == 'NEEDS_REVIEW',
            'council_deliberation': asdict(diff.council_deliberation) if diff.council_deliberation else None
        }
        
        self.proofs.append(proof)
        
        status = "✓ PASSED" if proof['passed'] else "⚠️ NEEDS REVIEW" if proof['requires_review'] else "✗ FAILED"
        logger.info(f"  {status}")
        
        return proof
    
    def generate_proof_document(self, output_path: Path) -> None:
        """
        Generate a Markdown proof document with all visual evidence.
        """
        lines = [
            "# Visual Proof Document",
            "",
            f"Generated: {__import__('datetime').datetime.now().isoformat()}",
            f"Excel File: {self.sentinel.excel_path.name}",
            f"Visual Council Members: {len(self.sentinel.council.members)}",
            "",
            "---",
            ""
        ]
        
        # Summary
        passed = sum(1 for p in self.proofs if p['passed'])
        lines.extend([
            "## Summary",
            "",
            f"- Total Updates Verified: {len(self.proofs)}",
            f"- Passed: {passed}",
            f"- Failed/Needs Review: {len(self.proofs) - passed}",
            "",
        ])
        
        # Individual proofs
        lines.append("## Proof Details")
        lines.append("")
        
        for i, proof in enumerate(self.proofs, 1):
            status = "✅" if proof['passed'] else "⚠️" if proof.get('requires_review') else "❌"
            lines.extend([
                f"### {i}. {proof['update']} {status}",
                "",
                f"**Sheet:** {proof['before']['sheet']}",
                f"**Range:** {proof['before']['range']}",
                "",
                "**Changes Detected:**",
            ])
            
            for change in proof['analysis']['changes_detected']:
                lines.append(f"- {change}")
            
            lines.extend([
                "",
                f"**Formatting Preserved:** {'Yes' if proof['analysis']['formatting_preserved'] else 'No'}",
                f"**Layout Preserved:** {'Yes' if proof['analysis']['layout_preserved'] else 'No'}",
            ])
            
            if proof['analysis']['issues']:
                lines.append("")
                lines.append("**Issues:**")
                for issue in proof['analysis']['issues']:
                    lines.append(f"- ⚠️ {issue}")
            
            lines.append("")
            lines.append("---")
            lines.append("")
        
        # Write document
        output_path.write_text('\n'.join(lines))
        logger.info(f"  📄 Visual proof document: {output_path}")

