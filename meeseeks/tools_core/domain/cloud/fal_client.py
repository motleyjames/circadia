#!/usr/bin/env python3
"""
Meeseeks FAL AI Client - Cloud Generative Media
"I'M MR. MEESEEKS! I KNOW ALL THE CLOUD MODELS!"

Direct SDK integration with FAL.ai - no server needed.
Supports intelligent model selection based on task requirements.

Usage:
    from tools_core.domain.cloud import generate_image, generate_video, list_models
    
    # Let Meeseeks choose the best model
    result = generate_image("a cyberpunk city", priority="quality")
    
    # Or specify explicitly
    result = generate_video("a cat dancing", model="veo3.1-fast")
"""

import os
import json
import httpx
from pathlib import Path
from typing import Dict, Any, Optional, List, Literal
from dataclasses import dataclass
from datetime import datetime

# Load FAL_KEY from API_CONFIG.env
def _load_fal_key() -> Optional[str]:
    """Load FAL_KEY from box/API_CONFIG.env or environment."""
    # Check environment first
    if os.environ.get("FAL_KEY"):
        return os.environ["FAL_KEY"]
    
    # Try to load from API_CONFIG.env
    config_paths = [
        Path(__file__).parent.parent.parent.parent / "box" / "API_CONFIG.env",
        Path("box/API_CONFIG.env"),
    ]
    
    for config_path in config_paths:
        if config_path.exists():
            with open(config_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("FAL_KEY=") and not line.startswith("#"):
                        key = line.split("=", 1)[1].strip()
                        # Strip quotes if present
                        if key.startswith('"') and key.endswith('"'):
                            key = key[1:-1]
                        if key.startswith("'") and key.endswith("'"):
                            key = key[1:-1]
                        if key:
                            os.environ["FAL_KEY"] = key
                            return key
    return None


# =============================================================================
# MODEL CATALOG - All available FAL models with metadata
# =============================================================================

@dataclass
class ModelInfo:
    """Information about a FAL model."""
    id: str
    name: str
    endpoint: str
    category: str
    output_type: str  # image, video, audio, 3d, json
    speed: Literal["fastest", "fast", "medium", "slow"]
    quality: Literal["best", "great", "good", "ok"]
    cost: Literal["$", "$$", "$$$", "$$$$"]
    description: str
    output_key: str = "images"  # Key in response containing output
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "endpoint": self.endpoint,
            "category": self.category,
            "output_type": self.output_type,
            "speed": self.speed,
            "quality": self.quality,
            "cost": self.cost,
            "description": self.description,
        }


