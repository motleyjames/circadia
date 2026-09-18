#!/usr/bin/env python3
"""
confidence.py - Confidence Calculations for RSI Loops

Ported and generalized from rsi_v3_engine.py.

Confidence Thresholds:
- >= 85% (EXECUTE_THRESHOLD): AUTO_EXECUTE - task complete
- >= 70% (MONITOR_THRESHOLD): EXECUTE_WITH_MONITORING
- >= 50% (SPAWN_THRESHOLD): SPAWN helper Meeseeks
- < 50%: ESCALATE to human

Confidence is calculated from:
1. Hypothesis test results (confirmed/refuted)
2. Probe verification outcomes
3. Council consensus levels
4. Dissent resolution rates
"""

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime


# =============================================================================
# THRESHOLDS - The Golden Numbers
# =============================================================================

EXECUTE_THRESHOLD = 0.85      # Auto-execute with confidence
MONITOR_THRESHOLD = 0.70      # Execute but watch carefully  
SPAWN_THRESHOLD = 0.50        # Spawn helper Meeseeks
ESCALATE_THRESHOLD = 0.50     # Below this = escalate to human


class DecisionType(Enum):
    """Types of decisions based on confidence"""
    AUTO_EXECUTE = "auto_execute"              # >= 85%
    EXECUTE_WITH_MONITORING = "execute_with_monitoring"  # >= 70%
    SPAWN_HELPER = "spawn_helper"              # >= 50%
    DEFER_TO_HUMAN = "defer_to_human"          # < 50%


@dataclass
class ConfidenceAdjustment:
    """Record of a confidence adjustment"""
    reason: str
    delta: float
    new_value: float
    source: str
    timestamp: Optional[str] = None


