import os
from pathlib import Path
from typing import List, Tuple
import subprocess
import shutil
from pdf2image import convert_from_path
from pypdf import PdfReader, PdfWriter
import pytesseract
from PIL import Image

def check_system_dependencies():
    """Checks if required system dependencies are installed."""
    missing = []

    # Check for pdftotext (part of poppler-utils)
    if not shutil.which('pdftotext'):
        missing.append('pdftotext (poppler/poppler-utils)')

    # Check for tesseract
    if not shutil.which('tesseract'):
        missing.append('tesseract')

    if missing:
        deps_str = ", ".join(missing)
        if os.name == 'darwin':  # macOS
            install_cmd = "brew install poppler tesseract"
        elif os.name == 'posix':  # Linux
            install_cmd = "sudo apt-get install poppler-utils tesseract-ocr"
        else:  # Windows
            install_cmd = "choco install poppler tesseract\n(You may need to restart your terminal after installation)"

        raise RuntimeError(
            f"Missing system dependencies: {deps_str}\n\n"
            f"Installation:\n{install_cmd}\n\n"
            f"See https://github.com/gavrielc/legion-pdf-playbooks#readme for more details."
        )

def get_page_count(pdf_path: str) -> int:
    """Returns the total number of pages in the PDF."""
    reader = PdfReader(pdf_path)
    return len(reader.pages)

def extract_full_text(pdf_path: str) -> str:
    """Extracts the full text from a PDF using pdftotext (via subprocess for speed/layout)."""
    try:
        # Using -layout to preserve some spatial structure which is good for slides
        result = subprocess.run(
            ['pdftotext', '-layout', pdf_path, '-'],
            capture_output=True,
            text=True,
            check=True
        )
        raw_text = result.stdout
        
        # Split by form feed to get pages
        pages = raw_text.split('\f')
        
        formatted_pages = []
        for i, page_text in enumerate(pages):
            # Skip empty pages at the end if any
            if not page_text.strip():
                continue
                
            # Strip whitespace
            clean_text = page_text.strip()
            
            # Truncate to 2000 chars
            if len(clean_text) > 2000:
                clean_text = clean_text[:2000] + "...[truncated]"
            
            # Wrap in page tags (1-indexed)
            formatted_pages.append(f"<page-{i+1}>\n{clean_text}\n</page-{i+1}>")
            
        return "<document_context>\n" + "\n".join(formatted_pages) + "\n</document_context>"
    except subprocess.CalledProcessError as e:
        print(f"Error extracting text: {e}")
        return ""


def extract_text_per_page(pdf_path: str) -> dict[int, str]:
    """
    Extracts text from each page of a PDF, returning a dict mapping page number to text.
    Page numbers are 1-indexed.
    """
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', pdf_path, '-'],
            capture_output=True,
            text=True,
            check=True
        )
        raw_text = result.stdout
        
        # Split by form feed to get pages
        pages = raw_text.split('\f')
        
        page_texts = {}
        for i, page_text in enumerate(pages):
            clean_text = page_text.strip()
            if clean_text:
                page_texts[i + 1] = clean_text
        
        return page_texts
    except subprocess.CalledProcessError as e:
        print(f"Error extracting text: {e}")
        return {}

def render_page_as_image(pdf_path: str, page_number: int) -> Image.Image:
    """Renders a specific page (1-indexed) as a PIL Image."""
    images = convert_from_path(
        pdf_path, 
        first_page=page_number, 
        last_page=page_number
    )
    if not images:
        raise ValueError(f"Could not render page {page_number}")
    return images[0]

def rehydrate_image_to_pdf(image: Image.Image, output_pdf_path: str, use_ocr: bool = True):
    """
    Converts an image to a single-page PDF.
    
    Args:
        image: PIL Image to convert
        output_pdf_path: Output PDF path
        use_ocr: If True, use Tesseract for hidden text layer. If False, just embed image.
    """
    if use_ocr:
        pdf_bytes = pytesseract.image_to_pdf_or_hocr(image, extension='pdf')
        with open(output_pdf_path, 'wb') as f:
            f.write(pdf_bytes)
    else:
        # Simple image to PDF without OCR (faster, preserves dimensions)
        image.save(output_pdf_path, "PDF", resolution=100.0)