# Full model catalog - updated January 2026
FAL_MODELS: Dict[str, Dict[str, ModelInfo]] = {
    # =========================================================================
    # IMAGE GENERATION
    # =========================================================================
    "image": {
        "flux-schnell": ModelInfo(
            id="flux-schnell", name="FLUX.1 [schnell]",
            endpoint="fal-ai/flux/schnell", category="image", output_type="image",
            speed="fast", quality="good", cost="$",
            description="Fast Flux model, good for iteration",
            output_key="images",
        ),
        "flux-dev": ModelInfo(
            id="flux-dev", name="FLUX.1 [dev]",
            endpoint="fal-ai/flux/dev", category="image", output_type="image",
            speed="medium", quality="great", cost="$$",
            description="High quality Flux, balanced speed/quality",
            output_key="images",
        ),
        "flux-pro": ModelInfo(
            id="flux-pro", name="FLUX.1 [pro]",
            endpoint="fal-ai/flux-pro/v1.1", category="image", output_type="image",
            speed="slow", quality="best", cost="$$$",
            description="Professional quality Flux",
            output_key="images",
        ),
        "flux-pro-ultra": ModelInfo(
            id="flux-pro-ultra", name="FLUX.1 [pro] Ultra",
            endpoint="fal-ai/flux-pro/v1.1-ultra", category="image", output_type="image",
            speed="slow", quality="best", cost="$$$$",
            description="Ultra quality Flux, highest resolution",
            output_key="images",
        ),
        "recraft-v3": ModelInfo(
            id="recraft-v3", name="Recraft V3",
            endpoint="fal-ai/recraft-v3", category="image", output_type="image",
            speed="medium", quality="great", cost="$$",
            description="Great for design, icons, illustrations",
            output_key="images",
        ),
        "ideogram-v2": ModelInfo(
            id="ideogram-v2", name="Ideogram V2",
            endpoint="fal-ai/ideogram/v2", category="image", output_type="image",
            speed="medium", quality="great", cost="$$",
            description="Excellent text rendering in images",
            output_key="images",
        ),
        "ideogram-v3": ModelInfo(
            id="ideogram-v3", name="Ideogram V3",
            endpoint="fal-ai/ideogram/v3", category="image", output_type="image",
            speed="medium", quality="best", cost="$$$",
            description="Best text rendering, latest Ideogram",
            output_key="images",
        ),
        "aura-flow": ModelInfo(
            id="aura-flow", name="Aura Flow",
            endpoint="fal-ai/aura-flow", category="image", output_type="image",
            speed="fast", quality="good", cost="$",
            description="Open source, fast generation",
            output_key="images",
        ),
        "sdxl-turbo": ModelInfo(
            id="sdxl-turbo", name="SDXL Turbo",
            endpoint="fal-ai/fast-sdxl", category="image", output_type="image",
            speed="fastest", quality="ok", cost="$",
            description="Fastest SDXL, good for previews",
            output_key="images",
        ),
        "gpt-image": ModelInfo(
            id="gpt-image", name="GPT Image 1.5",
            endpoint="fal-ai/gpt-image-1/text-to-image", category="image", output_type="image",
            speed="medium", quality="great", cost="$$",
            description="GPT-powered image generation",
            output_key="images",
        ),
        "nano-banana": ModelInfo(
            id="nano-banana", name="Nano Banana (Gemini)",
            endpoint="fal-ai/nano-banana", category="image", output_type="image",
            speed="fast", quality="great", cost="$$",
            description="Gemini-powered, great quality",
            output_key="images",
        ),
    },
    
    # =========================================================================
    # VIDEO GENERATION
    # =========================================================================
    "video": {
        "veo3.1-fast": ModelInfo(
            id="veo3.1-fast", name="Veo 3.1 Fast (Text-to-Video)",
            endpoint="fal-ai/veo3.1/fast/text-to-video", category="video", output_type="video",
            speed="fast", quality="great", cost="$$",
            description="Fast Google Veo, good quality",
            output_key="video",
        ),
        "veo3.1-quality": ModelInfo(
            id="veo3.1-quality", name="Veo 3.1 Quality",
            endpoint="fal-ai/veo3.1/quality/text-to-video", category="video", output_type="video",
            speed="medium", quality="best", cost="$$$",
            description="High quality Google Veo",
            output_key="video",
        ),
        "veo3.1-i2v": ModelInfo(
            id="veo3.1-i2v", name="Veo 3.1 Image-to-Video",
            endpoint="fal-ai/veo3.1/quality/image-to-video", category="video", output_type="video",
            speed="medium", quality="best", cost="$$$",
            description="Animate images with Veo",
            output_key="video",
        ),
        "veo3.1-flf2v": ModelInfo(
            id="veo3.1-flf2v", name="Veo 3.1 First-Last Frame",
            endpoint="fal-ai/veo3.1/quality/first-last-frame-to-video", category="video", output_type="video",
            speed="medium", quality="best", cost="$$$",
            description="Generate video from start and end frames",
            output_key="video",
        ),
        "sora-2-pro": ModelInfo(
            id="sora-2-pro", name="Sora 2 Pro",
            endpoint="fal-ai/sora-2/text-to-video/pro", category="video", output_type="video",
            speed="slow", quality="best", cost="$$$$",
            description="OpenAI Sora 2, highest quality",
            output_key="video",
        ),
        "minimax-video": ModelInfo(
            id="minimax-video", name="MiniMax Video-01",
            endpoint="fal-ai/minimax-video/video-01", category="video", output_type="video",
            speed="medium", quality="great", cost="$$$",
            description="High quality video generation",
            output_key="video",
        ),
        "kling-v2": ModelInfo(
            id="kling-v2", name="Kling V2 Master",
            endpoint="fal-ai/kling-video/v2/master/text-to-video", category="video", output_type="video",
            speed="slow", quality="best", cost="$$$$",
            description="Best Kling quality",
            output_key="video",
        ),
        "kling-v2-pro": ModelInfo(
            id="kling-v2-pro", name="Kling V2 Pro",
            endpoint="fal-ai/kling-video/v2/pro/text-to-video", category="video", output_type="video",
            speed="medium", quality="great", cost="$$$",
            description="Good balance of speed/quality",
            output_key="video",
        ),
        "luma-dream": ModelInfo(
            id="luma-dream", name="Luma Dream Machine",
            endpoint="fal-ai/luma-dream-machine", category="video", output_type="video",
            speed="medium", quality="great", cost="$$$",
            description="Dream-like video generation",
            output_key="video",
        ),
        "runway-gen3": ModelInfo(
            id="runway-gen3", name="Runway Gen-3 Turbo",
            endpoint="fal-ai/runway-gen3/turbo/text-to-video", category="video", output_type="video",
            speed="fast", quality="good", cost="$$",
            description="Fast Runway generation",
            output_key="video",
        ),
        "ltx-video": ModelInfo(
            id="ltx-video", name="LTX Video",
            endpoint="fal-ai/ltx-video", category="video", output_type="video",
            speed="fast", quality="good", cost="$",
            description="Fast open source video",
            output_key="video",
        ),
    },
    
    # =========================================================================
    # AVATAR / TALKING HEAD
    # =========================================================================
    "avatar": {
        "hunyuan-avatar": ModelInfo(
            id="hunyuan-avatar", name="Hunyuan Avatar",
            endpoint="fal-ai/hailuo/minimax-video-01-live", category="avatar", output_type="video",
            speed="slow", quality="best", cost="$$$",
            description="Talking head from image + audio",
            output_key="video",
        ),
        "sync-lipsync": ModelInfo(
            id="sync-lipsync", name="Sync Lipsync",
            endpoint="fal-ai/sync-lipsync", category="avatar", output_type="video",
            speed="fast", quality="great", cost="$$",
            description="Fast lip sync for video",
            output_key="video",
        ),
        "sadtalker": ModelInfo(
            id="sadtalker", name="SadTalker",
            endpoint="fal-ai/sadtalker", category="avatar", output_type="video",
            speed="fast", quality="good", cost="$",
            description="Animate faces with audio",
            output_key="video",
        ),
        "live-portrait": ModelInfo(
            id="live-portrait", name="Live Portrait",
            endpoint="fal-ai/live-portrait", category="avatar", output_type="video",
            speed="fast", quality="good", cost="$",
            description="Animate portrait with driving video",
            output_key="video",
        ),
    },
    
    # =========================================================================
    # AUDIO / TTS
    # =========================================================================
    "audio": {
        "minimax-tts": ModelInfo(
            id="minimax-tts", name="MiniMax TTS",
            endpoint="fal-ai/minimax-tts/text-to-speech", category="audio", output_type="audio",
            speed="fast", quality="great", cost="$",
            description="High quality TTS, multiple voices",
            output_key="audio",
        ),
        "kokoro-tts": ModelInfo(
            id="kokoro-tts", name="Kokoro TTS",
            endpoint="fal-ai/kokoro-tts", category="audio", output_type="audio",
            speed="fast", quality="great", cost="$",
            description="Natural sounding TTS",
            output_key="audio",
        ),
        "f5-tts": ModelInfo(
            id="f5-tts", name="F5 TTS",
            endpoint="fal-ai/f5-tts", category="audio", output_type="audio",
            speed="fast", quality="great", cost="$",
            description="Voice cloning TTS",
            output_key="audio",
        ),
        "stable-audio": ModelInfo(
            id="stable-audio", name="Stable Audio",
            endpoint="fal-ai/stable-audio", category="audio", output_type="audio",
            speed="medium", quality="great", cost="$$",
            description="Music and sound effects",
            output_key="audio",
        ),
        "mmaudio": ModelInfo(
            id="mmaudio", name="MMAudio",
            endpoint="fal-ai/mmaudio", category="audio", output_type="audio",
            speed="medium", quality="good", cost="$$",
            description="Generate audio from video",
            output_key="audio",
        ),
    },
    
    # =========================================================================
    # 3D GENERATION
    # =========================================================================
    "3d": {
        "trellis-2": ModelInfo(
            id="trellis-2", name="Trellis 2",
            endpoint="fal-ai/trellis", category="3d", output_type="3d",
            speed="fast", quality="great", cost="$$",
            description="Fast 3D from image, latest version",
            output_key="glb",
        ),
        "trellis-3d": ModelInfo(
            id="trellis-3d", name="Trellis 3D (Legacy)",
            endpoint="fal-ai/trellis-3d", category="3d", output_type="3d",
            speed="fast", quality="good", cost="$",
            description="3D model from image",
            output_key="glb",
        ),
        "triposr-3d": ModelInfo(
            id="triposr-3d", name="TripoSR",
            endpoint="fal-ai/triposr", category="3d", output_type="3d",
            speed="fast", quality="good", cost="$",
            description="Fast 3D reconstruction",
            output_key="glb",
        ),
        "hunyuan3d-v3": ModelInfo(
            id="hunyuan3d-v3", name="Hunyuan 3D V3",
            endpoint="fal-ai/hunyuan3d-v3/text-to-3d", category="3d", output_type="3d",
            speed="medium", quality="best", cost="$$$",
            description="High quality text to 3D",
            output_key="glb",
        ),
    },
    
    # =========================================================================
    # IMAGE EDITING / UPSCALING
    # =========================================================================
    "edit": {
        "nano-banana-edit": ModelInfo(
            id="nano-banana-edit", name="Nano Banana Edit",
            endpoint="fal-ai/nano-banana/image-to-image", category="edit", output_type="image",
            speed="fast", quality="great", cost="$$",
            description="Gemini-powered image editing",
            output_key="images",
        ),
        "flux-fill": ModelInfo(
            id="flux-fill", name="Flux Fill (Inpainting)",
            endpoint="fal-ai/flux/dev/inpainting", category="edit", output_type="image",
            speed="medium", quality="great", cost="$$",
            description="Flux inpainting/outpainting",
            output_key="images",
        ),
        "remove-bg": ModelInfo(
            id="remove-bg", name="Remove Background",
            endpoint="fal-ai/birefnet", category="edit", output_type="image",
            speed="fast", quality="great", cost="$",
            description="Remove background from image",
            output_key="image",
        ),
        "bria-rmbg": ModelInfo(
            id="bria-rmbg", name="BRIA Background Removal",
            endpoint="fal-ai/bria/rmbg/v2", category="edit", output_type="image",
            speed="fast", quality="great", cost="$",
            description="BRIA background removal",
            output_key="image",
        ),
        "bria-video-bg": ModelInfo(
            id="bria-video-bg", name="BRIA Video BG Removal",
            endpoint="fal-ai/bria/video-background-removal", category="edit", output_type="video",
            speed="medium", quality="great", cost="$$",
            description="Remove background from video",
            output_key="video",
        ),
    },
    
    # =========================================================================
    # UPSCALING
    # =========================================================================
    "upscale": {
        "real-esrgan": ModelInfo(
            id="real-esrgan", name="Real-ESRGAN",
            endpoint="fal-ai/real-esrgan", category="upscale", output_type="image",
            speed="fast", quality="good", cost="$",
            description="Fast 4x upscaling",
            output_key="image",
        ),
        "clarity-upscaler": ModelInfo(
            id="clarity-upscaler", name="Clarity Upscaler",
            endpoint="fal-ai/clarity-upscaler", category="upscale", output_type="image",
            speed="medium", quality="great", cost="$$",
            description="AI enhancement + upscale",
            output_key="image",
        ),
        "creative-upscaler": ModelInfo(
            id="creative-upscaler", name="Creative Upscaler",
            endpoint="fal-ai/creative-upscaler", category="upscale", output_type="image",
            speed="slow", quality="best", cost="$$$",
            description="Creative AI upscaling",
            output_key="image",
        ),
    },
    
    # =========================================================================
    # VISION / ANALYSIS
    # =========================================================================
    "vision": {
        "gemini-vision": ModelInfo(
            id="gemini-vision", name="Gemini Vision",
            endpoint="fal-ai/gemini/vision", category="vision", output_type="json",
            speed="fast", quality="best", cost="$",
            description="Analyze images with Gemini",
            output_key="response",
        ),
        "sam-3-image": ModelInfo(
            id="sam-3-image", name="SAM 3 (Image)",
            endpoint="fal-ai/sam3/image", category="vision", output_type="json",
            speed="fast", quality="best", cost="$",
            description="Segment Anything Model 3",
            output_key="masks",
        ),
        "sam-3-video": ModelInfo(
            id="sam-3-video", name="SAM 3 (Video)",
            endpoint="fal-ai/sam3/video", category="vision", output_type="video",
            speed="medium", quality="best", cost="$$",
            description="Video object segmentation",
            output_key="video",
        ),
        "moondream-query": ModelInfo(
            id="moondream-query", name="Moondream Query",
            endpoint="fal-ai/moondream3/query", category="vision", output_type="json",
            speed="fast", quality="good", cost="$",
            description="Query image with questions",
            output_key="response",
        ),
        "moondream-detect": ModelInfo(
            id="moondream-detect", name="Moondream Detect",
            endpoint="fal-ai/moondream3/detect", category="vision", output_type="json",
            speed="fast", quality="good", cost="$",
            description="Object detection in images",
            output_key="detections",
        ),
        "video-understanding": ModelInfo(
            id="video-understanding", name="Video Understanding",
            endpoint="fal-ai/video-understanding", category="vision", output_type="json",
            speed="medium", quality="great", cost="$$",
            description="Analyze video content",
            output_key="response",
        ),
        "nsfw-checker": ModelInfo(
            id="nsfw-checker", name="NSFW Checker",
            endpoint="fal-ai/nsfw-checker", category="vision", output_type="json",
            speed="fast", quality="good", cost="$",
            description="Check images for NSFW content",
            output_key="result",
        ),
    },
}


