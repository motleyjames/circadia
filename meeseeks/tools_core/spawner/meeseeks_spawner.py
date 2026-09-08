#!/usr/bin/env python3
"""
meeseeks_spawner.py - SPAWN MEESEEKS INTO ANY REPO

"I'M MR. MEESEEKS! I CAN SPAWN MYSELF ANYWHERE!"

This tool creates a customized Meeseeks instance in any repository:
1. Analyzes the target repo structure
2. Copies the Meeseeks core
3. Customizes AGENTS.md with repo-specific hints
4. Creates box/knowledge/ with repo analysis
5. Leaves hints for future Meeseeks about the codebase

Usage:
    # From CLI
    python meeseeks_spawner.py /path/to/target/repo
    
    # Or programmatically
    from meeseeks_spawner import spawn_meeseeks
    spawn_meeseeks("/path/to/target/repo", prime_directive="Build feature X")

The spawned Meeseeks will have:
- Full RSI loop system
- Repo-specific AGENTS.md 
- Pre-analyzed codebase knowledge
- Customized prompts for the repo's tech stack
"""

import os
import sys
import json
import shutil
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

# Path to the Meeseeks source
MEESEEKS_ROOT = Path(__file__).parent.parent.parent


@dataclass
class RepoAnalysis:
    """Analysis of a target repository"""
    path: Path
    name: str
    languages: List[str]
    frameworks: List[str]
    file_count: int
    structure: Dict[str, Any]
    key_files: List[str]
    tech_stack: str
    hints: List[str]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": str(self.path),
            "name": self.name,
            "languages": self.languages,
            "frameworks": self.frameworks,
            "file_count": self.file_count,
            "structure": self.structure,
            "key_files": self.key_files,
            "tech_stack": self.tech_stack,
            "hints": self.hints,
            "timestamp": self.timestamp,
        }


