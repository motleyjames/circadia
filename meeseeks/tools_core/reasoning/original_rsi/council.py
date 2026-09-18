#!/usr/bin/env python3
"""
council.py - Multi-Model Deliberation and Consensus

This module implements a council pattern where multiple LLMs
provide opinions on a decision, which are then synthesized.

Part of the Meeseeks RSI Toolkit.
"""

import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

from llm_caller import call_model, call_claude_opus, call_gemini_pro
from tracer import Tracer, Phase, get_tracer


class VotingMethod(Enum):
    MAJORITY = "majority"      # Simple majority wins
    WEIGHTED = "weighted"      # Weighted by model capability
    CONSENSUS = "consensus"    # All must agree
    ARBITER = "arbiter"        # Designated model makes final call


@dataclass
class Opinion:
    """A single model's opinion on a question."""
    model: str
    position: str           # The model's stance/answer
    reasoning: str          # Why they hold this position
    confidence: float       # 0-1 confidence score
    considerations: List[str]  # Key factors considered


@dataclass
class CouncilDecision:
    """The synthesized decision from the council."""
    question: str
    opinions: List[Opinion]
    synthesis: str          # Synthesized view
    final_decision: str     # The actual decision
    voting_method: VotingMethod
    agreement_level: float  # 0-1 how much models agreed
    dissenting_points: List[str]  # Where models disagreed


# Default council configuration
DEFAULT_COUNCIL = [
    "gemini-3.1-pro-preview",      # 2M context, good for analysis
    "claude-opus-4-6",  # Creative, nuanced reasoning
]

# Weights for weighted voting (based on router config capabilities)
MODEL_WEIGHTS = {
    "claude-opus-4-6": 1.5,  # Higher weight for architecture
    "gemini-3.1-pro-preview": 1.3,      # Good for comprehensive analysis
}


def get_opinion(
    model: str,
    question: str,
    context: str = "",
) -> Opinion:
    """
    Get a single model's opinion on a question.
    
    Args:
        model: Model name from router config
        question: The question to deliberate
        context: Additional context for the decision
    
    Returns:
        The model's Opinion
    """
    prompt = f"""You are participating in a council deliberation on an important technical decision.

## Question
{question}

## Context
{context if context else "No additional context provided."}

## Your Task
Provide your professional opinion. Be specific and actionable.

Respond in this JSON format:
```json
{{
  "position": "Your clear stance/answer in 1-2 sentences",
  "reasoning": "Detailed explanation of why you hold this position",
  "confidence": 0.85,
  "considerations": [
    "Key factor 1 you considered",
    "Key factor 2 you considered",
    "Key factor 3 you considered"
  ]
}}
```

Be honest about uncertainty. If you're not confident, say so.
Focus on practical, implementable recommendations.
"""

    system = """You are a senior technical architect participating in a design council.
Give thoughtful, nuanced opinions. Consider tradeoffs. Be specific about implementation.
Always output valid JSON."""

    response = call_model(model, prompt, system)
    
    # Parse response
    try:
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            data = json.loads(response[json_start:json_end])
            return Opinion(
                model=model,
                position=data.get('position', 'No clear position'),
                reasoning=data.get('reasoning', response),
                confidence=float(data.get('confidence', 0.7)),
                considerations=data.get('considerations', []),
            )
    except (json.JSONDecodeError, ValueError):
        pass
    
    # Fallback for non-JSON response
    return Opinion(
        model=model,
        position=response[:200],
        reasoning=response,
        confidence=0.5,
        considerations=[],
    )


def synthesize_opinions(
    question: str,
    opinions: List[Opinion],
    arbiter_model: str = "claude-opus-4-6",
) -> str:
    """
    Synthesize multiple opinions into a coherent recommendation.
    """
    opinions_text = ""
    for op in opinions:
        opinions_text += f"""
### {op.model} (Confidence: {op.confidence:.0%})
**Position:** {op.position}
**Reasoning:** {op.reasoning}
**Key Considerations:** {', '.join(op.considerations)}

"""

    prompt = f"""You are the arbiter synthesizing opinions from a technical council.

## Question
{question}

## Council Opinions
{opinions_text}

## Your Task
1. Identify common ground between the opinions
2. Note any significant disagreements
3. Synthesize a clear, actionable recommendation

Provide:
1. A synthesis paragraph explaining the consensus view
2. A clear final decision/recommendation
3. Any important caveats or dissenting points to consider

Be specific and actionable. The team needs to execute on this decision immediately.
"""

    return call_model(arbiter_model, prompt)