# =============================================================================
# MODEL SELECTION
# =============================================================================

def list_models(category: Optional[str] = None) -> Dict[str, Any]:
    """
    List all available models, optionally filtered by category.
    
    Args:
        category: Optional category filter (image, video, avatar, audio, 3d, edit, upscale, vision)
    
    Returns:
        Dictionary of models with their info
    """
    if category:
        if category not in FAL_MODELS:
            return {"error": f"Unknown category: {category}. Available: {list(FAL_MODELS.keys())}"}
        return {category: {k: v.to_dict() for k, v in FAL_MODELS[category].items()}}
    
    return {
        cat: {k: v.to_dict() for k, v in models.items()}
        for cat, models in FAL_MODELS.items()
    }


def choose_model(
    category: str,
    priority: Literal["fast", "quality", "cheap", "balanced"] = "balanced"
) -> str:
    """
    Intelligently choose the best model for a category based on priority.
    
    Args:
        category: Model category (image, video, avatar, audio, 3d, edit, upscale, vision)
        priority: Optimization target - "fast", "quality", "cheap", or "balanced"
    
    Returns:
        Model ID of the best choice
    """
    if category not in FAL_MODELS:
        raise ValueError(f"Unknown category: {category}")
    
    models = FAL_MODELS[category]
    
    speed_order = {"fastest": 0, "fast": 1, "medium": 2, "slow": 3}
    quality_order = {"best": 0, "great": 1, "good": 2, "ok": 3}
    cost_order = {"$": 1, "$$": 2, "$$$": 3, "$$$$": 4}
    
    if priority == "fast":
        return min(models.items(), key=lambda x: speed_order[x[1].speed])[0]
    elif priority == "quality":
        return min(models.items(), key=lambda x: quality_order[x[1].quality])[0]
    elif priority == "cheap":
        return min(models.items(), key=lambda x: cost_order[x[1].cost])[0]
    else:  # balanced - great+ quality, reasonable speed
        good_quality = [(k, v) for k, v in models.items() if v.quality in ("best", "great")]
        if not good_quality:
            good_quality = list(models.items())
        return min(good_quality, key=lambda x: speed_order[x[1].speed])[0]


