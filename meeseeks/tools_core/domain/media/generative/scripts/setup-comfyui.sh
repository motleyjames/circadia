#!/bin/bash
#
# ComfyUI Installation Script for Mac Silicon
# This script installs ComfyUI and downloads essential models.
#
# Usage:
#   ./scripts/setup-comfyui.sh [--with-models] [--install-path /path/to/install]
#
# Options:
#   --with-models     Download Flux Schnell model and text encoders
#   --install-path    Custom installation path (default: ~/ComfyUI)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default settings
INSTALL_PATH="${HOME}/ComfyUI"
WITH_MODELS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --with-models)
            WITH_MODELS=true
            shift
            ;;
        --install-path)
            INSTALL_PATH="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--with-models] [--install-path /path/to/install]"
            echo ""
            echo "Options:"
            echo "  --with-models     Download Flux Schnell model and text encoders"
            echo "  --install-path    Custom installation path (default: ~/ComfyUI)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           ComfyUI Installation for Mac Silicon             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed.${NC}"
    echo "Install with: brew install python@3.10"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "  ${GREEN}✓${NC} Python ${PYTHON_VERSION} found"

if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: Git is not installed.${NC}"
    echo "Install with: brew install git"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Git found"

# Check if already installed
if [ -d "$INSTALL_PATH" ]; then
    echo ""
    echo -e "${YELLOW}ComfyUI already exists at ${INSTALL_PATH}${NC}"
    read -p "Do you want to update it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Updating ComfyUI...${NC}"
        cd "$INSTALL_PATH"
        git pull origin main
    else
        echo "Skipping clone, using existing installation."
    fi
else
    # Clone ComfyUI
    echo ""
    echo -e "${BLUE}Cloning ComfyUI to ${INSTALL_PATH}...${NC}"
    git clone https://github.com/comfyanonymous/ComfyUI.git "$INSTALL_PATH"
fi

cd "$INSTALL_PATH"

# Create virtual environment
echo ""
echo -e "${BLUE}Setting up Python virtual environment...${NC}"

if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "  ${GREEN}✓${NC} Virtual environment created"
else
    echo -e "  ${GREEN}✓${NC} Virtual environment already exists"
fi

# Activate venv and install dependencies
source venv/bin/activate

echo ""
echo -e "${BLUE}Installing Python dependencies...${NC}"
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# Install PyTorch with MPS support
echo ""
echo -e "${BLUE}Installing PyTorch with Metal (MPS) support...${NC}"
pip install torch torchvision torchaudio -q
echo -e "  ${GREEN}✓${NC} PyTorch installed"

# Install ComfyUI Manager
echo ""
echo -e "${BLUE}Installing ComfyUI Manager...${NC}"
if [ ! -d "custom_nodes/ComfyUI-Manager" ]; then
    cd custom_nodes
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git
    cd ComfyUI-Manager
    pip install -r requirements.txt -q
    cd ../..
    echo -e "  ${GREEN}✓${NC} ComfyUI Manager installed"
else
    echo -e "  ${GREEN}✓${NC} ComfyUI Manager already installed"
fi

# Create model directories
echo ""
echo -e "${BLUE}Creating model directories...${NC}"
mkdir -p models/checkpoints
mkdir -p models/text_encoders
mkdir -p models/vae
mkdir -p models/loras
mkdir -p models/controlnet
echo -e "  ${GREEN}✓${NC} Model directories created"

# Download models if requested
if [ "$WITH_MODELS" = true ]; then
    echo ""
    echo -e "${BLUE}Downloading models (this may take a while)...${NC}"
    echo -e "${YELLOW}Note: Models are large files. Flux Schnell ~8.5GB, text encoders ~10GB${NC}"
    echo ""
    
    # Check for aria2c for faster downloads
    if command -v aria2c &> /dev/null; then
        DOWNLOADER="aria2c -x 16 -s 16 -k 1M"
    elif command -v wget &> /dev/null; then
        DOWNLOADER="wget -q --show-progress"
    else
        DOWNLOADER="curl -L -o"
    fi
    
    # Download Flux Schnell checkpoint
    if [ ! -f "models/checkpoints/flux1-schnell.safetensors" ]; then
        echo -e "  Downloading Flux Schnell checkpoint..."
        cd models/checkpoints
        $DOWNLOADER "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors" -o flux1-schnell.safetensors 2>/dev/null || \
        curl -L -o flux1-schnell.safetensors "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors"
        cd ../..
        echo -e "  ${GREEN}✓${NC} Flux Schnell downloaded"
    else
        echo -e "  ${GREEN}✓${NC} Flux Schnell already exists"
    fi
    
    # Download CLIP-L text encoder
    if [ ! -f "models/text_encoders/clip_l.safetensors" ]; then
        echo -e "  Downloading CLIP-L text encoder..."
        cd models/text_encoders
        curl -L -o clip_l.safetensors "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors"
        cd ../..
        echo -e "  ${GREEN}✓${NC} CLIP-L downloaded"
    else
        echo -e "  ${GREEN}✓${NC} CLIP-L already exists"
    fi
    
    # Download T5-XXL text encoder
    if [ ! -f "models/text_encoders/t5xxl_fp16.safetensors" ]; then
        echo -e "  Downloading T5-XXL text encoder (this is ~9.8GB)..."
        cd models/text_encoders
        curl -L -o t5xxl_fp16.safetensors "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors"
        cd ../..
        echo -e "  ${GREEN}✓${NC} T5-XXL downloaded"
    else
        echo -e "  ${GREEN}✓${NC} T5-XXL already exists"
    fi
fi

# Create start script
echo ""
echo -e "${BLUE}Creating start script...${NC}"
cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python main.py "$@"
EOF
chmod +x start.sh
echo -e "  ${GREEN}✓${NC} Start script created"

# Update gen-media .env if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEN_MEDIA_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$GEN_MEDIA_DIR/.env"

if [ -d "$GEN_MEDIA_DIR/src/gen_media" ]; then
    echo ""
    echo -e "${BLUE}Updating gen-media configuration...${NC}"
    
    # Create or update .env file
    if [ -f "$ENV_FILE" ]; then
        # Update existing COMFYUI_PATH
        if grep -q "^COMFYUI_PATH=" "$ENV_FILE"; then
            sed -i '' "s|^COMFYUI_PATH=.*|COMFYUI_PATH=${INSTALL_PATH}|" "$ENV_FILE"
        else
            echo "COMFYUI_PATH=${INSTALL_PATH}" >> "$ENV_FILE"
        fi
    else
        echo "COMFYUI_PATH=${INSTALL_PATH}" > "$ENV_FILE"
    fi
    echo -e "  ${GREEN}✓${NC} Updated .env with COMFYUI_PATH=${INSTALL_PATH}"
fi

# Done
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                Installation Complete!                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "ComfyUI installed at: ${BLUE}${INSTALL_PATH}${NC}"
echo ""
echo -e "To start ComfyUI:"
echo -e "  ${YELLOW}cd ${INSTALL_PATH} && ./start.sh${NC}"
echo ""
echo -e "Or manually:"
echo -e "  ${YELLOW}cd ${INSTALL_PATH} && source venv/bin/activate && python main.py${NC}"
echo ""
echo -e "Then open: ${BLUE}http://127.0.0.1:8188${NC}"
echo ""

if [ "$WITH_MODELS" = false ]; then
    echo -e "${YELLOW}Note: No models were downloaded. To download Flux Schnell models, run:${NC}"
    echo -e "  ${YELLOW}$0 --with-models${NC}"
    echo ""
fi

