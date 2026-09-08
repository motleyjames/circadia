#!/usr/bin/env python3
"""
meeseeks_generate.py - Headless Local Image Generation

"I'M MR. MEESEEKS! I'LL GENERATE THAT IMAGE!"

Usage:
    ./meeseeks_generate.py "a cyberpunk city" output.png
    ./meeseeks_generate.py "a red panda" panda.png --backend mflux --steps 8
    ./meeseeks_generate.py --check  # Check available backends
    
Backends:
    mflux      - Apple Silicon optimized Flux (fastest, default)
    comfyui    - Full workflow-based generation (requires server)
    drawthings - macOS Draw Things app (requires app running)
    zimage     - Bilingual text-to-image via ComfyUI
"""

import argparse
import sys
import time
from pathlib import Path

# Add tools_core to path
script_dir = Path(__file__).parent.parent
sys.path.insert(0, str(script_dir))


def main():
    parser = argparse.ArgumentParser(
        description="🔵 Meeseeks Generative Media - Headless Image Generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument("prompt", nargs="?", help="Text prompt for image generation")
    parser.add_argument("output", nargs="?", default="output.png", help="Output file path")
    
    parser.add_argument("--backend", "-b", 
                       choices=["mflux", "comfyui", "drawthings", "zimage"],
                       default="mflux",
                       help="Generation backend (default: mflux)")
    parser.add_argument("--width", "-W", type=int, default=1024, help="Image width")
    parser.add_argument("--height", "-H", type=int, default=1024, help="Image height")
    parser.add_argument("--steps", "-s", type=int, help="Inference steps")
    parser.add_argument("--seed", type=int, help="Random seed")
    
    parser.add_argument("--check", action="store_true", 
                       help="Check available backends and exit")
    parser.add_argument("--quiet", "-q", action="store_true",
                       help="Minimal output")
    
    args = parser.parse_args()
    
    # Import the media module
    from domain.media import generate_image, check_backends, GEN_MEDIA_AVAILABLE
    
    # Check mode
    if args.check:
        print("🔵 MEESEEKS GENERATIVE MEDIA - Backend Check")
        print("=" * 50)
        
        status = check_backends()
        
        if not status["gen_media_installed"]:
            print("❌ gen_media package NOT INSTALLED")
            print()
            print("To install:")
            print("  cd tools_core/domain/media/generative")
            print("  pip install -e .")
            print("  # Or with MFlux: pip install -e '.[mflux]'")
            sys.exit(1)
        
        print("✅ gen_media package installed")
        print()
        print("Backends:")
        for backend, available in status["backends"].items():
            icon = "✅" if available else "❌"
            print(f"  {icon} {backend}")
        
        print()
        print("To use MFlux (fastest on Apple Silicon):")
        print("  pip install mflux")
        print()
        print("To use ComfyUI:")
        print("  1. Start ComfyUI server on port 8188")
        print("  2. Download Flux models to ComfyUI/models/")
        print()
        print("To use Draw Things:")
        print("  1. Open Draw Things.app")
        print("  2. Enable API server (port 7860)")
        
        sys.exit(0)
    
    # Generation mode
    if not args.prompt:
        parser.error("prompt is required for generation")
    
    if not GEN_MEDIA_AVAILABLE:
        print("❌ gen_media package not installed")
        print("Run: cd tools_core/domain/media/generative && pip install -e .")
        sys.exit(1)
    
    if not args.quiet:
        print(f"🔵 Generating with {args.backend}...")
        print(f"   Prompt: {args.prompt[:50]}{'...' if len(args.prompt) > 50 else ''}")
        print(f"   Size: {args.width}x{args.height}")
    
    start = time.time()
    
    result = generate_image(
        prompt=args.prompt,
        output_path=args.output,
        backend=args.backend,
        width=args.width,
        height=args.height,
        steps=args.steps,
        seed=args.seed,
    )
    
    elapsed = time.time() - start
    
    if result["success"]:
        if not args.quiet:
            print(f"✅ Saved to: {result['path']}")
            print(f"   Time: {elapsed:.1f}s")
        else:
            print(result["path"])
        sys.exit(0)
    else:
        print(f"❌ Error: {result['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