def get_model(model_id: str) -> Optional[ModelInfo]:
    """Get model info by ID, searching all categories."""
    for category, models in FAL_MODELS.items():
        if model_id in models:
            return models[model_id]
    return None


# =============================================================================
# API CLIENT
# =============================================================================

FAL_API_BASE = "https://queue.fal.run"
FAL_RESULT_BASE = "https://queue.fal.run"


def _call_fal(endpoint: str, input_data: Dict[str, Any], timeout: int = 300) -> Dict[str, Any]:
    """
    Call FAL API and wait for result.
    
    Uses the queue API for long-running jobs, falls back to sync API if queue not supported.
    """
    fal_key = _load_fal_key()
    if not fal_key:
        return {"success": False, "error": "FAL_KEY not configured. Add it to box/API_CONFIG.env"}
    
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }
    
    # Submit job to queue API
    submit_url = f"{FAL_API_BASE}/{endpoint}"
    
    try:
        with httpx.Client(timeout=timeout) as client:
            # Submit
            response = client.post(submit_url, json=input_data, headers=headers)
            response.raise_for_status()
            submit_result = response.json()
            
            # If we got a direct result, return it
            if "images" in submit_result or "video" in submit_result or "audio" in submit_result:
                return {"success": True, "result": submit_result}
            
            # Check for other direct result keys
            if "image" in submit_result or "output" in submit_result or "model" in submit_result:
                return {"success": True, "result": submit_result}
            
            # Otherwise poll for result
            request_id = submit_result.get("request_id")
            if not request_id:
                return {"success": True, "result": submit_result}
            
            # Poll
            status_url = f"{FAL_RESULT_BASE}/{endpoint}/requests/{request_id}/status"
            result_url = f"{FAL_RESULT_BASE}/{endpoint}/requests/{request_id}"
            
            import time
            max_polls = timeout // 3
            encountered_405 = False
            
            for poll_num in range(max_polls):
                time.sleep(3)
                
                status_response = client.get(status_url, headers=headers)
                
                # Some FAL endpoints don't support /status - try sync API
                if status_response.status_code == 405:
                    encountered_405 = True
                    # After a few 405s, try the synchronous API instead
                    if poll_num >= 2:
                        # Try synchronous endpoint (fal.run instead of queue.fal.run)
                        sync_url = f"https://fal.run/{endpoint}"
                        try:
                            sync_response = client.post(sync_url, json=input_data, headers=headers, timeout=timeout)
                            if sync_response.status_code == 200:
                                return {"success": True, "result": sync_response.json()}
                        except Exception as sync_e:
                            # Sync also failed, continue polling
                            pass
                    continue
                
                try:
                    status = status_response.json()
                except:
                    continue
                
                if status.get("status") == "COMPLETED":
                    result_response = client.get(result_url, headers=headers)
                    return {"success": True, "result": result_response.json()}
                elif status.get("status") == "FAILED":
                    return {"success": False, "error": status.get("error", "Job failed")}
            
            # If we kept getting 405s, return a clearer error
            if encountered_405:
                return {"success": False, "error": f"Model '{endpoint}' doesn't support queue API - may need sync endpoint"}
            
            return {"success": False, "error": "Timeout waiting for result"}
            
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"HTTP error: {e.response.status_code} - {e.response.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# GENERATION FUNCTIONS
# =============================================================================

