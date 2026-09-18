"""
Meeseeks Visual Sentinel - The Eyes of RSI

"I'M MR. MEESEEKS! I CAN SEE WHAT YOU SEE!"

Gives Meeseeks the ability to SEE applications as a human would.
Uses a VISUAL COUNCIL of Vision-Language Models to verify visual output.

This is a GENERIC visual verification system that can be specialized
for specific domains (Excel, web pages, PDFs, etc.)

Key capabilities:
1. Screenshot capture (via various methods)
2. Visual council deliberation (multiple VLMs vote)
3. Before/After comparison (detect visual regressions)
4. Anomaly detection (issues invisible to code)
5. Professional polish assessment
"""

import os
import re
import base64
import logging
import hashlib
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any, Protocol
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

try:
    from ..core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND DATA CLASSES
# =============================================================================

class VisualCheckType(Enum):
    """Types of visual verification"""
    FORMATTING = "formatting"
    LAYOUT = "layout"
    CONTENT = "content"
    COMPARISON = "before_after"
    ANOMALY = "anomaly_detection"
    PROFESSIONAL = "professional_polish"
    CUSTOM = "custom"


class VerificationStatus(Enum):
    """Status of a visual verification"""
    PASSED = "passed"
    FAILED = "failed"
    NEEDS_REVIEW = "needs_review"
    ERROR = "error"


@dataclass
class VisualCapture:
    """A captured screenshot"""
    id: str
    source: str  # What was captured (URL, file path, app name)
    image_path: str
    timestamp: str
    capture_method: str
    width: int = 0
    height: int = 0
    base64_data: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class VisualVote:
    """A vote from a vision council member"""
    model: str
    passed: bool
    confidence: float
    observations: str
    anomalies: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


@dataclass
class VisualDeliberation:
    """Result of visual council deliberation"""
    votes: List[VisualVote]
    consensus: str  # 'PASS', 'FAIL', 'NEEDS_REVIEW'
    consensus_confidence: float
    key_agreements: List[str]
    key_disagreements: List[str]
    final_assessment: str


@dataclass
class VisualVerification:
    """Result of a visual verification"""
    check_type: VisualCheckType
    status: VerificationStatus
    confidence: float
    description: str
    anomalies: List[str]
    reasoning: str
    recommendations: List[str] = field(default_factory=list)
    council_deliberation: Optional[VisualDeliberation] = None


@dataclass
class VisualDiff:
    """Comparison between before and after screenshots"""
    before_capture: VisualCapture
    after_capture: VisualCapture
    changes_detected: List[str]
    regressions: List[str]
    improvements: List[str]
    overall_assessment: str
    council_deliberation: Optional[VisualDeliberation] = None


# =============================================================================
# ABSTRACT INTERFACES
# =============================================================================

class ScreenshotProvider(Protocol):
    """Protocol for screenshot capture implementations"""
    
    def capture(self, target: str, **kwargs) -> Optional[VisualCapture]:
        """Capture a screenshot of the target"""
        ...


class VisualAnalyzer(Protocol):
    """Protocol for visual analysis implementations"""
    
    def analyze(self, image_b64: str, prompt: str) -> VisualVote:
        """Analyze an image and return a vote"""
        ...


# =============================================================================
# VISUAL COUNCIL (GENERIC)
# =============================================================================

