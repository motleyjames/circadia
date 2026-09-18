"""
generator.py - Mermaid Diagram Generator

"I'M MR. MEESEEKS! I CAN MAKE PRETTY DIAGRAMS!"

Generate high-resolution PNG diagrams from Mermaid code using mermaid-cli.

Requirements:
    npm install -g @mermaid-js/mermaid-cli
    OR just have npx available (will auto-download)
"""

import subprocess
import os
from pathlib import Path
from typing import Optional, List
import tempfile
import shutil


def check_mmdc() -> str:
    """
    Check if mmdc (mermaid-cli) is available.
    
    Returns:
        Command string to use (either 'mmdc' or 'npx -y @mermaid-js/mermaid-cli')
    
    Raises:
        RuntimeError if neither mmdc nor npx is available
    """
    # Check for global install
    if shutil.which("mmdc"):
        return "mmdc"
    
    # Check for npx
    if shutil.which("npx"):
        return "npx -y @mermaid-js/mermaid-cli"
    
    raise RuntimeError(
        "mermaid-cli not found. Install with:\n"
        "  npm install -g @mermaid-js/mermaid-cli\n"
        "Or ensure npx is available."
    )


def generate_diagram(
    mermaid_code: str,
    output_path: str,
    scale: int = 3,
    width: int = 2400,
    height: int = 1800,
    background: str = "white",
    theme: str = "default",
) -> Path:
    """
    Generate a high-resolution PNG from Mermaid code.
    
    Args:
        mermaid_code: Mermaid diagram code (or path to .mmd file)
        output_path: Output PNG path
        scale: Scale factor for high-res (default: 3 = 3x resolution)
        width: Max width in pixels (default: 2400)
        height: Max height in pixels (default: 1800)
        background: Background color (default: "white")
        theme: Mermaid theme - "default", "dark", "forest", "neutral"
    
    Returns:
        Path to generated PNG file
    
    Raises:
        RuntimeError if mermaid-cli fails or output not created
    
    Example:
        >>> from tools_core.mermaid import generate_diagram
        >>> generate_diagram("graph TD; A-->B", "simple.png")
        PosixPath('simple.png')
        
        >>> generate_diagram("flowchart.mmd", "flowchart.png", scale=4, theme="dark")
        PosixPath('flowchart.png')
    """
    mmdc = check_mmdc()
    output = Path(output_path)
    
    # Check if input is a file path or raw mermaid code
    if os.path.isfile(mermaid_code):
        input_path = mermaid_code
        temp_file = None
    else:
        # Write code to temp file
        temp_file = tempfile.NamedTemporaryFile(
            mode='w', 
            suffix='.mmd', 
            delete=False
        )
        temp_file.write(mermaid_code)
        temp_file.close()
        input_path = temp_file.name
    
    try:
        # Build command
        cmd = f'{mmdc} -i "{input_path}" -o "{output}" ' \
              f'--scale {scale} --width {width} --height {height} ' \
              f'--backgroundColor {background} --theme {theme}'
        
        # Run mermaid-cli
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"mermaid-cli failed: {result.stderr}")
        
        if not output.exists():
            raise RuntimeError(f"Output file not created: {output}")
        
        return output
        
    finally:
        # Clean up temp file
        if temp_file and os.path.exists(temp_file.name):
            os.unlink(temp_file.name)


def generate_all_in_directory(
    directory: str,
    scale: int = 3,
    theme: str = "default",
) -> List[Path]:
    """
    Generate PNGs for all .mmd files in a directory.
    
    Args:
        directory: Path to directory containing .mmd files
        scale: Scale factor (default: 3)
        theme: Mermaid theme (default: "default")
    
    Returns:
        List of paths to generated PNG files
    
    Example:
        >>> from tools_core.mermaid import generate_all_in_directory
        >>> generate_all_in_directory("diagrams/", scale=4)
        [PosixPath('diagrams/flow.png'), PosixPath('diagrams/arch.png')]
    """
    dir_path = Path(directory)
    generated = []
    
    for mmd_file in dir_path.glob("*.mmd"):
        output_path = mmd_file.with_suffix(".png")
        print(f"🔵 Generating: {output_path.name}")
        
        result = generate_diagram(
            str(mmd_file),
            str(output_path),
            scale=scale,
            theme=theme,
        )
        generated.append(result)
        print(f"✅ Created: {result}")
    
    return generated