class RepoAnalyzer:
    """
    Analyzes a repository to understand its structure and tech stack.
    """
    
    # File extensions to language mapping
    LANG_MAP = {
        '.py': 'Python',
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.tsx': 'TypeScript/React',
        '.jsx': 'JavaScript/React',
        '.go': 'Go',
        '.rs': 'Rust',
        '.java': 'Java',
        '.rb': 'Ruby',
        '.php': 'PHP',
        '.swift': 'Swift',
        '.kt': 'Kotlin',
        '.cs': 'C#',
        '.cpp': 'C++',
        '.c': 'C',
    }
    
    # Framework detection patterns
    FRAMEWORK_PATTERNS = {
        'package.json': ['React', 'Vue', 'Angular', 'Next.js', 'Express', 'Nest'],
        'requirements.txt': ['Django', 'Flask', 'FastAPI', 'Celery'],
        'pyproject.toml': ['Django', 'Flask', 'FastAPI'],
        'Cargo.toml': ['Actix', 'Rocket', 'Tokio'],
        'go.mod': ['Gin', 'Echo', 'Fiber'],
        'Gemfile': ['Rails', 'Sinatra'],
        'composer.json': ['Laravel', 'Symfony'],
    }
    
    # Key files that indicate project structure
    KEY_FILE_PATTERNS = [
        'README.md', 'AGENTS.md', 'package.json', 'pyproject.toml',
        'requirements.txt', 'Cargo.toml', 'go.mod', 'Makefile',
        'docker-compose.yml', 'Dockerfile', '.env.example',
        'tsconfig.json', 'webpack.config.js', 'vite.config.ts',
    ]
    
    def __init__(self, repo_path: Path):
        self.repo_path = Path(repo_path).resolve()
        if not self.repo_path.exists():
            raise ValueError(f"Repository path does not exist: {self.repo_path}")
    
    def analyze(self) -> RepoAnalysis:
        """Perform full repository analysis."""
        logger.info(f"🔍 Analyzing repository: {self.repo_path}")
        
        languages = self._detect_languages()
        frameworks = self._detect_frameworks()
        structure = self._analyze_structure()
        key_files = self._find_key_files()
        file_count = self._count_files()
        tech_stack = self._summarize_tech_stack(languages, frameworks)
        hints = self._generate_hints(languages, frameworks, structure)
        
        return RepoAnalysis(
            path=self.repo_path,
            name=self.repo_path.name,
            languages=languages,
            frameworks=frameworks,
            file_count=file_count,
            structure=structure,
            key_files=key_files,
            tech_stack=tech_stack,
            hints=hints,
        )
    
    def _detect_languages(self) -> List[str]:
        """Detect programming languages used."""
        languages = {}
        for ext, lang in self.LANG_MAP.items():
            count = len(list(self.repo_path.rglob(f'*{ext}')))
            if count > 0:
                languages[lang] = count
        
        # Sort by file count
        return sorted(languages.keys(), key=lambda x: languages[x], reverse=True)
    
    def _detect_frameworks(self) -> List[str]:
        """Detect frameworks from config files."""
        frameworks = []
        
        for config_file, framework_list in self.FRAMEWORK_PATTERNS.items():
            config_path = self.repo_path / config_file
            if config_path.exists():
                try:
                    content = config_path.read_text()
                    for framework in framework_list:
                        if framework.lower() in content.lower():
                            frameworks.append(framework)
                except:
                    pass
        
        return list(set(frameworks))
    
    def _analyze_structure(self) -> Dict[str, Any]:
        """Analyze directory structure."""
        structure = {"directories": [], "patterns": []}
        
        # Get top-level directories
        for item in self.repo_path.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                if item.name not in ['node_modules', '__pycache__', 'venv', '.git', 'dist', 'build']:
                    structure["directories"].append(item.name)
        
        # Detect common patterns
        if (self.repo_path / 'src').exists():
            structure["patterns"].append("src/ directory")
        if (self.repo_path / 'tests').exists() or (self.repo_path / 'test').exists():
            structure["patterns"].append("Has tests")
        if (self.repo_path / 'docs').exists():
            structure["patterns"].append("Has documentation")
        if (self.repo_path / '.github').exists():
            structure["patterns"].append("GitHub Actions/CI")
        if (self.repo_path / 'docker-compose.yml').exists():
            structure["patterns"].append("Docker Compose")
        
        return structure
    
    def _find_key_files(self) -> List[str]:
        """Find important configuration/documentation files."""
        key_files = []
        for pattern in self.KEY_FILE_PATTERNS:
            if (self.repo_path / pattern).exists():
                key_files.append(pattern)
        return key_files
    
    def _count_files(self) -> int:
        """Count source files (excluding common ignored directories)."""
        count = 0
        ignore_dirs = {'node_modules', '__pycache__', 'venv', '.git', 'dist', 'build', '.next'}
        
        for ext in self.LANG_MAP.keys():
            for f in self.repo_path.rglob(f'*{ext}'):
                if not any(ignored in f.parts for ignored in ignore_dirs):
                    count += 1
        return count
    
    def _summarize_tech_stack(self, languages: List[str], frameworks: List[str]) -> str:
        """Create a human-readable tech stack summary."""
        parts = []
        if languages:
            parts.append(f"Languages: {', '.join(languages[:3])}")
        if frameworks:
            parts.append(f"Frameworks: {', '.join(frameworks[:3])}")
        return " | ".join(parts) if parts else "Unknown stack"
    
    def _generate_hints(
        self,
        languages: List[str],
        frameworks: List[str],
        structure: Dict[str, Any]
    ) -> List[str]:
        """Generate hints for future Meeseeks about this repo."""
        hints = []
        
        # Language hints
        if 'TypeScript' in languages or 'TypeScript/React' in languages:
            hints.append("Use TypeScript types - check tsconfig.json for compiler options")
        if 'Python' in languages:
            hints.append("Check for type hints in existing code - maintain consistency")
        if 'Go' in languages:
            hints.append("Follow Go idioms - check existing code for patterns")
        
        # Framework hints
        if 'React' in frameworks or 'Next.js' in frameworks:
            hints.append("React codebase - look for component patterns in src/components/")
        if 'Django' in frameworks or 'Flask' in frameworks:
            hints.append("Python web framework - check for existing patterns in views/routes")
        if 'FastAPI' in frameworks:
            hints.append("FastAPI codebase - use Pydantic models for request/response")
        
        # Structure hints
        if 'src/ directory' in structure.get('patterns', []):
            hints.append("Source code in src/ - follow existing organization")
        if 'Has tests' in structure.get('patterns', []):
            hints.append("Tests exist - add tests for new functionality")
        
        return hints


