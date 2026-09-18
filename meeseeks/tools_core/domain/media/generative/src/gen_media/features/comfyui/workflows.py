"""
Workflow management for ComfyUI.

Handles loading, modifying, and templating ComfyUI workflow JSON files.
"""

import json
from pathlib import Path
from typing import Any

from gen_media.config import get_settings


class WorkflowManager:
    """
    Manages ComfyUI workflow templates.

    Usage:
        manager = WorkflowManager()
        workflow = manager.load("flux-schnell")
        workflow = manager.with_prompt(workflow, "a beautiful sunset")
    """

    def __init__(self, workflows_path: Path | None = None):
        """
        Initialize workflow manager.

        Args:
            workflows_path: Directory containing workflow JSON files.
                          Defaults to settings.workflows_path.
        """
        settings = get_settings()
        self.workflows_path = workflows_path or settings.workflows_path

    def list_workflows(self) -> list[str]:
        """List available workflow names."""
        if not self.workflows_path.exists():
            return []

        return [
            p.stem
            for p in self.workflows_path.glob("*.json")
            if not p.name.startswith("_")
        ]

    def load(self, name: str) -> dict[str, Any]:
        """
        Load a workflow by name.

        Args:
            name: Workflow name (without .json extension).

        Returns:
            Workflow dict ready for execution.

        Raises:
            FileNotFoundError: If workflow doesn't exist.
        """
        workflow_path = self.workflows_path / f"{name}.json"
        if not workflow_path.exists():
            raise FileNotFoundError(f"Workflow not found: {workflow_path}")

        with open(workflow_path, "r") as f:
            return json.load(f)

    def save(self, name: str, workflow: dict[str, Any]) -> Path:
        """
        Save a workflow.

        Args:
            name: Workflow name.
            workflow: Workflow dict.

        Returns:
            Path to saved workflow file.
        """
        self.workflows_path.mkdir(parents=True, exist_ok=True)
        workflow_path = self.workflows_path / f"{name}.json"

        with open(workflow_path, "w") as f:
            json.dump(workflow, f, indent=2)

        return workflow_path

    def with_prompt(
        self,
        workflow: dict[str, Any],
        prompt: str,
        negative_prompt: str = "",
    ) -> dict[str, Any]:
        """
        Set prompt text in workflow.

        Finds CLIPTextEncode nodes and updates their text inputs.

        Args:
            workflow: Workflow dict.
            prompt: Positive prompt text.
            negative_prompt: Negative prompt text.

        Returns:
            Modified workflow dict.
        """
        workflow = json.loads(json.dumps(workflow))

        for node_id, node in workflow.items():
            class_type = node.get("class_type", "")

            if class_type == "CLIPTextEncode":
                inputs = node.get("inputs", {})
                if "text" in inputs:
                    if self._is_negative_node(node_id, workflow):
                        inputs["text"] = negative_prompt or ""
                    else:
                        inputs["text"] = prompt

        return workflow

    def with_model(self, workflow: dict[str, Any], model_name: str) -> dict[str, Any]:
        """
        Set checkpoint model in workflow.

        Args:
            workflow: Workflow dict.
            model_name: Checkpoint filename.

        Returns:
            Modified workflow dict.
        """
        workflow = json.loads(json.dumps(workflow))

        for node in workflow.values():
            class_type = node.get("class_type", "")

            if class_type in ("CheckpointLoaderSimple", "CheckpointLoader"):
                inputs = node.get("inputs", {})
                if "ckpt_name" in inputs:
                    inputs["ckpt_name"] = model_name

        return workflow

    def with_size(
        self,
        workflow: dict[str, Any],
        width: int,
        height: int,
    ) -> dict[str, Any]:
        """
        Set image dimensions in workflow.

        Args:
            workflow: Workflow dict.
            width: Image width in pixels.
            height: Image height in pixels.

        Returns:
            Modified workflow dict.
        """
        workflow = json.loads(json.dumps(workflow))

        for node in workflow.values():
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            if class_type == "EmptyLatentImage":
                if "width" in inputs:
                    inputs["width"] = width
                if "height" in inputs:
                    inputs["height"] = height

            if class_type in ("KSampler", "SamplerCustom"):
                pass

        return workflow

    def with_seed(self, workflow: dict[str, Any], seed: int) -> dict[str, Any]:
        """
        Set random seed in workflow.

        Args:
            workflow: Workflow dict.
            seed: Random seed value.

        Returns:
            Modified workflow dict.
        """
        workflow = json.loads(json.dumps(workflow))

        for node in workflow.values():
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            if class_type in ("KSampler", "KSamplerAdvanced", "SamplerCustom"):
                if "seed" in inputs:
                    inputs["seed"] = seed

        return workflow

    def with_steps(self, workflow: dict[str, Any], steps: int) -> dict[str, Any]:
        """
        Set inference steps in workflow.

        Args:
            workflow: Workflow dict.
            steps: Number of inference steps.

        Returns:
            Modified workflow dict.
        """
        workflow = json.loads(json.dumps(workflow))

        for node in workflow.values():
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            if class_type in ("KSampler", "KSamplerAdvanced", "SamplerCustom"):
                if "steps" in inputs:
                    inputs["steps"] = steps

        return workflow

    def _is_negative_node(self, node_id: str, workflow: dict[str, Any]) -> bool:
        """Check if a text encode node is for negative prompts."""
        for other_id, other_node in workflow.items():
            inputs = other_node.get("inputs", {})
            if "negative" in inputs:
                neg_ref = inputs["negative"]
                if isinstance(neg_ref, list) and len(neg_ref) > 0:
                    if neg_ref[0] == node_id:
                        return True

        return "negative" in node_id.lower() or "neg" in node_id.lower()

