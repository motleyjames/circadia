#!/usr/bin/env python3
"""
Screenshot annotation utility.
Draws bounding boxes and labels on screenshots based on detected elements.
"""

import sys
import json
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print(json.dumps({"error": "PIL not installed. Run: pip install pillow"}))
    sys.exit(1)


# Color scheme for different element types
ELEMENT_COLORS = {
    'button': '#FF4444',      # Red
    'input': '#44FF44',       # Green
    'link': '#4444FF',        # Blue
    'text': '#FFFF44',        # Yellow
    'form': '#FF44FF',        # Magenta
    'image': '#44FFFF',       # Cyan
    'dropdown': '#FFA500',    # Orange
    'container': '#888888',   # Gray
    'default': '#FFFFFF',     # White
}


def annotate_screenshot(
    image_path: str,
    elements: list,
    output_path: str,
    show_labels: bool = True,
    show_confidence: bool = True
) -> dict:
    """
    Draw bounding boxes and labels on a screenshot.
    
    Args:
        image_path: Path to the input image
        elements: List of detected elements with bounding boxes
        output_path: Path to save the annotated image
        show_labels: Whether to show element labels
        show_confidence: Whether to show confidence scores
    
    Returns:
        dict with status and output path
    """
    try:
        image = Image.open(image_path)
        draw = ImageDraw.Draw(image)
        
        # Try to load a font, fall back to default
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
        except:
            font = ImageFont.load_default()
        
        for elem in elements:
            bbox = elem.get('bbox', {})
            elem_type = elem.get('type', 'default')
            label = elem.get('label', elem_type)
            confidence = elem.get('confidence', 0)
            
            x = bbox.get('x', 0)
            y = bbox.get('y', 0)
            width = bbox.get('width', 0)
            height = bbox.get('height', 0)
            
            # Get color for this element type
            color = ELEMENT_COLORS.get(elem_type, ELEMENT_COLORS['default'])
            
            # Draw bounding box
            draw.rectangle(
                [x, y, x + width, y + height],
                outline=color,
                width=2
            )
            
            # Draw label if enabled
            if show_labels and label:
                label_text = label
                if show_confidence:
                    label_text = f"{label} ({confidence:.2f})"
                
                # Draw label background
                text_bbox = draw.textbbox((x, y - 15), label_text, font=font)
                draw.rectangle(text_bbox, fill=color)
                
                # Draw label text
                draw.text(
                    (x, y - 15),
                    label_text,
                    fill='#000000',
                    font=font
                )
        
        # Save annotated image
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)
        
        return {
            "status": "success",
            "output_path": output_path,
            "elements_annotated": len(elements)
        }
        
    except Exception as e:
        return {"error": str(e)}


def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "error": "Usage: annotate_screenshot.py <image_path> <output_path> <elements_json>"
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    output_path = sys.argv[2]
    elements_json = sys.argv[3]
    
    if not Path(image_path).exists():
        print(json.dumps({"error": f"Image not found: {image_path}"}))
        sys.exit(1)
    
    try:
        elements = json.loads(elements_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        sys.exit(1)
    
    result = annotate_screenshot(image_path, elements, output_path)
    print(json.dumps(result))


if __name__ == '__main__':
    main()

