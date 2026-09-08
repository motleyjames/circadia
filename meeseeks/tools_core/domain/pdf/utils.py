"""
Common utilities - DRY helpers used across the codebase.
"""

import json
from typing import Any, Dict, Optional, Tuple
from PIL import Image

try:
    from ...core.meeseeks_llm_caller import get_default_model
except ImportError:
    from tools_core.core.meeseeks_llm_caller import get_default_model

# Try imports
try:
    import fitz
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False


def clean_json_response(response_text: str) -> Dict[str, Any]:
    """
    Clean and parse JSON from LLM response.
    Handles markdown code blocks, whitespace, etc.
    
    Args:
        response_text: Raw text from LLM response
        
    Returns:
        Parsed JSON dict, or {"error": message} on failure
    """
    text = response_text.strip()
    
    # Handle markdown code blocks
    if "```" in text:
        # Extract content between first ``` pair
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            # Remove language identifier (json, python, etc)
            if text.startswith("json"):
                text = text[4:]
            elif text.startswith("python"):
                text = text[6:]
            text = text.strip()
    
    # Try to find JSON object/array in the text
    text = text.strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        # Try to extract JSON from text
        start_idx = text.find('{')
        if start_idx == -1:
            start_idx = text.find('[')
        if start_idx != -1:
            try:
                return json.loads(text[start_idx:])
            except json.JSONDecodeError:
                pass
        return {"error": f"JSON parse error: {e}", "raw": text[:200]}


def render_page(pdf_path: str, page_num: int, dpi: int = 150) -> Optional[Image.Image]:
    """
    Render a PDF page to PIL Image.
    Uses PyMuPDF if available, falls back to pdf_utils.
    
    Args:
        pdf_path: Path to PDF file
        page_num: 1-indexed page number
        dpi: Resolution for rendering
        
    Returns:
        PIL Image or None on failure
    """
    if HAS_PYMUPDF:
        try:
            doc = fitz.open(pdf_path)
            page = doc[page_num - 1]
            
            zoom = dpi / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            doc.close()
            return img
        except Exception as e:
            print(f"PyMuPDF render failed: {e}")
            return None
    else:
        # Fallback to pdf_utils
        from . import pdf_utils
        return pdf_utils.render_page_as_image(pdf_path, page_num)


# Model constants - resolved from model_roles in 00_llm_router_config.json
DEFAULT_MODEL = get_default_model("google_top")   # Best quality for text/analysis
FAST_MODEL = get_default_model("google_fast")    # Fast model for quick tasks
IMAGE_MODEL = 'gemini-3-pro-image-preview'       # For image generation


def get_model(fast: bool = False) -> str:
    """Get the appropriate text model based on fast flag."""
    return FAST_MODEL if fast else DEFAULT_MODEL


def call_gemini_text(
    prompt: str,
    images: list = None,
    temperature: float = 0.1,
    model: str = None,
    fast: bool = False
) -> Tuple[bool, str]:
    """
    Make a text-only Gemini API call.
    
    Args:
        prompt: The text prompt
        images: Optional list of PIL Images to include
        temperature: Model temperature
        model: Model to use (overrides fast flag if provided)
        fast: If True, use fast model (currently same as default)
        
    Returns:
        (success, response_text) tuple
    """
    if model is None:
        model = get_model(fast)
    
    try:
        from google.genai import types
        from . import ai_utils
        
        client = ai_utils.get_client()
        
        contents = [prompt]
        if images:
            contents.extend(images)
        
        config = types.GenerateContentConfig(
            response_modalities=['TEXT'],
            temperature=temperature,
        )
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config
        )
        
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.text:
                    return True, part.text
        
        return False, "No text in response"
        
    except Exception as e:
        return False, str(e)


def call_gemini_json(
    prompt: str,
    images: list = None,
    temperature: float = 0.1,
    model: str = None,
    fast: bool = False
) -> Tuple[bool, Dict[str, Any]]:
    """
    Make a Gemini API call expecting JSON response.
    Automatically cleans and parses the response.
    
    Args:
        prompt: The text prompt (should ask for JSON)
        images: Optional list of PIL Images
        temperature: Model temperature
        model: Model to use (overrides fast flag if provided)
        fast: If True, use fast model (currently same as default)
        
    Returns:
        (success, parsed_dict) tuple
    """
    success, text = call_gemini_text(prompt, images, temperature, model, fast)
    
    if not success:
        return False, {"error": text}
    
    result = clean_json_response(text)
    
    if "error" in result and "JSON parse error" in str(result.get("error", "")):
        return False, result
    
    return True, result


def get_page_dimensions(pdf_path: str, page_num: int) -> Tuple[float, float]:
    """
    Get page width and height.
    
    Returns:
        (width, height) tuple in points
    """
    if HAS_PYMUPDF:
        try:
            doc = fitz.open(pdf_path)
            page = doc[page_num - 1]
            rect = page.rect
            doc.close()
            return rect.width, rect.height
        except:
            pass
    
    # Fallback to pypdf
    from pypdf import PdfReader
    try:
        reader = PdfReader(pdf_path)
        page = reader.pages[page_num - 1]
        return float(page.mediabox.width), float(page.mediabox.height)
    except:
        return 612, 792  # Default letter size


def is_blank_image(image: Image.Image, threshold: float = 0.9) -> bool:
    """
    Check if an image is mostly blank/white.
    
    Args:
        image: PIL Image to check
        threshold: Percentage of white pixels to consider "blank"
        
    Returns:
        True if image appears blank
    """
    try:
        # Sample pixels (not all for performance)
        pixels = list(image.getdata())[:1000]
        white_count = sum(1 for p in pixels if sum(p[:3]) > 750)
        return (white_count / len(pixels)) > threshold
    except:
        return False

