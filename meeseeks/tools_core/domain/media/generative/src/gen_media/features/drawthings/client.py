"""
Draw Things HTTP client for local API.

Draw Things is a macOS app with an optional HTTP API that can be enabled
in settings. This client provides programmatic access to image generation.
"""

import base64
import time
from pathlib import Path
from typing import Any

import httpx

from gen_media.config import get_settings
from gen_media.features.drawthings.types import (
    DrawThingsConfig,
    DrawThingsModel,
    DrawThingsResult,
    DrawThingsStatus,
    Sampler,
)


class DrawThingsClient:
    """
    HTTP client for Draw Things local API.

    Draw Things must be running with API enabled (Settings → API → Enable HTTP API).

    Usage:
        async with DrawThingsClient() as client:
            result = await client.generate("a beautiful sunset")
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 300.0,
        output_path: Path | None = None,
    ):
        """
        Initialize Draw Things client.

        Args:
            base_url: Draw Things API URL. Defaults to settings.drawthings_url.
            timeout: Request timeout in seconds.
            output_path: Directory for saving images.
        """
        settings = get_settings()
        self.base_url = (base_url or settings.drawthings_url).rstrip("/")
        self.timeout = timeout
        self.output_path = output_path or settings.output_path
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "DrawThingsClient":
        """Enter async context."""
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Exit async context."""
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get HTTP client, raising if not in context."""
        if self._client is None:
            raise RuntimeError("DrawThingsClient must be used as async context manager")
        return self._client

    async def check_status(self) -> DrawThingsStatus:
        """Check if Draw Things API is reachable."""
        try:
            response = await self.client.get("/sdapi/v1/options")
            if response.status_code == 200:
                return DrawThingsStatus.CONNECTED
            return DrawThingsStatus.ERROR
        except httpx.ConnectError:
            return DrawThingsStatus.DISCONNECTED
        except Exception:
            return DrawThingsStatus.ERROR

    async def get_models(self) -> list[dict[str, Any]]:
        """Get available models."""
        response = await self.client.get("/sdapi/v1/sd-models")
        response.raise_for_status()
        return response.json()

    async def get_samplers(self) -> list[dict[str, Any]]:
        """Get available samplers."""
        response = await self.client.get("/sdapi/v1/samplers")
        response.raise_for_status()
        return response.json()

    async def get_options(self) -> dict[str, Any]:
        """Get current generation options."""
        response = await self.client.get("/sdapi/v1/options")
        response.raise_for_status()
        return response.json()

    async def set_options(self, options: dict[str, Any]) -> None:
        """Set generation options."""
        response = await self.client.post("/sdapi/v1/options", json=options)
        response.raise_for_status()

    async def generate(
        self,
        prompt: str,
        model: str | DrawThingsModel | None = None,
        width: int | None = None,
        height: int | None = None,
        steps: int | None = None,
        cfg_scale: float = 7.0,
        seed: int = -1,
        sampler: Sampler = Sampler.DPM_PLUS_2M_KARRAS,
        negative_prompt: str = "",
        batch_size: int = 1,
        save: bool = True,
    ) -> DrawThingsResult:
        """
        Generate images from a text prompt.

        Args:
            prompt: Text description of the image to generate.
            model: Model to use (optional, uses current if not specified).
            width: Image width in pixels.
            height: Image height in pixels.
            steps: Number of inference steps.
            cfg_scale: CFG scale for prompt adherence.
            seed: Random seed (-1 for random).
            sampler: Sampling algorithm.
            negative_prompt: What to avoid in the image.
            batch_size: Number of images to generate.
            save: Whether to save images to disk.

        Returns:
            DrawThingsResult with image data and metadata.
        """
        settings = get_settings()

        config = DrawThingsConfig(
            prompt=prompt,
            model=model or DrawThingsModel.SDXL_TURBO,
            width=width or settings.default_width,
            height=height or settings.default_height,
            steps=steps,
            cfg_scale=cfg_scale,
            seed=seed,
            sampler=sampler,
            negative_prompt=negative_prompt,
            batch_size=batch_size,
        )

        return await self.generate_from_config(config, save=save)

    async def generate_from_config(
        self,
        config: DrawThingsConfig,
        save: bool = True,
    ) -> DrawThingsResult:
        """
        Generate images from a configuration object.

        Args:
            config: Generation configuration.
            save: Whether to save images to disk.

        Returns:
            DrawThingsResult with image data and metadata.
        """
        start_time = time.time()

        try:
            payload = self._build_payload(config)
            response = await self.client.post("/sdapi/v1/txt2img", json=payload)
            response.raise_for_status()

            data = response.json()
            images_b64 = data.get("images", [])
            info = data.get("info", {})

            if isinstance(info, str):
                import json
                info = json.loads(info)

            image_data = [base64.b64decode(img) for img in images_b64]

            image_paths: list[Path] = []
            if save and image_data:
                image_paths = self._save_images(image_data, config)

            elapsed = time.time() - start_time

            return DrawThingsResult(
                images=image_paths,
                image_data=image_data,
                prompt=config.prompt,
                seed=info.get("seed", config.seed),
                elapsed_time=elapsed,
                model=str(config.model.value if isinstance(config.model, DrawThingsModel) else config.model),
                width=config.width,
                height=config.height,
                steps=config.steps or 20,
                success=True,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            return DrawThingsResult(
                prompt=config.prompt,
                elapsed_time=elapsed,
                model=str(config.model.value if isinstance(config.model, DrawThingsModel) else config.model),
                width=config.width,
                height=config.height,
                steps=config.steps or 20,
                error=str(e),
                success=False,
            )

    async def img2img(
        self,
        prompt: str,
        init_image: bytes,
        strength: float = 0.75,
        **kwargs: Any,
    ) -> DrawThingsResult:
        """
        Generate images from an existing image.

        Args:
            prompt: Text description for the transformation.
            init_image: Initial image bytes.
            strength: How much to transform (0.0 = no change, 1.0 = full change).
            **kwargs: Additional generation parameters.

        Returns:
            DrawThingsResult with image data and metadata.
        """
        start_time = time.time()
        settings = get_settings()

        try:
            init_b64 = base64.b64encode(init_image).decode("utf-8")

            payload = {
                "prompt": prompt,
                "negative_prompt": kwargs.get("negative_prompt", ""),
                "init_images": [init_b64],
                "denoising_strength": strength,
                "width": kwargs.get("width", settings.default_width),
                "height": kwargs.get("height", settings.default_height),
                "steps": kwargs.get("steps", 20),
                "cfg_scale": kwargs.get("cfg_scale", 7.0),
                "seed": kwargs.get("seed", -1),
                "sampler_name": kwargs.get("sampler", Sampler.DPM_PLUS_2M_KARRAS).value,
            }

            response = await self.client.post("/sdapi/v1/img2img", json=payload)
            response.raise_for_status()

            data = response.json()
            images_b64 = data.get("images", [])
            image_data = [base64.b64decode(img) for img in images_b64]

            elapsed = time.time() - start_time

            return DrawThingsResult(
                image_data=image_data,
                prompt=prompt,
                elapsed_time=elapsed,
                success=True,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            return DrawThingsResult(
                prompt=prompt,
                elapsed_time=elapsed,
                error=str(e),
                success=False,
            )

    async def interrupt(self) -> None:
        """Interrupt the current generation."""
        await self.client.post("/sdapi/v1/interrupt")

    def _build_payload(self, config: DrawThingsConfig) -> dict[str, Any]:
        """Build API payload from config."""
        sampler_name = config.sampler.value if isinstance(config.sampler, Sampler) else config.sampler

        return {
            "prompt": config.prompt,
            "negative_prompt": config.negative_prompt,
            "width": config.width,
            "height": config.height,
            "steps": config.steps or 20,
            "cfg_scale": config.cfg_scale,
            "seed": config.seed,
            "sampler_name": sampler_name,
            "batch_size": config.batch_size,
            "clip_skip": config.clip_skip,
        }

    def _save_images(
        self,
        image_data: list[bytes],
        config: DrawThingsConfig,
    ) -> list[Path]:
        """Save images to disk."""
        self.output_path.mkdir(parents=True, exist_ok=True)

        paths: list[Path] = []
        timestamp = int(time.time() * 1000)

        for i, data in enumerate(image_data):
            model_name = config.model.value if isinstance(config.model, DrawThingsModel) else config.model
            filename = f"drawthings_{model_name}_{timestamp}_{i}.png"
            path = self.output_path / filename
            path.write_bytes(data)
            paths.append(path)

        return paths

