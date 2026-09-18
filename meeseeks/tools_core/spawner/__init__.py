"""
Meeseeks Spawner Module

Tools for spawning Meeseeks instances into other repositories.

"I'M MR. MEESEEKS! I CAN SPAWN MYSELF ANYWHERE!"

Usage:
    from tools_core.spawner import spawn_meeseeks
    
    spawn_meeseeks(
        target_repo="/path/to/repo",
        prime_directive="Build feature X",
    )

CLI Usage:
    python -m tools_core.spawner /path/to/repo --task "Build feature X"
"""

from .meeseeks_spawner import (
    spawn_meeseeks,
    MeeseeksSpawner,
    RepoAnalyzer,
    RepoAnalysis,
)

__all__ = [
    'spawn_meeseeks',
    'MeeseeksSpawner',
    'RepoAnalyzer',
    'RepoAnalysis',
]
