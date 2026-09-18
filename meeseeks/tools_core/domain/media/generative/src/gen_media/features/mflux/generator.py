"""
MFLUX generator wrapper for Flux Schnell/Dev models.

Provides a simple interface to the mflux library for direct image generation
on Apple Silicon using Metal Performance Shaders (MPS).
"""

import io
import time
from pathlib import Path
from typing import TYPE_CHECKING

from gen_media.config import get_settings
from gen_media.features.mflux.types import (
    FluxGenerationConfig,
    FluxModel,
    FluxResult,
)

if TYPE_CHECKING:
    from PIL import Image


class MFluxGenerator:
    """
    Wrapper for MFLUX direct image generation.

    Generates images using Flux models directly through the mflux library,
    optimized for Apple Silicon with Metal acceleration.

    Usage:
        generator = MFluxGenerator()
        result = generator.generate("a beautiful sunset over mountains")
    """

    def __init__(
        self,
        model: FluxModel = FluxModel.SCHNELL,
        output_path: Path | None = None,
    ):
        """
        Initialize MFLUX generator.

        Args:
            model: Which Flux model to use.
            output_path: Directory for saving images. Defaults to settings.output_path.
        """
        self.model = model
        settings = get_settings()
        self.output_path = output_path or settings.output_path
        self._flux = None

    def _get_flux(self):
        """Lazy load Flux model."""
        if self._flux is None:
            try:
                from mflux import Flux

                self._flux = Flux.from_alias(
                    alias=self.model.value,
                    quantize=None,
                )
            except ImportError as e:
                raise ImportError(
                    "mflux is not installed. Install with: pip install mflux"
                ) from e
        return self._flux

    def generate(
        self,
        prompt: str,
        width: int | None = None,
        height: int | None = None,
        steps: int | None = None,
        guidance_scale: float = 7.0,
        seed: int | None = None,
        save: bool = True,
        filename: str | None = None,
    ) -> FluxResult:
        """
        Generate an image from a text prompt.

        Args:
            prompt: Text description of the image to generate.
            width: Image width in pixels.
            height: Image height in pixels.
            steps: Number of inference steps.
            guidance_scale: CFG scale for prompt adherence.
            seed: Random seed for reproducibility.
            save: Whether to save the image to disk.
            filename: Custom filename (without extension).

        Returns:
            FluxResult with image data and metadata.
        """
        settings = get_settings()

        config = FluxGenerationConfig(
            prompt=prompt,
            model=self.model,
            width=width or settings.default_width,
            height=height or settings.default_height,
            steps=steps,
            guidance_scale=guidance_scale,
            seed=seed,
        )

        return self.generate_from_config(config, save=save, filename=filename)

    def generate_from_config(
        self,
        config: FluxGenerationConfig,
        save: bool = True,
        filename: str | None = None,
    ) -> FluxResult:
        """
        Generate an image from a configuration object.

        Args:
            config: Generation configuration.
            save: Whether to save the image to disk.
            filename: Custom filename (without extension).

        Returns:
            FluxResult with image data and metadata.
        """
        start_time = time.time()

        try:
            flux = self._get_flux()

            image = flux.generate_image(
                prompt=config.prompt,
                width=config.width,
                height=config.height,
                num_steps=config.steps or config.model.default_steps,
                guidance=config.guidance_scale,
                seed=config.seed,
            )

            image_data = self._pil_to_bytes(image)

            image_path = None
            if save:
                image_path = self._save_image(image, filename, config.seed or 0)

            elapsed = time.time() - start_time

            return FluxResult(
                image_path=image_path,
                image_data=image_data,
                prompt=config.prompt,
                seed=config.seed or 0,
                elapsed_time=elapsed,
                model=config.model,
                width=config.width,
                height=config.height,
                steps=config.steps or config.model.default_steps,
                success=True,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            return FluxResult(
                prompt=config.prompt,
                elapsed_time=elapsed,
                model=config.model,
                width=config.width,
                height=config.height,
                steps=config.steps or config.model.default_steps,
                error=str(e),
                success=False,
            )

    def _pil_to_bytes(self, image: "Image.Image") -> bytes:
        """Convert PIL Image to PNG bytes."""
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def _save_image(
        self,
        image: "Image.Image",
        filename: str | None,
        seed: int,
    ) -> Path:
        """Save image to disk."""
        self.output_path.mkdir(parents=True, exist_ok=True)

        if filename:
            image_path = self.output_path / f"{filename}.png"
        else:
            timestamp = int(time.time() * 1000)
            image_path = self.output_path / f"flux_{self.model.value}_{seed}_{timestamp}.png"

        image.save(image_path)
        return image_path

    @staticmethod
    def is_available() -> bool:
        """Check if MFLUX is installed and available."""
        try:
            import mflux
            return True
        except ImportError:
            return False

    def warmup(self) -> None:
        """
        Pre-load the model to reduce first generation latency.

        Call this during application startup if you want faster first generation.
        """
        _ = self._get_flux()

