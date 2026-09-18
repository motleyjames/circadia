"""
Environment-based configuration for Gen-Media SDK.

All paths are configurable via environment variables with sensible defaults.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Gen-Media SDK configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # =========================================================================
    # Paths
    # =========================================================================

    comfyui_path: Path = Field(
        default=Path.home() / "ComfyUI",
        description="ComfyUI installation directory",
    )

    models_path: Path | None = Field(
        default=None,
        description="Shared models directory. Defaults to $COMFYUI_PATH/models",
    )

    output_path: Path = Field(
        default=Path("./output"),
        description="Output directory for generated images",
    )

    workflows_path: Path = Field(
        default=Path("./workflows"),
        description="Directory containing workflow JSON templates",
    )

    # =========================================================================
    # Server URLs
    # =========================================================================

    comfyui_url: str = Field(
        default="http://127.0.0.1:8188",
        description="ComfyUI server URL",
    )

    drawthings_url: str = Field(
        default="http://127.0.0.1:7860",
        description="Draw Things API URL",
    )

    # =========================================================================
    # Generation Defaults
    # =========================================================================

    default_width: int = Field(default=1024, ge=64, le=4096)
    default_height: int = Field(default=768, ge=64, le=4096)
    default_steps: int = Field(default=4, ge=1, le=150)
    default_cfg: float = Field(default=7.5, ge=1.0, le=30.0)
    default_backend: Literal["comfyui", "mflux", "drawthings"] = Field(default="comfyui")

    # =========================================================================
    # Computed Properties
    # =========================================================================

    @property
    def resolved_models_path(self) -> Path:
        """Get models path, defaulting to ComfyUI models directory."""
        if self.models_path is not None:
            return self.models_path
        return self.comfyui_path / "models"

    @property
    def checkpoints_path(self) -> Path:
        """Path to model checkpoints."""
        return self.resolved_models_path / "checkpoints"

    @property
    def text_encoders_path(self) -> Path:
        """Path to text encoder models."""
        return self.resolved_models_path / "text_encoders"

    @property
    def vae_path(self) -> Path:
        """Path to VAE models."""
        return self.resolved_models_path / "vae"

    @property
    def loras_path(self) -> Path:
        """Path to LoRA models."""
        return self.resolved_models_path / "loras"

    # =========================================================================
    # Validators
    # =========================================================================

    @field_validator("comfyui_path", "output_path", "workflows_path", mode="before")
    @classmethod
    def expand_path(cls, v: str | Path) -> Path:
        """Expand ~ and make paths absolute."""
        if isinstance(v, str):
            v = Path(v)
        return v.expanduser().resolve()

    @field_validator("models_path", mode="before")
    @classmethod
    def expand_optional_path(cls, v: str | Path | None) -> Path | None:
        """Expand ~ for optional paths."""
        if v is None:
            return None
        if isinstance(v, str):
            v = Path(v)
        return v.expanduser().resolve()

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def ensure_directories(self) -> None:
        """Create output and workflow directories if they don't exist."""
        self.output_path.mkdir(parents=True, exist_ok=True)
        self.workflows_path.mkdir(parents=True, exist_ok=True)

    def validate_comfyui_installation(self) -> bool:
        """Check if ComfyUI is installed at the configured path."""
        main_py = self.comfyui_path / "main.py"
        return main_py.exists()

    def validate_models_exist(self) -> dict[str, bool]:
        """Check which model directories exist."""
        return {
            "checkpoints": self.checkpoints_path.exists(),
            "text_encoders": self.text_encoders_path.exists(),
            "vae": self.vae_path.exists(),
            "loras": self.loras_path.exists(),
        }


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Settings are loaded once and cached for the lifetime of the application.
    To reload settings, clear the cache with `get_settings.cache_clear()`.
    """
    return Settings()

