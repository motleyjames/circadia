---
name: Cloud Generative Media - FAL AI
description: Cloud-based image, video, avatar, audio, 3D generation via FAL.ai - 50+ models
domains: [cloud-ai, fal-ai, image-generation, video-generation, avatar, tts, 3d-generation, vision-ai]
keywords: [flux, kling, veo, sora, minimax, hunyuan, trellis, fal, cloud, api, video, avatar, tts, 3d]
when_to_use: When local generation isn't enough - need Veo/Sora video, avatars, 3D, or cloud scale
priority: high
max_tokens: 3000
---

# ☁️ Cloud Generative Media - FAL AI

> **Philosophy**: Local for speed, Cloud for power. Use FAL.ai when you need production-grade quality, video generation, talking avatars, 3D models, or capabilities beyond local hardware.

## Key Mental Models

1. **Local vs Cloud**: Local (Z-Image, MFlux, LTX-2) for iteration, Cloud (FAL) for final quality
2. **Intelligent Selection**: Let Meeseeks choose the model based on priority (fast/quality/cheap)
3. **Cost Awareness**: Cloud = $$$. Use local for experiments, cloud for finals
4. **Pipeline Thinking**: Image → Speech → Avatar = Full talking head video

## Elevated Thinking Prompts

1. Can I do this locally first, then use cloud for the final version?
2. What's the minimum quality needed - do I need Sora 2 or will Runway Gen-3 suffice?
3. Can I chain FAL models (image → edit → upscale) for better results?
4. Should I generate variations locally and upscale the best one in cloud?
5. **🔥 Can SAM 3 extract what I need from existing images instead of generating new ones?**
6. **🔥 What tedious masking/selection work can SAM 3 eliminate entirely?**
7. **🔥 Can I track objects in video with SAM 3 instead of manual frame-by-frame work?**

---

# Quick Reference

## CLI Commands

```bash
# List all models
python -m tools_core.domain.cloud.fal_client models

# List video models
python -m tools_core.domain.cloud.fal_client models video

# Generate image (auto-select best model)
python -m tools_core.domain.cloud.fal_client image "a cyberpunk city"

# Generate with specific model
python -m tools_core.domain.cloud.fal_client image "sunset" --model flux-pro

# Generate video
python -m tools_core.domain.cloud.fal_client video "a cat dancing" --model veo3.1-fast

# Generate speech
python -m tools_core.domain.cloud.fal_client speech "Hello world" --voice English_CalmWoman

# Generate talking avatar
python -m tools_core.domain.cloud.fal_client avatar <image_url> <audio_url>

# Generate 3D model
python -m tools_core.domain.cloud.fal_client 3d --image <image_url>

# Upscale image
python -m tools_core.domain.cloud.fal_client upscale <image_url> --scale 4
```

## Python API

```python
from tools_core.domain.cloud import (
    generate_image, generate_video, generate_speech,
    generate_avatar, generate_3d, upscale_image,
    list_models, choose_model
)

# Auto-select model based on priority
result = generate_image("a cyberpunk city", priority="quality")
print(result["url"])

# Specify exact model
result = generate_video("a cat dancing", model="veo3.1-fast")

# Generate speech
result = generate_speech("Welcome to the future", voice="English_CalmWoman")

# Full avatar pipeline
portrait = generate_image("professional headshot, neutral expression")
speech = generate_speech("Hello, I'm your AI assistant")
avatar = generate_avatar(portrait["url"], speech["url"])
```

---

# Model Categories

## 🎨 Image Generation

| Model | Quality | Speed | Cost | Best For |
|-------|---------|-------|------|----------|
| `sdxl-turbo` | ⭐⭐ | ⚡⚡⚡ | $ | Quick previews |
| `flux-schnell` | ⭐⭐⭐ | ⚡⚡ | $ | Fast iteration |
| `flux-dev` | ⭐⭐⭐⭐ | ⚡ | $$ | Balanced quality |
| `flux-pro` | ⭐⭐⭐⭐⭐ | 🐢 | $$$ | Production |
| `recraft-v3` | ⭐⭐⭐⭐ | ⚡ | $$ | Design/icons |
| `ideogram-v3` | ⭐⭐⭐⭐⭐ | ⚡ | $$$ | **Text in images** |
| `nano-banana` | ⭐⭐⭐⭐ | ⚡⚡ | $$ | Gemini-powered |

## 🎬 Video Generation

| Model | Quality | Speed | Cost | Best For |
|-------|---------|-------|------|----------|
| `ltx-video` | ⭐⭐⭐ | ⚡⚡ | $ | Fast tests |
| `runway-gen3` | ⭐⭐⭐ | ⚡⚡ | $$ | Quick iteration |
| `veo3.1-fast` | ⭐⭐⭐⭐ | ⚡⚡ | $$ | **Best speed/quality** |
| `veo3.1-quality` | ⭐⭐⭐⭐⭐ | ⚡ | $$$ | High quality |
| `minimax-video` | ⭐⭐⭐⭐ | ⚡ | $$$ | Great quality |
| `kling-v2` | ⭐⭐⭐⭐⭐ | 🐢 | $$$$ | Best quality |
| `sora-2-pro` | ⭐⭐⭐⭐⭐ | 🐢 | $$$$ | **OpenAI Sora!** |

