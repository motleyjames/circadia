"""
PDF Tools Registry - A collection of PDF manipulation approaches
that can be selected intelligently based on the task.
"""

import os
import subprocess
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from PIL import Image

# Core PDF libraries
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

# Try to import optional libraries
try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import Color
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

try:
    import pikepdf
    HAS_PIKEPDF = True
except ImportError:
    HAS_PIKEPDF = False


class PDFCapability(Enum):
    """What each tool can do"""
    FILL_FORM = "fill_form"
    ADD_TEXT = "add_text"
    ADD_WATERMARK = "add_watermark"
    MERGE_PAGES = "merge_pages"
    EXTRACT_TEXT = "extract_text"
    EXTRACT_IMAGES = "extract_images"
    RENDER_PAGE = "render_page"
    GENERATE_PAGE = "generate_page"
    EDIT_IMAGE = "edit_image"
    REPLACE_TEXT = "replace_text"
    ADD_ANNOTATION = "add_annotation"
    REDACT = "redact"
    COMPRESS = "compress"
    DETECT_FORMS = "detect_forms"


@dataclass
class PDFTool:
    """Represents a PDF manipulation tool/approach"""
    name: str
    description: str
    capabilities: List[PDFCapability]
    reliability: float  # 0-1, how reliable for its tasks
    speed: float  # 0-1, relative speed
    requires_ai: bool = False
    available: bool = True
    
    def can_do(self, capability: PDFCapability) -> bool:
        return capability in self.capabilities


# Tool Registry
TOOLS: Dict[str, PDFTool] = {
    "pypdf": PDFTool(
        name="pypdf",
        description="Pure Python PDF library for merging, splitting, form filling (AcroForms)",
        capabilities=[
            PDFCapability.FILL_FORM,
            PDFCapability.MERGE_PAGES,
            PDFCapability.ADD_WATERMARK,
            PDFCapability.DETECT_FORMS,
        ],
        reliability=0.9,
        speed=0.9,
        available=True
    ),
    "pymupdf": PDFTool(
        name="pymupdf",
        description="Fast C-based PDF library (fitz). Excellent for text insertion, annotations, rendering",
        capabilities=[
            PDFCapability.ADD_TEXT,
            PDFCapability.ADD_WATERMARK,
            PDFCapability.REPLACE_TEXT,
            PDFCapability.ADD_ANNOTATION,
            PDFCapability.RENDER_PAGE,
            PDFCapability.EXTRACT_TEXT,
            PDFCapability.EXTRACT_IMAGES,
            PDFCapability.FILL_FORM,
            PDFCapability.REDACT,
        ],
        reliability=0.95,
        speed=0.95,
        available=HAS_PYMUPDF
    ),
    "reportlab": PDFTool(
        name="reportlab",
        description="Generate new PDF pages from scratch with precise text/graphics placement",
        capabilities=[
            PDFCapability.GENERATE_PAGE,
            PDFCapability.ADD_TEXT,
            PDFCapability.ADD_WATERMARK,
        ],
        reliability=0.95,
        speed=0.8,
        available=HAS_REPORTLAB
    ),
    "pikepdf": PDFTool(
        name="pikepdf",
        description="Low-level PDF manipulation, good for repairs and structure changes",
        capabilities=[
            PDFCapability.MERGE_PAGES,
            PDFCapability.COMPRESS,
            PDFCapability.FILL_FORM,
        ],
        reliability=0.9,
        speed=0.85,
        available=HAS_PIKEPDF
    ),
    "gemini_image": PDFTool(
        name="gemini_image",
        description="AI image generation - regenerates entire page as image. Best for creative edits.",
        capabilities=[
            PDFCapability.EDIT_IMAGE,
            PDFCapability.GENERATE_PAGE,
            PDFCapability.ADD_WATERMARK,
            PDFCapability.REPLACE_TEXT,
        ],
        reliability=0.7,  # Can fail or produce blank pages
        speed=0.3,  # Slow API call
        requires_ai=True,
        available=True
    ),
}


def get_available_tools() -> List[PDFTool]:
    """Returns list of currently available tools"""
    return [t for t in TOOLS.values() if t.available]


