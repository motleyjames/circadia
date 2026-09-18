"""Type definitions for Draw Things integration."""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class DrawThingsStatus(str, Enum):
    """Draw Things server status."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    BUSY = "busy"
    ERROR = "error"


class DrawThingsModel(str, Enum):
    """Common Draw Things models."""

    SDXL_TURBO = "sdxl-turbo"
    SDXL_BASE = "sdxl-base"
    SD15 = "sd-1.5"
    FLUX_SCHNELL = "flux-schnell"
    FLUX_DEV = "flux-dev"

    @property
    def default_steps(self) -> int:
        """Default inference steps for this model."""
        if self in (DrawThingsModel.SDXL_TURBO, DrawThingsModel.FLUX_SCHNELL):
            return 4
        if self == DrawThingsModel.FLUX_DEV:
            return 50
        return 20


class Sampler(str, Enum):
    """Available samplers in Draw Things."""

    EULER = "euler"
    EULER_A = "euler_a"
    DPM_2M = "dpm_2m"
    DPM_2M_KARRAS = "dpm_2m_karras"
    DPM_PLUS_2M_KARRAS = "dpm++_2m_karras"
    DPM_PLUS_2M_SDE_KARRAS = "dpm++_2m_sde_karras"
    DDIM = "ddim"
    LCM = "lcm"


@dataclass
class DrawThingsConfig:
    """Configuration for Draw Things generation."""

    prompt: str
    model: str | DrawThingsModel = DrawThingsModel.SDXL_TURBO
    width: int = 1024
    height: int = 1024
    steps: int | None = None
    cfg_scale: float = 7.0
    seed: int = -1
    sampler: Sampler = Sampler.DPM_PLUS_2M_KARRAS
    negative_prompt: str = ""
    clip_skip: int = 1
    batch_size: int = 1

    def __post_init__(self) -> None:
        """Set default steps based on model if not specified."""
        if self.steps is None:
            if isinstance(self.model, DrawThingsModel):
                self.steps = self.model.default_steps
            else:
                self.steps = 20


@dataclass
class DrawThingsResult:
    """Result of Draw Things generation."""

    images: list[Path] = None
    image_data: list[bytes] = None
    prompt: str = ""
    seed: int = 0
    elapsed_time: float = 0.0
    model: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 20
    error: str | None = None
    success: bool = True

    def __post_init__(self) -> None:
        """Initialize default lists."""
        if self.images is None:
            self.images = []
        if self.image_data is None:
            self.image_data = []

    @property
    def failed(self) -> bool:
        """Check if generation failed."""
        return not self.success

    @property
    def first_image(self) -> bytes | None:
        """Get first image data if available."""
        return self.image_data[0] if self.image_data else None

    @property
    def first_image_path(self) -> Path | None:
        """Get first image path if available."""
        return self.images[0] if self.images else None

