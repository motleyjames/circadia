"""
Structured Outputs - Pydantic Models for LLM Responses

Eliminates ALL regex parsing by forcing LLMs to return
structured JSON that validates against Pydantic schemas.

Uses:
- instructor (pip install instructor) for OpenAI/Anthropic
- Native Pydantic for schema validation
- Structured outputs for 100% reliable parsing

NO MORE REGEX! NO MORE BROKEN PARSING!
"""

from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum

try:
    from tools_core.core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model


# =============================================================================
# COUNCIL VOTE STRUCTURES
# =============================================================================

class DissentSeverityLevel(str, Enum):
    """Severity of a dissenting point"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    MINOR = "minor"


class DissentItem(BaseModel):
    """A single dissenting point from a council member"""
    point: str = Field(..., description="The specific concern or objection")
    severity: DissentSeverityLevel = Field(..., description="How serious is this concern")
    can_be_resolved_by: Optional[str] = Field(
        None, 
        description="What action could resolve this dissent (e.g., 'backup', 'visual_check', 'formula_trace')"
    )


class CouncilVote(BaseModel):
    """Structured vote from an LLM council member"""
    model_name: str = Field(..., description="Name of the model voting")
    decision: Literal["APPROVE", "APPROVE_WITH_CONDITIONS", "REJECT", "DEFER_TO_HUMAN"] = Field(
        ..., 
        description="The final voting decision"
    )
    confidence: float = Field(
        ..., 
        ge=0.0, 
        le=1.0, 
        description="Confidence in the decision (0.0 to 1.0)"
    )
    dissents: List[DissentItem] = Field(
        default_factory=list,
        description="List of specific concerns or objections"
    )
    reasoning: str = Field(..., description="Explanation for the vote")
    suggested_probes: List[str] = Field(
        default_factory=list,
        description="Suggested verification actions before proceeding"
    )


class CouncilDeliberationResult(BaseModel):
    """Combined result from all council members"""
    votes: List[CouncilVote]
    consensus: Literal["UNANIMOUS_APPROVE", "MAJORITY_APPROVE", "SPLIT", "MAJORITY_REJECT", "UNANIMOUS_REJECT"]
    overall_confidence: float = Field(..., ge=0.0, le=1.0)
    critical_blockers: List[str] = Field(default_factory=list)
    all_dissents: List[DissentItem] = Field(default_factory=list)
    recommended_action: Literal["AUTO_EXECUTE", "EXECUTE_WITH_MONITORING", "DEFER_TO_HUMAN", "ABORT"]


# =============================================================================
# VISUAL VERIFICATION STRUCTURES
# =============================================================================

class VisualAnomaly(BaseModel):
    """A detected visual anomaly"""
    description: str = Field(..., description="What the anomaly is")
    location: Optional[str] = Field(None, description="Where in the image (e.g., 'top-left', 'row 5')")
    severity: Literal["minor", "moderate", "severe"] = Field(default="moderate")


class VisualVoteResult(BaseModel):
    """Structured response from a vision model"""
    model_name: str
    passed: bool = Field(..., description="Does the visual pass inspection?")
    confidence: float = Field(..., ge=0.0, le=1.0)
    observations: str = Field(..., description="What the model observes in the image")
    anomalies: List[VisualAnomaly] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    formatting_score: Optional[int] = Field(None, ge=1, le=10)
    layout_score: Optional[int] = Field(None, ge=1, le=10)
    professional_score: Optional[int] = Field(None, ge=1, le=10)


class VisualComparisonResult(BaseModel):
    """Result of comparing before/after images"""
    changes_detected: List[str] = Field(default_factory=list)
    formatting_preserved: bool
    layout_preserved: bool
    regressions: List[str] = Field(default_factory=list, description="Things that got worse")
    improvements: List[str] = Field(default_factory=list, description="Things that got better")
    overall_verdict: Literal["ACCEPTABLE", "NEEDS_REVIEW", "UNACCEPTABLE"]
    confidence: float = Field(..., ge=0.0, le=1.0)


# =============================================================================
# PROBE SYNTHESIS STRUCTURES
# =============================================================================

class SynthesizedProbe(BaseModel):
    """A dynamically synthesized verification tool"""
    name: str = Field(..., description="Function name for the probe (snake_case)")
    description: str = Field(..., description="What the probe checks")
    target_type: Literal["cell", "range", "column", "sheet", "formula", "chart", "table"]
    target_address: Optional[str] = Field(None, description="Excel address if applicable")
    check_type: Literal["exists", "value_equals", "value_in_range", "not_empty", "formula_valid", "format_check"]
    expected_value: Optional[Any] = Field(None)
    python_code: Optional[str] = Field(None, description="Python code to execute the probe")


class ProbeExecutionResult(BaseModel):
    """Result of executing a probe"""
    probe_name: str
    success: bool
    actual_value: Optional[Any]
    expected_value: Optional[Any]
    message: str
    confidence_impact: float = Field(default=0.0, description="How much this affects overall confidence")


# =============================================================================
# UPDATE ANALYSIS STRUCTURES
# =============================================================================

class CellUpdateAnalysis(BaseModel):
    """Analysis of what happens when a cell is updated"""
    cell_address: str
    current_value: Optional[Any]
    new_value: Any
    affected_formulas: List[str] = Field(default_factory=list)
    affected_charts: List[str] = Field(default_factory=list)
    affected_tables: List[str] = Field(default_factory=list)
    risk_level: Literal["low", "medium", "high", "critical"]
    requires_human_review: bool


class UpdateImpactPrediction(BaseModel):
    """Prediction of update impact across the workbook"""
    target_sheet: str
    target_range: str
    rows_affected: int
    direct_dependencies: List[str]
    cascading_effects: List[str]
    formula_chains_impacted: int
    tables_affected: List[str]
    summary: str
    confidence: float = Field(..., ge=0.0, le=1.0)


# =============================================================================
# INSTRUCTOR INTEGRATION
# =============================================================================

def get_structured_client(provider: str = "openai"):
    """
    Get an instructor-patched client for structured outputs.
    
    Args:
        provider: "openai", "anthropic", or "gemini"
        
    Returns:
        Patched client that returns Pydantic models
    """
    try:
        import instructor
    except ImportError:
        raise ImportError("Please install instructor: pip install instructor")
    
    if provider == "openai":
        import openai
        import os
        client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        return instructor.patch(client)
    
    elif provider == "anthropic":
        import anthropic
        import os
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        return instructor.from_anthropic(client)
    
    elif provider == "gemini":
        # Gemini uses a different approach
        import google.generativeai as genai
        import os
        genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
        # Note: instructor doesn't directly support Gemini, 
        # we'll handle this separately
        return genai
    
    else:
        raise ValueError(f"Unknown provider: {provider}")


async def get_structured_vote_openai(
    prompt: str,
    model: str = None
) -> CouncilVote:
    """Get a structured council vote from OpenAI"""
    if model is None:
        model = get_default_model("openai_top")
    import instructor
    import openai
    import os
    
    client = instructor.patch(openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY")))
    
    vote = client.chat.completions.create(
        model=model,
        response_model=CouncilVote,
        messages=[
            {"role": "system", "content": "You are a critical reviewer analyzing a proposed spreadsheet update."},
            {"role": "user", "content": prompt}
        ]
    )
    
    return vote


async def get_structured_vote_anthropic(
    prompt: str,
    model: str = None
) -> CouncilVote:
    """Get a structured council vote from Anthropic"""
    if model is None:
        model = get_default_model("anthropic_top")
    import instructor
    import anthropic
    import os
    
    client = instructor.from_anthropic(
        anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    )
    
    vote = client.messages.create(
        model=model,
        max_tokens=1024,
        response_model=CouncilVote,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )
    
    return vote


async def get_structured_visual_vote_openai(
    prompt: str,
    image_b64: str,
    model: str = None
) -> VisualVoteResult:
    """Get a structured visual vote from OpenAI with image"""
    if model is None:
        model = get_default_model("vision")
    import instructor
    import openai
    import os
    
    client = instructor.patch(openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY")))
    
    result = client.chat.completions.create(
        model=model,
        response_model=VisualVoteResult,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"}
                    }
                ]
            }
        ]
    )
    
    return result


# =============================================================================
# COUNCIL PROMPT TEMPLATES
# =============================================================================

COUNCIL_VOTE_PROMPT = """You are reviewing a proposed update to an Excel spreadsheet.

## Update Details
{update_details}

## Current Workbook State
{workbook_state}

## Your Task
Analyze this update and provide your vote. Consider:
1. Data integrity - will formulas and dependencies be preserved?
2. Safety - is there risk of data loss or corruption?
3. Completeness - are there any missing considerations?
4. Visual impact - could this affect formatting or charts?

Respond with your structured vote."""


VISUAL_ANALYSIS_PROMPT = """Analyze this Excel spreadsheet screenshot.

## Check Type: {check_type}

## Expected State
{expected}

## Your Task
1. Describe what you observe in the image
2. Check if it matches expectations
3. Note any anomalies (cut-off text, broken borders, etc.)
4. Rate the professional appearance

Provide your structured analysis."""


COMPARISON_PROMPT = """Compare these two Excel screenshots - BEFORE and AFTER an update.

## Update Description
{update_description}

## Your Task
1. Identify what data changed
2. Check if formatting was preserved
3. Check if layout was preserved  
4. Note any regressions (things that got worse)
5. Note any improvements

Provide your structured comparison result."""

