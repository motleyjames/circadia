#!/usr/bin/env python3
"""
meeseeks_browser.py - Browser Automation for Mr. Meeseeks

"I'M MR. MEESEEKS! I'LL TEST THAT PAGE!"

ONE command. ONE task. Done.

Usage:
    ./meeseeks_browser.py screenshot http://localhost:3000 output.png
    ./meeseeks_browser.py smoke http://localhost:3000
    ./meeseeks_browser.py analyze screenshot.png "Is login form visible?"
    ./meeseeks_browser.py test http://localhost:3000 /dashboard /settings
"""

import argparse
import subprocess
import sys
import json
import shutil
from pathlib import Path
from typing import Optional, List

# Find the automation directory
SCRIPT_DIR = Path(__file__).parent.parent
AUTOMATION_DIR = SCRIPT_DIR / "automation"


def check_dependencies() -> dict:
    """Check if automation dependencies are available."""
    return {
        "node": shutil.which("node") is not None,
        "npx": shutil.which("npx") is not None,
        "npm_installed": (AUTOMATION_DIR / "node_modules").exists(),
        "playwright": shutil.which("playwright") is not None or (AUTOMATION_DIR / "node_modules" / "playwright").exists(),
    }


def run_automation_command(command: str, args: List[str] = None) -> dict:
    """Run an automation command and return results."""
    args = args or []
    
    # Check dependencies
    deps = check_dependencies()
    if not deps["node"]:
        return {"success": False, "error": "Node.js not installed. Run: brew install node"}
    
    if not deps["npm_installed"]:
        return {"success": False, "error": f"Dependencies not installed. Run: cd {AUTOMATION_DIR} && npm install"}
    
    # Build the command
    cmd = ["npx", "ts-node", str(AUTOMATION_DIR / "src" / "index.ts"), command] + args
    
    try:
        result = subprocess.run(
            cmd,
            cwd=str(AUTOMATION_DIR),
            capture_output=True,
            text=True,
            timeout=120,
        )
        
        return {
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr if result.returncode != 0 else None,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Command timed out (120s)"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def screenshot(url: str, output: str = None) -> dict:
    """
    Take a screenshot of a URL.
    
    Args:
        url: The URL to screenshot
        output: Output file path (default: screenshot.png)
        
    Returns:
        dict with success, path, error
    """
    output = output or "screenshot.png"
    
    # Use playwright directly for simple screenshot
    try:
        from playwright.sync_api import sync_playwright
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            page.screenshot(path=output, full_page=True)
            browser.close()
            
        return {"success": True, "path": output, "error": None}
    except ImportError:
        # Fall back to npx playwright
        cmd = ["npx", "playwright", "screenshot", url, output]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return {"success": True, "path": output, "error": None}
        return {"success": False, "path": None, "error": result.stderr}
    except Exception as e:
        return {"success": False, "path": None, "error": str(e)}


def smoke_test(url: str) -> dict:
    """
    Run a quick smoke test on a URL.
    
    Args:
        url: The URL to test
        
    Returns:
        dict with success, elements, features, error
    """
    return run_automation_command("smoke", [url])


def analyze_screenshot(image_path: str, question: str = None) -> dict:
    """
    Analyze a screenshot using vision AI.
    
    Args:
        image_path: Path to screenshot
        question: Optional question to answer about the image
        
    Returns:
        dict with success, analysis, error
    """
    python_script = AUTOMATION_DIR / "tools" / "process_screenshot.py"
    
    if not python_script.exists():
        return {"success": False, "error": f"Vision script not found: {python_script}"}
    
    cmd = [sys.executable, str(python_script), image_path]
    if question:
        cmd.extend(["--question", question])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return {
            "success": result.returncode == 0,
            "analysis": result.stdout,
            "error": result.stderr if result.returncode != 0 else None,
        }
    except Exception as e:
        return {"success": False, "analysis": None, "error": str(e)}


def test_pages(base_url: str, pages: List[str]) -> dict:
    """
    Run automated tests on multiple pages.
    
    Args:
        base_url: Base URL of the site
        pages: List of page paths to test (e.g., ["/", "/dashboard"])
        
    Returns:
        dict with success, results, error
    """
    args = [base_url] + pages
    return run_automation_command("test", args)


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="🔵 Meeseeks Browser Automation - One task, done, *poof*",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  screenshot URL [OUTPUT]     Take a screenshot of URL
  smoke URL                   Run quick smoke test on URL
  analyze IMAGE [QUESTION]    Analyze screenshot with vision AI
  test URL PAGE1 PAGE2 ...    Run tests on multiple pages
  check                       Check if dependencies are installed

Examples:
  ./meeseeks_browser.py screenshot http://localhost:3000 page.png
  ./meeseeks_browser.py smoke http://localhost:3000
  ./meeseeks_browser.py analyze page.png "Is there a login button?"
  ./meeseeks_browser.py test http://localhost:3000 / /dashboard /settings
"""
    )
    
    parser.add_argument("command", choices=["screenshot", "smoke", "analyze", "test", "check"],
                       help="Command to run")
    parser.add_argument("args", nargs="*", help="Command arguments")
    parser.add_argument("--quiet", "-q", action="store_true", help="Minimal output")
    
    args = parser.parse_args()
    
    if args.command == "check":
        deps = check_dependencies()
        print("🔵 Browser Automation Dependencies:")
        for name, ok in deps.items():
            icon = "✅" if ok else "❌"
            print(f"  {icon} {name}")
        
        if not deps["npm_installed"]:
            print(f"\nTo install: cd {AUTOMATION_DIR} && npm install")
        sys.exit(0 if all(deps.values()) else 1)
    
    elif args.command == "screenshot":
        if not args.args:
            parser.error("screenshot requires a URL")
        url = args.args[0]
        output = args.args[1] if len(args.args) > 1 else "screenshot.png"
        
        if not args.quiet:
            print(f"🔵 Taking screenshot of {url}...")
        
        result = screenshot(url, output)
        
        if result["success"]:
            print(f"✅ Saved: {result['path']}")
        else:
            print(f"❌ Error: {result['error']}")
            sys.exit(1)
    
    elif args.command == "smoke":
        if not args.args:
            parser.error("smoke requires a URL")
        url = args.args[0]
        
        if not args.quiet:
            print(f"🔵 Running smoke test on {url}...")
        
        result = smoke_test(url)
        
        if result["success"]:
            print("✅ Smoke test passed!")
            print(result["output"])
        else:
            print(f"❌ Error: {result['error']}")
            sys.exit(1)
    
    elif args.command == "analyze":
        if not args.args:
            parser.error("analyze requires an image path")
        image = args.args[0]
        question = " ".join(args.args[1:]) if len(args.args) > 1 else None
        
        if not args.quiet:
            print(f"🔵 Analyzing {image}...")
        
        result = analyze_screenshot(image, question)
        
        if result["success"]:
            print(result["analysis"])
        else:
            print(f"❌ Error: {result['error']}")
            sys.exit(1)
    
    elif args.command == "test":
        if len(args.args) < 2:
            parser.error("test requires a base URL and at least one page")
        base_url = args.args[0]
        pages = args.args[1:]
        
        if not args.quiet:
            print(f"🔵 Testing {len(pages)} page(s) on {base_url}...")
        
        result = test_pages(base_url, pages)
        
        if result["success"]:
            print("✅ Tests complete!")
            print(result["output"])
        else:
            print(f"❌ Error: {result['error']}")
            sys.exit(1)


if __name__ == "__main__":
    main()
