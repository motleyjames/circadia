"""
Model registry for discovering available models.

Provides a unified interface to discover and list models across
different directories and formats.
"""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Iterator

from gen_media.config import get_settings

from typing import Any


class ModelType(str, Enum):
    """Types of models."""

    CHECKPOINT = "checkpoint"
    TEXT_ENCODER = "text_encoder"
    VAE = "vae"
    LORA = "lora"
    CONTROLNET = "controlnet"
    EMBEDDING = "embedding"


@dataclass
class ModelInfo:
    """Information about a discovered model."""

    name: str
    path: Path
    model_type: ModelType
    size_bytes: int
    format: str

    @property
    def size_gb(self) -> float:
        """Size in gigabytes."""
        return self.size_bytes / (1024 ** 3)

    @property
    def size_human(self) -> str:
        """Human-readable size."""
        if self.size_bytes < 1024:
            return f"{self.size_bytes} B"
        elif self.size_bytes < 1024 ** 2:
            return f"{self.size_bytes / 1024:.1f} KB"
        elif self.size_bytes < 1024 ** 3:
            return f"{self.size_bytes / 1024 ** 2:.1f} MB"
        else:
            return f"{self.size_gb:.2f} GB"


class ModelRegistry:
    """
    Registry for discovering available models.

    Scans configured directories for model files and provides
    methods to list and filter them.

    Usage:
        registry = ModelRegistry()
        checkpoints = registry.list_checkpoints()
        for model in checkpoints:
            print(f"{model.name}: {model.size_human}")
    """

    CHECKPOINT_EXTENSIONS = {".safetensors", ".ckpt", ".pt", ".pth"}
    TEXT_ENCODER_EXTENSIONS = {".safetensors", ".bin"}
    VAE_EXTENSIONS = {".safetensors", ".pt"}
    LORA_EXTENSIONS = {".safetensors", ".pt"}

    def __init__(self, models_path: Path | None = None):
        """
        Initialize model registry.

        Args:
            models_path: Base models directory. Defaults to settings.
        """
        settings = get_settings()
        self.models_path = models_path or settings.resolved_models_path

    def _get_path_for_type(self, model_type: ModelType) -> Path:
        """Get the directory path for a model type."""
        type_to_dir = {
            ModelType.CHECKPOINT: "checkpoints",
            ModelType.TEXT_ENCODER: "text_encoders",
            ModelType.VAE: "vae",
            ModelType.LORA: "loras",
            ModelType.CONTROLNET: "controlnet",
            ModelType.EMBEDDING: "embeddings",
        }
        return self.models_path / type_to_dir.get(model_type, "")

    def _get_extensions_for_type(self, model_type: ModelType) -> set[str]:
        """Get valid extensions for a model type."""
        type_to_ext = {
            ModelType.CHECKPOINT: self.CHECKPOINT_EXTENSIONS,
            ModelType.TEXT_ENCODER: self.TEXT_ENCODER_EXTENSIONS,
            ModelType.VAE: self.VAE_EXTENSIONS,
            ModelType.LORA: self.LORA_EXTENSIONS,
            ModelType.CONTROLNET: self.CHECKPOINT_EXTENSIONS,
            ModelType.EMBEDDING: {".safetensors", ".pt", ".bin"},
        }
        return type_to_ext.get(model_type, self.CHECKPOINT_EXTENSIONS)

    def _scan_directory(
        self,
        directory: Path,
        model_type: ModelType,
        extensions: set[str],
    ) -> Iterator[ModelInfo]:
        """Scan a directory for model files."""
        if not directory.exists():
            return

        for path in directory.iterdir():
            if path.is_file() and path.suffix.lower() in extensions:
                yield ModelInfo(
                    name=path.stem,
                    path=path,
                    model_type=model_type,
                    size_bytes=path.stat().st_size,
                    format=path.suffix.lower().lstrip("."),
                )
            elif path.is_dir():
                yield from self._scan_directory(path, model_type, extensions)

    def list_models(self, model_type: ModelType) -> list[ModelInfo]:
        """
        List all models of a specific type.

        Args:
            model_type: Type of models to list.

        Returns:
            List of ModelInfo objects.
        """
        directory = self._get_path_for_type(model_type)
        extensions = self._get_extensions_for_type(model_type)
        return list(self._scan_directory(directory, model_type, extensions))

    def list_checkpoints(self) -> list[ModelInfo]:
        """List available checkpoint models."""
        return self.list_models(ModelType.CHECKPOINT)

    def list_text_encoders(self) -> list[ModelInfo]:
        """List available text encoder models."""
        return self.list_models(ModelType.TEXT_ENCODER)

    def list_vaes(self) -> list[ModelInfo]:
        """List available VAE models."""
        return self.list_models(ModelType.VAE)

    def list_loras(self) -> list[ModelInfo]:
        """List available LoRA models."""
        return self.list_models(ModelType.LORA)

    def list_all(self) -> dict[ModelType, list[ModelInfo]]:
        """List all models organized by type."""
        return {
            model_type: self.list_models(model_type)
            for model_type in ModelType
        }

    def find_model(self, name: str, model_type: ModelType | None = None) -> ModelInfo | None:
        """
        Find a model by name.

        Args:
            name: Model name (with or without extension).
            model_type: Optional type filter.

        Returns:
            ModelInfo if found, None otherwise.
        """
        name_lower = name.lower()
        name_stem = Path(name).stem.lower()

        types_to_search = [model_type] if model_type else list(ModelType)

        for mt in types_to_search:
            for model in self.list_models(mt):
                if model.name.lower() == name_stem or model.path.name.lower() == name_lower:
                    return model

        return None

    def get_total_size(self) -> int:
        """Get total size of all models in bytes."""
        total = 0
        for models in self.list_all().values():
            total += sum(m.size_bytes for m in models)
        return total

    def summary(self) -> dict[str, Any]:
        """Get a summary of available models."""
        all_models = self.list_all()
        return {
            "total_models": sum(len(models) for models in all_models.values()),
            "total_size_gb": self.get_total_size() / (1024 ** 3),
            "by_type": {
                model_type.value: {
                    "count": len(models),
                    "models": [m.name for m in models],
                }
                for model_type, models in all_models.items()
            },
        }