def run_model(model_id: str, **kwargs) -> Dict[str, Any]:
    """
    Run any model by ID with arbitrary parameters.
    
    This is the most flexible function - use when you know exactly what you want.
    """
    model = get_model(model_id)
    if not model:
        return {"success": False, "error": f"Unknown model: {model_id}"}
    
    result = _call_fal(model.endpoint, kwargs)
    if result["success"]:
        result["model"] = model.id
        result["model_name"] = model.name
    return result


def generate_image(
    prompt: str,
    model: Optional[str] = None,
    priority: Literal["fast", "quality", "cheap", "balanced"] = "balanced",
    **kwargs
) -> Dict[str, Any]:
    """
    Generate an image.
    
    Args:
        prompt: Text description of the image
        model: Specific model ID, or None to auto-select
        priority: Selection priority if model not specified
        **kwargs: Additional model parameters (image_size, num_images, etc.)
    
    Returns:
        {"success": bool, "result": {...}, "model": str, "url": str}
    """
    if not model:
        model = choose_model("image", priority)
    
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown image model: {model}"}
    
    params = {"prompt": prompt, **kwargs}
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
        result["model_name"] = model_info.name
        # Extract URL from result
        if "images" in result.get("result", {}):
            result["url"] = result["result"]["images"][0].get("url")
    
    return result


