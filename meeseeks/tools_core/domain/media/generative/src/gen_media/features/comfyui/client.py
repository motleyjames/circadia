"""
ComfyUI HTTP client for queueing prompts and fetching results.

Provides async interface to ComfyUI's REST API.
"""

import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

import httpx

from gen_media.config import get_settings
from gen_media.features.comfyui.types import (
    ComfyUIStatus,
    GenerationProgress,
    GenerationResult,
    PromptRequest,
    PromptResponse,
    PromptStatus,
)


class ComfyUIClient:
    """
    Async HTTP client for ComfyUI server.

    Usage:
        async with ComfyUIClient() as client:
            result = await client.generate(workflow, prompt="a beautiful sunset")
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 300.0,
        client_id: str | None = None,
    ):
        """
        Initialize ComfyUI client.

        Args:
            base_url: ComfyUI server URL. Defaults to settings.comfyui_url.
            timeout: Request timeout in seconds.
            client_id: Unique client identifier for websocket tracking.
        """
        settings = get_settings()
        self.base_url = (base_url or settings.comfyui_url).rstrip("/")
        self.timeout = timeout
        self.client_id = client_id or str(uuid.uuid4())
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ComfyUIClient":
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
            raise RuntimeError("ComfyUIClient must be used as async context manager")
        return self._client

    async def check_status(self) -> ComfyUIStatus:
        """Check if ComfyUI server is reachable and get its status."""
        try:
            response = await self.client.get("/system_stats")
            if response.status_code == 200:
                return ComfyUIStatus.CONNECTED
            return ComfyUIStatus.ERROR
        except httpx.ConnectError:
            return ComfyUIStatus.DISCONNECTED
        except Exception:
            return ComfyUIStatus.ERROR

    async def get_system_stats(self) -> dict[str, Any]:
        """Get ComfyUI system statistics."""
        response = await self.client.get("/system_stats")
        response.raise_for_status()
        return response.json()

    async def get_queue(self) -> dict[str, Any]:
        """Get current queue status."""
        response = await self.client.get("/queue")
        response.raise_for_status()
        return response.json()

    async def get_history(self, prompt_id: str | None = None) -> dict[str, Any]:
        """Get generation history."""
        url = f"/history/{prompt_id}" if prompt_id else "/history"
        response = await self.client.get(url)
        response.raise_for_status()
        return response.json()

    async def queue_prompt(self, request: PromptRequest) -> PromptResponse:
        """
        Queue a workflow for execution.

        Args:
            request: Prompt request containing workflow and metadata.

        Returns:
            Response with prompt ID and queue position.
        """
        payload = {
            "prompt": request.workflow,
            "client_id": request.client_id or self.client_id,
        }
        if request.extra_data:
            payload["extra_data"] = request.extra_data

        response = await self.client.post("/prompt", json=payload)
        response.raise_for_status()
        data = response.json()

        return PromptResponse(
            prompt_id=data["prompt_id"],
            number=data.get("number", 0),
            node_errors=data.get("node_errors", {}),
        )

    async def get_image(
        self,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        """
        Download an image from ComfyUI.

        Args:
            filename: Image filename.
            subfolder: Optional subfolder within the folder type.
            folder_type: One of "output", "input", or "temp".

        Returns:
            Raw image bytes.
        """
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type,
        }
        response = await self.client.get("/view", params=params)
        response.raise_for_status()
        return response.content

    async def upload_image(
        self,
        image_data: bytes,
        filename: str,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """
        Upload an image to ComfyUI input folder.

        Args:
            image_data: Raw image bytes.
            filename: Desired filename.
            overwrite: Whether to overwrite existing file.

        Returns:
            Upload result with final filename.
        """
        files = {"image": (filename, image_data)}
        data = {"overwrite": str(overwrite).lower()}

        response = await self.client.post("/upload/image", files=files, data=data)
        response.raise_for_status()
        return response.json()

    async def cancel_prompt(self, prompt_id: str) -> None:
        """Cancel a queued or running prompt."""
        await self.client.post("/interrupt")

    async def clear_queue(self) -> None:
        """Clear all queued prompts."""
        await self.client.post("/queue", json={"clear": True})

    async def wait_for_completion(
        self,
        prompt_id: str,
        poll_interval: float = 0.5,
        timeout: float | None = None,
    ) -> GenerationResult:
        """
        Wait for a prompt to complete.

        Args:
            prompt_id: ID of the queued prompt.
            poll_interval: Seconds between status checks.
            timeout: Maximum seconds to wait (None = no limit).

        Returns:
            Generation result with images.
        """
        start_time = time.time()
        elapsed = 0.0

        while True:
            history = await self.get_history(prompt_id)

            if prompt_id in history:
                entry = history[prompt_id]
                outputs = entry.get("outputs", {})

                images: list[bytes] = []
                for node_output in outputs.values():
                    if "images" in node_output:
                        for img_info in node_output["images"]:
                            img_data = await self.get_image(
                                filename=img_info["filename"],
                                subfolder=img_info.get("subfolder", ""),
                                folder_type=img_info.get("type", "output"),
                            )
                            images.append(img_data)

                elapsed = time.time() - start_time
                return GenerationResult(
                    prompt_id=prompt_id,
                    status=PromptStatus.COMPLETED,
                    image_data=images,
                    elapsed_time=elapsed,
                )

            if timeout and (time.time() - start_time) > timeout:
                return GenerationResult(
                    prompt_id=prompt_id,
                    status=PromptStatus.FAILED,
                    error=f"Timeout after {timeout} seconds",
                    elapsed_time=time.time() - start_time,
                )

            await asyncio.sleep(poll_interval)

    async def generate(
        self,
        workflow: dict[str, Any],
        wait: bool = True,
        save_to: Path | None = None,
        **workflow_overrides: Any,
    ) -> GenerationResult:
        """
        Generate images using a workflow.

        This is the main high-level method for image generation.

        Args:
            workflow: ComfyUI workflow dict.
            wait: Whether to wait for completion.
            save_to: Optional directory to save images.
            **workflow_overrides: Values to inject into workflow.

        Returns:
            Generation result with images.
        """
        modified_workflow = self._apply_overrides(workflow, workflow_overrides)

        request = PromptRequest(workflow=modified_workflow)
        response = await self.queue_prompt(request)

        if not wait:
            return GenerationResult(
                prompt_id=response.prompt_id,
                status=PromptStatus.QUEUED,
            )

        result = await self.wait_for_completion(response.prompt_id)

        if save_to and result.image_data:
            save_to = Path(save_to)
            save_to.mkdir(parents=True, exist_ok=True)

            for i, img_data in enumerate(result.image_data):
                img_path = save_to / f"{response.prompt_id}_{i}.png"
                img_path.write_bytes(img_data)
                result.images.append(img_path)

        return result

    def _apply_overrides(
        self,
        workflow: dict[str, Any],
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Apply parameter overrides to workflow nodes."""
        if not overrides:
            return workflow

        workflow = json.loads(json.dumps(workflow))

        for node_id, node in workflow.items():
            inputs = node.get("inputs", {})

            if "prompt" in overrides and "text" in inputs:
                inputs["text"] = overrides["prompt"]

            if "negative_prompt" in overrides and "text_negative" in inputs:
                inputs["text_negative"] = overrides["negative_prompt"]

            if "seed" in overrides and "seed" in inputs:
                inputs["seed"] = overrides["seed"]

            if "steps" in overrides and "steps" in inputs:
                inputs["steps"] = overrides["steps"]

            if "cfg" in overrides and "cfg" in inputs:
                inputs["cfg"] = overrides["cfg"]

            if "width" in overrides and "width" in inputs:
                inputs["width"] = overrides["width"]

            if "height" in overrides and "height" in inputs:
                inputs["height"] = overrides["height"]

        return workflow