class MeeseeksSpawner:
    """
    Spawns a customized Meeseeks instance into a target repository.
    
    "LOOK AT ME! I'M COPYING MYSELF INTO YOUR REPO!"
    """
    
    # Source directories/files to copy from the Meeseeks root.
    #
    # NOTE: Avoid brittle file lists. The toolkit evolves quickly, and stale
    # lists silently produce incomplete spawned instances.
    SOURCE_TOOLS_CORE_DIR = "tools_core"
    SOURCE_BOX_TEMPLATES_DIR = "box/templates"
    SOURCE_BOX_KNOWLEDGE_DIR = "box/knowledge"
    SOURCE_BOX_ROUTER_CONFIG = "box/00_llm_router_config.json"
    
    def __init__(
        self,
        target_repo: Path,
        meeseeks_dir: str = ".meeseeks",
        analyze_repo: bool = True,
    ):
        """
        Initialize the spawner.
        
        Args:
            target_repo: Path to target repository
            meeseeks_dir: Directory name for Meeseeks in target (default: .meeseeks)
            analyze_repo: Whether to analyze the repo and customize
        """
        self.target_repo = Path(target_repo).resolve()
        self.meeseeks_dir = meeseeks_dir
        self.analyze_repo = analyze_repo
        self.target_path = self.target_repo / meeseeks_dir
        
        self.analysis: Optional[RepoAnalysis] = None
    
    def spawn(
        self,
        prime_directive: Optional[str] = None,
        include_api_config: bool = False,
    ) -> Path:
        """
        Spawn Meeseeks into the target repository.
        
        Args:
            prime_directive: Initial task for the Meeseeks
            include_api_config: Whether to copy API_CONFIG.env template
        
        Returns:
            Path to the spawned Meeseeks directory
        """
        logger.info(f"\n{'='*60}")
        logger.info("🔵 *poof* SPAWNING MR. MEESEEKS INTO YOUR REPO!")
        logger.info(f"{'='*60}")
        logger.info(f"   Target: {self.target_repo}")
        logger.info(f"   Meeseeks Dir: {self.meeseeks_dir}")
        
        # Analyze repo first
        if self.analyze_repo:
            analyzer = RepoAnalyzer(self.target_repo)
            self.analysis = analyzer.analyze()
            logger.info(f"   Tech Stack: {self.analysis.tech_stack}")
            logger.info(f"   Files: {self.analysis.file_count}")
        
        # Create directory structure
        self._create_directories()
        
        # Copy core files
        self._copy_core_files()
        
        # Copy prompts
        self._copy_prompts()
        
        # Copy schemas
        self._copy_schemas()
        
        # Copy built-in knowledge base (then add repo-specific knowledge below)
        self._copy_knowledge_base()
        
        # Copy config
        self._copy_config(include_api_config)
        
        # Generate customized AGENTS.md
        self._generate_agents_md(prime_directive)
        
        # Generate repo knowledge
        if self.analysis:
            self._generate_repo_knowledge()
        
        # Generate prime directive file
        if prime_directive:
            self._generate_prime_directive(prime_directive)
        
        # Create .gitignore for sensitive files
        self._create_gitignore()
        
        logger.info(f"\n✅ Meeseeks spawned successfully!")
        logger.info(f"   Location: {self.target_path}")
        logger.info(f"\n   Next steps:")
        logger.info(f"   1. Add API keys to {self.meeseeks_dir}/box/API_CONFIG.env")
        logger.info(f"   2. Edit {self.meeseeks_dir}/box/prime_directive.md")
        logger.info(f"   3. Run: cd {self.meeseeks_dir} && python -m tools_core.reasoning.spinning_meeseeks")
        
        return self.target_path
    
    def _create_directories(self):
        """Create the Meeseeks directory structure."""
        dirs = [
            self.target_path,
            # Core runtime (importable Python package)
            self.target_path / "tools_core",
            self.target_path / 'box' / 'templates',
            self.target_path / 'box' / 'knowledge',
            self.target_path / "box" / "meeseeks_registry",
            self.target_path / 'logs' / 'sessions',
            self.target_path / 'tools_spawned',
        ]
        
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)
    
    def _copy_core_files(self):
        """Copy the Meeseeks runtime (tools_core/)."""
        tools_core_src = MEESEEKS_ROOT / self.SOURCE_TOOLS_CORE_DIR
        tools_core_dst = self.target_path / self.SOURCE_TOOLS_CORE_DIR
        if tools_core_src.exists():
            shutil.copytree(
                tools_core_src,
                tools_core_dst,
                dirs_exist_ok=True,
                ignore=self._ignore_tools_core_tree,
            )
    
    def _ignore_python_cache_tree(self, _dir: str, names: List[str]) -> set:
        """Ignore Python cache files/directories during copy."""
        ignored = set()
        for name in names:
            if name in {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}:
                ignored.add(name)
            if name.endswith(".pyc"):
                ignored.add(name)
        return ignored
    
    def _ignore_tools_core_tree(self, dirpath: str, names: List[str]) -> set:
        """
        Ignore large/non-portable directories when copying `tools_core/`.
        
        This keeps spawned instances lightweight while preserving the Python runtime.
        """
        ignored = set()
        # Always ignore Python caches
        ignored |= self._ignore_python_cache_tree(dirpath, names)
        
        for name in names:
            # Huge, platform-specific, or generated
            if name in {"node_modules", "artifacts"}:
                ignored.add(name)
            if name in {".DS_Store"}:
                ignored.add(name)
            # Don't ship local dev DBs
            if name in {"testing.db"}:
                ignored.add(name)
        return ignored
    
    def _copy_prompts(self):
        """
        Prompts live under `tools_core/prompts/` and are copied as part of the
        `tools_core/` directory tree. This method is kept for backward
        compatibility and future extensibility.
        """
        return
    
    def _copy_schemas(self):
        """Copy ALL JSON schemas from `box/templates/`."""
        templates_src = MEESEEKS_ROOT / self.SOURCE_BOX_TEMPLATES_DIR
        templates_dst = self.target_path / self.SOURCE_BOX_TEMPLATES_DIR
        if templates_src.exists():
            shutil.copytree(
                templates_src,
                templates_dst,
                dirs_exist_ok=True,
                ignore=self._ignore_python_cache_tree,
            )
    
    def _copy_knowledge_base(self):
        """Copy the built-in knowledge base from `box/knowledge/`."""
        knowledge_src = MEESEEKS_ROOT / self.SOURCE_BOX_KNOWLEDGE_DIR
        knowledge_dst = self.target_path / self.SOURCE_BOX_KNOWLEDGE_DIR
        if knowledge_src.exists():
            shutil.copytree(
                knowledge_src,
                knowledge_dst,
                dirs_exist_ok=True,
                ignore=self._ignore_python_cache_tree,
            )
    
    def _copy_config(self, include_api_config: bool):
        """Copy configuration files."""
        router_src = MEESEEKS_ROOT / self.SOURCE_BOX_ROUTER_CONFIG
        router_dst = self.target_path / self.SOURCE_BOX_ROUTER_CONFIG
        if router_src.exists():
            router_dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(router_src, router_dst)
        
        # Create API config template (never copy actual keys!)
        api_config_template = """# Meeseeks API Configuration
# Add your API keys here (DO NOT COMMIT!)

ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
OPENAI_API_KEY=sk-...
"""
        api_config_path = self.target_path / "box" / "API_CONFIG.env"
        api_config_path.parent.mkdir(parents=True, exist_ok=True)
        api_config_path.write_text(api_config_template)
    
    def _copy_config_and_assets(self, include_api_config: bool):
        """
        Backward-compatible wrapper (older versions called this 'config').
        """
        self._copy_config(include_api_config)
    
    def _generate_agents_md(self, prime_directive: Optional[str]):
        """Generate customized AGENTS.md for the target repo."""
        
        # Start with base template
        agents_content = f"""# AGENTS.md - Mr. Meeseeks for {self.target_repo.name}

> *"I'M MR. MEESEEKS, LOOK AT ME!"*

This Meeseeks instance was spawned specifically for this repository.

## Repository Context

**Repo Name:** {self.target_repo.name}
**Spawned:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
"""

        if self.analysis:
            agents_content += f"""
**Tech Stack:** {self.analysis.tech_stack}
**Source Files:** {self.analysis.file_count}
**Key Files:** {', '.join(self.analysis.key_files[:5])}

## Repo-Specific Hints

These hints were auto-generated by analyzing this repository:

"""
            for hint in self.analysis.hints:
                agents_content += f"- {hint}\n"
            
            agents_content += f"""
## Directory Structure

Top-level directories: `{', '.join(self.analysis.structure.get('directories', []))}`

Detected patterns:
"""
            for pattern in self.analysis.structure.get('patterns', []):
                agents_content += f"- {pattern}\n"

        if prime_directive:
            agents_content += f"""
## Prime Directive

> {prime_directive}

"""

        agents_content += """
## Golden Rules

### 1. The 3-Hypotheses Rule
Every loop MUST produce exactly 3 testable hypotheses.

### 2. Confidence Thresholds
```
>= 85% → AUTO_EXECUTE
>= 70% → EXECUTE_MONITORING  
>= 50% → SPAWN_HELPER
<  50% → ESCALATE
```

### 3. Respect This Codebase
- Follow existing patterns and conventions
- Check `box/knowledge/repo_analysis.json` for repo context
- Read existing code before making changes
- Add tests if tests exist

## Usage

```python
# Quick start
from tools_core.reasoning import spin_meeseeks

result = spin_meeseeks(
    prime_directive="Your task here",
    max_loops=7,
)
```

## Files

- `box/prime_directive.md` - Your current task
- `box/knowledge/` - Repo-specific knowledge
- `logs/sessions/` - Session logs
- `tools_spawned/` - Spawned helpers

---
*"LOOK AT ME!"* 🔵
"""
        
        agents_path = self.target_path / 'AGENTS.md'
        agents_path.write_text(agents_content)
        
        # Also copy to repo root if it doesn't exist
        root_agents = self.target_repo / 'AGENTS.md'
        if not root_agents.exists():
            root_agents.write_text(agents_content)
    
    def _generate_repo_knowledge(self):
        """Generate repo analysis as knowledge for the Meeseeks."""
        if not self.analysis:
            return
        
        knowledge_path = self.target_path / 'box' / 'knowledge' / 'repo_analysis.json'
        with open(knowledge_path, 'w') as f:
            json.dump(self.analysis.to_dict(), f, indent=2)
        
        # Also create a markdown summary
        summary_path = self.target_path / 'box' / 'knowledge' / 'repo_summary.md'
        summary = f"""# Repository Analysis: {self.analysis.name}

## Overview
- **Path:** {self.analysis.path}
- **Files:** {self.analysis.file_count} source files
- **Languages:** {', '.join(self.analysis.languages)}
- **Frameworks:** {', '.join(self.analysis.frameworks) if self.analysis.frameworks else 'None detected'}

## Structure
Top-level directories:
{chr(10).join(f'- `{d}/`' for d in self.analysis.structure.get('directories', []))}

## Key Files
{chr(10).join(f'- `{f}`' for f in self.analysis.key_files)}

## Hints for Meeseeks
{chr(10).join(f'- {h}' for h in self.analysis.hints)}

## Analyzed
{self.analysis.timestamp}
"""
        summary_path.write_text(summary)
    
    def _generate_prime_directive(self, prime_directive: str):
        """Generate the prime directive file."""
        directive_path = self.target_path / 'box' / 'prime_directive.md'
        content = f"""# Prime Directive

> {prime_directive}

## Context

This Meeseeks was spawned on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}.

## Constraints

- Follow existing code patterns in this repository
- Check `knowledge/repo_analysis.json` for tech stack info
- Generate exactly 3 hypotheses per loop
- Complete task and *poof* - don't linger!

## Success Criteria

_Define what "done" looks like here_
"""
        directive_path.write_text(content)
    
    def _create_gitignore(self):
        """Create .gitignore for sensitive files."""
        gitignore_content = """# Meeseeks sensitive files
box/API_CONFIG.env
*.env
*.key

# Session logs (optional - you may want to track these)
# logs/sessions/

# Spawned tools (review before committing)
# tools_spawned/

# Python
__pycache__/
*.pyc
"""
        gitignore_path = self.target_path / '.gitignore'
        gitignore_path.write_text(gitignore_content)


