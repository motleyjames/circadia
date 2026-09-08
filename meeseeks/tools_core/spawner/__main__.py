#!/usr/bin/env python3
"""
CLI entry point for the Meeseeks Spawner.

Usage:
    python -m tools_core.spawner /path/to/repo
    python -m tools_core.spawner /path/to/repo --task "Build feature X"
"""

from .meeseeks_spawner import main

if __name__ == "__main__":
    main()