def generate_video(
    prompt: str,
    model: Optional[str] = None,
    priority: Literal["fast", "quality", "cheap", "balanced"] = "balanced",
    **kwargs
) -> Dict[str, Any]:
    """
    Generate a video.
    
    Args:
        prompt: Text description of the video
        model: Specific model ID, or None to auto-select
        priority: Selection priority if model not specified
        **kwargs: Additional parameters
    """
    if not model:
        model = choose_model("video", priority)
    
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown video model: {model}"}
    
    params = {"prompt": prompt, **kwargs}
    result = _call_fal(model_info.endpoint, params, timeout=600)  # Videos take longer
    
    if result["success"]:
        result["model"] = model
        result["model_name"] = model_info.name
        if "video" in result.get("result", {}):
            result["url"] = result["result"]["video"].get("url")
    
    return result


def generate_speech(
    text: str,
    voice: str = "English_Trustworth_Man",
    model: str = "minimax-tts",
    **kwargs
) -> Dict[str, Any]:
    """
    Generate speech from text.
    
    Args:
        text: Text to convert to speech
        voice: Voice ID (see model docs for options)
        model: TTS model to use
    """
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown audio model: {model}"}
    
    params = {"text": text, "voice": voice, **kwargs}
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
        if "audio" in result.get("result", {}):
            result["url"] = result["result"]["audio"].get("url")
    
    return result


def generate_avatar(
    image_url: str,
    audio_url: str,
    model: str = "hunyuan-avatar",
    **kwargs
) -> Dict[str, Any]:
    """
    Generate talking head video from image + audio.
    
    Args:
        image_url: URL of portrait image
        audio_url: URL of speech audio
        model: Avatar model to use
    """
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown avatar model: {model}"}
    
    params = {"image_url": image_url, "audio_url": audio_url, **kwargs}
    result = _call_fal(model_info.endpoint, params, timeout=900)  # Avatars take long
    
    if result["success"]:
        result["model"] = model
        if "video" in result.get("result", {}):
            result["url"] = result["result"]["video"].get("url")
    
    return result


def generate_3d(
    image_url: Optional[str] = None,
    prompt: Optional[str] = None,
    model: Optional[str] = None,
    priority: Literal["fast", "quality", "cheap", "balanced"] = "balanced",
    **kwargs
) -> Dict[str, Any]:
    """
    Generate 3D model from image or text.
    
    Args:
        image_url: URL of image to convert to 3D
        prompt: Text prompt (for text-to-3D models)
        model: Specific model, or auto-select
    """
    if not model:
        model = choose_model("3d", priority)
    
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown 3D model: {model}"}
    
    params = kwargs
    if image_url:
        params["image_url"] = image_url
    if prompt:
        params["prompt"] = prompt
    
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
        if "glb" in result.get("result", {}):
            result["url"] = result["result"]["glb"].get("url")
    
    return result


def upscale_image(
    image_url: str,
    scale: int = 4,
    model: Optional[str] = None,
    priority: Literal["fast", "quality", "cheap", "balanced"] = "balanced",
    **kwargs
) -> Dict[str, Any]:
    """
    Upscale an image.
    
    Args:
        image_url: URL of image to upscale
        scale: Upscale factor (usually 2 or 4)
        model: Specific model, or auto-select
    """
    if not model:
        model = choose_model("upscale", priority)
    
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown upscale model: {model}"}
    
    params = {"image_url": image_url, "scale": scale, **kwargs}
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
        if "image" in result.get("result", {}):
            result["url"] = result["result"]["image"].get("url")
    
    return result


def remove_background(image_url: str, model: str = "remove-bg", **kwargs) -> Dict[str, Any]:
    """Remove background from image."""
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown model: {model}"}
    
    params = {"image_url": image_url, **kwargs}
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
        if "image" in result.get("result", {}):
            result["url"] = result["result"]["image"].get("url")
    
    return result


