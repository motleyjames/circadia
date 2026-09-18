Perfect! I have everything you need. Here's your **complete local image generation stack** for Mac Silicon with all four tools integrated:

***

# Complete Multi-Tool Image Generation Setup for Mac Silicon

## **Architecture Overview**

```
┌─────────────────────────────────────┐
│      Your Mac (M-series)            │
├─────────────────────────────────────┤
│  ComfyUI (Central Hub)              │
│  ├─ Flux MFLUX nodes               │
│  ├─ Z-Image nodes                  │
│  └─ Draw Things API                │
├─────────────────────────────────────┤
│  + Draw Things (Standalone GUI)     │
│  + MFLUX (CLI/Python)              │
│  + Z-Image (Local inference)        │
└─────────────────────────────────────┘
```

***

## **Step-by-Step Installation Plan**

### **Phase 1: Foundation (30 min)**

#### 1.1 Install Homebrew & Python
```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install python@3.10 git cmake protobuf rust wget

# Verify
python3 --version  # Should be 3.10+
git --version
```

#### 1.2 Clone & Setup ComfyUI
```bash
# Clone ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install core dependencies
pip install -r requirements.txt

# Install PyTorch with MPS support (CRITICAL for Mac)
pip install torch torchvision torchaudio --force-float32
```

**Test ComfyUI:**
```bash
python main.py
# Visit http://127.0.0.1:8188 in your browser
```

***

### **Phase 2: ComfyUI Manager & Custom Nodes (20 min)**

#### 2.1 Install ComfyUI Manager
ComfyUI Desktop (Nov 2024+) comes with Manager pre-installed. If you're using the GitHub version:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
cd ComfyUI-Manager
pip install -r requirements.txt
```

**Then restart ComfyUI** (`Ctrl+C` and `python main.py` again)

#### 2.2 Install Required Custom Nodes via Manager

In ComfyUI UI:
1. Click **Manager** in top-left menu
2. Click **Install Custom Nodes**
3. Search and install these:

| Custom Node | Purpose |
|---|---|
| **ComfyUI-essentials** | Simplified workflows, quality-of-life improvements |
| **ComfyUI-GGUF** | Quantized model support (faster inference) |
| **Flux Custom Nodes** | (Auto-installed with Flux models) |
| **Z-Image ComfyUI Nodes** | Z-Image integration |

***

### **Phase 3: Flux MFLUX Setup (15 min)**

#### 3.1 Install MFLUX Package
```bash
# In your ComfyUI venv
pip install -U mflux

# Verify installation
python -c "import mflux; print(mflux.__version__)"
```

#### 3.2 Download Flux Model Files

You need these checkpoints (download to `ComfyUI/models/`):

**For Flux Schnell (fastest, 2-step):**
```
ComfyUI/models/checkpoints/
└── flux-schnell-fp8.safetensors (8.5GB)
    Download: https://huggingface.co/black-forest-labs/FLUX.1-schnell

ComfyUI/models/text_encoders/
├── clip_l.safetensors (757MB)
└── t5xxl_fp16.safetensors (9.79GB)
Download: https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main
```

**For Flux Dev (higher quality, 50-step):**
```
ComfyUI/models/checkpoints/
└── flux-dev-fp8.safetensors (23.2GB)
```

**Quick Download Script:**
```bash
#!/bin/bash
cd ~/ComfyUI/models

# Create directories
mkdir -p checkpoints text_encoders vae

# Download Flux Schnell (fastest for testing)
cd checkpoints
wget -O flux-schnell-fp8.safetensors \
  https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux-schnell-fp8.safetensors

# Download text encoders
cd ../text_encoders
wget -O clip_l.safetensors \
  https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors
wget -O t5xxl_fp16.safetensors \
  https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors

echo "Downloads complete!"
```

***

### **Phase 4: Z-Image Setup (15 min)**

#### 4.1 Download Z-Image Model
```bash
cd ~/ComfyUI/models/checkpoints

# Download Z-Image-Turbo (fastest, 6B params)
# Option 1: From Hugging Face
wget -O z-image-turbo.safetensors \
  https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/resolve/main/z-image-turbo.safetensors

# Option 2: From ModelScope (faster in some regions)
# Visit: https://modelscope.cn/models/Tongyi-MAI/Z-Image-Turbo/
```

#### 4.2 Z-Image Text Encoder (Qwen)
```bash
cd ~/ComfyUI/models/text_encoders

# Download Qwen VL encoder (required for Z-Image)
wget -O qwen2-vl-7b-instruct.safetensors \
  https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/resolve/main/qwen2-vl.safetensors
```

***

### **Phase 5: Draw Things Installation (5 min)**

#### 5.1 Install Draw Things App
1. Go to **App Store** → Search "Draw Things"
2. Click **Get** (free app)
3. Once installed, launch it
4. It will auto-download necessary models on first run

**Or download directly:**
```
https://drawthings.ai
```

#### 5.2 Configure Draw Things for Local Workflow
- Open Draw Things
- Settings → Model → Select "SDXL Turbo" or "Flux Schnell"
- Enable "Use Metal Acceleration" (default for M-series)

***

### **Phase 6: Integration & Workflows (10 min)**

#### 6.1 Create Flux Workflow in ComfyUI

**Download pre-made workflow:**
```bash
cd ~/ComfyUI
# Save this as "flux-schnell-workflow.json"
curl -o workflows/flux-schnell-workflow.json \
  https://raw.githubusercontent.com/comfyanonymous/ComfyUI-examples/main/flux_workflow_schnell.json