## 🗣️ Avatar / Talking Head

| Model | Quality | Speed | Best For |
|-------|---------|-------|----------|
| `sadtalker` | ⭐⭐⭐ | ⚡⚡ | Quick lip sync |
| `live-portrait` | ⭐⭐⭐ | ⚡⚡ | Animate with driving video |
| `sync-lipsync` | ⭐⭐⭐⭐ | ⚡⚡ | Fast high quality |
| `hunyuan-avatar` | ⭐⭐⭐⭐⭐ | 🐢 | **Best quality** |

## 🎤 Audio / TTS

| Model | Quality | Best For |
|-------|---------|----------|
| `minimax-tts` | ⭐⭐⭐⭐ | Multiple voices, fast |
| `kokoro-tts` | ⭐⭐⭐⭐ | Natural sounding |
| `f5-tts` | ⭐⭐⭐⭐ | Voice cloning |
| `stable-audio` | ⭐⭐⭐⭐ | Music/sound effects |

**MiniMax TTS Voices:**
- `English_Trustworth_Man`, `English_Deep-VoicedGentleman`
- `English_MatureBoss`, `English_ReservedYoungMan`
- `English_CalmWoman`, `English_Soft-spokenGirl`
- `presenter_male`, `presenter_female`

## 🧊 3D Generation

| Model | Quality | Speed | Best For |
|-------|---------|-------|----------|
| `triposr-3d` | ⭐⭐⭐ | ⚡⚡ | Fast reconstruction |
| `trellis-2` | ⭐⭐⭐⭐ | ⚡⚡ | Image to 3D |
| `hunyuan3d-v3` | ⭐⭐⭐⭐⭐ | ⚡ | Best quality |

## 🔍 Vision / Analysis

| Model | Best For |
|-------|----------|
| `gemini-vision` | Image analysis, questions |
| `moondream-query` | Quick image Q&A |
| `moondream-detect` | Object detection |
| `sam-3-image` | 🔥 **SEGMENT ANYTHING** - extract any object! |
| `sam-3-video` | 🔥 **TRACK ANYTHING** - follow objects in video! |
| `video-understanding` | Video analysis |

---

# 🔥 SAM 3 - THE GAME CHANGER

> **SAM 3 (Segment Anything Model 3) is the most underrated capability in AI.** It can extract ANY object from ANY image with pixel-perfect precision. This unlocks workflows that were impossible before.

## Why SAM 3 is Revolutionary

**Traditional approach**: Manually mask objects in Photoshop (hours of work)
**SAM 3 approach**: Point at it → Perfect mask in seconds

```python
# Extract ANYTHING from ANY image
result = analyze_image(
    "https://example.com/photo.jpg",
    prompt="segment the red car",
    model="sam-3-image"
)
# Returns: Pixel-perfect mask of just the car!
```

## Novel SAM 3 Workflows

### 1. **Instant Asset Extraction Pipeline**
```python
# Screenshot a game/app → Extract ALL the icons automatically
screenshot = "https://example.com/game_ui.png"

# SAM 3 finds and extracts each icon
masks = analyze_image(screenshot, "segment all UI icons", model="sam-3-image")

# Each icon is now a separate asset with transparency!
for mask in masks["masks"]:
    save_as_png_with_alpha(mask)  # Perfect cutouts
```

### 2. **Product Photo Automation**
```python
# Take messy product photo → Extract product → Place on white background
product_photo = "https://example.com/messy_desk_with_product.jpg"

# SAM 3 extracts just the product
mask = analyze_image(product_photo, "segment the main product", model="sam-3-image")

# Composite onto clean background
final = composite_on_white(product_photo, mask)
# Result: Professional product photo from casual snapshot!
```

### 3. **Video Object Tracking (sam-3-video)**
```python
# Track a person/object across entire video
# Point once in frame 1 → SAM 3 follows it through ALL frames

result = run_model("sam-3-video", 
    video_url="https://example.com/video.mp4",
    point=[320, 240],  # Click on object in first frame
)
# Returns: Mask for EVERY frame, automatically tracked!
```

### 4. **Selective Editing Pipeline**
```python
# "Remove the person but keep everything else"
photo = "https://example.com/beach_with_tourist.jpg"

# SAM 3 segments just the person
mask = analyze_image(photo, "segment the person", model="sam-3-image")

# Use mask for inpainting - fill with background
edited = edit_image(photo, "remove the person, extend the beach", mask=mask)
```