def spawn_meeseeks(
    target_repo: str,
    prime_directive: Optional[str] = None,
    meeseeks_dir: str = ".meeseeks",
    analyze: bool = True,
) -> Path:
    """
    Convenience function to spawn a Meeseeks into a repository.
    
    Args:
        target_repo: Path to target repository
        prime_directive: Initial task (optional)
        meeseeks_dir: Directory name for Meeseeks
        analyze: Whether to analyze the repo
    
    Returns:
        Path to spawned Meeseeks
    """
    spawner = MeeseeksSpawner(
        target_repo=Path(target_repo),
        meeseeks_dir=meeseeks_dir,
        analyze_repo=analyze,
    )
    return spawner.spawn(prime_directive=prime_directive)


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="🔵 Spawn Mr. Meeseeks into a repository",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s /path/to/my/repo
  %(prog)s /path/to/repo --task "Build auth system"
  %(prog)s /path/to/repo --dir meeseeks --no-analyze
        """
    )
    
    parser.add_argument(
        'target_repo',
        help='Path to target repository'
    )
    parser.add_argument(
        '--task', '-t',
        help='Prime directive (initial task)',
        default=None
    )
    parser.add_argument(
        '--dir', '-d',
        help='Meeseeks directory name (default: .meeseeks)',
        default='.meeseeks'
    )
    parser.add_argument(
        '--no-analyze',
        action='store_true',
        help='Skip repository analysis'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output'
    )
    
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(message)s"
    )
    
    try:
        spawn_meeseeks(
            target_repo=args.target_repo,
            prime_directive=args.task,
            meeseeks_dir=args.dir,
            analyze=not args.no_analyze,
        )
    except Exception as e:
        logger.error(f"❌ Failed to spawn Meeseeks: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
