---
name: Local Generative Media - Images & Video
description: Generate images AND videos locally using Flux, SDXL, LTX-Video, and other models
domains: [image-generation, video-generation, ai-images, ai-video, flux, sdxl, local-inference, ltx-video, cogvideo]
keywords: [mflux, comfyui, drawthings, flux-schnell, flux-dev, stable-diffusion, generate, image, video, t2v, i2v, zimage]
when_to_use: When generating images or videos locally without cloud APIs
priority: high
max_tokens: 3000
---

# Local Generative Media - Images & Video

> **Philosophy**: Local generation = privacy, speed, no API costs. Apple Silicon and NVIDIA GPUs make this practical.

## Key Mental Models

1. **Z-Image/SDXL-Turbo is FASTEST** → 1-2 steps, ~1-2 seconds (simpler prompts)
2. **MFlux is QUALITY-FAST** → 4 steps, ~3s, best Flux quality on Mac
3. **ComfyUI is FLEXIBLE** → Workflows enable any pipeline (images + video)
4. **VRAM is the bottleneck** → Know your GPU's limits
5. **Video = Many Frames** → Expect 10-60s for short clips

## Elevated Thinking Prompts

1. **Image or Video?** → Can a single image convey this, or do I need motion?
2. **Do I need cloud quality or local speed?** → Local is often enough
3. **Can I cache generated assets?** → Generate once, use many times
4. **Should this be a workflow?** → Repeatable tasks → ComfyUI workflow
5. **What VRAM do I have?** → Determines which models you can run

---

# 🖼️ IMAGE GENERATION

## Speed Comparison (2025)

| Backend | Time (1024x1024) | VRAM | Quality | Best For |
|---------|------------------|------|---------|----------|
| **[Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)** | ⚡️ **<1s** (H800) | 16GB | Excellent | **FASTEST**, text rendering! |
| **MFlux (Flux Schnell)** | ⚡️ ~3s | 12GB | Great | Apple Silicon, quality balance |
| **ComfyUI (Flux Dev)** | ~10-15s | 24GB | Best | Production, complex prompts |
| **DrawThings** | ~5s | 8GB | Good | macOS native, easy UI |

> **🔥 Z-Image-Turbo** is the new king: 6B params, 8 steps, sub-second, **excellent bilingual text rendering**, Apache 2.0 license!

## Quick Start (Headless CLI)

```bash
# Check what's available
python -m tools_core.domain.media.cli --check

# Generate with MFlux (Apple Silicon optimized)
python -m tools_core.domain.media.cli "a cyberpunk cityscape" output.png

# With options
python -m tools_core.domain.media.cli "a sunset" sunset.png \
    --backend mflux --steps 8 --width 1024 --height 768
```

## Z-Image-Turbo (FASTEST - Recommended!)

[Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) is a 6B model from Alibaba with:
- **Sub-second** inference on good GPUs
- **16GB VRAM** requirement (fits consumer RTX 4090!)
- **Excellent text rendering** (English + Chinese)
- Apache 2.0 license

```python
# Install latest diffusers (Z-Image support merged)
# pip install git+https://github.com/huggingface/diffusers

import torch
from diffusers import ZImagePipeline

pipe = ZImagePipeline.from_pretrained(
    "Tongyi-MAI/Z-Image-Turbo",
    torch_dtype=torch.bfloat16,
)
pipe.to("cuda")  # or "mps" for Apple Silicon

image = pipe(
    prompt="A sign that says 'Hello Meeseeks!' in neon lights",
    height=1024,
    width=1024,
    num_inference_steps=9,  # Results in 8 DiT forwards
    guidance_scale=0.0,     # Must be 0 for Turbo
    generator=torch.Generator("cuda").manual_seed(42),
).images[0]

image.save("zimage_output.png")
```

## Python API

```python
from tools_core.domain.media import generate_image, check_backends

# Check available backends
status = check_backends()
print(status)  # {'gen_media_installed': True, 'backends': {'mflux': True, ...}}

# Generate an image
result = generate_image(
    prompt="a beautiful sunset over mountains",
    backend="mflux",  # or "comfyui", "drawthings", "zimage"
    width=1024,
    height=1024,
    steps=4,  # More steps = better quality, slower
)

if result["success"]:
    print(f"Saved to: {result['path']}")
else:
    print(f"Error: {result['error']}")
```

---

# 🎬 VIDEO GENERATION

## Available Models (2025)

