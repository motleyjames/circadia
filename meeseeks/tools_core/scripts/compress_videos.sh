#!/bin/bash

# Conservative video compression for screen recordings
# Maintains readability while reducing file size ~70%

SOURCE_DIR="/Users/mjmacblade2023/arcanelabs/xp/copia-knowledge-base/legacy/bundle/all_clips"
OUTPUT_DIR="/Users/mjmacblade2023/arcanelabs/xp/copia-knowledge-base/legacy/bundle/all_clips_compressed"

count=0
total=$(find "$SOURCE_DIR" -name "*.mp4" | wc -l | tr -d ' ')

echo "Starting compression of $total videos..."
echo "Settings: H.264, CRF 25, 24fps, stillimage tune, AAC 96kbps"
echo ""

for video in "$SOURCE_DIR"/*.mp4; do
    filename=$(basename "$video")
    output="$OUTPUT_DIR/$filename"
    
    count=$((count + 1))
    echo "[$count/$total] Processing: $filename"
    
    ffmpeg -i "$video" \
        -c:v libx264 \
        -crf 25 \
        -preset medium \
        -tune stillimage \
        -r 24 \
        -c:a aac \
        -b:a 96k \
        -movflags +faststart \
        "$output" \
        -y \
        -loglevel error \
        -stats
    
    if [ $? -eq 0 ]; then
        echo "✓ Complete"
    else
        echo "✗ Failed: $filename"
    fi
    echo ""
done

echo "Video compression complete: $count/$total files processed"
