"""
Gen-Media SDK - Unified Python interface for local image generation.

Supports:
- ComfyUI (workflow-based generation)
- MFLUX (Flux Schnell/Dev direct generation)
- Z-Image (via ComfyUI workflows)
- Draw Things (local API)
"""

from gen_media.config import get_settings, Settings
from gen_media.features.comfyui import ComfyUIClient
from gen_media.features.mflux import MFluxGenerator
from gen_media.features.zimage import ZImageGenerator
from gen_media.features.drawthings import DrawThingsClient
from gen_media.shared.output import save_image, OutputFormat

__version__ = "0.1.0"

__all__ = [
    # Config
    "get_settings",
    "Settings",
    # Feature clients
    "ComfyUIClient",
    "MFluxGenerator",
    "ZImageGenerator",
    "DrawThingsClient",
    # Utilities
    "save_image",
    "OutputFormat",
]

