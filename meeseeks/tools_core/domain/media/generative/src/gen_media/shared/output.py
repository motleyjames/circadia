"""
Output handling utilities for Gen-Media SDK.

Provides consistent image saving, naming, and format handling.
"""

from __future__ import annotations

import io
import time
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Union

from gen_media.config import get_settings

if TYPE_CHECKING:
    from PIL import Image


class OutputFormat(str, Enum):
    """Supported image output formats."""

    PNG = "png"
    JPEG = "jpeg"
    WEBP = "webp"

    @property
    def extension(self) -> str:
        """File extension for this format."""
        return f".{self.value}"

    @property
    def mime_type(self) -> str:
        """MIME type for this format."""
        return f"image/{self.value}"


def generate_filename(
    prefix: str = "gen",
    seed: int | None = None,
    backend: str | None = None,
    format: OutputFormat = OutputFormat.PNG,
) -> str:
    """
    Generate a unique filename for an image.

    Args:
        prefix: Filename prefix.
        seed: Random seed used for generation.
        backend: Backend name (comfyui, mflux, etc.).
        format: Output format.

    Returns:
        Unique filename with extension.
    """
    timestamp = int(time.time() * 1000)
    parts = [prefix]

    if backend:
        parts.append(backend)

    if seed is not None:
        parts.append(str(seed))

    parts.append(str(timestamp))

    return "_".join(parts) + format.extension


def save_image(
    image_data: Union[bytes, "Image.Image"],
    filename: str | None = None,
    output_path: Path | None = None,
    format: OutputFormat = OutputFormat.PNG,
    prefix: str = "gen",
    seed: int | None = None,
    backend: str | None = None,
    quality: int = 95,
) -> Path:
    """
    Save an image to disk.

    Args:
        image_data: Raw bytes or PIL Image.
        filename: Custom filename (without extension).
        output_path: Directory to save to. Defaults to settings.
        format: Output format.
        prefix: Filename prefix if auto-generating.
        seed: Random seed for filename.
        backend: Backend name for filename.
        quality: JPEG/WebP quality (1-100).

    Returns:
        Path to saved image.
    """
    settings = get_settings()
    output_dir = output_path or settings.output_path
    output_dir.mkdir(parents=True, exist_ok=True)

    if filename:
        if not filename.endswith(format.extension):
            filename = filename + format.extension
    else:
        filename = generate_filename(
            prefix=prefix,
            seed=seed,
            backend=backend,
            format=format,
        )

    file_path = output_dir / filename

    if isinstance(image_data, bytes):
        if format == OutputFormat.PNG:
            file_path.write_bytes(image_data)
        else:
            image = _bytes_to_pil(image_data)
            _save_pil(image, file_path, format, quality)
    else:
        _save_pil(image_data, file_path, format, quality)

    return file_path


def _bytes_to_pil(data: bytes) -> "Image.Image":
    """Convert bytes to PIL Image."""
    from PIL import Image
    return Image.open(io.BytesIO(data))


def _save_pil(
    image: "Image.Image",
    path: Path,
    format: OutputFormat,
    quality: int,
) -> None:
    """Save PIL Image to disk."""
    save_kwargs = {}

    if format == OutputFormat.PNG:
        save_kwargs["compress_level"] = 6
    elif format in (OutputFormat.JPEG, OutputFormat.WEBP):
        save_kwargs["quality"] = quality

    if format == OutputFormat.JPEG and image.mode == "RGBA":
        image = image.convert("RGB")

    image.save(path, format=format.value.upper(), **save_kwargs)


def convert_format(
    image_data: bytes,
    target_format: OutputFormat,
    quality: int = 95,
) -> bytes:
    """
    Convert image data to a different format.

    Args:
        image_data: Source image bytes.
        target_format: Target output format.
        quality: Quality for lossy formats.

    Returns:
        Converted image bytes.
    """
    image = _bytes_to_pil(image_data)

    if target_format == OutputFormat.JPEG and image.mode == "RGBA":
        image = image.convert("RGB")

    buffer = io.BytesIO()
    save_kwargs = {}

    if target_format == OutputFormat.PNG:
        save_kwargs["compress_level"] = 6
    elif target_format in (OutputFormat.JPEG, OutputFormat.WEBP):
        save_kwargs["quality"] = quality

    image.save(buffer, format=target_format.value.upper(), **save_kwargs)
    return buffer.getvalue()


def get_image_info(image_data: bytes) -> dict:
    """
    Get information about an image.

    Args:
        image_data: Image bytes.

    Returns:
        Dict with width, height, mode, format.
    """
    image = _bytes_to_pil(image_data)
    return {
        "width": image.width,
        "height": image.height,
        "mode": image.mode,
        "format": image.format,
    }


def resize_image(
    image_data: bytes,
    width: int | None = None,
    height: int | None = None,
    maintain_aspect: bool = True,
) -> bytes:
    """
    Resize an image.

    Args:
        image_data: Source image bytes.
        width: Target width (optional).
        height: Target height (optional).
        maintain_aspect: Whether to maintain aspect ratio.

    Returns:
        Resized image as PNG bytes.
    """
    from PIL import Image

    image = _bytes_to_pil(image_data)
    original_format = image.format or "PNG"

    if width is None and height is None:
        return image_data

    if maintain_aspect:
        if width and height:
            image.thumbnail((width, height), Image.Resampling.LANCZOS)
        elif width:
            ratio = width / image.width
            height = int(image.height * ratio)
            image = image.resize((width, height), Image.Resampling.LANCZOS)
        elif height:
            ratio = height / image.height
            width = int(image.width * ratio)
            image = image.resize((width, height), Image.Resampling.LANCZOS)
    else:
        new_width = width or image.width
        new_height = height or image.height
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format=original_format)
    return buffer.getvalue()