# Example Mermaid diagrams for Meeseeks system
EXAMPLE_RSI_DIAGRAM = """
flowchart TB
    subgraph "🔵 MR. MEESEEKS RSI SYSTEM"
        PD[📋 Prime Directive]
        
        subgraph "Loop Cycle"
            L1[Loop 1: Observe & Hypothesize]
            L2[Loop 2: Test Hypotheses]
            L3[Loop 3: Reflect & Decide]
        end
        
        ARB{🎯 Arbiter<br/>Checkpoint}
        
        PD --> L1
        L1 --> |3 Hypotheses| L2
        L2 --> |3 More Hypotheses| L3
        L3 --> ARB
        
        ARB --> |CONTINUE| L1
        ARB --> |PIVOT| L1
        ARB --> |CONVERGE| EXEC[✅ Execute]
        ARB --> |SPAWN| SPAWN[🐣 Spawn Helper]
        ARB --> |ESCALATE| HUMAN[👤 Human Help]
        
        SPAWN --> |Sub-task| L1
    end
    
    style PD fill:#4a9eff,color:#fff
    style ARB fill:#ff9f4a,color:#fff
    style EXEC fill:#4aff9f,color:#000
    style SPAWN fill:#9f4aff,color:#fff
    style HUMAN fill:#ff4a4a,color:#fff
"""

EXAMPLE_LEARNING_DIAGRAM = """
flowchart LR
    subgraph "Meeseeks A"
        A_ID[Identity: a1b2c3d4]
        A_HINTS[Hints]
        A_PATTERNS[Patterns]
    end
    
    subgraph "Meeseeks B"
        B_ID[Identity: e5f6g7h8]
        B_HINTS[Hints]
        B_PATTERNS[Patterns]
    end
    
    A_HINTS --> |learn_from| B_HINTS
    A_PATTERNS --> |learn_from| B_PATTERNS
    
    STORE[(Knowledge<br/>Store)]
    A_ID --> STORE
    B_ID --> STORE
    
    style A_ID fill:#4a9eff,color:#fff
    style B_ID fill:#9f4aff,color:#fff
    style STORE fill:#4aff9f,color:#000
"""


# CLI entry point
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Generate high-resolution Mermaid diagrams"
    )
    parser.add_argument(
        "input", 
        nargs="?",
        help="Input .mmd file or Mermaid code"
    )
    parser.add_argument(
        "output",
        nargs="?", 
        help="Output PNG path"
    )
    parser.add_argument(
        "--all",
        metavar="DIR",
        help="Process all .mmd files in directory"
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=3,
        help="Scale factor (default: 3)"
    )
    parser.add_argument(
        "--theme",
        default="default",
        choices=["default", "dark", "forest", "neutral"],
        help="Mermaid theme"
    )
    parser.add_argument(
        "--example",
        action="store_true",
        help="Generate example RSI diagram"
    )
    
    args = parser.parse_args()
    
    print("🔵 MR. MEESEEKS DIAGRAM GENERATOR")
    print("=" * 40)
    
    if args.example:
        # Generate example diagrams
        output = generate_diagram(
            EXAMPLE_RSI_DIAGRAM,
            "rsi_system.png",
            scale=args.scale,
            theme=args.theme,
        )
        print(f"✅ Generated example: {output}")
        
        output2 = generate_diagram(
            EXAMPLE_LEARNING_DIAGRAM,
            "learning_system.png",
            scale=args.scale,
            theme=args.theme,
        )
        print(f"✅ Generated example: {output2}")
        
    elif args.all:
        generated = generate_all_in_directory(
            args.all,
            scale=args.scale,
            theme=args.theme,
        )
        print(f"\n🔵 Generated {len(generated)} diagrams! LOOK AT ME!")
        
    elif args.input and args.output:
        output = generate_diagram(
            args.input,
            args.output,
            scale=args.scale,
            theme=args.theme,
        )
        print(f"✅ Generated: {output}")
        print("🔵 LOOK AT ME! Diagram complete! *poof*")
        
    else:
        parser.print_help()
