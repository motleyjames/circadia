"""
Cloud Generative Media - FAL AI & Replicate Integration
"I'M MR. MEESEEKS! I CAN CALL ANY CLOUD MODEL!"

50+ models including:
- Image: Flux, Recraft, Ideogram, GPT-Image
- Video: Veo 3.1, Sora 2, Kling V2, MiniMax
- Avatar: Hunyuan Avatar, SadTalker
- Audio: MiniMax TTS, Kokoro, Stable Audio
- 3D: Trellis, Hunyuan 3D, TripoSR
- 🔥 SAM 3: SEGMENT ANYTHING - extract any object from any image!
"""

from .fal_client import (
    FAL_MODELS,
    list_models,
    choose_model,
    generate_image,
    generate_video,
    generate_speech,
    generate_avatar,
    generate_3d,
    upscale_image,
    remove_background,
    analyze_image,
    edit_image,
    run_model,
    # 🔥 SAM 3 - GAME CHANGER
    segment_image,
    segment_video,
    extract_object,
    track_object,
)

__all__ = [
    "FAL_MODELS",
    "list_models",
    "choose_model",
    "generate_image",
    "generate_video",
    "generate_speech",
    "generate_avatar",
    "generate_3d",
    "upscale_image",
    "remove_background",
    "analyze_image",
    "edit_image",
    "run_model",
    # 🔥 SAM 3 - Segment Anything
    "segment_image",
    "segment_video", 
    "extract_object",
    "track_object",
]