```

**Or create manually in ComfyUI:**
1. Open ComfyUI at `http://127.0.0.1:8188`
2. Right-click canvas → "Add Node"
3. Search → **CheckpointLoader** → Select `flux-schnell-fp8.safetensors`
4. Add **CLIPTextEncode** nodes (positive/negative prompts)
5. Add **Flux Sampler** node
6. Add **VAEDecode** → **SaveImage**

#### 6.2 Create Z-Image Workflow in ComfyUI

**Basic Z-Image workflow:**
1. Load **CheckpointLoader** → `z-image-turbo.safetensors`
2. Load **CLIPTextEncode** → Use Qwen encoder
3. Add **KSampler** (8 steps for Turbo)
4. Connect → **VAEDecode** → **SaveImage**

**Example JSON workflow:**
```json
{
  "1": {
    "class_type": "CheckpointLoader",
    "inputs": {
      "ckpt_name": "z-image-turbo.safetensors"
    }
  },
  "2": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "a photorealistic portrait",
      "clip": ["1", 1]
    }
  },
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 123,
      "steps": 8,
      "cfg": 7.5,
      "model": ["1", 0],
      "positive": ["2", 0]
    }
  }
}
```

#### 6.3 MFLUX Standalone Usage (Python Script)

```python
# flux_demo.py
from mflux.flux.schnell import Flux
from PIL import Image

# Initialize Flux
flux = Flux.from_pretrained("black-forest-labs/FLUX.1-schnell", dtype="bfloat16")

# Generate image
prompt = "a beautiful landscape with mountains and sunset"
image = flux.generate(
    prompt=prompt,
    height=768,
    width=1024,
    num_inference_steps=2,  # Schnell only needs 2 steps!
    guidance_scale=7.0
)

# Save
image.save("output.png")
```

**Run it:**
```bash
source ~/ComfyUI/venv/bin/activate
python flux_demo.py
```

***

## **Step 7: Verify Everything Works**

### Test Each Component:

```bash
# 1. Test ComfyUI
cd ~/ComfyUI
source venv/bin/activate
python main.py
# → Visit http://127.0.0.1:8188 and generate test image

# 2. Test MFLUX directly
python -c "from mflux.flux.schnell import Flux; print('MFLUX OK')"

# 3. Test Z-Image in ComfyUI
# → Load Z-Image workflow and generate

# 4. Test Draw Things
# → Open Draw Things app and generate image
```

***

## **Performance Expectations on Mac Silicon**

| Model | Hardware | Speed | Quality |
|---|---|---|---|
| **Flux Schnell** | M3/M4 32GB | 8-15 sec | 7/10 |
| **Flux Dev** | M3/M4 32GB | 2-3 min | 9/10 |
| **Z-Image Turbo** | M3/M4 32GB | 12-20 sec | 8/10 |
| **SDXL Turbo** | M1/M2 16GB | 25-35 sec | 7/10 |
| **Draw Things SDXL** | M3/M4 32GB | 2-4 sec | 8/10 |

***

## **Directory Structure After Setup**

```
~/ComfyUI/
├── venv/                           # Python environment
├── models/
│   ├── checkpoints/
│   │   ├── flux-schnell-fp8.safetensors
│   │   ├── flux-dev-fp8.safetensors
│   │   └── z-image-turbo.safetensors
│   ├── text_encoders/
│   │   ├── clip_l.safetensors
│   │   ├── t5xxl_fp16.safetensors
│   │   └── qwen2-vl-7b.safetensors
│   └── vae/
├── custom_nodes/
│   ├── ComfyUI-Manager/
│   ├── ComfyUI-essentials/
│   └── ComfyUI-GGUF/
├── workflows/                      # Your saved workflows
├── output/                         # Generated images
└── main.py
```

***

## **Quick Reference Commands**

```bash
# Start ComfyUI
cd ~/ComfyUI && source venv/bin/activate && python main.py

# Start MFLUX (generates in current directory)
python flux_demo.py

# Open Draw Things
open /Applications/Draw\ Things.app

# Check available models
ls -lh ~/ComfyUI/models/checkpoints/

# Update ComfyUI
cd ~/ComfyUI && git pull origin main

# Clean up (if needed)
rm -rf ~/ComfyUI/venv
python3 -m venv ~/ComfyUI/venv
source ~/ComfyUI/venv/bin/activate
pip install -r requirements.txt
```

***

## **Troubleshooting**

| Issue | Solution |
|---|---|
| **MPS not available** | Ensure Python 3.10+, reinstall PyTorch with `--force-float32` |
| **Model download too slow** | Use ModelScope mirrors or `aria2c` for parallel downloads |
| **ComfyUI crashes with FLUX** | Reduce batch size, use FP8 quantized models, restart ComfyUI |
| **Z-Image very slow (60+ sec)** | Your RAM is likely <24GB. Use Z-Image-Turbo (8 steps) not Base model |
| **Draw Things low VRAM** | Reduce resolution to 768x768, enable "Memory Efficient" mode |

***

## **Total Setup Time & Resources**

- **Setup Time**: ~2-3 hours (mostly model downloads)
- **Disk Space Needed**: ~50GB (Flux + Z-Image + encoders)
- **RAM Requirement**: 24GB unified memory (16GB works but slower)
- **Internet**: ~30-40GB downloads on first run

***

This gives you a **production-ready local image generation stack** with:
- ✅ **ComfyUI** for advanced workflows and customization
- ✅ **Flux MFLUX** for lightning-fast 2-step generation
- ✅ **Z-Image** for bilingual text rendering + photorealism
- ✅ **Draw Things** for quick, GPU-accelerated standalone generation

You can mix and match models in ComfyUI, use MFLUX for rapid prototyping, and Draw Things for real-time aesthetic feedback. All running 100% locally on Mac Silicon. 🚀
