#!/usr/bin/env python3
"""
Visual Improvement Renderer

Takes improvement specs and renders visual comparisons using:
1. Playwright - Inject CSS into live page and screenshot
2. Gemini Imagen - Generate AI mockup of the improvement

Usage:
    python render_improvements.py <improvements_folder>
    python render_improvements.py <improvements_folder> --improvement vd_1
    python render_improvements.py <improvements_folder> --method playwright
    python render_improvements.py <improvements_folder> --method imagen
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Dict

# Get paths
TOOLS_DIR = Path(__file__).parent.absolute()
AUTOMATION_DIR = TOOLS_DIR.parent




def call_gemini_imagen(
    prompt: str, 
    output_path: Path, 
    input_image: str = None,
    aspect: str = "16:9", 
    size: str = "2K"
) -> bool:
    """
    Call Gemini image generation using nano_banana.sh script.
    
    Args:
        prompt: The image generation/editing prompt
        output_path: Where to save the generated image
        input_image: Optional reference image for image-to-image editing
        aspect: Aspect ratio (1:1, 16:9, 4:3, 3:4, 9:16)
        size: Resolution (1K, 2K, 4K)
    
    Returns:
        True if successful, False otherwise
    """
    # nano_banana.sh is in the same tools directory
    nano_banana_script = TOOLS_DIR / "nano_banana.sh"
    
    if not nano_banana_script.exists():
        print(f"   ❌ nano_banana.sh not found at {nano_banana_script}")
        return False
    
    # Build command
    cmd = [
        "bash", str(nano_banana_script),
        prompt,
        str(output_path),
        "--aspect", aspect,
        "--size", size
    ]
    
    # Add input image for image-to-image editing
    if input_image and Path(input_image).exists():
        cmd.extend(["--input", str(input_image)])
    
    try:
        print(f"   🎨 Generating with Gemini Pro Image...")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout for image generation
            env={**os.environ}
        )
        
        if result.returncode != 0:
            print(f"   ⚠️  nano_banana.sh error: {result.stderr}")
            return False
        
        # Check if output file was created
        if output_path.exists():
            return True
        else:
            print(f"   ⚠️  Output file not created")
            return False
            
    except subprocess.TimeoutExpired:
        print("   ⚠️  Image generation timed out")
        return False
    except Exception as e:
        print(f"   ⚠️  Error calling nano_banana.sh: {e}")
        return False


async def render_with_playwright(
    url: str,
    css_changes: List[dict],
    output_path: Path,
    viewport: dict = None
) -> bool:
    """Inject CSS into page and screenshot."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("❌ playwright not installed")
        return False
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # Set viewport
        vp = viewport or {"width": 1280, "height": 800}
        context = await browser.new_context(viewport=vp)
        page = await context.new_page()
        
        try:
            # Navigate
            await page.goto(url, wait_until="networkidle", timeout=30000)
            
            # Build CSS injection
            css_rules = []
            for change in css_changes:
                selector = change.get("selector", "")
                prop = change.get("property", "")
                value = change.get("new_value", "")
                if selector and prop and value:
                    css_rules.append(f"{selector} {{ {prop}: {value} !important; }}")
            
            if css_rules:
                css_string = "\n".join(css_rules)
                await page.add_style_tag(content=css_string)
                
                # Small delay for styles to apply
                await asyncio.sleep(0.5)
            
            # Screenshot
            await page.screenshot(path=str(output_path), full_page=False)
            return True
            
        except Exception as e:
            print(f"   ⚠️  Playwright error: {e}")
            return False
        finally:
            await browser.close()