def get_tools_for_capability(capability: PDFCapability) -> List[PDFTool]:
    """Returns tools that support a specific capability, sorted by reliability"""
    tools = [t for t in TOOLS.values() if t.available and t.can_do(capability)]
    return sorted(tools, key=lambda t: t.reliability, reverse=True)


def detect_pdf_features(pdf_path: str) -> Dict[str, Any]:
    """
    Analyzes a PDF to detect its features:
    - Has fillable form fields?
    - Is text-based or image-based?
    - Page count, dimensions, orientation, etc.
    """
    features = {
        "has_acroform": False,
        "has_xfa": False,
        "form_fields": [],
        "page_count": 0,
        "is_scanned": False,  # Image-based PDF
        "has_text": False,
        "page_width": 0,
        "page_height": 0,
        "orientation": "portrait",
        "page_size": (612, 792),  # Default letter
    }
    
    try:
        reader = PdfReader(pdf_path)
        features["page_count"] = len(reader.pages)
        
        # Get page dimensions from first page
        if reader.pages:
            first_page = reader.pages[0]
            width = float(first_page.mediabox.width)
            height = float(first_page.mediabox.height)
            features["page_width"] = width
            features["page_height"] = height
            features["page_size"] = (width, height)
            features["orientation"] = "landscape" if width > height else "portrait"
        
        # Check for AcroForm
        if "/AcroForm" in reader.trailer.get("/Root", {}):
            features["has_acroform"] = True
            
        # Get form fields if they exist
        if reader.get_fields():
            features["form_fields"] = list(reader.get_fields().keys())
            features["has_acroform"] = True
            
        # Check for XFA
        if hasattr(reader, 'xfa') and reader.xfa:
            features["has_xfa"] = True
            
        # Check if PDF has extractable text
        for page in reader.pages[:3]:  # Check first 3 pages
            text = page.extract_text()
            if text and len(text.strip()) > 50:
                features["has_text"] = True
                break
                
        # If no text found, likely scanned/image-based
        if not features["has_text"]:
            features["is_scanned"] = True
            
    except Exception as e:
        features["error"] = str(e)
        
    return features


def validate_page_dimensions(
    original_path: str, 
    edited_path: str, 
    page_num: int,
    tolerance: float = 5.0
) -> Tuple[bool, str]:
    """
    Validate that edited page has same dimensions as original.
    Returns (is_valid, message)
    """
    if not HAS_PYMUPDF:
        return True, "PyMuPDF not available for validation"
        
    try:
        orig_doc = fitz.open(original_path)
        edit_doc = fitz.open(edited_path)
        
        orig_page = orig_doc[page_num - 1]
        edit_page = edit_doc[page_num - 1]
        
        orig_rect = orig_page.rect
        edit_rect = edit_page.rect
        
        width_diff = abs(orig_rect.width - edit_rect.width)
        height_diff = abs(orig_rect.height - edit_rect.height)
        
        orig_doc.close()
        edit_doc.close()
        
        if width_diff > tolerance or height_diff > tolerance:
            return False, (
                f"Dimension mismatch: original={orig_rect.width:.0f}x{orig_rect.height:.0f}, "
                f"edited={edit_rect.width:.0f}x{edit_rect.height:.0f}"
            )
            
        return True, "Dimensions match"
        
    except Exception as e:
        return False, f"Validation error: {e}"


def fill_form_pypdf(pdf_path: str, field_values: Dict[str, str], output_path: str) -> bool:
    """Fill form fields using pypdf"""
    try:
        reader = PdfReader(pdf_path)
        writer = PdfWriter()
        
        writer.append(reader)
        writer.update_page_form_field_values(writer.pages[0], field_values)
        
        with open(output_path, "wb") as f:
            writer.write(f)
        return True
    except Exception as e:
        print(f"pypdf form fill failed: {e}")
        return False