def edit_image(
    image_url: str,
    prompt: str,
    model: str = "nano-banana-edit",
    **kwargs
) -> Dict[str, Any]:
    """
    Edit an image with a text prompt.
    
    Args:
        image_url: URL of image to edit
        prompt: Edit instructions
        model: Edit model to use
    """
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown edit model: {model}"}
    
    params = {"image_url": image_url, "prompt": prompt, **kwargs}
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
        if "images" in result.get("result", {}):
            result["url"] = result["result"]["images"][0].get("url")
    
    return result


def analyze_image(
    image_url: str,
    prompt: str = "Describe this image in detail.",
    model: str = "gemini-vision",
    **kwargs
) -> Dict[str, Any]:
    """
    Analyze an image with vision AI.
    
    Args:
        image_url: URL of image to analyze
        prompt: Question or instruction
        model: Vision model to use
    """
    model_info = get_model(model)
    if not model_info:
        return {"success": False, "error": f"Unknown vision model: {model}"}
    
    params = {"image_url": image_url, "prompt": prompt, **kwargs}
    result = _call_fal(model_info.endpoint, params)
    
    if result["success"]:
        result["model"] = model
    
    return result


# =============================================================================
# SAM 3 - SEGMENT ANYTHING (GAME CHANGER!)
# =============================================================================