class VisualCouncil:
    """
    Visual Council - Multiple VLMs deliberate on visual quality.
    
    Like the LLM Council in RSI, but for VISION.
    They vote on visual questions and reach consensus.
    """
    
    def __init__(self, analyzers: Optional[List[VisualAnalyzer]] = None):
        """
        Initialize with optional custom analyzers.
        If none provided, uses default LLM vision providers.
        """
        self._analyzers = analyzers or []
        self._default_providers_initialized = False
        
        # API keys for default providers
        self.openai_key = os.environ.get("OPENAI_API_KEY")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        self.gemini_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        
        logger.info(f"  👁️ Visual Council initialized")
    
    def _init_default_providers(self):
        """Lazy initialization of default providers"""
        if self._default_providers_initialized:
            return
        
        self._default_providers_initialized = True
        
        # Add available default providers
        if self.openai_key:
            logger.info("     - OpenAI Vision available")
        if self.anthropic_key:
            logger.info("     - Anthropic Vision available")
        if self.gemini_key:
            logger.info("     - Gemini Vision available")
    
    def deliberate(self, base64_image: str, prompt: str) -> VisualDeliberation:
        """
        Have all council members analyze the image and deliberate.
        
        Returns consensus and all votes.
        """
        self._init_default_providers()
        
        votes = []
        
        # Call default providers if no custom analyzers
        if not self._analyzers:
            if self.openai_key:
                vote = self._call_openai_vision(base64_image, prompt)
                votes.append(vote)
            
            if self.anthropic_key:
                vote = self._call_anthropic_vision(base64_image, prompt)
                votes.append(vote)
            
            if self.gemini_key:
                vote = self._call_gemini_vision(base64_image, prompt)
                votes.append(vote)
        else:
            # Use custom analyzers
            for analyzer in self._analyzers:
                vote = analyzer.analyze(base64_image, prompt)
                votes.append(vote)
        
        if not votes:
            return VisualDeliberation(
                votes=[],
                consensus="ERROR",
                consensus_confidence=0.0,
                key_agreements=[],
                key_disagreements=["No vision providers available"],
                final_assessment="Cannot verify without visual analysis capability"
            )
        
        # Determine consensus
        passed_votes = sum(1 for v in votes if v.passed)
        total_votes = len(votes)
        
        if passed_votes == total_votes:
            consensus = "PASS"
        elif passed_votes == 0:
            consensus = "FAIL"
        else:
            consensus = "NEEDS_REVIEW"
        
        avg_confidence = sum(v.confidence for v in votes) / max(total_votes, 1)
        
        # Find agreements and disagreements
        all_anomalies = []
        for v in votes:
            all_anomalies.extend(v.anomalies)
        
        from collections import Counter
        anomaly_counts = Counter(all_anomalies)
        agreements = [a for a, c in anomaly_counts.items() if c >= 2]
        disagreements = [a for a, c in anomaly_counts.items() if c == 1]
        
        # Log results
        for vote in votes:
            status = "✓" if vote.passed else "✗"
            logger.info(f"     {status} {vote.model}: {vote.confidence:.0%} confident")
        
        return VisualDeliberation(
            votes=votes,
            consensus=consensus,
            consensus_confidence=avg_confidence,
            key_agreements=agreements[:5],
            key_disagreements=disagreements[:5],
            final_assessment=self._generate_final_assessment(votes, consensus)
        )
    
    def _call_openai_vision(self, base64_image: str, prompt: str) -> VisualVote:
        """Call OpenAI Vision (vision role)"""
        try:
            import openai
            
            client = openai.OpenAI(api_key=self.openai_key)
            
            response = client.chat.completions.create(
                model=get_default_model("vision"),
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                        ]
                    }
                ],
                max_tokens=1024
            )
            
            return self._parse_vote("GPT-5.2", response.choices[0].message.content)
            
        except Exception as e:
            logger.error(f"OpenAI Vision error: {e}")
            return VisualVote(
                model="GPT-5.2",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    def _call_anthropic_vision(self, base64_image: str, prompt: str) -> VisualVote:
        """Call Anthropic Claude Vision"""
        try:
            import anthropic
            
            client = anthropic.Anthropic(api_key=self.anthropic_key)
            
            response = client.messages.create(
                model=get_default_model("anthropic_top"),
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64_image}},
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
            )
            
            return self._parse_vote("Claude", response.content[0].text)
            
        except Exception as e:
            logger.error(f"Claude Vision error: {e}")
            return VisualVote(
                model="Claude",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    def _call_gemini_vision(self, base64_image: str, prompt: str) -> VisualVote:
        """Call Gemini Vision"""
        try:
            import google.generativeai as genai
            from PIL import Image
            import io
            
            genai.configure(api_key=self.gemini_key)
            model = genai.GenerativeModel(get_default_model("google_top"))
            
            # Decode image for Gemini
            image_bytes = base64.b64decode(base64_image)
            image = Image.open(io.BytesIO(image_bytes))
            
            response = model.generate_content([prompt, image])
            
            return self._parse_vote("Gemini", response.text)
            
        except Exception as e:
            logger.error(f"Gemini Vision error: {e}")
            return VisualVote(
                model="Gemini",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    def _parse_vote(self, model: str, response: str) -> VisualVote:
        """Parse a VLM response into a vote"""
        passed = True
        confidence = 0.7
        anomalies = []
        recommendations = []
        
        response_upper = response.upper()
        
        # Check for explicit pass/fail
        if any(k in response_upper for k in ['FAIL', 'NOT ACCEPTABLE', 'ISSUES FOUND', 'PROBLEMS']):
            passed = False
        if any(k in response_upper for k in ['PASS', 'ACCEPTABLE', 'LOOKS GOOD', 'NO ISSUES']):
            passed = True
        
        # Extract confidence
        conf_match = re.search(r'CONFIDENCE[:\s]*([0-9.]+)', response, re.IGNORECASE)
        if conf_match:
            try:
                confidence = float(conf_match.group(1))
                if confidence > 1:
                    confidence = confidence / 100
            except:
                pass
        
        # Extract anomalies/issues
        for pattern in ['ANOMALIES', 'ISSUES', 'PROBLEMS']:
            items = self._extract_list(response, pattern)
            if items:
                anomalies.extend(items)
                break
        
        # Extract recommendations
        for pattern in ['RECOMMENDATION', 'SUGGESTIONS', 'FIX']:
            items = self._extract_list(response, pattern)
            if items:
                recommendations.extend(items)
                break
        
        return VisualVote(
            model=model,
            passed=passed,
            confidence=confidence,
            observations=response[:500],
            anomalies=anomalies[:5],
            recommendations=recommendations[:5]
        )
    
    def _extract_list(self, text: str, key: str) -> List[str]:
        """Extract a list from response"""
        items = []
        lines = text.split('\n')
        in_section = False
        
        for line in lines:
            if key.upper() in line.upper():
                in_section = True
                if ':' in line:
                    content = line.split(':', 1)[1].strip()
                    if content and not content.startswith('['):
                        items.append(content)
                continue
            if in_section:
                if line.strip().startswith('-'):
                    items.append(line.strip()[1:].strip())
                elif line.strip().startswith(('1.', '2.', '3.')):
                    items.append(re.sub(r'^\d+\.\s*', '', line.strip()))
                elif line.strip() and line.strip()[0].isupper() and ':' in line:
                    break
        
        return items[:5]
    
    def _generate_final_assessment(self, votes: List[VisualVote], consensus: str) -> str:
        """Generate a final assessment from all votes"""
        if consensus == "PASS":
            return "Visual Council APPROVED: All members agree the visual appearance is acceptable."
        elif consensus == "FAIL":
            all_issues = []
            for v in votes:
                all_issues.extend(v.anomalies)
            return f"Visual Council REJECTED: Issues found - {', '.join(set(all_issues)[:3])}"
        else:
            passed = [v.model for v in votes if v.passed]
            failed = [v.model for v in votes if not v.passed]
            return f"Visual Council SPLIT: {', '.join(passed)} approve, {', '.join(failed)} have concerns"


# =============================================================================
# BASE VISUAL SENTINEL
# =============================================================================

class BaseVisualSentinel(ABC):
    """
    Abstract base class for Visual Sentinel implementations.
    
    Subclass this for domain-specific visual verification
    (Excel, web pages, PDFs, etc.)
    """
    
    def __init__(
        self,
        output_dir: Optional[Path] = None,
        use_council: bool = True
    ):
        # Default to logs/visual_captures relative to project root (not CWD!)
        default_dir = Path(__file__).parent.parent.parent / "logs" / "visual_captures"
        self.output_dir = output_dir or default_dir
        self.output_dir.mkdir(exist_ok=True)
        self.use_council = use_council
        
        # Initialize Visual Council
        self.council = VisualCouncil()
        
        # Capture cache
        self.captures: Dict[str, VisualCapture] = {}
        self.verifications: List[VisualVerification] = []
        
        logger.info("=" * 60)
        logger.info("👁️ VISUAL SENTINEL INITIALIZED")
        logger.info("=" * 60)
    
    @abstractmethod
    def capture(self, target: str, **kwargs) -> Optional[VisualCapture]:
        """Capture a screenshot of the target. Override in subclass."""
        pass
    
    def _encode_image(self, image_path: Path) -> Optional[str]:
        """Encode image to base64 for VLM API"""
        try:
            with open(image_path, 'rb') as f:
                return base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to encode image: {e}")
            return None
    
    def verify(
        self, 
        capture: VisualCapture, 
        prompt: str,
        check_type: VisualCheckType = VisualCheckType.CUSTOM
    ) -> VisualVerification:
        """
        Verify a capture against expectations using the visual council.
        """
        if not capture.base64_data:
            return VisualVerification(
                check_type=check_type,
                status=VerificationStatus.ERROR,
                confidence=0.0,
                description="No image data available",
                anomalies=["Image capture not available"],
                reasoning="Cannot verify without visual capture"
            )
        
        # Use Visual Council
        deliberation = self.council.deliberate(capture.base64_data, prompt)
        
        # Map consensus to status
        if deliberation.consensus == "PASS":
            status = VerificationStatus.PASSED
        elif deliberation.consensus == "FAIL":
            status = VerificationStatus.FAILED
        else:
            status = VerificationStatus.NEEDS_REVIEW
        
        verification = VisualVerification(
            check_type=check_type,
            status=status,
            confidence=deliberation.consensus_confidence,
            description=deliberation.final_assessment,
            anomalies=deliberation.key_agreements,
            reasoning=deliberation.final_assessment,
            recommendations=[r for v in deliberation.votes for r in v.recommendations][:5],
            council_deliberation=deliberation
        )
        
        self.verifications.append(verification)
        return verification
    
    def compare(
        self, 
        before: VisualCapture, 
        after: VisualCapture,
        comparison_prompt: Optional[str] = None
    ) -> VisualDiff:
        """
        Compare before and after screenshots.
        
        This is THE killer feature - it detects visual regressions
        that code would never catch.
        """
        if not before.base64_data or not after.base64_data:
            return VisualDiff(
                before_capture=before,
                after_capture=after,
                changes_detected=["Unable to compare - missing images"],
                regressions=["Image capture not available"],
                improvements=[],
                overall_assessment="CANNOT_VERIFY"
            )
        
        prompt = comparison_prompt or """You are comparing two versions of a visual: BEFORE and AFTER an update.

Analyze the differences:

1. DATA CHANGES: What data appears different?
2. FORMATTING: Did visual styling survive the update?
3. LAYOUT: Did the structure/alignment stay the same?
4. REGRESSIONS: Did anything get WORSE visually?
5. IMPROVEMENTS: Did anything get BETTER?

Respond in this format:
DATA_CHANGES: [describe what changed]
FORMATTING_PRESERVED: [YES/NO, explain]
LAYOUT_PRESERVED: [YES/NO, explain]
REGRESSIONS: [list any visual problems introduced]
IMPROVEMENTS: [list any visual improvements]
OVERALL: [ACCEPTABLE/NEEDS_REVIEW/UNACCEPTABLE]
CONFIDENCE: [0.0-1.0]"""

        # For comparison, need to handle both images
        # This requires special handling - use OpenAI which supports multiple images
        if self.council.openai_key:
            result = self._compare_with_openai(before.base64_data, after.base64_data, prompt)
        elif self.council.anthropic_key:
            # Anthropic also supports it
            result = self._compare_with_anthropic(before.base64_data, after.base64_data, prompt)
        else:
            result = "ERROR: Need vision provider that supports multiple images for comparison"
        
        # Parse result
        regressions = self._extract_items(result, "REGRESSIONS")
        improvements = self._extract_items(result, "IMPROVEMENTS")
        changes = self._extract_items(result, "DATA_CHANGES")
        
        overall = "ACCEPTABLE"
        if "UNACCEPTABLE" in result.upper():
            overall = "UNACCEPTABLE"
        elif "NEEDS_REVIEW" in result.upper():
            overall = "NEEDS_REVIEW"
        
        return VisualDiff(
            before_capture=before,
            after_capture=after,
            changes_detected=changes or ["See observations"],
            regressions=regressions,
            improvements=improvements,
            overall_assessment=overall
        )
    
    def _compare_with_openai(self, before_b64: str, after_b64: str, prompt: str) -> str:
        """Compare two images using GPT-5.2"""
        try:
            import openai
            
            client = openai.OpenAI(api_key=self.council.openai_key)
            
            response = client.chat.completions.create(
                model=get_default_model("vision"),
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "IMAGE 1 - BEFORE:"},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{before_b64}"}},
                            {"type": "text", "text": "IMAGE 2 - AFTER:"},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{after_b64}"}},
                            {"type": "text", "text": prompt}
                        ]
                    }
                ],
                max_tokens=1024
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"OpenAI comparison error: {e}")
            return f"ERROR: {e}"
    
    def _compare_with_anthropic(self, before_b64: str, after_b64: str, prompt: str) -> str:
        """Compare two images using Claude"""
        try:
            import anthropic
            
            client = anthropic.Anthropic(api_key=self.council.anthropic_key)
            
            response = client.messages.create(
                model=get_default_model("anthropic_top"),
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "IMAGE 1 - BEFORE:"},
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": before_b64}},
                            {"type": "text", "text": "IMAGE 2 - AFTER:"},
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": after_b64}},
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
            )
            
            return response.content[0].text
            
        except Exception as e:
            logger.error(f"Anthropic comparison error: {e}")
            return f"ERROR: {e}"
    
    def _extract_items(self, text: str, key: str) -> List[str]:
        """Extract list items following a key"""
        items = []
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            if key.upper() in line.upper():
                if ':' in line:
                    content = line.split(':', 1)[1].strip()
                    if content:
                        items.append(content)
                for next_line in lines[i+1:i+6]:
                    if next_line.strip().startswith('-'):
                        items.append(next_line.strip()[1:].strip())
                    elif next_line.strip() and ':' in next_line and next_line.strip()[0].isupper():
                        break
                break
        
        return items
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all visual verifications"""
        passed = sum(1 for v in self.verifications if v.status == VerificationStatus.PASSED)
        total = len(self.verifications)
        
        return {
            'captures': len(self.captures),
            'verifications': total,
            'passed': passed,
            'failed': sum(1 for v in self.verifications if v.status == VerificationStatus.FAILED),
            'needs_review': sum(1 for v in self.verifications if v.status == VerificationStatus.NEEDS_REVIEW),
            'pass_rate': passed / max(total, 1)
        }


# =============================================================================
# SIMPLE SCREENSHOT SENTINEL (Using Playwright)
# =============================================================================

class WebVisualSentinel(BaseVisualSentinel):
    """
    Visual Sentinel for web pages using Playwright.
    
    Usage:
        sentinel = WebVisualSentinel()
        capture = sentinel.capture('http://localhost:3000')
        verification = sentinel.verify(capture, "Check if login form is visible")
    """
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._browser = None
        self._playwright = None
    
    def capture(
        self, 
        url: str, 
        selector: Optional[str] = None,
        full_page: bool = False,
        **kwargs
    ) -> Optional[VisualCapture]:
        """Capture a screenshot of a web page"""
        try:
            from playwright.sync_api import sync_playwright
            
            capture_id = hashlib.md5(url.encode()).hexdigest()[:8]
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            image_path = self.output_dir / f"web_{capture_id}_{timestamp}.png"
            
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(url, wait_until="networkidle")
                
                if selector:
                    element = page.locator(selector)
                    element.screenshot(path=str(image_path))
                else:
                    page.screenshot(path=str(image_path), full_page=full_page)
                
                browser.close()
            
            capture = VisualCapture(
                id=capture_id,
                source=url,
                image_path=str(image_path),
                timestamp=timestamp,
                capture_method='playwright',
                base64_data=self._encode_image(image_path)
            )
            
            self.captures[capture_id] = capture
            logger.info(f"  📸 Captured {url}")
            return capture
            
        except Exception as e:
            logger.error(f"Web capture failed: {e}")
            return None


# Factory functions
def create_visual_council() -> VisualCouncil:
    """Create a visual council instance."""
    return VisualCouncil()


def create_web_sentinel(output_dir: Optional[Path] = None) -> WebVisualSentinel:
    """Create a web visual sentinel instance."""
    return WebVisualSentinel(output_dir=output_dir)
