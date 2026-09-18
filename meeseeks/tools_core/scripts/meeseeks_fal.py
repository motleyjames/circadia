#!/usr/bin/env python3
"""
Meeseeks FAL AI CLI - Cloud Generative Media
"I'M MR. MEESEEKS! I CAN CALL ANY CLOUD MODEL!"

50+ models for image, video, avatar, audio, 3D, and vision.

Usage:
    ./meeseeks_fal.py models [category]
    ./meeseeks_fal.py image "prompt" [--model MODEL] [--priority PRIORITY]
    ./meeseeks_fal.py video "prompt" [--model MODEL]
    ./meeseeks_fal.py speech "text" [--voice VOICE]
    ./meeseeks_fal.py avatar IMAGE_URL AUDIO_URL
    ./meeseeks_fal.py 3d --image IMAGE_URL
    ./meeseeks_fal.py upscale IMAGE_URL [--scale 4]
"""

import sys
import os
from pathlib import Path

# Add tools_core to path for imports
tools_core_path = Path(__file__).parent.parent
sys.path.insert(0, str(tools_core_path))

# Now run the fal_client CLI
if __name__ == "__main__":
    # Change to tools_core directory so relative imports work
    os.chdir(tools_core_path)
    
    # Import and run
    from domain.cloud import fal_client
    
    # The fal_client has its own __main__ block, but we need to trigger it
    # So we'll just exec its main code
    import argparse
    import json
    
    parser = argparse.ArgumentParser(
        description="Meeseeks FAL AI Client - Cloud Generative Media (50+ models)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all models
  %(prog)s models
  
  # List video models
  %(prog)s models video
  
  # Generate image (auto-select model)
  %(prog)s image "a cyberpunk city"
  
  # Generate image with specific model
  %(prog)s image "a sunset" --model flux-pro
  
  # Generate video
  %(prog)s video "a cat dancing" --model veo3.1-fast
  
  # Generate speech
  %(prog)s speech "Hello world" --voice English_CalmWoman
  
  # Generate talking avatar
  %(prog)s avatar <image_url> <audio_url>
  
  # Generate 3D model
  %(prog)s 3d --image <image_url>
  
  # 🔥 SAM 3 - SEGMENT ANYTHING (Game Changer!)
  %(prog)s segment <image_url> --prompt "the red car"     # Extract by description
  %(prog)s segment <image_url> --point 320,240            # Extract by click position
  %(prog)s segment <image_url> --box 100,100,400,400      # Extract by bounding box
  
  # 🔥 SAM 3 - TRACK ANYTHING through video
  %(prog)s track <video_url> --point 320,240 -d "the person in red"
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Models command
    models_parser = subparsers.add_parser("models", help="List available models")
    models_parser.add_argument("category", nargs="?", help="Filter by category")
    
    # Image command
    image_parser = subparsers.add_parser("image", help="Generate image")
    image_parser.add_argument("prompt", help="Image description")
    image_parser.add_argument("--model", "-m", help="Specific model")
    image_parser.add_argument("--priority", "-p", default="balanced",
                              choices=["fast", "quality", "cheap", "balanced"])
    
    # Video command
    video_parser = subparsers.add_parser("video", help="Generate video")
    video_parser.add_argument("prompt", help="Video description")
    video_parser.add_argument("--model", "-m", help="Specific model")
    video_parser.add_argument("--priority", "-p", default="balanced",
                              choices=["fast", "quality", "cheap", "balanced"])
    
    # Speech command
    speech_parser = subparsers.add_parser("speech", help="Generate speech")
    speech_parser.add_argument("text", help="Text to speak")
    speech_parser.add_argument("--voice", "-v", default="English_Trustworth_Man")
    speech_parser.add_argument("--model", "-m", default="minimax-tts")
    
    # Avatar command
    avatar_parser = subparsers.add_parser("avatar", help="Generate talking head")
    avatar_parser.add_argument("image_url", help="Portrait image URL")
    avatar_parser.add_argument("audio_url", help="Speech audio URL")
    avatar_parser.add_argument("--model", "-m", default="hunyuan-avatar")
    
    # 3D command
    three_d_parser = subparsers.add_parser("3d", help="Generate 3D model")
    three_d_parser.add_argument("--image", help="Image URL")
    three_d_parser.add_argument("--prompt", help="Text prompt")
    three_d_parser.add_argument("--model", "-m", help="Specific model")
    
    # Upscale command
    upscale_parser = subparsers.add_parser("upscale", help="Upscale image")
    upscale_parser.add_argument("image_url", help="Image URL")
    upscale_parser.add_argument("--scale", "-s", type=int, default=4)
    upscale_parser.add_argument("--model", "-m", help="Specific model")
    
    # Edit command
    edit_parser = subparsers.add_parser("edit", help="Edit image")
    edit_parser.add_argument("image_url", help="Image URL")
    edit_parser.add_argument("prompt", help="Edit instructions")
    edit_parser.add_argument("--model", "-m", default="nano-banana-edit")
    
    # Analyze command
    analyze_parser = subparsers.add_parser("analyze", help="Analyze image")
    analyze_parser.add_argument("image_url", help="Image URL")
    analyze_parser.add_argument("--prompt", "-p", default="Describe this image in detail.")
    analyze_parser.add_argument("--model", "-m", default="gemini-vision")
    
    # 🔥 SAM 3 - Segment Anything
    segment_parser = subparsers.add_parser("segment", help="🔥 SAM 3: Extract ANY object from image")
    segment_parser.add_argument("image_url", help="Image URL")
    segment_parser.add_argument("--prompt", "-p", help="What to segment (e.g., 'the red car')")
    segment_parser.add_argument("--point", type=str, help="Click position as 'x,y' (e.g., '320,240')")
    segment_parser.add_argument("--box", type=str, help="Bounding box as 'x1,y1,x2,y2'")
    
    # SAM 3 Video
    track_parser = subparsers.add_parser("track", help="🔥 SAM 3: Track object through video")
    track_parser.add_argument("video_url", help="Video URL")
    track_parser.add_argument("--point", type=str, required=True, help="Click position as 'x,y' to identify object")
    track_parser.add_argument("--description", "-d", help="What you're tracking (for logging)")
    
    args = parser.parse_args()
    
    if args.command == "models":
        result = fal_client.list_models(args.category)
        if "error" in result:
            print(f"❌ {result['error']}")
            sys.exit(1)
        
        # Pretty print
        total = sum(len(models) for models in result.values())
        print(f"🔵 FAL MODELS: {total} models")
        print()
        
        for category, models in result.items():
            print(f"📁 {category.upper()} ({len(models)} models)")
            for model_id, info in models.items():
                speed = info.get('speed', '?')
                quality = info.get('quality', '?')
                cost = info.get('cost', '?')
                print(f"   {speed:8} {quality:5} {cost:4} {model_id}")
            print()
    
    elif args.command == "image":
        print(f"🎨 Generating image with priority={args.priority}...")
        result = fal_client.generate_image(args.prompt, model=args.model, priority=args.priority)
        if result.get("success"):
            print(f"✅ Generated with {result.get('model_name', result.get('model'))}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "video":
        print(f"🎬 Generating video with priority={args.priority}...")
        print("   (This may take a few minutes...)")
        result = fal_client.generate_video(args.prompt, model=args.model, priority=args.priority)
        if result.get("success"):
            print(f"✅ Generated with {result.get('model_name', result.get('model'))}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "speech":
        print(f"🎤 Generating speech with voice={args.voice}...")
        result = fal_client.generate_speech(args.text, voice=args.voice, model=args.model)
        if result.get("success"):
            print(f"✅ Generated with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "avatar":
        print(f"🗣️ Generating avatar (this takes 5-10 minutes)...")
        result = fal_client.generate_avatar(args.image_url, args.audio_url, model=args.model)
        if result.get("success"):
            print(f"✅ Generated with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "3d":
        print(f"🧊 Generating 3D model...")
        result = fal_client.generate_3d(image_url=args.image, prompt=args.prompt, model=args.model)
        if result.get("success"):
            print(f"✅ Generated with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "upscale":
        print(f"🔍 Upscaling image {args.scale}x...")
        result = fal_client.upscale_image(args.image_url, scale=args.scale, model=args.model)
        if result.get("success"):
            print(f"✅ Upscaled with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "edit":
        print(f"✏️ Editing image...")
        result = fal_client.edit_image(args.image_url, args.prompt, model=args.model)
        if result.get("success"):
            print(f"✅ Edited with {result.get('model')}")
            print(f"   URL: {result.get('url')}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "analyze":
        print(f"👁️ Analyzing image...")
        result = fal_client.analyze_image(args.image_url, prompt=args.prompt, model=args.model)
        if result.get("success"):
            print(f"✅ Analysis with {result.get('model')}:")
            print(json.dumps(result.get("result"), indent=2))
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "segment":
        print(f"🔥 SAM 3: Segmenting object from image...")
        
        # Parse point if provided
        point = None
        if args.point:
            point = [int(x) for x in args.point.split(",")]
        
        # Parse box if provided  
        box = None
        if args.box:
            box = [int(x) for x in args.box.split(",")]
        
        result = fal_client.segment_image(
            args.image_url,
            prompt=args.prompt,
            point=point,
            box=box
        )
        
        if result.get("success"):
            print(f"✅ Segmentation complete!")
            print(f"   Masks extracted: {len(result.get('result', {}).get('masks', []))}")
            if result.get("result", {}).get("masks"):
                print(f"   Mask URLs:")
                for i, mask in enumerate(result["result"]["masks"][:3]):  # Show first 3
                    if isinstance(mask, dict) and mask.get("url"):
                        print(f"     [{i}] {mask['url']}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
    
    elif args.command == "track":
        print(f"🔥 SAM 3: Tracking object through video...")
        print("   (This may take several minutes...)")
        
        # Parse point
        point = [int(x) for x in args.point.split(",")]
        
        result = fal_client.track_object(
            args.video_url,
            description=args.description,
            click_position=point
        )
        
        if result.get("success"):
            print(f"✅ Tracking complete!")
            print(f"   Video URL: {result.get('url')}")
            if args.description:
                print(f"   Tracked: {args.description}")
        else:
            print(f"❌ Error: {result.get('error')}")
            sys.exit(1)
