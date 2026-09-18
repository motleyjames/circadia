"""Type definitions for ComfyUI integration."""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class ComfyUIStatus(str, Enum):
    """ComfyUI server status."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    BUSY = "busy"
    ERROR = "error"


class PromptStatus(str, Enum):
    """Status of a queued prompt."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class PromptRequest:
    """Request to queue a prompt in ComfyUI."""

    workflow: dict[str, Any]
    client_id: str | None = None
    extra_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PromptResponse:
    """Response from queuing a prompt."""

    prompt_id: str
    number: int
    node_errors: dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationProgress:
    """Progress update for a generation."""

    prompt_id: str
    node: str
    step: int
    total_steps: int
    preview_image: bytes | None = None


@dataclass
class GenerationResult:
    """Result of an image generation."""

    prompt_id: str
    status: PromptStatus
    images: list[Path] = field(default_factory=list)
    image_data: list[bytes] = field(default_factory=list)
    elapsed_time: float = 0.0
    error: str | None = None


@dataclass
class NodeOutput:
    """Output from a single workflow node."""

    node_id: str
    images: list[dict[str, Any]] = field(default_factory=list)
    text: list[str] = field(default_factory=list)


@dataclass
class HistoryEntry:
    """Entry from ComfyUI history."""

    prompt_id: str
    prompt: dict[str, Any]
    outputs: dict[str, NodeOutput]
    status: dict[str, Any]