def add_text_pymupdf(
    pdf_path: str, 
    page_num: int, 
    text: str, 
    position: Tuple[float, float],
    font_size: float = 12,
    color: Tuple[float, float, float] = (0, 0, 0),
    output_path: str = None
) -> bool:
    """Add text to a specific position on a page using PyMuPDF"""
    if not HAS_PYMUPDF:
        return False
        
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_num - 1]  # 0-indexed
        
        # Insert text
        page.insert_text(
            position,
            text,
            fontsize=font_size,
            color=color
        )
        
        out = output_path or pdf_path
        doc.save(out)
        doc.close()
        return True
    except Exception as e:
        print(f"PyMuPDF text insert failed: {e}")
        return False


def add_watermark_pymupdf(
    pdf_path: str,
    watermark_text: str,
    output_path: str = None,
    opacity: float = 0.3,
    angle: float = 45,
    color: Tuple[float, float, float] = (0.5, 0.5, 0.5)
) -> bool:
    """Add a diagonal watermark to all pages using PyMuPDF"""
    if not HAS_PYMUPDF:
        return False
        
    try:
        doc = fitz.open(pdf_path)
        
        for page in doc:
            rect = page.rect
            
            # Create a text writer for precise control
            tw = fitz.TextWriter(rect)
            
            # Calculate diagonal positions for multiple watermarks
            font = fitz.Font("helv")
            fontsize = 40
            
            # Add watermark text at multiple positions diagonally
            positions = [
                (rect.width * 0.2, rect.height * 0.3),
                (rect.width * 0.5, rect.height * 0.5),
                (rect.width * 0.3, rect.height * 0.7),
            ]
            
            for x, y in positions:
                # Use insert_textbox for better control
                text_rect = fitz.Rect(x - 150, y - 20, x + 150, y + 20)
                page.insert_textbox(
                    text_rect,
                    watermark_text,
                    fontsize=fontsize,
                    fontname="helv",
                    color=color,
                    align=fitz.TEXT_ALIGN_CENTER,
                    overlay=True
                )
            
        out = output_path or pdf_path
        doc.save(out)
        doc.close()
        return True
    except Exception as e:
        print(f"PyMuPDF watermark failed: {e}")
        return False


def replace_text_pymupdf(
    pdf_path: str,
    old_text: str,
    new_text: str,
    output_path: str = None
) -> Tuple[bool, int]:
    """Replace text occurrences in PDF using PyMuPDF. Returns (success, count)."""
    if not HAS_PYMUPDF:
        return False, 0
        
    try:
        doc = fitz.open(pdf_path)
        count = 0
        
        for page in doc:
            # Find text instances
            text_instances = page.search_for(old_text)
            
            for inst in text_instances:
                # Redact the old text
                page.add_redact_annot(inst, fill=(1, 1, 1))
                
            # Apply redactions
            if text_instances:
                page.apply_redactions()
                
                # Add new text at first occurrence location
                if text_instances:
                    page.insert_text(
                        text_instances[0].tl,  # Top-left of first match
                        new_text,
                        fontsize=11
                    )
                count += len(text_instances)
                
        out = output_path or pdf_path
        doc.save(out)
        doc.close()
        return True, count
    except Exception as e:
        print(f"PyMuPDF text replace failed: {e}")
        return False, 0


