---
name: Nano Banana Image Generation
description: Gemini-powered image generation CLI tool with Pro and Flash modes
domains: [image-generation, gemini, ai-images, cli]
keywords: [nano_banana, gemini, image, generate, 4K, aspect-ratio, grounding]
when_to_use: When generating images with Gemini models via CLI
priority: high
max_tokens: 800
---

# 🍌 Nano Banana CLI Helper

Quick reference for `nano_banana.sh` - Gemini image generation tool

## Usage

```bash
./nano_banana.sh "your prompt" [output.png] [options]
```

## Default Behavior
- **Model**: Nano Banana Pro (gemini-3-pro-image-preview) ✨
- **Size**: 2K resolution
- **Aspect**: 1:1 (square)
- **Output**: generated_image.png

## Options

| Flag | Description | Values |
|------|-------------|--------|
| `--fast` | Use Nano Banana (2.5 Flash) instead of Pro | N/A |
| `--grounding` | Enable Google Search grounding for real-time data | N/A |
| `--size` | Image resolution | 1K, 2K, **4K** (4K only for Pro) |
| `--aspect` | Aspect ratio | 1:1, 16:9, 4:3, 3:4, 9:16 |
| `--help` | Show help | N/A |

## Examples

### Basic (Default Pro, 2K, 1:1)
```bash
./nano_banana.sh "A red banana" my_image.png
```

### 4K Ultra HD Landscape
```bash
./nano_banana.sh "Epic mountain vista" landscape.png --size 4K --aspect 16:9
```
**Output**: 5504x3072 pixels

### 4K Portrait
```bash
./nano_banana.sh "Character portrait" portrait.png --size 4K --aspect 3:4
```
**Output**: 3584x4800 pixels

### Fast Generation (2.5 Flash)
```bash
./nano_banana.sh "Quick sketch" sketch.png --fast
```
⚠️ Note: Flash model currently has API issues

### Cinematic Widescreen
```bash
./nano_banana.sh "Sci-fi cityscape at night" scifi.png --aspect 16:9 --size 2K
```

### Mobile Portrait
```bash
./nano_banana.sh "App splash screen" splash.png --aspect 9:16 --size 2K
```

### Real-Time Data with Grounding
```bash
./nano_banana.sh "Current weather map of North America" weather.png --grounding --aspect 16:9
```
**Use grounding for**: Current events, real-time data, recent news, sports scores, weather, stock markets

### Comparison: With vs Without Grounding
```bash
# Without grounding - generic/creative interpretation
./nano_banana.sh "Stock market trends" stocks.png

# With grounding - uses real-time search data
./nano_banana.sh "Stock market trends" stocks.png --grounding
```

## Resolution Reference

| Size | 1:1 | 16:9 | 4:3 | 3:4 | 9:16 |
|------|-----|------|-----|-----|------|
| 1K | 1024x1024 | 1536x864 | 1408x1056 | 1056x1408 | 864x1536 |
| 2K | 2048x2048 | 2752x1536 | 2304x1728 | 1728x2304 | 1536x2752 |
| 4K | 4096x4096 | 5504x3072 | 4608x3456 | 3584x4800 | 3072x5504 |

## Model Comparison

### Nano Banana (Default)
- **Model**: `gemini-3-pro-image-preview`
- **Max Resolution**: 4K
- **Best for**: Production assets, detailed visuals, high-quality images
- **Speed**: Higher quality (preferred default)

## Tips

1. **4K is Pro-only**: Only available with default (Pro) model
2. **Prompt quality matters**: More detailed prompts = better results
3. **Aspect ratios**: Choose based on use case (16:9 for desktop, 9:16 for mobile, 1:1 for social)
4. **File size**: 4K images are 8-15MB, 2K are 2-4MB

## Grounding Feature 🌐

**What is grounding?**  
Grounding enables the model to search Google for real-time information before generating the image. This makes the image based on actual current data rather than the model's training knowledge.

**When to use grounding:**
- Current events ("Today's news headlines")
- Real-time data ("Current weather map", "Live stock prices")
- Recent information ("Latest sports scores", "Today's date")
- Factual accuracy matters

**When NOT to use grounding:**
- Creative/artistic content
- Fictional scenarios
- Abstract concepts
- Historical scenes (already in training data)

**Performance note:** Grounding adds minimal processing time but provides much more accurate real-time information.

## Tested & Working ✅

- ✅ Default Pro model (gemini-3-pro-image-preview)
- ✅ 2K generation (all aspect ratios)
- ✅ 4K generation (all aspect ratios)
- ✅ Complex prompts with detailed descriptions
- ✅ All aspect ratios (1:1, 16:9, 4:3, 3:4, 9:16)
- ✅ Google Search grounding for real-time data

## Known Issues

- None currently tracked for the default model (`gemini-3-pro-image-preview`)