def council_vote(
    question: str,
    context: str = "",
    models: Optional[List[str]] = None,
    voting_method: VotingMethod = VotingMethod.ARBITER,
    arbiter: str = "claude-opus-4-6",
    tracer: Optional[Tracer] = None,
) -> CouncilDecision:
    """
    Convene a council to deliberate on a question.
    
    Args:
        question: The question to deliberate
        context: Additional context
        models: List of models to consult (default: DEFAULT_COUNCIL)
        voting_method: How to aggregate opinions
        arbiter: Model to make final synthesis (for ARBITER method)
        tracer: Optional tracer for logging
    
    Returns:
        CouncilDecision with synthesized result
    """
    tracer = tracer or get_tracer()
    models = models or DEFAULT_COUNCIL
    
    tracer.log(
        phase=Phase.ARCHITECTURE,
        title="Council Convened",
        context=f"Question: {question}",
        reasoning=f"Consulting {len(models)} models for diverse perspectives.",
        decision_action=f"Models: {', '.join(models)}",
        next_steps=["Gather opinions", "Synthesize", "Make decision"],
    )
    
    # Gather opinions (serially to respect rate limits)
    opinions = []
    for model in models:
        try:
            opinion = get_opinion(model, question, context)
            opinions.append(opinion)
        except Exception as e:
            # Log failure but continue
            opinions.append(Opinion(
                model=model,
                position=f"Failed to get opinion: {e}",
                reasoning="Model call failed",
                confidence=0,
                considerations=[],
            ))
    
    # Synthesize
    synthesis = synthesize_opinions(question, opinions, arbiter)
    
    # Calculate agreement level
    if len(opinions) > 1:
        # Simple heuristic: average confidence weighted by position similarity
        avg_confidence = sum(o.confidence for o in opinions) / len(opinions)
        agreement_level = avg_confidence
    else:
        agreement_level = opinions[0].confidence if opinions else 0
    
    # Extract final decision from synthesis
    final_decision = synthesis[:500] if len(synthesis) > 500 else synthesis
    
    decision = CouncilDecision(
        question=question,
        opinions=opinions,
        synthesis=synthesis,
        final_decision=final_decision,
        voting_method=voting_method,
        agreement_level=agreement_level,
        dissenting_points=[],  # Could be extracted from synthesis
    )
    
    # Log the decision
    model_calls = [
        {
            "model": op.model,
            "prompt_summary": f"Opinion on: {question[:50]}...",
            "response_summary": op.position[:100],
        }
        for op in opinions
    ]
    model_calls.append({
        "model": arbiter,
        "prompt_summary": "Synthesize opinions",
        "response_summary": final_decision[:100],
    })
    
    tracer.log(
        phase=Phase.ARCHITECTURE,
        title="Council Decision Made",
        context=question,
        reasoning=f"Gathered {len(opinions)} opinions with {agreement_level:.0%} agreement.",
        decision_action=final_decision,
        model_calls=model_calls,
        metadata={
            "agreement_level": agreement_level,
            "models_consulted": models,
        },
    )
    
    return decision


def quick_council(question: str, context: str = "") -> str:
    """
    Quick council for simple decisions - returns just the decision text.
    """
    decision = council_vote(question, context)
    return decision.final_decision


if __name__ == "__main__":
    # Test the council
    question = """
    For the target project, we need to merge a React chat UI 
    (l-os-legion-ui-chat-panel) into an Electron app (legion-desktop-app).
    
    Should we:
    A) Copy the source files directly into the Electron renderer
    B) Set up the chat panel as a separate npm package and import it
    C) Use a monorepo structure with shared dependencies
    
    Consider: We have 10 hours until demo and need the fastest working solution.
    """
    
    print("Convening council...")
    decision = council_vote(
        question=question,
        context="Demo in 10 hours. Focus on speed over perfection.",
        models=["gemini-3.1-pro-preview"],
    )
    
    print(f"\n=== Council Decision ===")
    print(f"Question: {decision.question[:100]}...")
    print(f"Agreement Level: {decision.agreement_level:.0%}")
    print(f"\n=== Final Decision ===")
    print(decision.final_decision)