def generate_page_reportlab(
    content: Dict[str, Any],
    output_path: str,
    page_size: Tuple[float, float] = letter
) -> bool:
    """
    Generate a new PDF page using ReportLab.
    
    content dict can have:
    - title: str
    - subtitle: str
    - body: List[str] (lines of text)
    - bullets: List[str] (bulleted items)
    - header: str
    - footer: str
    
    page_size: (width, height) in points. Use (720, 405) for landscape slides.
    """
    if not HAS_REPORTLAB:
        return False
        
    try:
        c = canvas.Canvas(output_path, pagesize=page_size)
        width, height = page_size
        
        # Adjust margins based on orientation
        is_landscape = width > height
        margin = 40 if is_landscape else 72
        
        y_pos = height - margin
        
        # Title
        if "title" in content:
            title_size = 24 if is_landscape else 18
            c.setFont("Helvetica-Bold", title_size)
            c.drawCentredString(width / 2, y_pos, content["title"])
            y_pos -= title_size + 12
            
        # Subtitle
        if "subtitle" in content:
            c.setFont("Helvetica-Oblique", 10)
            c.drawCentredString(width / 2, y_pos, content["subtitle"])
            y_pos -= 20
            
        # Body text
        if "body" in content:
            font_size = 10 if is_landscape else 11
            line_height = font_size + 4
            c.setFont("Helvetica", font_size)
            for line in content["body"]:
                if y_pos < margin:
                    break
                c.drawString(margin, y_pos, line)
                y_pos -= line_height
                
        # Bulleted items
        if "bullets" in content:
            font_size = 10 if is_landscape else 11
            line_height = font_size + 4
            c.setFont("Helvetica", font_size)
            for item in content["bullets"]:
                if y_pos < margin:
                    break
                c.drawString(margin + 15, y_pos, f"• {item}")
                y_pos -= line_height
                
        # Footer
        if "footer" in content:
            c.setFont("Helvetica-Oblique", 9)
            c.drawCentredString(width / 2, 20, content["footer"])
            
        c.save()
        return True
    except Exception as e:
        print(f"ReportLab page generation failed: {e}")
        return False


def generate_slide_reportlab(
    content: Dict[str, Any],
    output_path: str,
    template_path: str = None
) -> bool:
    """
    Generate a slide-style PDF page matching template dimensions.
    
    If template_path is provided, uses its page dimensions.
    Otherwise defaults to 720x405 (landscape slide format).
    """
    if not HAS_REPORTLAB:
        return False
        
    # Get page size from template or use default slide size
    page_size = (720, 405)  # Default landscape slide
    if template_path:
        features = detect_pdf_features(template_path)
        page_size = features.get("page_size", page_size)
        
    return generate_page_reportlab(content, output_path, page_size)


def render_page_pymupdf(pdf_path: str, page_num: int, dpi: int = 150) -> Optional[Image.Image]:
    """Render a PDF page to PIL Image using PyMuPDF (faster than pdf2image)"""
    if not HAS_PYMUPDF:
        return None
        
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_num - 1]
        
        # Render at specified DPI
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        # Convert to PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        doc.close()
        return img
    except Exception as e:
        print(f"PyMuPDF render failed: {e}")
        return None


