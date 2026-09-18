"""
Meeseeks Prompts Module

Unified prompt templates for the RSI toolkit.

Structure:
- system/: System prompts defining AI personas
  - meeseeks_persona.txt: Mr. Meeseeks core personality and RSI rules
  - council_member.txt: Council member voting behavior
  - arbiter.txt: Council arbiter synthesis behavior

- tasks/: Task-specific prompts
  - generate_hypothesis.txt: Hypothesis generation (GOLDEN RULE)
  - test_hypothesis.txt: Hypothesis testing
  - decompose_goal.txt: Task decomposition
  - review_code.txt: Code review
  - extract_canon.txt: Document canon extraction
  - extract_logic.txt: Logic flow extraction
  - semantic_analysis.txt: Semantic analysis
  - semantic_cross_validation.txt: Cross-validation
"""

from pathlib import Path

PROMPTS_DIR = Path(__file__).parent
SYSTEM_DIR = PROMPTS_DIR / "system"
TASKS_DIR = PROMPTS_DIR / "tasks"


def load_prompt(name: str, category: str = "tasks") -> str:
    """
    Load a prompt template by name.
    
    Args:
        name: Prompt name (without .txt extension)
        category: "system" or "tasks"
    
    Returns:
        Prompt content as string
    """
    if category == "system":
        path = SYSTEM_DIR / f"{name}.txt"
    else:
        path = TASKS_DIR / f"{name}.txt"
    
    if not path.exists():
        raise FileNotFoundError(f"Prompt not found: {path}")
    
    return path.read_text()


def load_system_prompt(name: str) -> str:
    """Load a system prompt."""
    return load_prompt(name, "system")


def load_task_prompt(name: str) -> str:
    """Load a task prompt."""
    return load_prompt(name, "tasks")


def format_prompt(name: str, category: str = "tasks", **kwargs) -> str:
    """
    Load and format a prompt with variables.
    
    Args:
        name: Prompt name
        category: "system" or "tasks"
        **kwargs: Variables to substitute in the prompt
    
    Returns:
        Formatted prompt string
    """
    template = load_prompt(name, category)
    return template.format(**kwargs)


# Convenience functions for common prompts
def get_meeseeks_persona() -> str:
    """Get the Mr. Meeseeks system prompt."""
    return load_system_prompt("meeseeks_persona")


def get_council_member_prompt() -> str:
    """Get the council member system prompt."""
    return load_system_prompt("council_member")


def get_arbiter_prompt() -> str:
    """Get the arbiter system prompt."""
    return load_system_prompt("arbiter")


def get_hypothesis_generation_prompt(**kwargs) -> str:
    """Get formatted hypothesis generation prompt."""
    return format_prompt("generate_hypothesis", **kwargs)


def get_hypothesis_test_prompt(**kwargs) -> str:
    """Get formatted hypothesis test prompt."""
    return format_prompt("test_hypothesis", **kwargs)


__all__ = [
    'PROMPTS_DIR',
    'SYSTEM_DIR',
    'TASKS_DIR',
    'load_prompt',
    'load_system_prompt',
    'load_task_prompt',
    'format_prompt',
    'get_meeseeks_persona',
    'get_council_member_prompt',
    'get_arbiter_prompt',
    'get_hypothesis_generation_prompt',
    'get_hypothesis_test_prompt',
]