def segment_image(
    image_url: str,
    prompt: Optional[str] = None,
    point: Optional[List[int]] = None,
    box: Optional[List[int]] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    🔥 SAM 3: Segment ANYTHING from ANY image with pixel-perfect precision.
    
    This is a GAME CHANGER - extracts any object with just a point, box, or text prompt.
    
    Args:
        image_url: URL of image
        prompt: Text description of what to segment (e.g., "the red car", "all people")
        point: [x, y] coordinates to click on the object you want
        box: [x1, y1, x2, y2] bounding box around the object
    
    Returns:
        {"success": True, "masks": [...], "url": "mask_image_url"}
    
    Examples:
        # Extract by text prompt
        segment_image(url, prompt="the cat")
        
        # Extract by clicking a point
        segment_image(url, point=[320, 240])
        
        # Extract by bounding box
        segment_image(url, box=[100, 100, 400, 400])
    """
    params = {"image_url": image_url, **kwargs}
    
    if prompt:
        params["prompt"] = prompt
    if point:
        params["point"] = point
    if box:
        params["box"] = box
    
    result = _call_fal("fal-ai/sam3/image", params)
    
    if result["success"]:
        result["model"] = "sam-3-image"
    
    return result


def segment_video(
    video_url: str,
    point: Optional[List[int]] = None,
    box: Optional[List[int]] = None,
    frame: int = 0,
    **kwargs
) -> Dict[str, Any]:
    """
    🔥 SAM 3 Video: Track ANY object through ENTIRE video automatically.
    
    Point at object in one frame → Get perfect masks for ALL frames.
    
    Args:
        video_url: URL of video
        point: [x, y] in first frame to identify object to track
        box: [x1, y1, x2, y2] bounding box in first frame
        frame: Which frame to use for initial selection (default: 0)
    
    Returns:
        {"success": True, "video": {"url": "masked_video_url"}, "masks": [...]}
    
    Examples:
        # Track person by clicking on them in frame 0
        segment_video(url, point=[320, 240])
        
        # Track car by bounding box
        segment_video(url, box=[100, 100, 400, 300])
    """
    params = {"video_url": video_url, **kwargs}
    
    if point:
        params["point"] = point
    if box:
        params["box"] = box
    if frame:
        params["frame"] = frame
    
    result = _call_fal("fal-ai/sam3/video", params, timeout=600)
    
    if result["success"]:
        result["model"] = "sam-3-video"
        if "video" in result.get("result", {}):
            result["url"] = result["result"]["video"].get("url")
    
    return result


def extract_object(
    image_url: str,
    description: str,
    output_with_alpha: bool = True,
    **kwargs
) -> Dict[str, Any]:
    """
    🔥 High-level: Extract an object from image as PNG with transparency.
    
    Combines SAM 3 segmentation with background removal for clean extraction.
    
    Args:
        image_url: URL of source image
        description: What to extract (e.g., "the red car", "the person on the left")
        output_with_alpha: If True, returns PNG with transparent background
    
    Returns:
        {"success": True, "url": "extracted_object.png", "mask_url": "..."}
    
    Example:
        # Extract a product from a messy photo
        result = extract_object(
            "https://example.com/desk_with_product.jpg",
            "the coffee mug"
        )
        # result["url"] = PNG of just the mug with transparent background
    """
    # Step 1: Get mask from SAM 3
    mask_result = segment_image(image_url, prompt=description, **kwargs)
    
    if not mask_result.get("success"):
        return mask_result
    
    # The mask URL can be used for compositing or as-is
    return {
        "success": True,
        "model": "sam-3-image",
        "mask": mask_result.get("result", {}),
        "description": description,
        "source_url": image_url,
    }


def track_object(
    video_url: str,
    description: str = None,
    click_position: List[int] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    🔥 High-level: Track an object through entire video.
    
    Point once → SAM 3 follows it through ALL frames automatically.
    
    Args:
        video_url: URL of video
        description: What to track (for logging)
        click_position: [x, y] where to click to identify object
    
    Returns:
        {"success": True, "url": "tracked_video.mp4", "frame_count": N}
    
    Example:
        # Track a person walking through a scene
        result = track_object(
            "https://example.com/street_scene.mp4",
            description="the person in red shirt",
            click_position=[400, 300]  # Click on them in frame 0
        )
        # result["url"] = Video with tracked object highlighted/masked
    """
    result = segment_video(video_url, point=click_position, **kwargs)
    
    if result.get("success"):
        result["description"] = description
    
    return result


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(
        description="Meeseeks FAL AI Client - Cloud Generative Media",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all models
  python fal_client.py models
  
  # List video models
  python fal_client.py models video
  
  # Generate image (auto-select model)
  python fal_client.py image "a cyberpunk city"
  
  # Generate image with specific model
  python fal_client.py image "a sunset" --model flux-pro
  
  # Generate video
  python fal_client.py video "a cat dancing" --model veo3.1-fast
  
  # Generate speech
  python fal_client.py speech "Hello world" --voice English_CalmWoman
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Models command
    models_parser = subparsers.add_parser("models", help="List available models")
    models_parser.add_argument("category", nargs="?", help="Filter by category")
    
    # Image command
    image_parser = subparsers.add_parser("image", help="Generate image")
    image_parser.add_argument("prompt", help="Image description")
    image_parser.add_argument("--model", "-m", help="Specific model")
    image_parser.add_argument("--priority", "-p", default="balanced",
                              choices=["fast", "quality", "cheap", "balanced"])
    
    # Video command
    video_parser = subparsers.add_parser("video", help="Generate video")
    video_parser.add_argument("prompt", help="Video description")
    video_parser.add_argument("--model", "-m", help="Specific model")
    video_parser.add_argument("--priority", "-p", default="balanced",
                              choices=["fast", "quality", "cheap", "balanced"])
    
    # Speech command
    speech_parser = subparsers.add_parser("speech", help="Generate speech")
    speech_parser.add_argument("text", help="Text to speak")
    speech_parser.add_argument("--voice", "-v", default="English_Trustworth_Man")
    speech_parser.add_argument("--model", "-m", default="minimax-tts")
    
    # Avatar command
    avatar_parser = subparsers.add_parser("avatar", help="Generate talking head")
    avatar_parser.add_argument("image_url", help="Portrait image URL")
    avatar_parser.add_argument("audio_url", help="Speech audio URL")
    avatar_parser.add_argument("--model", "-m", default="hunyuan-avatar")
    
    # 3D command
    three_d_parser = subparsers.add_parser("3d", help="Generate 3D model")
    three_d_parser.add_argument("--image", help="Image URL")
    three_d_parser.add_argument("--prompt", help="Text prompt")
    three_d_parser.add_argument("--model", "-m", help="Specific model")
    
    # Upscale command
    upscale_parser = subparsers.add_parser("upscale", help="Upscale image")
    upscale_parser.add_argument("image_url", help="Image URL")
    upscale_parser.add_argument("--scale", "-s", type=int, default=4)
    upscale_parser.add_argument("--model", "-m", help="Specific model")
    
    args = parser.parse_args()
    
    if args.command == "models":
        result = list_models(args.category)
        print(json.dumps(result, indent=2))
    
    elif args.command == "image":
        print(f"🎨 Generating image with priority={args.priority}...")
        result = generate_image(args.prompt, model=args.model, priority=args.priority)
        if result["success"]:
            print(f"✅ Generated with {result.get('model_name', result.get('model'))}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "video":
        print(f"🎬 Generating video with priority={args.priority}...")
        result = generate_video(args.prompt, model=args.model, priority=args.priority)
        if result["success"]:
            print(f"✅ Generated with {result.get('model_name', result.get('model'))}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "speech":
        print(f"🎤 Generating speech...")
        result = generate_speech(args.text, voice=args.voice, model=args.model)
        if result["success"]:
            print(f"✅ Generated with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "avatar":
        print(f"🗣️ Generating avatar...")
        result = generate_avatar(args.image_url, args.audio_url, model=args.model)
        if result["success"]:
            print(f"✅ Generated with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "3d":
        print(f"🧊 Generating 3D model...")
        result = generate_3d(image_url=args.image, prompt=args.prompt, model=args.model)
        if result["success"]:
            print(f"✅ Generated with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "upscale":
        print(f"🔍 Upscaling image...")
        result = upscale_image(args.image_url, scale=args.scale, model=args.model)
        if result["success"]:
            print(f"✅ Upscaled with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
