"""
Z-Image generator using ComfyUI workflows.

Z-Image is a bilingual text-to-image model with excellent text rendering
capabilities. This generator uses ComfyUI as the backend.
"""

import random
import time
from pathlib import Path
from typing import Any

from gen_media.config import get_settings
from gen_media.features.comfyui import ComfyUIClient, WorkflowManager
from gen_media.features.zimage.types import (
    ZImageConfig,
    ZImageModel,
    ZImageResult,
)


class ZImageGenerator:
    """
    Z-Image generator using ComfyUI as backend.

    Generates images using Z-Image models through ComfyUI workflows,
    which provides better text rendering and bilingual support.

    Usage:
        async with ZImageGenerator() as generator:
            result = await generator.generate("a sign that says HELLO")
    """

    def __init__(
        self,
        model: ZImageModel = ZImageModel.TURBO,
        comfyui_url: str | None = None,
        output_path: Path | None = None,
    ):
        """
        Initialize Z-Image generator.

        Args:
            model: Which Z-Image model variant to use.
            comfyui_url: ComfyUI server URL. Defaults to settings.
            output_path: Directory for saving images. Defaults to settings.
        """
        self.model = model
        settings = get_settings()
        self.comfyui_url = comfyui_url or settings.comfyui_url
        self.output_path = output_path or settings.output_path
        self._client: ComfyUIClient | None = None
        self._workflow_manager = WorkflowManager()

    async def __aenter__(self) -> "ZImageGenerator":
        """Enter async context."""
        self._client = ComfyUIClient(base_url=self.comfyui_url)
        await self._client.__aenter__()
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Exit async context."""
        if self._client:
            await self._client.__aexit__(*args)
            self._client = None

    @property
    def client(self) -> ComfyUIClient:
        """Get ComfyUI client, raising if not in context."""
        if self._client is None:
            raise RuntimeError("ZImageGenerator must be used as async context manager")
        return self._client

    async def generate(
        self,
        prompt: str,
        width: int | None = None,
        height: int | None = None,
        steps: int | None = None,
        cfg_scale: float = 7.5,
        seed: int | None = None,
        negative_prompt: str = "",
        save: bool = True,
    ) -> ZImageResult:
        """
        Generate an image from a text prompt.

        Args:
            prompt: Text description of the image to generate.
            width: Image width in pixels.
            height: Image height in pixels.
            steps: Number of inference steps.
            cfg_scale: CFG scale for prompt adherence.
            seed: Random seed for reproducibility.
            negative_prompt: What to avoid in the image.
            save: Whether to save the image to disk.

        Returns:
            ZImageResult with image data and metadata.
        """
        settings = get_settings()

        config = ZImageConfig(
            prompt=prompt,
            model=self.model,
            width=width or settings.default_width,
            height=height or settings.default_height,
            steps=steps,
            cfg_scale=cfg_scale,
            seed=seed,
            negative_prompt=negative_prompt,
        )

        return await self.generate_from_config(config, save=save)

    async def generate_from_config(
        self,
        config: ZImageConfig,
        save: bool = True,
    ) -> ZImageResult:
        """
        Generate an image from a configuration object.

        Args:
            config: Generation configuration.
            save: Whether to save the image to disk.

        Returns:
            ZImageResult with image data and metadata.
        """
        start_time = time.time()

        try:
            workflow = self._build_workflow(config)

            save_path = self.output_path if save else None
            result = await self.client.generate(
                workflow=workflow,
                wait=True,
                save_to=save_path,
            )

            elapsed = time.time() - start_time

            image_data = result.image_data[0] if result.image_data else None
            image_path = result.images[0] if result.images else None

            return ZImageResult(
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
                comfyui_prompt_id=result.prompt_id,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            return ZImageResult(
                prompt=config.prompt,
                elapsed_time=elapsed,
                model=config.model,
                width=config.width,
                height=config.height,
                steps=config.steps or config.model.default_steps,
                error=str(e),
                success=False,
            )

    def _build_workflow(self, config: ZImageConfig) -> dict[str, Any]:
        """
        Build ComfyUI workflow for Z-Image generation.

        Args:
            config: Generation configuration.

        Returns:
            ComfyUI workflow dict.
        """
        seed = config.seed if config.seed is not None else random.randint(0, 2**32 - 1)

        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": config.model.checkpoint_name,
                },
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": config.prompt,
                    "clip": ["1", 1],
                },
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": config.negative_prompt,
                    "clip": ["1", 1],
                },
            },
            "4": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": config.width,
                    "height": config.height,
                    "batch_size": 1,
                },
            },
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": seed,
                    "steps": config.steps or config.model.default_steps,
                    "cfg": config.cfg_scale,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0],
                },
            },
            "6": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["5", 0],
                    "vae": ["1", 2],
                },
            },
            "7": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": f"zimage_{config.model.value}",
                    "images": ["6", 0],
                },
            },
        }

        return workflow

    async def generate_with_workflow(
        self,
        workflow_name: str,
        prompt: str,
        **overrides: Any,
    ) -> ZImageResult:
        """
        Generate using a saved workflow template.

        Args:
            workflow_name: Name of the workflow to load.
            prompt: Text prompt.
            **overrides: Additional workflow parameter overrides.

        Returns:
            ZImageResult with image data and metadata.
        """
        start_time = time.time()

        try:
            workflow = self._workflow_manager.load(workflow_name)
            workflow = self._workflow_manager.with_prompt(workflow, prompt)

            result = await self.client.generate(
                workflow=workflow,
                wait=True,
                save_to=self.output_path,
                **overrides,
            )

            elapsed = time.time() - start_time

            image_data = result.image_data[0] if result.image_data else None
            image_path = result.images[0] if result.images else None

            return ZImageResult(
                image_path=image_path,
                image_data=image_data,
                prompt=prompt,
                elapsed_time=elapsed,
                model=self.model,
                success=True,
                comfyui_prompt_id=result.prompt_id,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            return ZImageResult(
                prompt=prompt,
                elapsed_time=elapsed,
                error=str(e),
                success=False,
            )

