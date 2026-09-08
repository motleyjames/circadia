"""
Meeseeks Mermaid Diagram Generator

"I'M MR. MEESEEKS! I CAN MAKE PRETTY DIAGRAMS!"

Generate high-resolution PNG diagrams from Mermaid code.

Usage:
    from tools_core.mermaid import generate_diagram, generate_all_in_directory
    
    # From code string
    generate_diagram("graph TD; A-->B", "output.png", scale=3)
    
    # From file
    generate_diagram("diagram.mmd", "output.png", theme="dark")
    
    # Batch process
    generate_all_in_directory("diagrams/", scale=4)
"""

from .generator import (
    generate_diagram,
    generate_all_in_directory,
    check_mmdc,
    EXAMPLE_RSI_DIAGRAM,
    EXAMPLE_LEARNING_DIAGRAM,
)

__all__ = [
    'generate_diagram',
    'generate_all_in_directory',
    'check_mmdc',
    'EXAMPLE_RSI_DIAGRAM',
    'EXAMPLE_LEARNING_DIAGRAM',
]