class PDFToolbox:
    """
    Intelligent PDF manipulation toolbox that selects the best approach
    for each task and validates results.
    """
    
    def __init__(self, ai_validator=None):
        self.tools = TOOLS
        self.ai_validator = ai_validator  # Function to validate with AI vision
        self.max_retries = 3
        
    def select_tool(self, capability: PDFCapability, pdf_features: Dict = None) -> List[PDFTool]:
        """
        Select the best tool(s) for a capability, considering PDF features.
        Returns list ordered by preference.
        """
        candidates = get_tools_for_capability(capability)
        
        if not candidates:
            return []
            
        # Adjust ranking based on PDF features
        if pdf_features:
            ranked = []
            for tool in candidates:
                score = tool.reliability
                
                # Prefer form-filling tools if PDF has forms
                if pdf_features.get("has_acroform") or pdf_features.get("has_xfa"):
                    if capability == PDFCapability.FILL_FORM:
                        if tool.name in ["pypdf", "pymupdf", "pikepdf"]:
                            score += 0.2
                            
                # Prefer non-AI tools for text-based PDFs
                if pdf_features.get("has_text") and not pdf_features.get("is_scanned"):
                    if not tool.requires_ai:
                        score += 0.1
                        
                # Prefer AI for scanned/image PDFs
                if pdf_features.get("is_scanned"):
                    if tool.requires_ai:
                        score += 0.1
                        
                ranked.append((tool, score))
                
            ranked.sort(key=lambda x: x[1], reverse=True)
            return [t for t, _ in ranked]
            
        return candidates
        
    def execute_with_fallback(
        self,
        pdf_path: str,
        capability: PDFCapability,
        params: Dict[str, Any],
        output_path: str
    ) -> Tuple[bool, str, List[str]]:
        """
        Execute a PDF operation with automatic fallback to alternative tools.
        
        Returns: (success, output_path, attempts_log)
        """
        pdf_features = detect_pdf_features(pdf_path)
        tools = self.select_tool(capability, pdf_features)
        
        attempts = []
        
        for tool in tools[:self.max_retries]:
            attempt_msg = f"Trying {tool.name} for {capability.value}..."
            attempts.append(attempt_msg)
            
            try:
                success = self._execute_tool(tool, pdf_path, capability, params, output_path)
                
                if success:
                    # Validate result if we have an AI validator
                    if self.ai_validator and tool.requires_ai:
                        is_valid, reason = self.ai_validator(output_path, params)
                        if not is_valid:
                            attempts.append(f"  {tool.name} validation failed: {reason}")
                            continue
                            
                    attempts.append(f"  ✓ {tool.name} succeeded!")
                    return True, output_path, attempts
                else:
                    attempts.append(f"  ✗ {tool.name} failed")
                    
            except Exception as e:
                attempts.append(f"  ✗ {tool.name} error: {str(e)}")
                
        return False, None, attempts
        
    def _execute_tool(
        self,
        tool: PDFTool,
        pdf_path: str,
        capability: PDFCapability,
        params: Dict[str, Any],
        output_path: str
    ) -> bool:
        """Execute a specific tool for a capability"""
        
        if tool.name == "pypdf":
            if capability == PDFCapability.FILL_FORM:
                return fill_form_pypdf(pdf_path, params.get("fields", {}), output_path)
                
        elif tool.name == "pymupdf":
            if capability == PDFCapability.ADD_TEXT:
                return add_text_pymupdf(
                    pdf_path,
                    params.get("page", 1),
                    params.get("text", ""),
                    params.get("position", (100, 100)),
                    params.get("font_size", 12),
                    params.get("color", (0, 0, 0)),
                    output_path
                )
            elif capability == PDFCapability.ADD_WATERMARK:
                return add_watermark_pymupdf(
                    pdf_path,
                    params.get("text", "WATERMARK"),
                    output_path,
                    params.get("opacity", 0.3),
                    params.get("angle", 45)
                )
            elif capability == PDFCapability.REPLACE_TEXT:
                success, _ = replace_text_pymupdf(
                    pdf_path,
                    params.get("old_text", ""),
                    params.get("new_text", ""),
                    output_path
                )
                return success
                
        elif tool.name == "reportlab":
            if capability == PDFCapability.GENERATE_PAGE:
                return generate_page_reportlab(
                    params.get("content", {}),
                    output_path,
                    params.get("page_size", letter)
                )
                
        elif tool.name == "gemini_image":
            # This will be handled by ai_utils - return False to try other tools first
            # Only use as last resort
            return False
            
        return False


