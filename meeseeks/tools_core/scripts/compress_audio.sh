#!/bin/bash

# Conservative audio compression for voice narrations
# Reduces to 64kbps mono, optimized for voice clarity

SOURCE_DIR="/Users/mjmacblade2023/arcanelabs/xp/copia-knowledge-base/legacy/bundle/narrations"
OUTPUT_DIR="/Users/mjmacblade2023/arcanelabs/xp/copia-knowledge-base/legacy/bundle/narrations_compressed"

count=0
total=$(find "$SOURCE_DIR" -name "*.mp3" | wc -l | tr -d ' ')

echo "Starting compression of $total audio files..."
echo "Settings: 64kbps, 44.1kHz, mono"
echo ""

for audio in "$SOURCE_DIR"/*.mp3; do
    filename=$(basename "$audio")
    output="$OUTPUT_DIR/$filename"
    
    count=$((count + 1))
    echo -ne "[$count/$total] Processing: $filename\r"
    
    ffmpeg -i "$audio" \
        -b:a 64k \
        -ar 44100 \
        -ac 1 \
        "$output" \
        -y \
        -loglevel error
    
    if [ $? -ne 0 ]; then
        echo "✗ Failed: $filename                    "
    fi
done

echo ""
echo "Audio compression complete: $count/$total files processed"
