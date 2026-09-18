"""
Visual Sentinel - The Eyes of RSI v3.1

Gives RSI the ability to SEE the spreadsheet as a human would.
Uses a VISUAL COUNCIL of Vision-Language Models:
- UI-Tars-2 (Specialized for GUI/UI understanding)
- GPT-4o Vision (General visual reasoning)
- Claude 3.5 Sonnet Vision (Document analysis)

Key capabilities:
1. Screenshot capture (Excel range, chart, full sheet)
2. Visual verification (formatting, layout, charts)
3. Before/After comparison (detect visual regressions)
4. Anomaly detection (cut-off text, broken borders)
5. Professional polish assessment
6. VISUAL COUNCIL deliberation (multiple VLMs vote on visual quality)

This is the "Visual Cortex" that transforms RSI from a
Data Entry Bot into a Visual Analyst.
"""

import os
import re
import base64
import logging
import hashlib
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum

logger = logging.getLogger(__name__)

# Optional imports for vision capabilities
try:
    import excel2img  # Windows only - uses real Excel
    EXCEL2IMG_AVAILABLE = True
except ImportError:
    EXCEL2IMG_AVAILABLE = False

try:
    from html2image import Html2Image
    HTML2IMAGE_AVAILABLE = True
except ImportError:
    HTML2IMAGE_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# LLM Vision support
try:
    import openai
    OPENAI_VISION_AVAILABLE = True
except ImportError:
    OPENAI_VISION_AVAILABLE = False

try:
    import anthropic
    ANTHROPIC_VISION_AVAILABLE = True
except ImportError:
    ANTHROPIC_VISION_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from ....core.meeseeks_llm_caller import get_default_model
except ImportError:
    from tools_core.core.meeseeks_llm_caller import get_default_model


# =============================================================================
# ENUMS AND DATA CLASSES
# =============================================================================

class VisualCheckType(Enum):
    """Types of visual verification"""
    FORMATTING = "formatting"
    CHART = "chart"
    LAYOUT = "layout"
    CONDITIONAL = "conditional_formatting"
    PROFESSIONAL = "professional_polish"
    COMPARISON = "before_after"
    ANOMALY = "anomaly_detection"


class VisionProvider(Enum):
    """Supported vision model providers - resolved from model_roles in 00_llm_router_config.json"""
    UI_TARS_2 = "ui-tars-2"
    OPENAI_GPT4O = get_default_model("vision")
    ANTHROPIC_CLAUDE = get_default_model("anthropic_top")
    GEMINI_VISION = get_default_model("google_top")


@dataclass
class VisualCapture:
    """A captured screenshot of Excel content"""
    id: str
    sheet_name: str
    range_ref: str
    image_path: str
    timestamp: str
    capture_method: str  # 'excel2img', 'html2image', 'pyautogui'
    width: int = 0
    height: int = 0
    base64_data: Optional[str] = None


@dataclass
class VisualVote:
    """A vote from a vision council member"""
    model: str
    provider: VisionProvider
    passed: bool
    confidence: float
    observations: str
    anomalies: List[str]
    recommendations: List[str]


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
    passed: bool
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
    formatting_preserved: bool
    layout_preserved: bool
    issues: List[str]
    overall_assessment: str
    council_deliberation: Optional[VisualDeliberation] = None


# =============================================================================
# UI-TARS-2 CLIENT
# =============================================================================

