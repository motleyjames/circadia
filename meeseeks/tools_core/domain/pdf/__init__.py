"""
PDF Domain Module - PDF Processing and Analysis

Provides PDF parsing, text extraction, manipulation, and AI-powered analysis.

Usage:
    from tools_core.domain.pdf import PDFToolbox, extract_full_text
    
    # Get text from PDF
    text = extract_full_text('document.pdf')
    
    # Use the full toolbox
    toolbox = PDFToolbox()
    toolbox.extract_text('document.pdf')
"""

from .pdf_tools import (
    PDFCapability,
    PDFTool,
    PDFToolbox,
    get_available_tools,
    get_tools_for_capability,
    detect_pdf_features,
)

from .pdf_utils import (
    extract_full_text,
    extract_text_per_page,
    get_page_count,
    render_page_as_image,
    merge_pdfs,
    replace_page_in_pdf,
)

from .ai_utils import (
    generate_slide,
    describe_page,
    semantic_search_pages,
)

from .pdf_agent import PDFAgent

__all__ = [
    # Tools
    'PDFCapability',
    'PDFTool', 
    'PDFToolbox',
    'PDFAgent',
    'get_available_tools',
    'get_tools_for_capability',
    'detect_pdf_features',
    # Utils
    'extract_full_text',
    'extract_text_per_page',
    'get_page_count',
    'render_page_as_image',
    'merge_pdfs',
    'replace_page_in_pdf',
    # AI
    'generate_slide',
    'describe_page',
    'semantic_search_pages',
]
