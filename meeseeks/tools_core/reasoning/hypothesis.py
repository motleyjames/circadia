#!/usr/bin/env python3
"""
hypothesis.py - Hypothesis Management for RSI Loops

GOLDEN RULE: Every loop (except the final one) MUST produce exactly 3 hypotheses.

A hypothesis is a testable assertion about what might work. The RSI system
generates hypotheses, tests them, and uses the results to guide the next loop.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum


class HypothesisPriority(Enum):
    """Priority levels for hypotheses"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class HypothesisCategory(Enum):
    """Categories of hypotheses"""
    ARCHITECTURE = "architecture"
    IMPLEMENTATION = "implementation"
    INTEGRATION = "integration"
    PERFORMANCE = "performance"
    CORRECTNESS = "correctness"
    ALTERNATIVE_APPROACH = "alternative_approach"


class HypothesisTestResult(Enum):
    """Possible outcomes of testing a hypothesis"""
    CONFIRMED = "CONFIRMED"      # Hypothesis was true
    REFUTED = "REFUTED"          # Hypothesis was false
    PARTIAL = "PARTIAL"          # Partially true/unclear
    INCONCLUSIVE = "INCONCLUSIVE"  # Could not determine


@dataclass
class Hypothesis:
    """
    A testable hypothesis for the RSI loop system.
    
    Attributes:
        id: Unique identifier (H1, H2, H3, etc.)
        hypothesis: The hypothesis statement
        test_method: How to test this hypothesis
        expected_outcome: What we expect if true
        priority: Priority for testing
        category: Category of hypothesis
        dependencies: Other hypothesis IDs this depends on
        tools_required: Tools needed to test
        created_in_loop: Which loop created this
    """
    id: str
    hypothesis: str
    test_method: str
    expected_outcome: str
    priority: str = "medium"
    category: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)
    tools_required: List[str] = field(default_factory=list)
    created_in_loop: Optional[int] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def __post_init__(self):
        """Validate hypothesis on creation"""
        if not self.id.startswith("H"):
            raise ValueError(f"Hypothesis ID must start with 'H': {self.id}")
        if len(self.hypothesis) < 10:
            raise ValueError(f"Hypothesis must be at least 10 characters: {self.hypothesis}")
        if len(self.test_method) < 10:
            raise ValueError(f"Test method must be at least 10 characters: {self.test_method}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "hypothesis": self.hypothesis,
            "test_method": self.test_method,
            "expected_outcome": self.expected_outcome,
            "priority": self.priority,
            "category": self.category,
            "dependencies": self.dependencies,
            "tools_required": self.tools_required,
            "created_in_loop": self.created_in_loop,
            "created_at": self.created_at,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Hypothesis':
        """Create from dictionary"""
        return cls(
            id=data["id"],
            hypothesis=data["hypothesis"],
            test_method=data["test_method"],
            expected_outcome=data["expected_outcome"],
            priority=data.get("priority", "medium"),
            category=data.get("category"),
            dependencies=data.get("dependencies", []),
            tools_required=data.get("tools_required", []),
            created_in_loop=data.get("created_in_loop"),
            created_at=data.get("created_at", datetime.now().isoformat()),
        )


@dataclass
class HypothesisResult:
    """
    Result of testing a hypothesis.
    
    Attributes:
        id: The hypothesis ID that was tested
        result: Outcome (CONFIRMED, REFUTED, PARTIAL, INCONCLUSIVE)
        evidence: Evidence supporting this result
        confidence_impact: How this affects confidence (-1 to +1)
        tested_at: When the test was performed
        tested_by: What tool/method performed the test
    """
    id: str
    result: str  # CONFIRMED, REFUTED, PARTIAL, INCONCLUSIVE
    evidence: str
    confidence_impact: float
    tested_at: str = field(default_factory=lambda: datetime.now().isoformat())
    tested_by: Optional[str] = None
    
    def __post_init__(self):
        """Validate result"""
        valid_results = ["CONFIRMED", "REFUTED", "PARTIAL", "INCONCLUSIVE"]
        if self.result not in valid_results:
            raise ValueError(f"Invalid result '{self.result}'. Must be one of: {valid_results}")
        if not -1 <= self.confidence_impact <= 1:
            raise ValueError(f"confidence_impact must be between -1 and 1: {self.confidence_impact}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "result": self.result,
            "evidence": self.evidence,
            "confidence_impact": self.confidence_impact,
            "tested_at": self.tested_at,
            "tested_by": self.tested_by,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'HypothesisResult':
        """Create from dictionary"""
        return cls(
            id=data["id"],
            result=data["result"],
            evidence=data["evidence"],
            confidence_impact=data["confidence_impact"],
            tested_at=data.get("tested_at", datetime.now().isoformat()),
            tested_by=data.get("tested_by"),
        )


class HypothesisValidationError(Exception):
    """Raised when hypothesis validation fails"""
    pass


class HypothesisValidator:
    """
    Validates hypotheses against the golden rules.
    
    GOLDEN RULE: Loops 1 and 2 MUST produce exactly 3 hypotheses.
    """
    
    DEFAULT_REQUIRED_COUNT = 3
    
    def __init__(self, required_count: int = DEFAULT_REQUIRED_COUNT):
        """
        Initialize validator.
        
        Args:
            required_count: Number of hypotheses required per loop
        """
        self.required_count = required_count
    
    def validate_hypotheses(
        self,
        hypotheses: List[Hypothesis],
        required_count: Optional[int] = None,
        loop_number: Optional[int] = None
    ) -> bool:
        """
        Validate a list of hypotheses.
        
        Args:
            hypotheses: List of hypotheses to validate
            required_count: Override required count (optional)
            loop_number: Current loop number (for error messages)
        
        Returns:
            True if valid
        
        Raises:
            HypothesisValidationError: If validation fails
        """
        count = required_count or self.required_count
        loop_info = f" in loop {loop_number}" if loop_number else ""
        
        # Check count
        if len(hypotheses) != count:
            raise HypothesisValidationError(
                f"GOLDEN RULE VIOLATION{loop_info}: Expected {count} hypotheses, got {len(hypotheses)}. "
                f"Every loop MUST produce exactly {count} hypotheses!"
            )
        
        # Check for unique IDs
        ids = [h.id for h in hypotheses]
        if len(ids) != len(set(ids)):
            raise HypothesisValidationError(
                f"Duplicate hypothesis IDs found{loop_info}: {ids}"
            )
        
        # Validate each hypothesis
        for h in hypotheses:
            self._validate_single(h)
        
        return True
    
    def _validate_single(self, hypothesis: Hypothesis) -> bool:
        """Validate a single hypothesis"""
        errors = []
        
        if not hypothesis.id.startswith("H"):
            errors.append(f"ID must start with 'H': {hypothesis.id}")
        
        if len(hypothesis.hypothesis) < 10:
            errors.append(f"Hypothesis too short (min 10 chars): {len(hypothesis.hypothesis)}")
        
        if len(hypothesis.test_method) < 10:
            errors.append(f"Test method too short (min 10 chars): {len(hypothesis.test_method)}")
        
        if not hypothesis.expected_outcome:
            errors.append("Expected outcome is required")
        
        if errors:
            raise HypothesisValidationError(
                f"Invalid hypothesis {hypothesis.id}: {'; '.join(errors)}"
            )
        
        return True
    
    def validate_for_loop(
        self,
        hypotheses: List[Hypothesis],
        loop_number: int,
        max_loops: int = 3
    ) -> bool:
        """
        Validate hypotheses for a specific loop.
        
        Args:
            hypotheses: Hypotheses to validate
            loop_number: Current loop number
            max_loops: Maximum number of loops
        
        Returns:
            True if valid
        
        Raises:
            HypothesisValidationError: If validation fails
        """
        # Final loop doesn't need hypotheses
        if loop_number >= max_loops:
            if len(hypotheses) > 0:
                raise HypothesisValidationError(
                    f"Final loop {loop_number} should not produce hypotheses (got {len(hypotheses)})"
                )
            return True
        
        # Non-final loops need exactly required_count hypotheses
        return self.validate_hypotheses(hypotheses, loop_number=loop_number)


def create_hypothesis(
    number: int,
    hypothesis: str,
    test_method: str,
    expected_outcome: str,
    loop_number: int,
    **kwargs
) -> Hypothesis:
    """
    Convenience function to create a hypothesis.
    
    Args:
        number: Hypothesis number (will be formatted as H{number})
        hypothesis: The hypothesis statement
        test_method: How to test it
        expected_outcome: Expected outcome
        loop_number: Which loop created this
        **kwargs: Additional Hypothesis attributes
    
    Returns:
        Hypothesis instance
    """
    return Hypothesis(
        id=f"H{number}",
        hypothesis=hypothesis,
        test_method=test_method,
        expected_outcome=expected_outcome,
        created_in_loop=loop_number,
        **kwargs
    )


def create_hypothesis_result(
    hypothesis_id: str,
    confirmed: bool,
    evidence: str,
    confidence_impact: Optional[float] = None
) -> HypothesisResult:
    """
    Convenience function to create a hypothesis result.
    
    Args:
        hypothesis_id: The hypothesis ID (H1, H2, etc.)
        confirmed: Whether the hypothesis was confirmed
        evidence: Evidence for the result
        confidence_impact: Impact on confidence (auto-calculated if not provided)
    
    Returns:
        HypothesisResult instance
    """
    if confirmed:
        result = "CONFIRMED"
        impact = confidence_impact if confidence_impact is not None else 0.10
    else:
        result = "REFUTED"
        impact = confidence_impact if confidence_impact is not None else -0.05
    
    return HypothesisResult(
        id=hypothesis_id,
        result=result,
        evidence=evidence,
        confidence_impact=impact
    )