| Model | Speed | Quality | VRAM | Special Features |
|-------|-------|---------|------|------------------|
| **[LTX-2](https://huggingface.co/Lightricks/LTX-2)** | ⚡️ Fast | Excellent | 12-24GB | 🔥 **VIDEO + AUDIO together!** |
| **LTX-2 Distilled** | ⚡️⚡️ 8 steps | Great | 12GB | Faster, CFG=1 |
| **CogVideoX** | ~2min | Great | 16GB | Balanced quality/resource |
| **Hunyuan Video** | ~5min | Excellent | 24GB+ | Top quality, needs beefy GPU |
| **Wan2.1** | ~1min | Good | 12GB | Fast, Chinese model |

> **🔥 LTX-2 is the new standard** - 19B params, generates synchronized video AND audio in one model!

## LTX-2 Checkpoints

| Checkpoint | Use Case |
|------------|----------|
| `ltx-2-19b-dev` | Full model, trainable (bf16) |
| `ltx-2-19b-dev-fp8` | Full model, quantized (less VRAM) |
| `ltx-2-19b-distilled` | **8 steps, CFG=1** (fastest) |
| `ltx-2-spatial-upscaler-x2` | Upscale resolution |
| `ltx-2-temporal-upscaler-x2` | Upscale FPS |

## Quick Start - LTX-2 (Diffusers)

```python
# pip install git+https://github.com/huggingface/diffusers
import torch
from diffusers import LTX2Pipeline

# Load the distilled model for speed
pipe = LTX2Pipeline.from_pretrained(
    "Lightricks/LTX-2",
    subfolder="ltx-2-19b-distilled",
    torch_dtype=torch.bfloat16,
)
pipe.to("cuda")  # or "mps" for Apple Silicon

# Generate video WITH audio!
result = pipe(
    prompt="A cat playing piano, jazz music",
    height=480,
    width=704,
    num_frames=97,  # Must be divisible by 8 + 1
    num_inference_steps=8,  # Distilled = 8 steps
    guidance_scale=1.0,  # CFG=1 for distilled
).frames[0]

# Save video (includes audio!)
from diffusers.utils import export_to_video
export_to_video(result, "cat_piano.mp4")
```

## Quick Start - LTX-2 (ComfyUI)

```bash
# Use built-in LTXVideo nodes from ComfyUI Manager
# Or manual install:
cd ComfyUI/custom_nodes
git clone https://github.com/Lightricks/LTX-2.git

# Download model
huggingface-cli download Lightricks/LTX-2 --local-dir models/ltx-2
```

## LTX-2 Tips

- **Resolution**: Width & height must be divisible by 32
- **Frames**: Must be divisible by 8 + 1 (e.g., 97, 161, 225)
- **Distilled model**: Use `guidance_scale=1.0` and 8 steps
- **Audio**: LTX-2 generates audio automatically - no separate model needed!
- **Training**: Full model is trainable, LoRAs work great

---

# Installation

## 1. Install gen-media SDK

```bash
cd tools_core/domain/media/generative
pip install -e .
# With MFlux support:
pip install -e ".[mflux]"
```

## 2. Download Models (One-Time)

**For MFlux:**
```bash
# Models auto-download on first use (~12GB for Flux Schnell)
mflux-generate --model schnell --prompt "test" --steps 1
```

**For ComfyUI (Images + Video):**
```bash
# 1. Install ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI && pip install -r requirements.txt

# 2. Download models to ComfyUI/models/
# Images: flux1-schnell.safetensors, sdxl-turbo
# Video: ltx-video.safetensors, cogvideox

# 3. Start server
python main.py --listen 127.0.0.1 --port 8188
```

**For DrawThings:**
```bash
# 1. Download Draw Things from App Store
# 2. Open app, enable API server (Settings → API → Enable)
# 3. Download models in-app
```

---

# Novel Applications

## 1. Asset Generation Pipeline
```python
# Generate multiple variations
for i in range(5):
    result = generate_image(
        f"game icon: {item_name}, pixel art, transparent background",
        output_path=f"assets/{item_name}_{i}.png",
        seed=i * 1000
    )
```

## 2. Video from Image Sequence
```bash
# Generate keyframes, then interpolate
python -m tools_core.domain.media.cli "scene start: empty room" frame_001.png
python -m tools_core.domain.media.cli "scene middle: person enters" frame_002.png
python -m tools_core.domain.media.cli "scene end: person sits" frame_003.png

# Use ffmpeg to interpolate (or FILM/RIFE for AI interpolation)
ffmpeg -framerate 1 -i frame_%03d.png -vf "minterpolate=fps=24" output.mp4
```

## 3. Product Video Generation
```python
# Generate turntable-style product video
# (requires img2vid model like SVD or LTX)
result = generate_video(
    prompt="3D turntable rotation of product",
    image="product_photo.png",  # img2vid mode
    duration=3,
)
```

## 4. Automated Social Content
```python
# Generate image + animate it
image = generate_image("motivational quote, elegant typography")
video = generate_video(
    prompt="subtle zoom and particles animation",
    image=image["path"],
    duration=5,
)
```

---

# Troubleshooting

| Issue | Solution |
|-------|----------|
| "gen_media not installed" | `cd generative && pip install -e .` |
| MFlux slow first run | Models downloading (~12GB) |
| ComfyUI connection refused | Start server: `python main.py` |
| DrawThings not found | Open app, enable API server |
| Out of memory (images) | Reduce resolution or use Schnell |
| Out of memory (video) | Use LTX-Video (8GB) or reduce frames |
| Video generation too slow | Use fewer frames, smaller resolution |

---

# See Also

- **Nano Banana** (`nano-banana-compression.md`) - Gemini cloud image generation
- **FLUX.2 klein** - New fast image model from Black Forest Labs (needs 29GB VRAM)
- For cloud-based generation when local isn't available

---

*"Why pay for API calls when your hardware can generate locally?"* 🔵
