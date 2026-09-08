"""
Meeseeks Domain Modules

Domain-specific implementations built on the core RSI toolkit.

Domains:
- cloud: Cloud generative media via FAL AI (50+ models: video, avatar, 3D, TTS)
- excel: Excel automation, workbook analysis, and RSI-powered updates
- finance: DCF valuation, sensitivity analysis, Monte Carlo simulation
- media: LOCAL generative image/video (Z-Image, MFlux, LTX-2, ComfyUI)
- pdf: PDF parsing, extraction, and AI analysis
- video: Video transcription and meeting analysis

Usage:
    # Import specific domain
    from tools_core.domain import cloud  # FAL AI cloud generation
    from tools_core.domain import excel
    from tools_core.domain import finance
    from tools_core.domain import media  # Local generation
    from tools_core.domain import pdf
    from tools_core.domain import video
    
    # Or import specific tools
    from tools_core.domain.cloud import generate_video, generate_avatar
    from tools_core.domain.finance import DCFModel
    from tools_core.domain.pdf import PDFAgent
"""

__all__ = [
    'cloud',
    'excel',
    'finance',
    'media',
    'pdf',
    'video',
]