def get_page_structure(pdf_path: str, page_num: int) -> str:
    """
    Returns a JSON representation of all elements on a page with their coordinates.
    This gives the LLM "structural awareness" of where things are.
    """
    import json
    
    if not HAS_PYMUPDF:
        return json.dumps({"error": "PyMuPDF not available"})
    
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_num - 1]
        
        structure = {
            "page_num": page_num,
            "width": page.rect.width,
            "height": page.rect.height,
            "orientation": "landscape" if page.rect.width > page.rect.height else "portrait",
            "text_blocks": [],
            "images": [],
            "drawings": []
        }
        
        # Get text blocks with full detail
        blocks = page.get_text("dict")["blocks"]
        
        for b in blocks:
            if b.get('type') == 0:  # Text block
                for line in b.get("lines", []):
                    for span in line.get("spans", []):
                        structure["text_blocks"].append({
                            "text": span.get("text", ""),
                            "bbox": list(span.get("bbox", [])),  # [x0, y0, x1, y1]
                            "font": span.get("font", ""),
                            "size": span.get("size", 0),
                            "color": span.get("color", 0),
                            "flags": span.get("flags", 0)  # bold, italic, etc.
                        })
            elif b.get('type') == 1:  # Image block
                structure["images"].append({
                    "bbox": list(b.get("bbox", [])),
                    "width": b.get("width", 0),
                    "height": b.get("height", 0)
                })
        
        # Get drawings/paths
        paths = page.get_drawings()
        for path in paths[:20]:  # Limit to first 20 drawings
            structure["drawings"].append({
                "type": path.get("type", ""),
                "rect": list(path.get("rect", [])) if path.get("rect") else [],
                "color": path.get("color", None),
                "fill": path.get("fill", None)
            })
        
        doc.close()
        return json.dumps(structure, indent=2)
        
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_page_elements_summary(pdf_path: str, page_num: int) -> str:
    """
    Returns a human-readable summary of page elements for the LLM.
    More concise than full structure for context limits.
    """
    import json
    
    structure = json.loads(get_page_structure(pdf_path, page_num))
    
    if "error" in structure:
        return f"Error: {structure['error']}"
    
    summary_lines = [
        f"Page {page_num}: {structure['width']:.0f}x{structure['height']:.0f} ({structure['orientation']})",
        f"Text blocks: {len(structure['text_blocks'])}",
        f"Images: {len(structure['images'])}",
        f"Drawings: {len(structure['drawings'])}",
        "",
        "TEXT ELEMENTS:"
    ]
    
    # Group text by approximate Y position (same line)
    text_blocks = structure['text_blocks']
    if text_blocks:
        # Sort by Y position
        sorted_blocks = sorted(text_blocks, key=lambda b: (b['bbox'][1], b['bbox'][0]))
        
        current_y = -100
        current_line = []
        
        for block in sorted_blocks:
            y = block['bbox'][1]
            if abs(y - current_y) > 10:  # New line
                if current_line:
                    line_text = " ".join(b['text'] for b in current_line)
                    if line_text.strip():
                        summary_lines.append(f"  Y={current_y:.0f}: \"{line_text[:60]}{'...' if len(line_text) > 60 else ''}\"")
                current_line = [block]
                current_y = y
            else:
                current_line.append(block)
        
        # Last line
        if current_line:
            line_text = " ".join(b['text'] for b in current_line)
            if line_text.strip():
                summary_lines.append(f"  Y={current_y:.0f}: \"{line_text[:60]}{'...' if len(line_text) > 60 else ''}\"")
    
    return "\n".join(summary_lines)


def execute_pymupdf_script(
    pdf_path: str,
    script: str,
    output_path: str = None
) -> Tuple[bool, str]:
    """
    Execute a dynamically generated PyMuPDF script.
    The script should modify 'doc' which is pre-opened.
    
    Returns: (success, message)
    """
    if not HAS_PYMUPDF:
        return False, "PyMuPDF not available"
    
    if not output_path:
        output_path = pdf_path.replace(".pdf", "_modified.pdf")
    
    # Security: Basic sanity checks on the script
    dangerous_patterns = [
        "import os", "import sys", "import subprocess",
        "eval(", "exec(", "__import__", "open(",
        "shutil", "pathlib", "glob"
    ]
    
    for pattern in dangerous_patterns:
        if pattern in script and pattern not in ["fitz.open("]:
            return False, f"Script contains potentially dangerous pattern: {pattern}"
    
    try:
        # Open the document
        doc = fitz.open(pdf_path)
        
        # Create a restricted namespace for execution
        namespace = {
            'doc': doc,
            'fitz': fitz,
            'page': None,  # Will be set per-page if needed
        }
        
        # Execute the script
        exec(script, namespace)
        
        # Save the result
        doc.save(output_path)
        doc.close()
        
        return True, f"Script executed successfully. Saved to {output_path}"
        
    except Exception as e:
        return False, f"Script execution failed: {str(e)}"


def print_available_tools():
    """Print info about available PDF tools"""
    print("\n📦 Available PDF Tools:\n")
    for name, tool in TOOLS.items():
        status = "✓" if tool.available else "✗"
        print(f"  {status} {tool.name}")
        print(f"    {tool.description}")
        print(f"    Reliability: {tool.reliability:.0%} | Speed: {tool.speed:.0%}")
        caps = ", ".join(c.value for c in tool.capabilities[:4])
        if len(tool.capabilities) > 4:
            caps += f" (+{len(tool.capabilities) - 4} more)"
        print(f"    Capabilities: {caps}")
        print()


if __name__ == "__main__":
    print_available_tools()