### 5. **Training Data Generation**
```python
# Extract objects → Place in new contexts → Generate training data

# 1. Extract cat from photo A
cat_mask = analyze_image(photo_a, "segment the cat", model="sam-3-image")

# 2. Extract background from photo B  
bg = remove_subject(photo_b)

# 3. Composite cat into new scene
# Now you have synthetic training data!
```

### 6. **Interactive "What's This?" Tool**
```python
# User clicks on any part of image → Get just that object
def extract_clicked_object(image_url, click_x, click_y):
    result = run_model("sam-3-image",
        image_url=image_url,
        point=[click_x, click_y]  # Where user clicked
    )
    return result["masks"][0]  # Perfect extraction of clicked object
```

### 7. **Bulk Asset Extraction**
```python
# Got a sprite sheet? Extract ALL sprites automatically
sprite_sheet = "https://example.com/game_sprites.png"

# SAM 3 finds every distinct object
all_masks = analyze_image(sprite_sheet, "segment all objects", model="sam-3-image")

# Export each sprite as individual file
for i, mask in enumerate(all_masks["masks"]):
    save_sprite(f"sprite_{i}.png", mask)
```

### 8. **Before/After Comparison**
```python
# Segment same object in two images → Compare changes
before = analyze_image(photo_before, "segment the building", model="sam-3-image")
after = analyze_image(photo_after, "segment the building", model="sam-3-image")

# Now you can precisely measure what changed
diff = compare_masks(before, after)
```

## Mental Model Shift

**OLD THINKING**: "I need to manually select/mask objects"
**NEW THINKING**: "I can POINT at anything and extract it perfectly"

**OLD THINKING**: "Video editing requires frame-by-frame work"
**NEW THINKING**: "I can track ANY object across ALL frames automatically"

**OLD THINKING**: "Asset extraction is tedious manual work"
**NEW THINKING**: "SAM 3 can bulk-extract assets from any screenshot"

## Elevated Thinking Prompts for SAM 3

1. **What if I could extract ANY object from ANY image in seconds?**
2. **What if I could track ANY object through ANY video automatically?**
3. **What tedious masking/selection work can I eliminate?**
4. **What assets am I NOT extracting because it seems too hard?**
5. **How can I combine SAM 3 + image generation for compositing?**
6. **What training data could I generate by extracting and recombining objects?**

## ✏️ Edit / Upscale

| Model | Best For |
|-------|----------|
| `nano-banana-edit` | Gemini image editing |
| `flux-fill` | Inpainting/outpainting |
| `remove-bg` | Background removal |
| `real-esrgan` | Fast 4x upscale |
| `clarity-upscaler` | AI enhanced upscale |
| `creative-upscaler` | Creative upscaling |

---

# Workflows

## Story-to-Video Pipeline

```python
from tools_core.domain.cloud import generate_image, generate_speech, generate_avatar

# 1. Generate character portrait
portrait = generate_image(
    "professional headshot of a friendly AI assistant, neutral background",
    model="flux-pro"
)

# 2. Generate narration
narration = generate_speech(
    "Welcome! I'm your AI guide. Let me show you something amazing.",
    voice="English_CalmWoman"
)

# 3. Create talking avatar
video = generate_avatar(portrait["url"], narration["url"])
print(f"Video: {video['url']}")
```

## Image Enhancement Pipeline

```python
# Generate → Edit → Upscale
base = generate_image("product photo, white background", model="flux-schnell")
edited = edit_image(base["url"], "make colors more vibrant")
final = upscale_image(edited["url"], scale=4, model="clarity-upscaler")
```

## 3D Asset Pipeline

```python
# Image → 3D
concept = generate_image("isometric game asset, treasure chest", model="flux-dev")
model_3d = generate_3d(image_url=concept["url"], model="trellis-2")
print(f"GLB: {model_3d['url']}")
```

---

# Local vs Cloud Decision Tree

```
Need text in image?
  → YES: Cloud (Ideogram V3) or Local (Z-Image-Turbo)
  
Need video?
  → Quick test: Local (LTX-2) or Cloud (ltx-video)
  → Production: Cloud (Veo 3.1, Kling V2, Sora 2)

Need talking avatar?
  → ALWAYS Cloud (Hunyuan Avatar)

Need 3D model?
  → Cloud (Trellis 2, Hunyuan 3D)

Need voice/TTS?
  → Cloud (MiniMax TTS, Kokoro TTS)

Just need an image?
  → Iterate: Local (Z-Image-Turbo, MFlux)
  → Production: Cloud (Flux Pro)
```

---

# Setup

1. Get FAL API key: https://fal.ai/dashboard/keys
2. Add to `box/API_CONFIG.env`:
   ```
   FAL_KEY=your_key_here
   ```
3. Install httpx: `pip install httpx`

---

*"Local for speed, cloud for power. Know when to use each."* 🔵
