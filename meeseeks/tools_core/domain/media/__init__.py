"""
Media Domain Module - Generative Media Tools

Unified SDK for local image generation supporting multiple backends:
- ComfyUI: Full Stable Diffusion/Flux workflows
- MFlux: Apple Silicon optimized Flux (fastest on Mac)
- DrawThings: macOS native generation
- zImage: Bilingual text-to-image with text rendering

INSTALLATION REQUIRED:
    cd tools_core/domain/media/generative
    pip install -e .
    # Or with MFlux: pip install -e ".[mflux]"

HEADLESS CLI:
    python -m tools_core.domain.media.cli "a cyberpunk city" output.png --backend mflux

PYTHON API:
    from gen_media import MFluxGenerator
    generator = MFluxGenerator()
    result = generator.generate("a cyberpunk city")
"""

import subprocess
import sys
from pathlib import Path
from typing import Optional, Literal

# Check if gen_media is installed
GEN_MEDIA_AVAILABLE = False
try:
    import gen_media
    GEN_MEDIA_AVAILABLE = True
except ImportError:
    pass


def generate_image(
    prompt: str,
    output_path: Optional[str] = None,
    backend: Literal["mflux", "comfyui", "drawthings", "zimage"] = "mflux",
    width: int = 1024,
    height: int = 1024,
    steps: Optional[int] = None,
    seed: Optional[int] = None,
) -> dict:
    """
    Generate an image using local models.
    
    Args:
        prompt: Text description of the image to generate
        output_path: Where to save the image (default: ./output/generated.png)
        backend: Which backend to use (mflux, comfyui, drawthings, zimage)
        width: Image width
        height: Image height
        steps: Number of inference steps (backend-dependent)
        seed: Random seed for reproducibility
        
    Returns:
        dict with 'success', 'path', 'error', 'elapsed_time'
        
    Example:
        >>> result = generate_image("a red panda", backend="mflux")
        >>> if result['success']:
        ...     print(f"Saved to: {result['path']}")
    """
    if not GEN_MEDIA_AVAILABLE:
        return {
            "success": False,
            "error": "gen_media not installed. Run: cd tools_core/domain/media/generative && pip install -e .",
            "path": None,
            "elapsed_time": 0,
        }
    
    output_path = output_path or f"./output/generated_{backend}.png"
    
    try:
        if backend == "mflux":
            from gen_media import MFluxGenerator
            generator = MFluxGenerator()
            result = generator.generate(
                prompt=prompt,
                width=width,
                height=height,
                steps=steps or 4,
                seed=seed,
            )
            return {
                "success": result.success,
                "path": str(result.image_path) if result.image_path else None,
                "error": result.error,
                "elapsed_time": result.elapsed_time,
            }
            
        elif backend == "comfyui":
            import asyncio
            from gen_media import ComfyUIClient
            from gen_media.features.comfyui import WorkflowManager
            
            async def _generate():
                manager = WorkflowManager()
                workflow = manager.load("flux-schnell")
                workflow = manager.with_prompt(workflow, prompt)
                workflow = manager.with_size(workflow, width, height)
                if seed:
                    workflow = manager.with_seed(workflow, seed)
                
                async with ComfyUIClient() as client:
                    return await client.generate(workflow)
            
            result = asyncio.run(_generate())
            # Save first image
            if result.image_data:
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                Path(output_path).write_bytes(result.image_data[0])
                return {
                    "success": True,
                    "path": output_path,
                    "error": None,
                    "elapsed_time": result.elapsed_time,
                }
            return {"success": False, "error": "No images generated", "path": None, "elapsed_time": 0}
            
        elif backend == "drawthings":
            import asyncio
            from gen_media import DrawThingsClient
            
            async def _generate():
                async with DrawThingsClient() as client:
                    return await client.generate(
                        prompt=prompt,
                        width=width,
                        height=height,
                        steps=steps or 4,
                        seed=seed,
                    )
            
            result = asyncio.run(_generate())
            if result.success and result.images:
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                result.images[0].save(output_path)
                return {
                    "success": True,
                    "path": output_path,
                    "error": None,
                    "elapsed_time": result.elapsed_time,
                }
            return {"success": False, "error": result.error, "path": None, "elapsed_time": 0}
            
        elif backend == "zimage":
            import asyncio
            from gen_media import ZImageGenerator
            
            async def _generate():
                async with ZImageGenerator() as generator:
                    return await generator.generate(
                        prompt=prompt,
                        width=width,
                        height=height,
                    )
            
            result = asyncio.run(_generate())
            return {
                "success": result.success,
                "path": str(result.image_path) if result.image_path else None,
                "error": result.error,
                "elapsed_time": result.elapsed_time,
            }
            
        else:
            return {"success": False, "error": f"Unknown backend: {backend}", "path": None, "elapsed_time": 0}
            
    except Exception as e:
        return {"success": False, "error": str(e), "path": None, "elapsed_time": 0}


def check_backends() -> dict:
    """
    Check which generation backends are available.
    
    Returns:
        dict mapping backend name to availability status
    """
    status = {
        "gen_media_installed": GEN_MEDIA_AVAILABLE,
        "backends": {}
    }
    
    if not GEN_MEDIA_AVAILABLE:
        return status
    
    # Check MFlux
    try:
        from gen_media import MFluxGenerator
        status["backends"]["mflux"] = True
    except ImportError:
        status["backends"]["mflux"] = False
    
    # Check ComfyUI (requires server running)
    try:
        import httpx
        resp = httpx.get("http://127.0.0.1:8188/system_stats", timeout=2)
        status["backends"]["comfyui"] = resp.status_code == 200
    except:
        status["backends"]["comfyui"] = False
    
    # Check Draw Things (requires app running)
    try:
        import httpx
        resp = httpx.get("http://127.0.0.1:7860/", timeout=2)
        status["backends"]["drawthings"] = resp.status_code == 200
    except:
        status["backends"]["drawthings"] = False
    
    # Check Z-Image (via ComfyUI)
    status["backends"]["zimage"] = status["backends"].get("comfyui", False)
    
    return status


__all__ = [
    'generate_image',
    'check_backends',
    'GEN_MEDIA_AVAILABLE',
]
