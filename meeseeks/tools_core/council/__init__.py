"""
Meeseeks Council Module

Multi-model deliberation and consensus for important decisions.

Components:
- council: Core voting and opinion gathering (synchronous)
- async_council: Parallel LLM execution for 3x speedup
- visual_council: Multi-model visual analysis
"""

from .meeseeks_council import (
    council_vote,
    quick_council,
    get_opinion,
    synthesize_opinions,
    VotingMethod,
    Opinion,
    CouncilDecision,
)

# Async Council - Parallel LLM execution
from .meeseeks_async_council import (
    AsyncCouncil,
    AsyncVisualCouncil,
    AsyncCouncilConfig,
    VisualVoteResult,
    create_async_council,
    create_visual_council,
)

__all__ = [
    # Synchronous Council
    'council_vote',
    'quick_council',
    'get_opinion',
    'synthesize_opinions',
    'VotingMethod',
    'Opinion',
    'CouncilDecision',
    # Async Council (3x faster!)
    'AsyncCouncil',
    'AsyncVisualCouncil',
    'AsyncCouncilConfig',
    'VisualVoteResult',
    'create_async_council',
    'create_visual_council',
]