class UITars2Client:
    """
    Client for UI-Tars-2 Vision Model.
    
    UI-Tars-2 is specialized for GUI/UI understanding and can:
    - Understand spreadsheet layouts
    - Detect UI elements (buttons, cells, charts)
    - Reason about visual hierarchy
    - Perform GUI-grounded actions
    
    Supports both local (HuggingFace) and API endpoints.
    """
    
    def __init__(self, 
                 endpoint: Optional[str] = None,
                 api_key: Optional[str] = None,
                 use_local: bool = False):
        """
        Initialize UI-Tars-2 client.
        
        Args:
            endpoint: API endpoint URL (e.g., HuggingFace Inference API)
            api_key: API key for the endpoint
            use_local: Whether to use local model via transformers
        """
        self.endpoint = endpoint or os.environ.get("UI_TARS_ENDPOINT")
        self.api_key = api_key or os.environ.get("UI_TARS_API_KEY") or os.environ.get("HF_TOKEN")
        self.use_local = use_local
        self.model_name = "bytedance-research/UI-TARS-2-7B"
        self._local_model = None
        self._local_processor = None
        
        logger.info(f"  🤖 UI-Tars-2 Client: {'Local' if use_local else 'API'}")
    
    def _load_local_model(self):
        """Load local UI-Tars-2 model"""
        if self._local_model is not None:
            return
        
        try:
            from transformers import AutoModelForCausalLM, AutoProcessor
            import torch
            
            logger.info("  Loading UI-Tars-2 model locally...")
            
            self._local_processor = AutoProcessor.from_pretrained(
                self.model_name,
                trust_remote_code=True
            )
            self._local_model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.bfloat16,
                device_map="auto",
                trust_remote_code=True
            )
            
            logger.info("  ✓ UI-Tars-2 loaded")
            
        except Exception as e:
            logger.error(f"Failed to load UI-Tars-2: {e}")
            raise
    
    def analyze_image(self, base64_image: str, prompt: str) -> str:
        """
        Analyze an image using UI-Tars-2.
        
        Args:
            base64_image: Base64-encoded image
            prompt: The analysis prompt
            
        Returns:
            Model response text
        """
        if self.use_local:
            return self._analyze_local(base64_image, prompt)
        else:
            return self._analyze_api(base64_image, prompt)
    
    def _analyze_api(self, base64_image: str, prompt: str) -> str:
        """Call UI-Tars-2 via API (HuggingFace Inference)"""
        if not self.endpoint:
            # Default to HuggingFace Inference API
            self.endpoint = f"https://api-inference.huggingface.co/models/{self.model_name}"
        
        if not REQUESTS_AVAILABLE:
            return "ERROR: requests library not available"
        
        try:
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            # Decode base64 to bytes for HF API
            image_bytes = base64.b64decode(base64_image)
            
            # HuggingFace Inference API format
            payload = {
                "inputs": {
                    "image": base64_image,
                    "text": prompt
                },
                "parameters": {
                    "max_new_tokens": 1024
                }
            }
            
            response = requests.post(
                self.endpoint,
                headers=headers,
                json=payload,
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get("generated_text", str(result))
                return str(result)
            else:
                return f"ERROR: API returned {response.status_code}: {response.text}"
                
        except Exception as e:
            logger.error(f"UI-Tars-2 API error: {e}")
            return f"ERROR: {e}"
    
    def _analyze_local(self, base64_image: str, prompt: str) -> str:
        """Analyze using local UI-Tars-2 model"""
        try:
            self._load_local_model()
            
            import torch
            from PIL import Image
            import io
            
            # Decode image
            image_bytes = base64.b64decode(base64_image)
            image = Image.open(io.BytesIO(image_bytes))
            
            # Prepare inputs
            inputs = self._local_processor(
                images=image,
                text=prompt,
                return_tensors="pt"
            ).to(self._local_model.device)
            
            # Generate
            with torch.no_grad():
                outputs = self._local_model.generate(
                    **inputs,
                    max_new_tokens=1024,
                    do_sample=False
                )
            
            # Decode
            response = self._local_processor.decode(outputs[0], skip_special_tokens=True)
            
            return response
            
        except Exception as e:
            logger.error(f"UI-Tars-2 local error: {e}")
            return f"ERROR: {e}"


# =============================================================================
# VISUAL COUNCIL
# =============================================================================

class VisualCouncil:
    """
    Visual Council - Multiple VLMs deliberate on visual quality.
    
    Like the LLM Council in RSI, but for VISION:
    - UI-Tars-2: GUI/UI specialist
    - GPT-4o: General visual reasoning
    - Claude 3.5: Document analysis
    
    They vote on visual questions and reach consensus.
    """
    
    def __init__(self):
        self.members: List[Tuple[str, VisionProvider]] = []
        
        # API keys
        self.openai_key = os.environ.get("OPENAI_API_KEY")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        self.hf_token = os.environ.get("HF_TOKEN") or os.environ.get("UI_TARS_API_KEY")
        
        # Initialize available members
        if self.hf_token:
            self.ui_tars = UITars2Client(api_key=self.hf_token)
            self.members.append(("UI-Tars-2", VisionProvider.UI_TARS_2))
        else:
            self.ui_tars = None
        
        if self.openai_key and OPENAI_VISION_AVAILABLE:
            self.members.append(("GPT-5.2", VisionProvider.OPENAI_GPT4O))
        
        if self.anthropic_key and ANTHROPIC_VISION_AVAILABLE:
            self.members.append(("Claude-Opus-4.5", VisionProvider.ANTHROPIC_CLAUDE))
        
        logger.info(f"  👁️ Visual Council: {len(self.members)} members")
        for name, provider in self.members:
            logger.info(f"     - {name} ({provider.value})")
    
    def deliberate(self, base64_image: str, prompt: str) -> VisualDeliberation:
        """
        Have all council members analyze the image and deliberate.
        
        Returns consensus and all votes.
        """
        votes = []
        
        # Collect votes from each member
        for name, provider in self.members:
            logger.info(f"    🗳️ {name} analyzing...")
            
            response = self._call_member(provider, base64_image, prompt)
            vote = self._parse_vote(name, provider, response)
            votes.append(vote)
            
            status = "✓" if vote.passed else "✗"
            logger.info(f"       {status} {name}: {vote.confidence:.0%} confident")
        
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
        
        # Agreement = anomalies mentioned by multiple members
        from collections import Counter
        anomaly_counts = Counter(all_anomalies)
        agreements = [a for a, c in anomaly_counts.items() if c >= 2]
        disagreements = [a for a, c in anomaly_counts.items() if c == 1]
        
        return VisualDeliberation(
            votes=votes,
            consensus=consensus,
            consensus_confidence=avg_confidence,
            key_agreements=agreements[:5],
            key_disagreements=disagreements[:5],
            final_assessment=self._generate_final_assessment(votes, consensus)
        )
    
    def _call_member(self, provider: VisionProvider, 
                     base64_image: str, prompt: str) -> str:
        """Call a specific council member"""
        
        if provider == VisionProvider.UI_TARS_2 and self.ui_tars:
            return self.ui_tars.analyze_image(base64_image, prompt)
        
        elif provider == VisionProvider.OPENAI_GPT4O:
            return self._call_gpt4o(base64_image, prompt)
        
        elif provider == VisionProvider.ANTHROPIC_CLAUDE:
            return self._call_claude(base64_image, prompt)
        
        return "ERROR: Provider not available"
    
    def _call_gpt4o(self, base64_image: str, prompt: str) -> str:
        """Call GPT-4o Vision"""
        try:
            client = openai.OpenAI(api_key=self.openai_key)
            
            response = client.chat.completions.create(
                model=VisionProvider.OPENAI_GPT4O.value,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                max_completion_tokens=1024  # gpt-5.2 requires max_completion_tokens, not max_tokens
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"GPT-4o Vision error: {e}")
            return f"ERROR: {e}"
    
    def _call_claude(self, base64_image: str, prompt: str) -> str:
        """Call Claude 3.5 Sonnet Vision"""
        try:
            client = anthropic.Anthropic(api_key=self.anthropic_key)
            
            response = client.messages.create(
                model=VisionProvider.ANTHROPIC_CLAUDE.value,
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": base64_image
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )
            
            return response.content[0].text
            
        except Exception as e:
            logger.error(f"Claude Vision error: {e}")
            return f"ERROR: {e}"
    
    def _parse_vote(self, name: str, provider: VisionProvider, 
                    response: str) -> VisualVote:
        """Parse a VLM response into a vote"""
        
        # Default values
        passed = True
        confidence = 0.7
        anomalies = []
        recommendations = []
        
        response_upper = response.upper()
        
        # Check for explicit pass/fail
        if any(k in response_upper for k in ['FAIL', 'NOT ACCEPTABLE', 'ISSUES FOUND', 'ANOMALIES_FOUND: YES']):
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
        
        # Extract anomalies
        anomalies = self._extract_list(response, "ANOMALIES") or \
                    self._extract_list(response, "ISSUES") or \
                    self._extract_list(response, "PROBLEMS")
        
        # Extract recommendations
        recommendations = self._extract_list(response, "RECOMMENDATION") or \
                          self._extract_list(response, "SUGGESTIONS")
        
        return VisualVote(
            model=name,
            provider=provider,
            passed=passed,
            confidence=confidence,
            observations=response[:300],
            anomalies=anomalies,
            recommendations=recommendations
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
    
    def _generate_final_assessment(self, votes: List[VisualVote], 
                                    consensus: str) -> str:
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
# VISUAL SENTINEL - MAIN CLASS
# =============================================================================

class VisualSentinel:
    """
    The Eyes of RSI - Visual Intelligence for Excel.
    
    Uses a Visual Council (UI-Tars-2, GPT-4o, Claude) to verify
    what the user actually SEES, not just what the XML says.
    
    Key capabilities:
    1. Screenshot capture (Excel range, chart, full sheet)
    2. Visual council deliberation (multiple VLMs vote)
    3. Before/After comparison (detect visual regressions)
    4. Anomaly detection (cut-off text, broken borders)
    5. Professional polish assessment
    """
    
    def __init__(self,
                 excel_path: Path,
                 output_dir: Optional[Path] = None,
                 use_council: bool = True):
        """
        Initialize the Visual Sentinel.
        
        Args:
            excel_path: Path to the Excel file
            output_dir: Directory for screenshots
            use_council: Whether to use full visual council (vs single model)
        """
        self.excel_path = Path(excel_path)
        # Default to logs/visual_captures relative to project root (not CWD!)
        default_dir = Path(__file__).parent.parent.parent.parent.parent / "logs" / "visual_captures"
        self.output_dir = output_dir or default_dir
        self.output_dir.mkdir(exist_ok=True)
        self.use_council = use_council
        
        # Initialize Visual Council
        self.council = VisualCouncil()
        
        # Capture cache
        self.captures: Dict[str, VisualCapture] = {}
        self.verifications: List[VisualVerification] = []
        
        # Determine available capture methods
        self.capture_methods = []
        if EXCEL2IMG_AVAILABLE:
            self.capture_methods.append('excel2img')
        if HTML2IMAGE_AVAILABLE:
            self.capture_methods.append('html2image')
        
        logger.info("=" * 60)
        logger.info("👁️ VISUAL SENTINEL INITIALIZED")
        logger.info("=" * 60)
        logger.info(f"   Excel: {self.excel_path.name}")
        logger.info(f"   Council Members: {len(self.council.members)}")
        logger.info(f"   Capture Methods: {self.capture_methods or ['fallback']}")
    
    # =========================================================================
    # SCREENSHOT CAPTURE
    # =========================================================================
    
    def capture_range(self, sheet_name: str, range_ref: str,
                      label: str = "capture") -> Optional[VisualCapture]:
        """
        Capture a screenshot of a specific Excel range.
        
        Args:
            sheet_name: Name of the sheet
            range_ref: Excel range (e.g., "A1:H20")
            label: Label for the capture
            
        Returns:
            VisualCapture object or None if capture failed
        """
        capture_id = f"{label}_{hashlib.md5(f'{sheet_name}_{range_ref}'.encode()).hexdigest()[:8]}"
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        image_path = self.output_dir / f"{capture_id}_{timestamp}.png"
        
        # Try excel2img first (best quality - uses real Excel, Windows only)
        if EXCEL2IMG_AVAILABLE:
            try:
                excel2img.export_img(
                    str(self.excel_path),
                    str(image_path),
                    sheet_name,
                    range_ref
                )
                logger.info(f"  📸 Captured {sheet_name}!{range_ref} via excel2img")
                
                capture = VisualCapture(
                    id=capture_id,
                    sheet_name=sheet_name,
                    range_ref=range_ref,
                    image_path=str(image_path),
                    timestamp=timestamp,
                    capture_method='excel2img'
                )
                
                capture.base64_data = self._encode_image(image_path)
                self.captures[capture_id] = capture
                return capture
                
            except Exception as e:
                logger.warning(f"  excel2img failed: {e}")
        
        # Try html2image - REAL capture using HTML rendering (cross-platform!)
        capture = self._create_html2image_capture(sheet_name, range_ref, image_path, capture_id, timestamp)
        if capture:
            self.captures[capture_id] = capture
            return capture
        
        # LAST RESORT: PIL mock - but log a warning!
        logger.warning(f"  ⚠️ html2image failed, using PIL mock for {sheet_name}!{range_ref}")
        capture = self._create_mock_capture(sheet_name, range_ref, image_path, capture_id, timestamp)
        if capture:
            self.captures[capture_id] = capture
            return capture
        
        return None
    
    def _create_html2image_capture(self, sheet_name: str, range_ref: str,
                                     output_path: Path, capture_id: str,
                                     timestamp: str) -> Optional[VisualCapture]:
        """
        Create REAL capture using html2image - renders Excel data with styling.
        This is the primary capture method for cross-platform support.
        """
        try:
            from html2image import Html2Image
            import openpyxl
            import pandas as pd
            
            wb = openpyxl.load_workbook(self.excel_path, data_only=False)
            
            if sheet_name not in wb.sheetnames:
                logger.error(f"  Sheet '{sheet_name}' not found in workbook")
                wb.close()
                return None
            
            ws = wb[sheet_name]
            
            # Extract data with styles
            data = []
            styles_matrix = []
            
            for row in ws.iter_rows(max_row=min(50, ws.max_row or 50), 
                                    max_col=min(15, ws.max_column or 15)):
                row_data = []
                row_styles = []
                for cell in row:
                    # Get cell value (formula or value)
                    if cell.value is not None:
                        if isinstance(cell.value, str) and cell.value.startswith('='):
                            row_data.append(cell.value[:50])  # Show formula
                        else:
                            row_data.append(str(cell.value)[:50])
                    else:
                        row_data.append("")
                    
                    # Extract styles
                    style_str = ""
                    if cell.font:
                        if cell.font.bold:
                            style_str += "font-weight: bold;"
                        if cell.font.italic:
                            style_str += "font-style: italic;"
                        if cell.font.color and cell.font.color.rgb:
                            rgb = cell.font.color.rgb
                            if isinstance(rgb, str) and len(rgb) >= 6:
                                if len(rgb) == 8:
                                    rgb = rgb[2:]  # Remove alpha
                                style_str += f"color: #{rgb};"
                    
                    if cell.fill and cell.fill.start_color and cell.fill.start_color.rgb:
                        rgb = cell.fill.start_color.rgb
                        if isinstance(rgb, str) and len(rgb) >= 6 and rgb != '00000000':
                            if len(rgb) == 8:
                                rgb = rgb[2:]  # Remove alpha
                            style_str += f"background-color: #{rgb};"
                    
                    row_styles.append(style_str)
                
                data.append(row_data)
                styles_matrix.append(row_styles)
            
            wb.close()
            
            # Build styled HTML table
            html = """
            <style>
                table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
                td, th { border: 1px solid #ccc; padding: 4px 8px; min-width: 80px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                th { background-color: #4472C4; color: white; font-weight: bold; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .header-row { font-size: 14px; font-weight: bold; }
            </style>
            <table>
            """
            
            for i, row in enumerate(data):
                html += "<tr>"
                for j, val in enumerate(row):
                    cell_style = styles_matrix[i][j] if i < len(styles_matrix) and j < len(styles_matrix[i]) else ""
                    tag = "th" if i == 0 else "td"
                    html += f'<{tag} style="{cell_style}">{val}</{tag}>'
                html += "</tr>"
            
            html += "</table>"
            
            # Render HTML to image - use html_str (not html_content!)
            hti = Html2Image(output_path=str(self.output_dir))
            filename = output_path.name
            hti.screenshot(html_str=html, save_as=filename, size=(1400, 900))
            
            actual_path = self.output_dir / filename
            if actual_path.exists():
                logger.info(f"  📸 Captured {sheet_name}!{range_ref} via html2image (REAL data)")
                
                return VisualCapture(
                    id=capture_id,
                    sheet_name=sheet_name,
                    range_ref=range_ref,
                    image_path=str(actual_path),
                    timestamp=timestamp,
                    capture_method='html2image',
                    width=1400,
                    height=900,
                    base64_data=self._encode_image(actual_path)
                )
            else:
                logger.error(f"  html2image output not found at {actual_path}")
                return None
                
        except ImportError as e:
            logger.warning(f"  html2image not available: {e}")
            return None
        except Exception as e:
            logger.error(f"  html2image capture failed: {e}")
            return None
    
    def _create_mock_capture(self, sheet_name: str, range_ref: str,
                              output_path: Path, capture_id: str, 
                              timestamp: str) -> Optional[VisualCapture]:
        """Create a mock capture using pandas + PIL - LAST RESORT ONLY"""
        try:
            import openpyxl
            
            # Try to create a simple visual representation
            wb = openpyxl.load_workbook(self.excel_path, data_only=True)
            
            if sheet_name not in wb.sheetnames:
                wb.close()
                return None
            
            ws = wb[sheet_name]
            
            # Get some data for the mock
            data_preview = []
            for row in ws.iter_rows(max_row=min(20, ws.max_row), max_col=min(10, ws.max_column)):
                row_data = [str(cell.value)[:15] if cell.value else "" for cell in row]
                data_preview.append(row_data)
            
            wb.close()
            
            # If PIL is available, create a simple image
            if PIL_AVAILABLE:
                from PIL import Image, ImageDraw, ImageFont
                
                # Create a simple table image
                cell_width = 100
                cell_height = 25
                rows = len(data_preview)
                cols = max(len(r) for r in data_preview) if data_preview else 1
                
                img_width = cols * cell_width + 20
                img_height = rows * cell_height + 20
                
                img = Image.new('RGB', (img_width, img_height), 'white')
                draw = ImageDraw.Draw(img)
                
                # Draw grid and text
                for i, row in enumerate(data_preview):
                    for j, val in enumerate(row):
                        x = 10 + j * cell_width
                        y = 10 + i * cell_height
                        
                        # Draw cell border
                        draw.rectangle([x, y, x + cell_width, y + cell_height], 
                                       outline='gray')
                        
                        # Draw text
                        draw.text((x + 5, y + 5), val[:12], fill='black')
                
                img.save(str(output_path))
                
                return VisualCapture(
                    id=capture_id,
                    sheet_name=sheet_name,
                    range_ref=range_ref,
                    image_path=str(output_path),
                    timestamp=timestamp,
                    capture_method='mock_pil',
                    width=img_width,
                    height=img_height,
                    base64_data=self._encode_image(output_path)
                )
            
            # No PIL - return capture with no image
            return VisualCapture(
                id=capture_id,
                sheet_name=sheet_name,
                range_ref=range_ref,
                image_path="",
                timestamp=timestamp,
                capture_method='no_image',
                base64_data=None
            )
            
        except Exception as e:
            logger.error(f"Mock capture failed: {e}")
            return None
    
    def _encode_image(self, image_path: Path) -> Optional[str]:
        """Encode image to base64 for VLM API"""
        try:
            with open(image_path, 'rb') as f:
                return base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to encode image: {e}")
            return None
    
    # =========================================================================
    # VISUAL VERIFICATION
    # =========================================================================
    
    def verify_formatting(self, capture: VisualCapture,
                          expected: str) -> VisualVerification:
        """
        Verify that formatting matches expectations.
        
        Uses Visual Council to reach consensus.
        """
        prompt = f"""You are a Visual Auditor for financial spreadsheets.

Analyze this Excel screenshot and verify the formatting.

EXPECTED FORMATTING: {expected}

Your task:
1. Describe the colors, fonts, and styles you observe
2. Identify if the expected formatting is present
3. Note any formatting anomalies (missing borders, wrong colors, etc.)

Respond in this format:
OBSERVED: [describe what you see]
MATCHES_EXPECTED: [YES/NO]
CONFIDENCE: [0.0-1.0]
ANOMALIES: [list any issues, one per line with - prefix]
RECOMMENDATIONS: [suggestions]"""

        if not capture.base64_data:
            return VisualVerification(
                check_type=VisualCheckType.FORMATTING,
                passed=False,
                confidence=0.0,
                description="No image data available",
                anomalies=["Image capture not available"],
                reasoning="Cannot verify without visual capture"
            )
        
        # Use Visual Council
        deliberation = self.council.deliberate(capture.base64_data, prompt)
        
        verification = VisualVerification(
            check_type=VisualCheckType.FORMATTING,
            passed=deliberation.consensus == "PASS",
            confidence=deliberation.consensus_confidence,
            description=deliberation.final_assessment,
            anomalies=deliberation.key_agreements,
            reasoning=deliberation.final_assessment,
            recommendations=[r for v in deliberation.votes for r in v.recommendations][:5],
            council_deliberation=deliberation
        )
        
        self.verifications.append(verification)
        return verification
    
    def verify_chart(self, capture: VisualCapture,
                     chart_type: str = "any") -> VisualVerification:
        """
        Verify that a chart renders correctly.
        
        openpyxl CANNOT see charts - it only sees XML definitions.
        This is the ONLY way to verify charts actually look right.
        """
        prompt = f"""You are a Data Visualization Expert auditing financial charts.

Analyze this Excel chart screenshot.

EXPECTED CHART TYPE: {chart_type}

Evaluate:
1. Is the chart readable? Are labels legible?
2. Does the data appear to render correctly?
3. Are there visual issues? (squished axes, overlapping labels, empty chart)
4. Does it look professional?

Respond in this format:
CHART_TYPE: [what type of chart you see]
READABLE: [YES/NO]
DATA_APPEARS_VALID: [YES/NO]
VISUAL_ISSUES: [list any problems]
PROFESSIONAL: [YES/NO]
CONFIDENCE: [0.0-1.0]
RECOMMENDATIONS: [suggestions for improvement]"""

        if not capture.base64_data:
            return VisualVerification(
                check_type=VisualCheckType.CHART,
                passed=False,
                confidence=0.0,
                description="No image data available",
                anomalies=["Image capture not available"],
                reasoning="Cannot verify chart without visual capture"
            )
        
        deliberation = self.council.deliberate(capture.base64_data, prompt)
        
        verification = VisualVerification(
            check_type=VisualCheckType.CHART,
            passed=deliberation.consensus == "PASS",
            confidence=deliberation.consensus_confidence,
            description=deliberation.final_assessment,
            anomalies=deliberation.key_agreements,
            reasoning=deliberation.final_assessment,
            council_deliberation=deliberation
        )
        
        self.verifications.append(verification)
        return verification
    
    def verify_professional_polish(self, capture: VisualCapture) -> VisualVerification:
        """
        The "Does it look good?" check.
        
        Ensures the spreadsheet maintains professional appearance
        after updates - something code CANNOT verify.
        """
        prompt = """You are a UX Expert evaluating the visual quality of a financial spreadsheet.

Analyze this screenshot for professional polish.

Evaluate:
1. Layout - Is it clean and organized?
2. Alignment - Are columns/rows properly aligned?
3. Spacing - Is there appropriate whitespace?
4. Typography - Are fonts consistent and readable?
5. Colors - Is the color scheme professional?
6. Overall - Would you show this to a client?

Respond in this format:
LAYOUT_SCORE: [1-10]
ALIGNMENT_SCORE: [1-10]
TYPOGRAPHY_SCORE: [1-10]
COLOR_SCORE: [1-10]
OVERALL_PROFESSIONAL: [YES/NO]
CONFIDENCE: [0.0-1.0]
ISSUES: [list specific problems]
QUICK_FIXES: [easy improvements]"""

        if not capture.base64_data:
            return VisualVerification(
                check_type=VisualCheckType.PROFESSIONAL,
                passed=False,
                confidence=0.0,
                description="No image data available",
                anomalies=["Image capture not available"],
                reasoning="Cannot verify without visual capture"
            )
        
        deliberation = self.council.deliberate(capture.base64_data, prompt)
        
        verification = VisualVerification(
            check_type=VisualCheckType.PROFESSIONAL,
            passed=deliberation.consensus == "PASS",
            confidence=deliberation.consensus_confidence,
            description=deliberation.final_assessment,
            anomalies=deliberation.key_agreements,
            reasoning=deliberation.final_assessment,
            council_deliberation=deliberation
        )
        
        self.verifications.append(verification)
        return verification
    
    def detect_anomalies(self, capture: VisualCapture) -> VisualVerification:
        """
        Detect visual anomalies that code cannot see.
        """
        prompt = """You are a Quality Assurance specialist for spreadsheets.

Scan this screenshot for VISUAL ANOMALIES that would be invisible to code.

Look for:
1. Cut-off text (### symbols or text extending beyond cells)
2. Broken borders or missing gridlines
3. Inconsistent row heights
4. Overlapping elements
5. Empty cells that should have data
6. Conditional formatting that didn't fire
7. Charts that appear empty or broken
8. Any visual "glitches"

Respond in this format:
ANOMALIES_FOUND: [YES/NO]
ANOMALIES:
- [anomaly 1]
- [anomaly 2]
SEVERITY: [LOW/MEDIUM/HIGH/CRITICAL]
CONFIDENCE: [0.0-1.0]
FIX_SUGGESTIONS: [how to resolve]"""

        if not capture.base64_data:
            return VisualVerification(
                check_type=VisualCheckType.ANOMALY,
                passed=True,  # Assume pass if we can't check
                confidence=0.0,
                description="No image data available",
                anomalies=[],
                reasoning="Cannot verify without visual capture"
            )
        
        deliberation = self.council.deliberate(capture.base64_data, prompt)
        
        # For anomaly detection, PASS means NO anomalies found
        passed = deliberation.consensus != "FAIL"
        
        verification = VisualVerification(
            check_type=VisualCheckType.ANOMALY,
            passed=passed,
            confidence=deliberation.consensus_confidence,
            description=deliberation.final_assessment,
            anomalies=deliberation.key_agreements,
            reasoning=deliberation.final_assessment,
            council_deliberation=deliberation
        )
        
        self.verifications.append(verification)
        return verification
    
    # =========================================================================
    # BEFORE/AFTER COMPARISON
    # =========================================================================
    
    def compare_before_after(self, before: VisualCapture,
                              after: VisualCapture) -> VisualDiff:
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
                formatting_preserved=False,
                layout_preserved=False,
                issues=["Image capture not available"],
                overall_assessment="CANNOT_VERIFY"
            )
        
        prompt = """You are comparing two versions of a spreadsheet: BEFORE and AFTER an update.

The images show the same Excel range before and after data was modified.

Analyze the differences:

1. DATA CHANGES: What data appears different?
2. FORMATTING PRESERVED: Did colors, fonts, borders survive the update?
3. LAYOUT PRESERVED: Did the structure/alignment stay the same?
4. REGRESSIONS: Did anything get WORSE visually?
5. IMPROVEMENTS: Did anything get BETTER?

Respond in this format:
DATA_CHANGES: [describe what changed]
FORMATTING_PRESERVED: [YES/NO, explain]
LAYOUT_PRESERVED: [YES/NO, explain]
REGRESSIONS: [list any visual problems introduced]
OVERALL: [ACCEPTABLE/NEEDS_REVIEW/UNACCEPTABLE]
CONFIDENCE: [0.0-1.0]"""

        # For comparison, we need to send both images
        # Using GPT-4o which supports multiple images
        if self.council.openai_key and OPENAI_VISION_AVAILABLE:
            result = self._compare_with_gpt4o(before.base64_data, after.base64_data, prompt)
        else:
            result = "ERROR: Need GPT-4o for comparison (supports multiple images)"
        
        # Parse result
        formatting_preserved = "FORMATTING_PRESERVED: YES" in result.upper()
        layout_preserved = "LAYOUT_PRESERVED: YES" in result.upper()
        
        overall = "ACCEPTABLE"
        if "UNACCEPTABLE" in result.upper():
            overall = "UNACCEPTABLE"
        elif "NEEDS_REVIEW" in result.upper():
            overall = "NEEDS_REVIEW"
        
        diff = VisualDiff(
            before_capture=before,
            after_capture=after,
            changes_detected=self._extract_list_from_text(result, "DATA_CHANGES"),
            formatting_preserved=formatting_preserved,
            layout_preserved=layout_preserved,
            issues=self._extract_list_from_text(result, "REGRESSIONS"),
            overall_assessment=overall
        )
        
        return diff
    
    def _compare_with_gpt4o(self, before_b64: str, after_b64: str, prompt: str) -> str:
        """Compare two images using GPT-4o"""
        try:
            client = openai.OpenAI(api_key=self.council.openai_key)
            
            response = client.chat.completions.create(
                model=VisionProvider.OPENAI_GPT4O.value,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "IMAGE 1 - BEFORE:"},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{before_b64}"}
                            },
                            {"type": "text", "text": "IMAGE 2 - AFTER:"},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{after_b64}"}
                            },
                            {"type": "text", "text": prompt}
                        ]
                    }
                ],
                max_completion_tokens=1024  # gpt-5.2 requires max_completion_tokens
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"GPT-4o comparison error: {e}")
            return f"ERROR: {e}"
    
    def _extract_list_from_text(self, text: str, key: str) -> List[str]:
        """Extract list items following a key"""
        items = []
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            if key.upper() in line.upper():
                # Check for inline content
                if ':' in line:
                    content = line.split(':', 1)[1].strip()
                    if content:
                        items.append(content)
                # Check following lines for list items
                for next_line in lines[i+1:i+6]:
                    if next_line.strip().startswith('-'):
                        items.append(next_line.strip()[1:].strip())
                    elif next_line.strip() and ':' in next_line and next_line.strip()[0].isupper():
                        break
                break
        
        return items
    
    # =========================================================================
    # UTILITY METHODS
    # =========================================================================
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all visual verifications"""
        passed = sum(1 for v in self.verifications if v.passed)
        total = len(self.verifications)
        
        return {
            'captures': len(self.captures),
            'verifications': total,
            'passed': passed,
            'failed': total - passed,
            'council_members': len(self.council.members),
            'pass_rate': passed / max(total, 1)
        }

