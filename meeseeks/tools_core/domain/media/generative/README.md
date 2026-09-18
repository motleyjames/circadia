# Gen-Media SDK

Unified Python SDK for local image generation on Mac Silicon.

## Supported Backends

- **ComfyUI** - Workflow-based generation with full customization
- **MFLUX** - Direct Flux Schnell/Dev generation optimized for Apple Silicon
- **Z-Image** - Bilingual text-to-image with excellent text rendering
- **Draw Things** - Fast local generation via macOS app API

## Installation

```bash
cd generative-media
pip install -e .

# With MFLUX support
pip install -e ".[mflux]"

# With dev dependencies
pip install -e ".[dev]"
```

## Configuration

Copy `env.example` to `.env` and configure paths:

```bash
cp env.example .env
```

Key environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `COMFYUI_PATH` | ComfyUI installation directory | `~/ComfyUI` |
| `MODELS_PATH` | Shared models directory | `$COMFYUI_PATH/models` |
| `OUTPUT_PATH` | Generated images directory | `./output` |
| `COMFYUI_URL` | ComfyUI server URL | `http://127.0.0.1:8188` |
| `DRAWTHINGS_URL` | Draw Things API URL | `http://127.0.0.1:7860` |

## Quick Start

### ComfyUI

```python
import asyncio
from gen_media import ComfyUIClient, WorkflowManager

async def main():
    manager = WorkflowManager()
    workflow = manager.load("flux-schnell")
    workflow = manager.with_prompt(workflow, "a beautiful sunset over mountains")

    async with ComfyUIClient() as client:
        result = await client.generate(workflow)
        print(f"Generated {len(result.image_data)} images in {result.elapsed_time:.2f}s")

asyncio.run(main())
```

### MFLUX (Direct Generation)

```python
from gen_media import MFluxGenerator

generator = MFluxGenerator()
result = generator.generate("a beautiful sunset over mountains")

if result.success:
    print(f"Saved to: {result.image_path}")
else:
    print(f"Error: {result.error}")
```

### Z-Image

```python
import asyncio
from gen_media import ZImageGenerator

async def main():
    async with ZImageGenerator() as generator:
        result = await generator.generate(
            prompt="a sign that says 'HELLO WORLD'",
            width=1024,
            height=768,
        )
        print(f"Generated in {result.elapsed_time:.2f}s")

asyncio.run(main())
```

### Draw Things

```python
import asyncio
from gen_media import DrawThingsClient

async def main():
    async with DrawThingsClient() as client:
        result = await client.generate(
            prompt="a beautiful landscape",
            steps=4,
        )
        if result.success:
            print(f"Generated {len(result.images)} images")

asyncio.run(main())
```

## Workflows

Pre-built workflow templates are in the `workflows/` directory:

- `flux-schnell.json` - Fast 2-step Flux generation
- `flux-dev.json` - High-quality 50-step Flux generation
- `z-image-turbo.json` - Fast Z-Image with 8 steps
- `sdxl-turbo.json` - Fast SDXL Turbo generation

Load and customize workflows:

```python
from gen_media.features.comfyui import WorkflowManager

manager = WorkflowManager()
workflow = manager.load("flux-schnell")
workflow = manager.with_prompt(workflow, "your prompt here")
workflow = manager.with_size(workflow, 1024, 768)
workflow = manager.with_seed(workflow, 42)
```

## Model Registry

Discover available models:

```python
from gen_media.shared import ModelRegistry

registry = ModelRegistry()

# List all checkpoints
for model in registry.list_checkpoints():
    print(f"{model.name}: {model.size_human}")

# Find a specific model
model = registry.find_model("flux-schnell-fp8")
if model:
    print(f"Found at: {model.path}")

# Get summary
print(registry.summary())
```

## Project Structure

```
generative-media/
├── pyproject.toml          # Package configuration
├── env.example             # Environment template
├── src/
│   └── gen_media/
│       ├── config/         # Settings management
│       ├── features/
│       │   ├── comfyui/    # ComfyUI client
│       │   ├── mflux/      # MFLUX wrapper
│       │   ├── zimage/     # Z-Image integration
│       │   └── drawthings/ # Draw Things client
│       └── shared/         # Common utilities
├── workflows/              # Workflow templates
└── tests/                  # Test suite
```

## License

MIT

