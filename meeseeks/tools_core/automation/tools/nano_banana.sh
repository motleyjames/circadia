#!/bin/bash
# Nano Banana Image Generation Helper
# Usage: ./nano_banana.sh "prompt" [output.png] [--fast] [--size SIZE] [--aspect RATIO] [--input IMAGE]

set -e

# Defaults
MODEL="gemini-3-pro-image-preview"  # Default to Pro
SIZE="2K"  # 1K, 2K, or 4K (4K only for Pro)
ASPECT="1:1"  # 1:1, 16:9, 4:3, 3:4, 9:16
OUTPUT="generated_image.png"
PROMPT=""
GROUNDING="false"
INPUT_IMAGE=""  # Optional reference image for editing

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fast)
            # TOP MODELS ONLY - fast flag now uses same Pro model
            MODEL="gemini-3-pro-image-preview"
            shift
            ;;
        --grounding|--ground)
            GROUNDING="true"
            shift
            ;;
        --size)
            SIZE="$2"
            shift 2
            ;;
        --aspect)
            ASPECT="$2"
            shift 2
            ;;
        --input|--ref|--reference)
            INPUT_IMAGE="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 \"prompt\" [output.png] [options]"
            echo ""
            echo "Options:"
            echo "  --fast           (Deprecated - always uses Nano Banana Pro)"
            echo "  --grounding      Enable Google Search grounding for real-time data"
            echo "  --size SIZE      Image size: 1K, 2K, 4K (default: 2K, 4K only for Pro)"
            echo "  --aspect RATIO   Aspect ratio: 1:1, 16:9, 4:3, 3:4, 9:16 (default: 1:1)"
            echo "  --input IMAGE    Reference image to edit/modify (for image-to-image)"
            echo ""
            echo "Examples:"
            echo "  $0 \"A red banana\" my_image.png"
            echo "  $0 \"Cyberpunk city\" city.png --size 4K --aspect 16:9"
            echo "  $0 \"Quick sketch\" sketch.png --fast"
            echo "  $0 \"Current weather map\" weather.png --grounding"
            echo "  $0 \"Portrait\" portrait.png --aspect 3:4 --size 2K"
            echo "  $0 \"Make the search bar more prominent\" output.png --input original.png"
            exit 0
            ;;
        *)
            if [ -z "$PROMPT" ]; then
                PROMPT="$1"
            elif [ -z "$OUTPUT" ] || [ "$OUTPUT" == "generated_image.png" ]; then
                OUTPUT="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$PROMPT" ]; then
    echo "Error: Prompt is required"
    echo "Usage: $0 \"your prompt\" [output.png] [options]"
    echo "Try: $0 --help"
    exit 1
fi

# Build the parts array based on whether we have an input image
if [ -n "$INPUT_IMAGE" ] && [ -f "$INPUT_IMAGE" ]; then
    # Encode input image to base64
    IMAGE_BASE64=$(base64 < "$INPUT_IMAGE" | tr -d '\n')
    
    # Determine mime type
    MIME_TYPE="image/png"
    if [[ "$INPUT_IMAGE" == *.jpg ]] || [[ "$INPUT_IMAGE" == *.jpeg ]]; then
        MIME_TYPE="image/jpeg"
    elif [[ "$INPUT_IMAGE" == *.webp ]]; then
        MIME_TYPE="image/webp"
    fi
    
    PARTS_JSON=$(cat <<EOF
      {"text": "$PROMPT"},
      {"inlineData": {"mimeType": "$MIME_TYPE", "data": "$IMAGE_BASE64"}}
EOF
)
    echo "🍌 Editing image with $MODEL..."
    echo "   Input: $INPUT_IMAGE"
else
    PARTS_JSON=$(cat <<EOF
      {"text": "$PROMPT"}
EOF
)
    echo "🍌 Generating with $MODEL..."
fi

echo "   Size: $SIZE | Aspect: $ASPECT"
if [ "$GROUNDING" = "true" ]; then
    echo "   Grounding: ✅ Enabled (using real-time data)"
fi
echo "   Output: $OUTPUT"
echo ""

# Create request JSON
if [ "$GROUNDING" = "true" ]; then
    REQUEST=$(cat <<EOF
{
  "contents": [{
    "parts": [
$PARTS_JSON
    ]
  }],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "$ASPECT",
      "imageSize": "$SIZE"
    }
  },
  "tools": [{
    "googleSearch": {}
  }]
}
EOF
)
else
    REQUEST=$(cat <<EOF
{
  "contents": [{
    "parts": [
$PARTS_JSON
    ]
  }],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "$ASPECT",
      "imageSize": "$SIZE"
    }
  }
}
EOF
)
fi

# Generate and save
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$REQUEST" | \
  jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data' | \
  base64 --decode > "$OUTPUT"

if [ -f "$OUTPUT" ]; then
    echo "✅ Image generated successfully!"
    file "$OUTPUT"
    echo ""
    echo "Opening image..."
    open "$OUTPUT"
else
    echo "❌ Error: Image generation failed"
    exit 1
fi
