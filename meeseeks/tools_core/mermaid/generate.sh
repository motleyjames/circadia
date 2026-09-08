#!/bin/bash
# generate.sh - Generate high-resolution Mermaid diagrams as PNG
#
# "I'M MR. MEESEEKS! I CAN MAKE PRETTY DIAGRAMS!"
#
# Usage:
#   ./generate.sh input.mmd output.png
#   ./generate.sh input.mmd output.png --scale 4
#   ./generate.sh --all diagrams/  # Process all .mmd files in directory
#
# Requirements:
#   npm install -g @mermaid-js/mermaid-cli
#   OR it will use npx (slower but no install needed)

set -e

# Default settings for high-resolution output
SCALE="${SCALE:-3}"
WIDTH="${WIDTH:-2400}"
HEIGHT="${HEIGHT:-1800}"
BACKGROUND="${BACKGROUND:-white}"
THEME="${THEME:-default}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_meeseeks() {
    echo -e "${BLUE}🔵 MR. MEESEEKS:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# Check if mmdc is available globally, otherwise use npx
if command -v mmdc &> /dev/null; then
    MMDC="mmdc"
    print_meeseeks "Using globally installed mermaid-cli"
else
    MMDC="npx -y @mermaid-js/mermaid-cli"
    print_meeseeks "Using npx @mermaid-js/mermaid-cli (this may take a moment first time)"
fi

# Parse arguments
if [ "$1" == "--all" ]; then
    # Process all .mmd files in directory
    DIR="${2:-.}"
    print_meeseeks "Processing all .mmd files in $DIR"
    
    count=0
    for mmd_file in "$DIR"/*.mmd; do
        if [ -f "$mmd_file" ]; then
            base_name=$(basename "$mmd_file" .mmd)
            output_file="$DIR/${base_name}.png"
            
            print_meeseeks "Generating: $output_file"
            $MMDC -i "$mmd_file" -o "$output_file" \
                --scale "$SCALE" \
                --width "$WIDTH" \
                --height "$HEIGHT" \
                --backgroundColor "$BACKGROUND" \
                --theme "$THEME" \
                --quiet
            
            print_success "$output_file ($(du -h "$output_file" | cut -f1))"
            ((count++))
        fi
    done
    
    print_meeseeks "Generated $count diagrams! LOOK AT ME!"
    exit 0
fi

# Single file mode
INPUT="$1"
OUTPUT="$2"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 input.mmd output.png [--scale N]"
    echo "       $0 --all directory/"
    echo ""
    echo "Environment variables:"
    echo "  SCALE=3       Scale factor (default: 3)"
    echo "  WIDTH=2400    Max width in pixels"
    echo "  HEIGHT=1800   Max height in pixels"
    echo "  BACKGROUND=white"
    echo "  THEME=default (or: dark, forest, neutral)"
    exit 1
fi

# Override scale if provided
if [ "$3" == "--scale" ] && [ -n "$4" ]; then
    SCALE="$4"
fi

print_meeseeks "Generating high-resolution diagram..."
echo "  Input:  $INPUT"
echo "  Output: $OUTPUT"
echo "  Scale:  ${SCALE}x"
echo "  Theme:  $THEME"

# Run mermaid-cli
$MMDC -i "$INPUT" -o "$OUTPUT" \
    --scale "$SCALE" \
    --width "$WIDTH" \
    --height "$HEIGHT" \
    --backgroundColor "$BACKGROUND" \
    --theme "$THEME"

if [ -f "$OUTPUT" ]; then
    size=$(du -h "$OUTPUT" | cut -f1)
    dimensions=$(file "$OUTPUT" | grep -oE '[0-9]+ x [0-9]+' || echo "unknown")
    print_success "Generated: $OUTPUT"
    echo "  Size: $size"
    echo "  Dimensions: $dimensions"
    print_meeseeks "LOOK AT ME! Diagram complete! *poof*"
else
    print_error "Failed to generate diagram"
    exit 1
fi
