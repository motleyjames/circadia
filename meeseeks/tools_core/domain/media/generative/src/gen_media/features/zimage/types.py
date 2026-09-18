"""Type definitions for Z-Image integration."""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class ZImageModel(str, Enum):
    """Available Z-Image model variants."""

    TURBO = "turbo"
    BASE = "base"

    @property
    def checkpoint_name(self) -> str:
        """Checkpoint filename for this model."""
        if self == ZImageModel.TURBO:
            return "z-image-turbo.safetensors"
        return "z-image-base.safetensors"

    @property
    def default_steps(self) -> int:
        """Default inference steps for this model."""
        if self == ZImageModel.TURBO:
            return 8
        return 30

    @property
    def text_encoder(self) -> str:
        """Text encoder to use with this model."""
        return "qwen2-vl-7b-instruct.safetensors"


@dataclass
class ZImageConfig:
    """Configuration for Z-Image generation."""

    prompt: str
    model: ZImageModel = ZImageModel.TURBO
    width: int = 1024
    height: int = 768
    steps: int | None = None
    cfg_scale: float = 7.5
    seed: int | None = None
    negative_prompt: str = ""

    def __post_init__(self) -> None:
        """Set default steps based on model if not specified."""
        if self.steps is None:
            self.steps = self.model.default_steps


@dataclass
class ZImageResult:
    """Result of Z-Image generation."""

    image_path: Path | None = None
    image_data: bytes | None = None
    prompt: str = ""
    seed: int = 0
    elapsed_time: float = 0.0
    model: ZImageModel = ZImageModel.TURBO
    width: int = 1024
    height: int = 768
    steps: int = 8
    error: str | None = None
    success: bool = True
    comfyui_prompt_id: str | None = None

    @property
    def failed(self) -> bool:
        """Check if generation failed."""
        return not self.success

