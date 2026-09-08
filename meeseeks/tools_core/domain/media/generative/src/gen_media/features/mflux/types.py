"""Type definitions for MFLUX integration."""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Literal


class FluxModel(str, Enum):
    """Available Flux model variants."""

    SCHNELL = "schnell"
    DEV = "dev"

    @property
    def default_steps(self) -> int:
        """Default inference steps for this model."""
        if self == FluxModel.SCHNELL:
            return 2
        return 50

    @property
    def model_id(self) -> str:
        """HuggingFace model ID."""
        if self == FluxModel.SCHNELL:
            return "black-forest-labs/FLUX.1-schnell"
        return "black-forest-labs/FLUX.1-dev"


@dataclass
class FluxGenerationConfig:
    """Configuration for Flux image generation."""

    prompt: str
    model: FluxModel = FluxModel.SCHNELL
    width: int = 1024
    height: int = 768
    steps: int | None = None
    guidance_scale: float = 7.0
    seed: int | None = None
    dtype: Literal["bfloat16", "float16", "float32"] = "bfloat16"

    def __post_init__(self) -> None:
        """Set default steps based on model if not specified."""
        if self.steps is None:
            self.steps = self.model.default_steps


@dataclass
class FluxResult:
    """Result of Flux image generation."""

    image_path: Path | None = None
    image_data: bytes | None = None
    prompt: str = ""
    seed: int = 0
    elapsed_time: float = 0.0
    model: FluxModel = FluxModel.SCHNELL
    width: int = 1024
    height: int = 768
    steps: int = 2
    error: str | None = None
    success: bool = True

    @property
    def failed(self) -> bool:
        """Check if generation failed."""
        return not self.success