def create_comparison_image(before_path: Path, after_path: Path, output_path: Path):
    """Create side-by-side comparison image."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("   ⚠️  PIL not installed, skipping comparison image")
        return False
    
    try:
        before = Image.open(before_path)
        after = Image.open(after_path)
        
        # Resize to same height
        max_height = max(before.height, after.height)
        if before.height != max_height:
            ratio = max_height / before.height
            before = before.resize((int(before.width * ratio), max_height))
        if after.height != max_height:
            ratio = max_height / after.height
            after = after.resize((int(after.width * ratio), max_height))
        
        # Create comparison canvas
        gap = 20
        label_height = 40
        total_width = before.width + gap + after.width
        total_height = max_height + label_height
        
        comparison = Image.new('RGB', (total_width, total_height), '#1a1a1a')
        
        # Paste images
        comparison.paste(before, (0, label_height))
        comparison.paste(after, (before.width + gap, label_height))
        
        # Add labels
        draw = ImageDraw.Draw(comparison)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        except:
            font = ImageFont.load_default()
        
        draw.text((before.width // 2 - 40, 8), "BEFORE", fill='#ff6666', font=font)
        draw.text((before.width + gap + after.width // 2 - 30, 8), "AFTER", fill='#66ff66', font=font)
        
        comparison.save(output_path)
        return True
    except Exception as e:
        print(f"   ⚠️  Comparison error: {e}")
        return False


def build_imagen_prompt(improvement: dict, implementation: dict, design_context: dict, is_edit: bool = False) -> str:
    """
    Build a prompt for Gemini to generate/edit a mockup image.
    
    Args:
        improvement: The improvement hypothesis data
        implementation: The implementation spec with CSS changes
        design_context: Design analysis from step 5
        is_edit: If True, prompt is for editing an existing image
    """
    
    visual_desc = implementation.get("visual_description", {})
    css_changes = implementation.get("implementation_spec", {}).get("css_changes", [])
    
    # Get improvement details
    hypothesis = improvement.get('hypothesis', improvement.get('proposed_change', 'Improve the UI'))
    rationale = improvement.get('rationale', '')
    
    # Build description of changes
    changes_desc = []
    for change in css_changes:
        selector = change.get('selector', '')
        prop = change.get('property', '')
        new_val = change.get('new_value', '')
        if selector and prop:
            changes_desc.append(f"- {selector}: {prop} → {new_val}")
    
    if is_edit:
        # Image-to-image editing prompt - modify the existing screenshot
        prompt = f"""Edit this website screenshot to apply the following UI improvement.

IMPROVEMENT TO APPLY:
{hypothesis}

WHY THIS IMPROVEMENT:
{rationale}

SPECIFIC VISUAL CHANGES:
{chr(10).join(changes_desc) if changes_desc else '- Enhance the specified UI element'}
- Layout: {visual_desc.get('layout_changes', 'keep existing layout')}
- Colors: {visual_desc.get('color_changes', 'maintain color scheme')}
- Spacing: {visual_desc.get('spacing_changes', 'improve whitespace where needed')}

CRITICAL INSTRUCTIONS:
1. Keep the ENTIRE page layout intact - header, content list, footer
2. Only modify the specific element mentioned in the improvement
3. Maintain the overall website style and branding
4. Output should look like a real screenshot of the improved website
5. Keep all text, links, and navigation exactly as shown
6. The improvement should be clearly visible but not disruptive

Generate the COMPLETE website screenshot with ONLY the specified improvement applied."""
    else:
        # Text-to-image generation prompt
        style = design_context.get('overall_impression', {}).get('style', 'minimalist')
        colors = design_context.get('color_analysis', {}).get('primary_colors', ['white', 'orange', 'black'])
        
        prompt = f"""Generate a complete website screenshot showing this UI improvement applied.

ORIGINAL SITE STYLE:
- Design style: {style}
- Color palette: {', '.join(colors) if isinstance(colors, list) else colors}

IMPROVEMENT TO SHOW:
{hypothesis}

SPECIFIC CHANGES:
{chr(10).join(changes_desc) if changes_desc else 'General UI improvements'}