def image_to_pdf_with_size(
    image: Image.Image, 
    output_pdf_path: str, 
    target_width: float, 
    target_height: float
):
    """
    Create a PDF from image with specific page dimensions.
    
    Args:
        image: PIL Image
        output_pdf_path: Output path
        target_width: Target page width in points
        target_height: Target page height in points
    """
    # Resize image to match target aspect ratio
    img_width, img_height = image.size
    target_ratio = target_width / target_height
    img_ratio = img_width / img_height
    
    if abs(img_ratio - target_ratio) > 0.01:
        # Need to adjust
        if img_ratio > target_ratio:
            new_height = int(img_width / target_ratio)
            new_image = Image.new('RGB', (img_width, new_height), (255, 255, 255))
            new_image.paste(image, (0, 0))
            image = new_image
        else:
            new_width = int(img_height * target_ratio)
            new_image = Image.new('RGB', (new_width, img_height), (255, 255, 255))
            new_image.paste(image, (0, 0))
            image = new_image
    
    # Calculate DPI to achieve target size
    # Points are 1/72 inch, so: pixels / DPI * 72 = points
    # DPI = pixels * 72 / points
    dpi_x = image.size[0] * 72 / target_width
    dpi_y = image.size[1] * 72 / target_height
    dpi = (dpi_x + dpi_y) / 2  # Average
    
    image.save(output_pdf_path, "PDF", resolution=dpi)

def replace_page_in_pdf(original_pdf_path: str, new_page_pdf_path: str, page_number: int, output_pdf_path: str):
    """
    Replaces a specific page in the original PDF with the new single-page PDF.
    page_number is 1-indexed.
    """
    reader = PdfReader(original_pdf_path)
    writer = PdfWriter()

    # Add pages before the target
    for i in range(len(reader.pages)):
        if i == page_number - 1:
            # This is the page to replace
            original_page = reader.pages[i]
            original_width = original_page.mediabox.width
            original_height = original_page.mediabox.height
            
            new_reader = PdfReader(new_page_pdf_path)
            new_page = new_reader.pages[0]
            
            # Resize new page to match original dimensions
            new_page.scale_to(width=float(original_width), height=float(original_height))
            
            writer.add_page(new_page)
        else:
            writer.add_page(reader.pages[i])

    with open(output_pdf_path, 'wb') as f:
        writer.write(f)

def batch_replace_pages(original_pdf_path: str, replacements: dict[int, str], output_pdf_path: str):
    """
    Replaces multiple pages in the original PDF.
    replacements: dict mapping page_number (1-indexed) -> path_to_new_single_page_pdf
    """
    reader = PdfReader(original_pdf_path)
    writer = PdfWriter()

    for i in range(len(reader.pages)):
        page_num = i + 1
        if page_num in replacements:
            # This page needs replacement
            original_page = reader.pages[i]
            original_width = original_page.mediabox.width
            original_height = original_page.mediabox.height

            new_pdf_path = replacements[page_num]
            new_reader = PdfReader(new_pdf_path)
            new_page = new_reader.pages[0]

            # Resize new page to match original dimensions
            new_page.scale_to(width=float(original_width), height=float(original_height))

            writer.add_page(new_page)
        else:
            # Keep original page
            writer.add_page(reader.pages[i])

    with open(output_pdf_path, 'wb') as f:
        writer.write(f)

def merge_pdfs(pdf_paths: list[str], output_pdf_path: str):
    """
    Merges multiple single-page PDFs into one multi-page PDF.
    """
    writer = PdfWriter()
    for pdf_path in pdf_paths:
        reader = PdfReader(pdf_path)
        for page in reader.pages:
            writer.add_page(page)
    
    with open(output_pdf_path, 'wb') as f:
        writer.write(f)

def insert_page(original_pdf_path: str, new_page_pdf_path: str, after_page: int, output_pdf_path: str):
    """
    Inserts a new page into the PDF after the specified page number.
    after_page: 0 to insert at the beginning, or page number (1-indexed) to insert after.
    """
    reader = PdfReader(original_pdf_path)
    writer = PdfWriter()

    # Get dimensions from the first page as reference
    reference_page = reader.pages[0]
    ref_width = reference_page.mediabox.width
    ref_height = reference_page.mediabox.height

    # Load the new page
    new_reader = PdfReader(new_page_pdf_path)
    new_page = new_reader.pages[0]
    new_page.scale_to(width=float(ref_width), height=float(ref_height))

    # Insert at beginning
    if after_page == 0:
        writer.add_page(new_page)

    # Add all original pages, inserting the new one at the right position
    for i in range(len(reader.pages)):
        writer.add_page(reader.pages[i])
        # Insert after this page if it matches
        if i + 1 == after_page:
            writer.add_page(new_page)

    with open(output_pdf_path, 'wb') as f:
        writer.write(f)

