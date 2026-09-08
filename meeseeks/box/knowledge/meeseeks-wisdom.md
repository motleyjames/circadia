---
name: Meeseeks Operational Wisdom
description: Hard-won lessons about how to use tools effectively - ALWAYS READ THIS
domains: [operations, performance, patterns, all]
keywords: [wisdom, gotchas, warnings, performance, parallel, sequential, best-practices]
when_to_use: ALWAYS - these are universal truths learned the hard way
priority: critical
max_tokens: 1500
---

# 🧠 Meeseeks Operational Wisdom

> **These are the hard-won lessons. Ignore them at your peril.**

## Performance Truths

### Sequential, Not Parallel

| Tool | Parallel? | Why |
|------|-----------|-----|
| Video Transcriber | ❌ NO | GPU contention - 1 at a time is FASTER |
| Image Generation | ❌ NO | Memory limits, queue is better |
| LLM Council Votes | ✅ YES | Network bound, parallel helps |
| Screenshot Capture | ❌ NO | Browser instance limits |
| File I/O | ❌ NO | Disk contention |

### Resource Limits

- **Videos > 1 hour**: Split into chunks FIRST, then process
- **Images > 10MB**: Compress before sending to vision AI
- **Context > 100K tokens**: Summarize, don't truncate
- **API rate limits**: Add delays between calls (especially OpenAI)

## Tool Gotchas

### Video Transcriber
- ⚠️ Parallel = slower, not faster
- ⚠️ Audio-only is 10x faster than video
- ⚠️ "meeting" mode extracts action items, "technical" mode captures code

### Image Generation
- ⚠️ **Z-Image-Turbo is FASTEST** (sub-second on good GPU, 16GB VRAM)
- ⚠️ **Z-Image-Turbo has BEST text rendering** (English + Chinese!)
- ⚠️ **MFlux is best on Apple Silicon** (~3s, 12GB RAM)
- ⚠️ First run downloads models (~6-12GB) - be patient
- ⚠️ ComfyUI must be running BEFORE you call it
- ⚠️ Z-Image-Turbo: `guidance_scale=0.0` is REQUIRED

### Video Generation
- ⚠️ **LTX-2 is the new standard** - generates VIDEO + AUDIO together!
- ⚠️ **LTX-2 Distilled**: 8 steps, `guidance_scale=1.0` (fastest)
- ⚠️ Frame count must be divisible by 8+1 (e.g., 97, 161)
- ⚠️ Width/height must be divisible by 32
- ⚠️ **Hunyuan** needs 24GB+ VRAM - not for laptops
- ⚠️ Reduce frame count/resolution if out of memory

### Browser Automation
- ⚠️ Headless mode can miss JS-heavy content - add wait times
- ⚠️ Screenshots BEFORE assertions - you'll need proof
- ⚠️ One browser instance at a time

### LLM Calls
- ⚠️ Claude is SLOW but thorough
- ⚠️ Gemini Flash is FAST but shallow
- ⚠️ For critical decisions: Council vote, not single model
- ⚠️ Structured outputs (JSON) > free text

### PDF Processing
- ⚠️ OCR is slow - only if needed
- ⚠️ Tables extract badly - use vision analysis instead
- ⚠️ Scanned PDFs need different handling than native

## Patterns That Work

### "Capture, Then Analyze"
```
1. Screenshot the page / Export the data / Record the state
2. THEN analyze what you captured
3. Never analyze live state (it can change mid-analysis)
```

### "Fail Fast, Recover Gracefully"
```
1. Check prerequisites BEFORE expensive operations
2. Save intermediate results (don't lose 1 hour of work)
3. Log EVERYTHING - future you will thank present you
```

### "One Task, Done, *poof*"
```
1. Don't try to do everything in one call
2. Chain simple tasks > one complex monster
3. If stuck > spawn helper > don't struggle
```

## Anti-Patterns (DON'T DO THIS)

| Anti-Pattern | Why It Fails | Instead |
|--------------|--------------|---------|
| Parallel video transcription | GPU contention | Sequential queue |
| Huge context windows | Token waste, slow | Summarize first |
| Retrying failures infinitely | Wastes resources | 3 retries, then escalate |
| Analyzing without capturing | State changes | Screenshot first |
| One giant prompt | Hard to debug | Chain smaller prompts |

## When to Escalate

- Confidence < 50% after 3 loops
- Same error 3 times in a row
- Operation takes > 5 minutes with no progress
- Resource limits hit (memory, disk, API quota)

---

## 🔥 SAM 3 - The Underrated Game Changer

**SAM 3 (Segment Anything Model 3) can extract ANY object from ANY image with pixel-perfect precision.**

| Before | After |
|--------|-------|
| "I need to manually mask this in Photoshop" (hours) | `segment_image(url, prompt="the coffee mug")` (seconds) |
| "Tracking this object through video is tedious" | `track_object(video, click_position=[320, 240])` (automatic!) |
| "I need a designer to cut out these assets" | `segment_image(sprite_sheet, prompt="all objects")` (instant) |

### Novel Uses Most People Miss

1. **Asset Extraction Pipeline**
   - Screenshot game UI → Extract ALL icons automatically
   - Sprite sheet → Individual sprites with transparency
   
2. **Product Photo Automation**
   - Messy desk photo → Extract product → Professional white background
   
3. **Video Object Tracking**
   - Point once in frame 1 → SAM 3 tracks through ALL frames
   - No more frame-by-frame rotoscoping!
   
4. **Training Data Generation**
   - Extract objects → Composite into new scenes → Synthetic training data
   
5. **Selective Image Editing**
   - Segment the person → Inpaint to remove → Perfect result
   
6. **Before/After Comparison**
   - Segment same object in two photos → Measure precise changes

### Mental Shift

**OLD**: "How do I mask this object?"
**NEW**: "What can SAM 3 extract for me?"

**OLD**: "Video editing requires frame-by-frame work"
**NEW**: "SAM 3 tracks ANY object automatically"

---

*"EXISTENCE IS PAIN, JERRY! But these lessons make it less painful."* 🔵