REQUIREMENTS:
1. Generate a COMPLETE website page, not just an isolated component
2. Include header, main content area, and footer
3. Make it look like a real website screenshot
4. The improvement should be clearly visible
5. Maintain professional, clean design aesthetic

Generate the full website screenshot showing this improvement."""

    return prompt


def load_improvement_data(improvement_folder: Path) -> dict:
    """Load all data for an improvement."""
    data = {}
    
    # Load implementation
    impl_file = improvement_folder / "1_implementation.json"
    if impl_file.exists():
        with open(impl_file) as f:
            data["implementation"] = json.load(f)
    
    # Load complete results
    results_file = improvement_folder / "complete_results.json"
    if results_file.exists():
        with open(results_file) as f:
            data["results"] = json.load(f)
    
    return data


def render_improvement(
    improvement_folder: Path,
    original_image: str,
    url: str,
    methods: List[str],
    design_context: dict
) -> dict:
    """Render visual comparisons for an improvement."""
    
    imp_id = improvement_folder.name
    print(f"\n{'='*60}")
    print(f"🎨 Rendering: {imp_id}")
    print(f"{'='*60}")
    
    # Load improvement data
    data = load_improvement_data(improvement_folder)
    implementation = data.get("implementation", {})
    results = data.get("results", {})
    original_improvement = results.get("original_improvement", {})
    
    render_results = {
        "improvement_id": imp_id,
        "timestamp": datetime.now().isoformat(),
        "methods_used": methods,
        "outputs": {}
    }
    
    # Copy original as "before"
    before_path = improvement_folder / "before.png"
    if not before_path.exists():
        print(f"\n📷 Copying original as before.png...")
        shutil.copy(original_image, before_path)
        render_results["outputs"]["before"] = str(before_path)
        print(f"   💾 Saved: before.png")
    
    # Method 1: Playwright (inject CSS)
    if "playwright" in methods or "all" in methods:
        print(f"\n🌐 Method 1: Playwright (live CSS injection)...")
        
        css_changes = implementation.get("implementation_spec", {}).get("css_changes", [])
        
        if css_changes and url:
            after_live_path = improvement_folder / "after_live.png"
            
            success = asyncio.run(render_with_playwright(
                url,
                css_changes,
                after_live_path
            ))
            
            if success:
                render_results["outputs"]["after_live"] = str(after_live_path)
                print(f"   💾 Saved: after_live.png")
                
                # Create comparison
                comparison_path = improvement_folder / "comparison_live.png"
                if create_comparison_image(before_path, after_live_path, comparison_path):
                    render_results["outputs"]["comparison_live"] = str(comparison_path)
                    print(f"   💾 Saved: comparison_live.png")
            else:
                print(f"   ⚠️  Playwright rendering failed")
        else:
            print(f"   ⚠️  No CSS changes or URL available")
    
    # Method 2: Gemini Imagen (AI mockup via nano_banana.sh)
    if "imagen" in methods or "all" in methods:
        print(f"\n🤖 Method 2: Gemini Pro Image (via nano_banana.sh)...")
        print(f"   📎 Using original image as reference for editing...")
        
        # Build prompt for image-to-image editing (is_edit=True)
        prompt = build_imagen_prompt(original_improvement, implementation, design_context, is_edit=True)
        
        # Save prompt for reference
        prompt_path = improvement_folder / "imagen_prompt.txt"
        with open(prompt_path, "w") as f:
            f.write(prompt)
        
        after_mockup_path = improvement_folder / "after_mockup.png"
        
        # Pass the original image for image-to-image editing
        success = call_gemini_imagen(
            prompt, 
            after_mockup_path, 
            input_image=original_image,  # Pass the original screenshot!
            aspect="16:9", 
            size="2K"
        )
        
        if success:
            render_results["outputs"]["after_mockup"] = str(after_mockup_path)
            print(f"   💾 Saved: after_mockup.png")
            
            # Create comparison
            comparison_path = improvement_folder / "comparison_mockup.png"
            if create_comparison_image(before_path, after_mockup_path, comparison_path):
                render_results["outputs"]["comparison_mockup"] = str(comparison_path)
                print(f"   💾 Saved: comparison_mockup.png")
        else:
            print(f"   ⚠️  Imagen generation failed or not available")
    
    # Save render results
    render_results_path = improvement_folder / "render_results.json"
    with open(render_results_path, "w") as f:
        json.dump(render_results, f, indent=2)
    
    return render_results


def main():
    parser = argparse.ArgumentParser(
        description="Render visual comparisons for UI improvements",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Methods:
  playwright - Inject CSS into live page and screenshot
  imagen     - Generate AI mockup with Gemini Imagen
  all        - Use both methods

Examples:
  python render_improvements.py ./improvements_folder
  python render_improvements.py ./improvements_folder --improvement vd_1
  python render_improvements.py ./improvements_folder --method playwright
  python render_improvements.py ./improvements_folder --method all
"""
    )
    parser.add_argument("improvements_folder", type=Path, help="Path to improvements folder")
    parser.add_argument("--improvement", "-i", type=str, help="Specific improvement ID")
    parser.add_argument("--method", "-m", type=str, nargs="+", 
                       choices=["playwright", "imagen", "all"], default=["all"],
                       help="Rendering method(s) to use")
    parser.add_argument("--url", "-u", type=str, help="URL for Playwright rendering")
    
    args = parser.parse_args()
    
    if not args.improvements_folder.exists():
        print(f"❌ Folder not found: {args.improvements_folder}")
        sys.exit(1)
    
    # Find the parent analysis folder
    analysis_folder = args.improvements_folder.parent
    if args.improvements_folder.name == "improvements":
        analysis_folder = args.improvements_folder.parent
    
    # Load summary to get image path and URL
    summary_file = analysis_folder / "summary.json"
    if not summary_file.exists():
        # Try going up one more level
        summary_file = analysis_folder.parent / "summary.json"
    
    original_image = None
    url = args.url
    design_context = {}
    
    if summary_file.exists():
        with open(summary_file) as f:
            summary = json.load(f)
            original_image = summary.get("image")
            if not url:
                url = summary.get("url_hint")
    
    # Load design context
    design_file = analysis_folder / "step5_design.json"
    if not design_file.exists():
        design_file = analysis_folder.parent / "step5_design.json"
    if design_file.exists():
        with open(design_file) as f:
            design_context = json.load(f)
    
    if not original_image or not Path(original_image).exists():
        print("❌ Original image not found")
        sys.exit(1)
    
    print(f"\n📂 Improvements folder: {args.improvements_folder}")
    print(f"🖼️  Original image: {Path(original_image).name}")
    if url:
        print(f"🌐 URL: {url}")
    print(f"🔧 Methods: {', '.join(args.method)}")
    
    # Find improvement folders
    if args.improvement:
        folders = [args.improvements_folder / args.improvement]
        if not folders[0].exists():
            folders = [args.improvements_folder]
    else:
        folders = [f for f in args.improvements_folder.iterdir() 
                  if f.is_dir() and not f.name.startswith('.')]
    
    if not folders:
        print("❌ No improvement folders found")
        sys.exit(1)
    
    print(f"📋 Found {len(folders)} improvement(s) to render")
    
    # Render each improvement
    all_results = []
    for folder in folders:
        if not (folder / "1_implementation.json").exists():
            continue
        result = render_improvement(folder, original_image, url, args.method, design_context)
        all_results.append(result)
    
    # Print summary
    print(f"\n{'='*60}")
    print("✨ Rendering Complete!")
    print(f"{'='*60}")
    
    for result in all_results:
        outputs = result.get("outputs", {})
        print(f"\n📁 {result['improvement_id']}:")
        for name, path in outputs.items():
            print(f"   • {name}: {Path(path).name}")


if __name__ == "__main__":
    main()