class ConfidenceCalculator:
    """
    Calculates and tracks confidence throughout the RSI loop.
    
    Confidence starts at 0.5 (neutral) and is adjusted based on:
    - Hypothesis confirmations (+0.05 to +0.15)
    - Hypothesis refutations (-0.05 to -0.10)
    - Probe successes (+0.05 to +0.12)
    - Council consensus (+/- based on agreement)
    - Dissent resolution rates
    """
    
    # Adjustment weights
    HYPOTHESIS_CONFIRMED = 0.10
    HYPOTHESIS_REFUTED = -0.05
    HYPOTHESIS_PARTIAL = 0.05
    HYPOTHESIS_INCONCLUSIVE = 0.0
    
    PROBE_SUCCESS = 0.08
    PROBE_FAILURE = -0.05
    
    COUNCIL_HIGH_AGREEMENT = 0.10  # Agreement > 80%
    COUNCIL_MEDIUM_AGREEMENT = 0.05  # Agreement 60-80%
    COUNCIL_LOW_AGREEMENT = -0.02  # Agreement < 60%
    
    def __init__(self, initial_confidence: float = 0.5):
        """
        Initialize calculator.
        
        Args:
            initial_confidence: Starting confidence (default: 0.5)
        """
        self.confidence = initial_confidence
        self.trajectory: List[float] = [initial_confidence]
        self.adjustments: List[ConfidenceAdjustment] = []
    
    def adjust(
        self,
        current: float,
        delta: float,
        reason: str,
        source: str = "unknown",
        clamp: bool = True
    ) -> float:
        """
        Adjust confidence by a delta.
        
        Args:
            current: Current confidence value
            delta: Amount to adjust (positive or negative)
            reason: Reason for adjustment
            source: Source of the adjustment
            clamp: Whether to clamp between 0 and 1
        
        Returns:
            New confidence value
        """
        new_value = current + delta
        
        if clamp:
            new_value = max(0.0, min(1.0, new_value))
        
        self.confidence = new_value
        self.trajectory.append(new_value)
        self.adjustments.append(ConfidenceAdjustment(
            reason=reason,
            delta=delta,
            new_value=new_value,
            source=source,
            timestamp=datetime.now().isoformat(),
        ))
        
        return new_value
    
    def adjust_from_hypothesis(
        self,
        result: str,
        confidence_impact: Optional[float] = None
    ) -> float:
        """
        Adjust confidence based on hypothesis test result.
        
        Args:
            result: CONFIRMED, REFUTED, PARTIAL, or INCONCLUSIVE
            confidence_impact: Override default adjustment
        
        Returns:
            New confidence value
        """
        if confidence_impact is not None:
            delta = confidence_impact
        else:
            delta = {
                "CONFIRMED": self.HYPOTHESIS_CONFIRMED,
                "REFUTED": self.HYPOTHESIS_REFUTED,
                "PARTIAL": self.HYPOTHESIS_PARTIAL,
                "INCONCLUSIVE": self.HYPOTHESIS_INCONCLUSIVE,
            }.get(result, 0.0)
        
        return self.adjust(
            self.confidence,
            delta,
            reason=f"Hypothesis {result.lower()}",
            source="hypothesis_test"
        )
    
    def adjust_from_probe(
        self,
        success: bool,
        confidence_impact: Optional[float] = None
    ) -> float:
        """
        Adjust confidence based on probe result.
        
        Args:
            success: Whether the probe succeeded
            confidence_impact: Override default adjustment
        
        Returns:
            New confidence value
        """
        if confidence_impact is not None:
            delta = confidence_impact
        else:
            delta = self.PROBE_SUCCESS if success else self.PROBE_FAILURE
        
        return self.adjust(
            self.confidence,
            delta,
            reason=f"Probe {'success' if success else 'failure'}",
            source="probe"
        )
    
    def adjust_from_council(
        self,
        agreement_level: float
    ) -> float:
        """
        Adjust confidence based on council agreement.
        
        Args:
            agreement_level: Agreement percentage (0-1)
        
        Returns:
            New confidence value
        """
        if agreement_level > 0.80:
            delta = self.COUNCIL_HIGH_AGREEMENT
        elif agreement_level > 0.60:
            delta = self.COUNCIL_MEDIUM_AGREEMENT
        else:
            delta = self.COUNCIL_LOW_AGREEMENT
        
        return self.adjust(
            self.confidence,
            delta,
            reason=f"Council agreement: {agreement_level:.0%}",
            source="council"
        )
    
    def get_decision(self) -> DecisionType:
        """
        Get the current decision based on confidence level.
        
        Returns:
            DecisionType based on thresholds
        """
        if self.confidence >= EXECUTE_THRESHOLD:
            return DecisionType.AUTO_EXECUTE
        elif self.confidence >= MONITOR_THRESHOLD:
            return DecisionType.EXECUTE_WITH_MONITORING
        elif self.confidence >= SPAWN_THRESHOLD:
            return DecisionType.SPAWN_HELPER
        else:
            return DecisionType.DEFER_TO_HUMAN
    
    def get_summary(self) -> Dict[str, Any]:
        """
        Get a summary of confidence tracking.
        
        Returns:
            Dict with confidence info
        """
        return {
            "current": self.confidence,
            "initial": self.trajectory[0] if self.trajectory else 0.5,
            "final": self.confidence,
            "min": min(self.trajectory) if self.trajectory else 0,
            "max": max(self.trajectory) if self.trajectory else 0,
            "trajectory": self.trajectory,
            "num_adjustments": len(self.adjustments),
            "decision": self.get_decision().value,
        }


@dataclass
class ConfidenceDecision:
    """Result of a confidence-based decision"""
    decision: str
    confidence: float
    enablers: List[str] = field(default_factory=list)
    blockers: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    auto_executable: bool = False


class ConfidenceGatedAutoExecutor:
    """
    Confidence-Gated Auto-Execute
    
    Makes the final decision about whether to execute automatically
    based on confidence, dissent resolution, probe verification, and other factors.
    
    Ported from rsi_v3_engine.py
    """
    
    def __init__(
        self,
        auto_execute_threshold: float = EXECUTE_THRESHOLD,
        monitoring_threshold: float = MONITOR_THRESHOLD,
        spawn_threshold: float = SPAWN_THRESHOLD,
        resolution_rate_threshold: float = 0.50,
        critical_blocker_threshold: int = 0
    ):
        """
        Initialize executor.
        
        Args:
            auto_execute_threshold: Confidence for auto-execute (default: 0.85)
            monitoring_threshold: Confidence for monitored execute (default: 0.70)
            spawn_threshold: Confidence for spawning helper (default: 0.50)
            resolution_rate_threshold: Required resolution rate
            critical_blocker_threshold: Max critical blockers allowed
        """
        self.auto_execute_threshold = auto_execute_threshold
        self.monitoring_threshold = monitoring_threshold
        self.spawn_threshold = spawn_threshold
        self.resolution_rate_threshold = resolution_rate_threshold
        self.critical_blocker_threshold = critical_blocker_threshold
        
        self.decision_log: List[ConfidenceDecision] = []
    
    def make_decision(
        self,
        confidence: float,
        hypothesis_results: Optional[List[Dict]] = None,
        probe_results: Optional[List[Dict]] = None,
        council_result: Optional[Dict] = None,
        additional_enablers: Optional[List[str]] = None,
        additional_blockers: Optional[List[str]] = None
    ) -> ConfidenceDecision:
        """
        Make the final execution decision.
        
        Args:
            confidence: Current confidence level
            hypothesis_results: Results of hypothesis tests
            probe_results: Results of probe executions
            council_result: Result of council vote (if any)
            additional_enablers: Extra enabling factors
            additional_blockers: Extra blocking factors
        
        Returns:
            ConfidenceDecision with decision and reasoning
        """
        hypothesis_results = hypothesis_results or []
        probe_results = probe_results or []
        
        enablers = list(additional_enablers or [])
        blockers = list(additional_blockers or [])
        reasons = []
        
        # Check confidence level
        if confidence >= self.auto_execute_threshold:
            enablers.append(f"High confidence: {confidence:.0%}")
        elif confidence >= self.monitoring_threshold:
            enablers.append(f"Sufficient confidence: {confidence:.0%}")
        elif confidence >= self.spawn_threshold:
            blockers.append(f"Low confidence for auto-execute: {confidence:.0%}")
        else:
            blockers.append(f"Confidence too low: {confidence:.0%}")
        
        # Check hypothesis results
        confirmed = sum(1 for h in hypothesis_results if h.get("result") == "CONFIRMED")
        refuted = sum(1 for h in hypothesis_results if h.get("result") == "REFUTED")
        
        if confirmed > 0 and refuted == 0:
            enablers.append(f"{confirmed} hypotheses confirmed, 0 refuted")
        elif refuted > 0:
            blockers.append(f"{refuted} hypotheses refuted")
        
        # Check probe results
        probe_successes = sum(1 for p in probe_results if p.get("success") or p.get("verified"))
        probe_failures = len(probe_results) - probe_successes
        
        if probe_successes > 0:
            enablers.append(f"{probe_successes} probes verified")
        if probe_failures > 0:
            blockers.append(f"{probe_failures} probe failures")
        
        # Check council consensus (if provided)
        if council_result:
            agreement = council_result.get("agreement_level", 0)
            if agreement >= 0.80:
                enablers.append(f"Strong council consensus: {agreement:.0%}")
            elif agreement < 0.50:
                blockers.append(f"Council disagreement: {agreement:.0%}")
        
        # Make the decision
        if not blockers:
            if confidence >= self.auto_execute_threshold:
                decision = "AUTO_EXECUTE"
                reasons.append("All conditions met for automatic execution")
            else:
                decision = "EXECUTE_WITH_MONITORING"
                reasons.append("Conditions met with monitoring recommended")
        elif len(blockers) == 1 and confidence >= self.monitoring_threshold:
            decision = "EXECUTE_WITH_MONITORING"
            reasons.append(f"Minor issue: {blockers[0]}")
        elif confidence >= self.spawn_threshold:
            decision = "SPAWN_HELPER"
            reasons.append("Spawning helper Meeseeks for assistance")
            reasons.extend(blockers)
        else:
            decision = "DEFER_TO_HUMAN"
            reasons.append("Human intervention required")
            reasons.extend(blockers)
        
        result = ConfidenceDecision(
            decision=decision,
            confidence=confidence,
            enablers=enablers,
            blockers=blockers,
            reasons=reasons,
            auto_executable=len(blockers) == 0
        )
        
        self.decision_log.append(result)
        return result


def calculate_confidence_delta(
    base_delta: float,
    importance: float = 1.0,
    certainty: float = 1.0
) -> float:
    """
    Calculate a confidence delta with modifiers.
    
    Args:
        base_delta: Base adjustment value
        importance: How important this factor is (0-1)
        certainty: How certain we are about this (0-1)
    
    Returns:
        Adjusted delta
    """
    return base_delta * importance * certainty


def format_confidence_trajectory(trajectory: List[float]) -> str:
    """
    Format confidence trajectory for display.
    
    Args:
        trajectory: List of confidence values
    
    Returns:
        Formatted string like "50% → 60% → 75% → 85%"
    """
    return " → ".join(f"{c:.0%}" for c in trajectory)
