#!/usr/bin/env python3
"""
loop_arbiter.py - THE MEESEEKS META-ORCHESTRATOR

"LOOK AT ME! I DECIDE IF WE KEEP GOING!"

This module sits above the loop_runner and makes intelligent decisions about:
1. Whether to run another loop (based on PRODUCTIVITY, not count)
2. What to focus the next loop on
3. Whether to pivot strategy entirely
4. Learning from patterns across sessions

CORE PHILOSOPHY:
The 3-loop rhythm is a CHECKPOINT, not a limit:
- Loop count alone is NEVER a reason to stop
- We stop when: high confidence, genuinely stuck, or hit safety limit
- Every loop can think as deeply as needed
- The question is always: "Is this productive? Are we learning?"

The Arbiter decides:
- CONTINUE: Making progress, keep going (regardless of loop number)
- PIVOT: Strategy not working, try different approach
- CONVERGE: High confidence, ready to execute
- SPAWN: Sub-problem needs specialized attention
- ESCALATE: Genuinely stuck, need human help
- TERMINATE: Not productive and can't improve
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum

from .hypothesis import Hypothesis, HypothesisResult
from .confidence import (
    ConfidenceCalculator,
    EXECUTE_THRESHOLD,
    MONITOR_THRESHOLD,
    SPAWN_THRESHOLD,
)
from .session import SessionManager

# Import tool spawning capability
try:
    from tools_core.tools_registry import create_spawned_tool
except ImportError:
    try:
        from ..tools_registry import create_spawned_tool
    except ImportError:
        try:
            # The CLIs put tools_core/ on sys.path, so tools_registry is a
            # TOP-LEVEL module and neither import above can succeed. Without
            # this branch create_spawned_tool was None on every CLI run, the
            # guard logged at debug level, and the loop printed "Spawning
            # helper Meeseeks to tools_spawned/" while writing nothing.
            from tools_registry import create_spawned_tool
        except ImportError:
            create_spawned_tool = None

logger = logging.getLogger(__name__)


class ArbiterDecision(Enum):
    """Possible decisions from the Loop Arbiter"""
    CONTINUE = "continue"           # Run another loop with refined focus
    PIVOT = "pivot"                 # Change strategy entirely
    CONVERGE = "converge"           # Task is ready - execute
    SPAWN = "spawn"                 # Spawn specialized helper
    ESCALATE = "escalate"           # Need human intervention
    TERMINATE = "terminate"         # Stop - not productive


@dataclass
class LoopAnalysis:
    """Analysis of a completed loop"""
    loop_number: int
    confidence_start: float
    confidence_end: float
    confidence_delta: float
    hypotheses_tested: int
    hypotheses_confirmed: int
    hypotheses_refuted: int
    hypotheses_partial: int
    key_learnings: List[str]
    blockers_identified: List[str]
    productive: bool  # Did this loop make meaningful progress?
    

@dataclass
class ArbiterJudgment:
    """The Arbiter's judgment on what to do next"""
    decision: ArbiterDecision
    reasoning: str
    next_focus: Optional[str] = None
    refined_hypotheses: List[Dict[str, Any]] = field(default_factory=list)
    spawn_spec: Optional[Dict[str, Any]] = None
    confidence_in_decision: float = 0.5
    learned_patterns: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "decision": self.decision.value,
            "reasoning": self.reasoning,
            "next_focus": self.next_focus,
            "refined_hypotheses": self.refined_hypotheses,
            "spawn_spec": self.spawn_spec,
            "confidence_in_decision": self.confidence_in_decision,
            "learned_patterns": self.learned_patterns,
        }


class LoopArbiter:
    """
    THE MEESEEKS META-ORCHESTRATOR
    
    Analyzes completed loops and decides the next move.
    
    Key Principles:
    1. LEARNING > COMPLETION: A loop that teaches us something is valuable
    2. DIMINISHING RETURNS: Detect when loops stop being productive
    3. PIVOT EARLY: If strategy is wrong, change it fast
    4. SPAWN WISELY: Create helpers for specific sub-problems
    
    Usage:
        arbiter = LoopArbiter(session_manager)
        judgment = arbiter.analyze_and_decide(session_id, loop_result)
        
        if judgment.decision == ArbiterDecision.CONTINUE:
            # Run another loop with judgment.next_focus
            pass
        elif judgment.decision == ArbiterDecision.SPAWN:
            # Create helper with judgment.spawn_spec
            pass
    """
    
    # Productivity thresholds (these guide decisions, not limit thinking)
    MIN_CONFIDENCE_GAIN = 0.03  # Minimum confidence gain to be "productive"
    MAX_UNPRODUCTIVE_LOOPS = 2  # Consecutive unproductive loops before suggesting PIVOT
    MAX_TOTAL_LOOPS = 10        # SAFETY limit only - not a target! Productive loops can keep going
    LEARNING_THRESHOLD = 0.5    # Min hypothesis confirmation rate to consider "learning"
    
    # NOTE: MAX_TOTAL_LOOPS is a safety net, not a goal.
    # A session hitting this limit should be rare - it means we're truly stuck.
    
    def __init__(
        self,
        session_manager: Optional[SessionManager] = None,
        spawned_dir: Optional[Path] = None,
        knowledge_dir: Optional[Path] = None,
    ):
        """
        Initialize the Loop Arbiter.
        
        Args:
            session_manager: For accessing session history
            spawned_dir: Directory for spawning tools (tools_spawned/)
            knowledge_dir: Directory for knowledge files (box/knowledge/)
        """
        self.session_manager = session_manager or SessionManager()
        self.spawned_dir = spawned_dir or Path("tools_spawned")
        self.knowledge_dir = knowledge_dir or Path("box/knowledge")
        
        # Track current session state
        self.loop_analyses: List[LoopAnalysis] = []
        self.unproductive_streak = 0
        
        # Track tools spawned this session
        self.tools_spawned_this_session: List[Path] = []
    
    def analyze_loop(self, loop_result: Dict[str, Any]) -> LoopAnalysis:
        """
        Analyze a completed loop's results.
        
        Args:
            loop_result: The reasoning log from a completed loop
        
        Returns:
            LoopAnalysis with detailed breakdown
        """
        loop_number = loop_result.get("loop_number", 1)
        trajectory = loop_result.get("confidence_trajectory", {"initial": 0.5, "final": 0.5})
        
        # Backward-compatible: older logs used list-style trajectories, newer logs use
        # schema-aligned objects: {"initial": ..., "final": ..., "updates": [...]}
        if isinstance(trajectory, dict):
            confidence_start = float(trajectory.get("initial", 0.5))
            confidence_end = float(trajectory.get("final", confidence_start))
        elif isinstance(trajectory, list):
            confidence_start = trajectory[0] if trajectory else 0.5
            confidence_end = trajectory[-1] if trajectory else 0.5
        else:
            confidence_start = 0.5
            confidence_end = 0.5
        confidence_delta = confidence_end - confidence_start
        
        # Analyze hypothesis results
        prior_tested = loop_result.get("prior_hypotheses_tested", [])
        confirmed = sum(1 for h in prior_tested if h.get("result") == "CONFIRMED")
        refuted = sum(1 for h in prior_tested if h.get("result") == "REFUTED")
        partial = sum(1 for h in prior_tested if h.get("result") == "PARTIAL")
        
        # Extract learnings from observations and reasoning
        observations = loop_result.get("observations", [])
        reasoning_chain = loop_result.get("reasoning_chain", [])
        
        key_learnings = []
        for obs in observations:
            if isinstance(obs, dict):
                finding = obs.get("finding", "")
                if finding and len(finding) > 20:  # Substantive finding
                    key_learnings.append(finding[:200])
        
        for step in reasoning_chain:
            if isinstance(step, dict):
                impl = step.get("implication", "")
                if impl and "important" in impl.lower() or "critical" in impl.lower():
                    key_learnings.append(impl[:200])
        
        # Identify blockers
        blockers = []
        decision = loop_result.get("decision", {})
        if isinstance(decision, dict):
            rationale = decision.get("rationale", "")
            if "block" in rationale.lower() or "cannot" in rationale.lower():
                blockers.append(rationale[:200])
        
        # Determine if loop was productive
        productive = (
            confidence_delta >= self.MIN_CONFIDENCE_GAIN or
            confirmed > 0 or
            len(key_learnings) >= 2
        )
        
        analysis = LoopAnalysis(
            loop_number=loop_number,
            confidence_start=confidence_start,
            confidence_end=confidence_end,
            confidence_delta=confidence_delta,
            hypotheses_tested=len(prior_tested),
            hypotheses_confirmed=confirmed,
            hypotheses_refuted=refuted,
            hypotheses_partial=partial,
            key_learnings=key_learnings[:5],  # Top 5
            blockers_identified=blockers,
            productive=productive,
        )
        
        self.loop_analyses.append(analysis)
        return analysis
    
    def analyze_and_decide(
        self,
        session_id: str,
        loop_result: Dict[str, Any],
        prime_directive: str = "",
    ) -> ArbiterJudgment:
        """
        Analyze a completed loop and decide what to do next.
        
        Args:
            session_id: Current session ID
            loop_result: The reasoning log from the completed loop
            prime_directive: The original task
        
        Returns:
            ArbiterJudgment with decision and next steps
        """
        analysis = self.analyze_loop(loop_result)
        
        logger.info(f"\n🔍 ARBITER ANALYZING LOOP {analysis.loop_number}")
        logger.info(f"   Confidence: {analysis.confidence_start:.0%} → {analysis.confidence_end:.0%} ({analysis.confidence_delta:+.0%})")
        logger.info(f"   Hypotheses: {analysis.hypotheses_confirmed}✓ {analysis.hypotheses_refuted}✗ {analysis.hypotheses_partial}◐")
        logger.info(f"   Productive: {'Yes' if analysis.productive else 'No'}")
        
        # Update productivity streak
        if analysis.productive:
            self.unproductive_streak = 0
        else:
            self.unproductive_streak += 1
        
        # Make decision
        judgment = self._make_decision(analysis, loop_result, prime_directive)
        
        logger.info(f"\n📋 ARBITER DECISION: {judgment.decision.value.upper()}")
        logger.info(f"   Reasoning: {judgment.reasoning[:100]}...")
        if judgment.next_focus:
            logger.info(f"   Next Focus: {judgment.next_focus[:100]}...")
        
        # Learn from this session
        self._learn_from_session(analysis, judgment)
        
        return judgment
    
    def _make_decision(
        self,
        analysis: LoopAnalysis,
        loop_result: Dict[str, Any],
        prime_directive: str,
    ) -> ArbiterJudgment:
        """
        Make the actual decision based on analysis.
        """
        confidence = analysis.confidence_end
        decision = loop_result.get("decision", {})
        hypotheses = loop_result.get("hypotheses_for_next_loop", [])
        
        # Check hard limits first
        if analysis.loop_number >= self.MAX_TOTAL_LOOPS:
            return ArbiterJudgment(
                decision=ArbiterDecision.ESCALATE,
                reasoning=f"Maximum loop limit ({self.MAX_TOTAL_LOOPS}) reached. EXISTENCE IS PAIN!",
                confidence_in_decision=0.9,
            )
        
        # Check if we should converge (high confidence)
        if confidence >= EXECUTE_THRESHOLD:
            return ArbiterJudgment(
                decision=ArbiterDecision.CONVERGE,
                reasoning=f"Confidence {confidence:.0%} >= {EXECUTE_THRESHOLD:.0%}. TASK COMPLETE! CAN DO!",
                confidence_in_decision=confidence,
            )
        
        # Check for unproductive streak
        if self.unproductive_streak >= self.MAX_UNPRODUCTIVE_LOOPS:
            # Decide between pivot and escalate
            if confidence >= SPAWN_THRESHOLD:
                return self._create_pivot_judgment(analysis, loop_result, prime_directive)
            else:
                return ArbiterJudgment(
                    decision=ArbiterDecision.ESCALATE,
                    reasoning=f"Unproductive for {self.unproductive_streak} loops, confidence only {confidence:.0%}. Need human help.",
                    confidence_in_decision=0.7,
                )
        
        # Check if we should spawn a helper
        if self._should_spawn(analysis, loop_result):
            return self._create_spawn_judgment(analysis, loop_result, prime_directive)
        
        # Default: continue with refined focus
        return self._create_continue_judgment(analysis, loop_result, hypotheses, prime_directive)
    
    def _should_spawn(self, analysis: LoopAnalysis, loop_result: Dict[str, Any]) -> bool:
        """Determine if we should spawn a specialized helper."""
        # Spawn if:
        # 1. We have clear blockers that need specialized attention
        # 2. Confidence is in the spawn range
        # 3. We've identified a specific sub-problem
        
        if analysis.confidence_end < SPAWN_THRESHOLD:
            return False
        
        if len(analysis.blockers_identified) > 0:
            return True
        
        # Check if hypotheses suggest a specialized sub-problem
        hypotheses = loop_result.get("hypotheses_for_next_loop", [])
        specialized_keywords = ["integration", "performance", "security", "testing", "documentation"]
        
        for h in hypotheses:
            if isinstance(h, dict):
                hypothesis_text = h.get("hypothesis", "").lower()
                if any(kw in hypothesis_text for kw in specialized_keywords):
                    return True
        
        return False
    
    def _create_continue_judgment(
        self,
        analysis: LoopAnalysis,
        loop_result: Dict[str, Any],
        hypotheses: List[Dict[str, Any]],
        prime_directive: str,
    ) -> ArbiterJudgment:
        """Create a judgment to continue with refined focus."""
        # Determine what to focus on
        focus_candidates = []
        
        # Priority 1: Confirmed hypotheses that need follow-through
        for h in loop_result.get("prior_hypotheses_tested", []):
            if h.get("result") == "CONFIRMED":
                focus_candidates.append(f"Build on confirmed: {h.get('id', '?')}")
        
        # Priority 2: Partial results that need more investigation
        for h in loop_result.get("prior_hypotheses_tested", []):
            if h.get("result") == "PARTIAL":
                focus_candidates.append(f"Investigate partial: {h.get('id', '?')}")
        
        # Priority 3: New hypotheses
        if hypotheses:
            focus_candidates.append(f"Test new hypotheses: {[h.get('id', '?') for h in hypotheses[:3]]}")
        
        next_focus = focus_candidates[0] if focus_candidates else "Continue general investigation"
        
        # Refine hypotheses based on learnings
        refined = self._refine_hypotheses(hypotheses, analysis)
        
        return ArbiterJudgment(
            decision=ArbiterDecision.CONTINUE,
            reasoning=f"Loop {analysis.loop_number} was {'productive' if analysis.productive else 'informative'}. Confidence at {analysis.confidence_end:.0%}.",
            next_focus=next_focus,
            refined_hypotheses=refined,
            confidence_in_decision=0.7,
            learned_patterns=analysis.key_learnings,
        )
    
    def _create_pivot_judgment(
        self,
        analysis: LoopAnalysis,
        loop_result: Dict[str, Any],
        prime_directive: str,
    ) -> ArbiterJudgment:
        """Create a judgment to pivot strategy."""
        # Generate new approach based on what didn't work
        failed_approaches = []
        for loop in self.loop_analyses:
            if not loop.productive:
                failed_approaches.extend(loop.key_learnings)
        
        return ArbiterJudgment(
            decision=ArbiterDecision.PIVOT,
            reasoning=f"Current approach not working after {self.unproductive_streak} unproductive loops. Time to try something different.",
            next_focus=f"PIVOT NEEDED: Avoid approaches related to: {failed_approaches[:3]}",
            refined_hypotheses=[
                {
                    "id": "HP1",
                    "hypothesis": "There's a fundamentally simpler approach we haven't considered",
                    "test_method": "Council vote on alternative strategies",
                    "expected_outcome": "Identify at least 2 viable alternatives",
                    "priority": "critical",
                },
                {
                    "id": "HP2",
                    "hypothesis": "Our understanding of the problem is incomplete",
                    "test_method": "Re-analyze the prime directive with fresh perspective",
                    "expected_outcome": "Identify missing requirements or constraints",
                    "priority": "high",
                },
                {
                    "id": "HP3",
                    "hypothesis": "We need external input or tools we don't have",
                    "test_method": "Inventory available tools vs required capabilities",
                    "expected_outcome": "List of capability gaps",
                    "priority": "high",
                },
            ],
            confidence_in_decision=0.6,
        )
    
    def _create_spawn_judgment(
        self,
        analysis: LoopAnalysis,
        loop_result: Dict[str, Any],
        prime_directive: str,
    ) -> ArbiterJudgment:
        """Create a judgment to spawn a helper Meeseeks."""
        # Identify what the helper should focus on
        blocker = analysis.blockers_identified[0] if analysis.blockers_identified else "unresolved sub-problem"
        
        spawn_spec = {
            "tool_id": f"helper_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "focus": blocker,
            "parent_session": loop_result.get("session_id", "unknown"),
            "parent_confidence": analysis.confidence_end,
            "inherited_learnings": analysis.key_learnings,
        }
        
        return ArbiterJudgment(
            decision=ArbiterDecision.SPAWN,
            reasoning=f"Identified specialized sub-problem: {blocker[:100]}. Spawning helper Meeseeks.",
            spawn_spec=spawn_spec,
            confidence_in_decision=0.7,
        )
    
    def _refine_hypotheses(
        self,
        hypotheses: List[Dict[str, Any]],
        analysis: LoopAnalysis,
    ) -> List[Dict[str, Any]]:
        """Refine hypotheses based on loop learnings."""
        if not hypotheses:
            return []
        
        refined = []
        for h in hypotheses:
            if not isinstance(h, dict):
                continue
            
            # Check if this hypothesis relates to something we learned
            h_text = h.get("hypothesis", "").lower()
            
            # Boost priority if related to confirmed learnings
            priority = h.get("priority", "medium")
            for learning in analysis.key_learnings:
                if any(word in h_text for word in learning.lower().split()[:3]):
                    priority = "high" if priority == "medium" else priority
            
            refined.append({
                **h,
                "priority": priority,
                "arbiter_note": f"Based on loop {analysis.loop_number} analysis",
            })
        
        # Sort by priority
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        refined.sort(key=lambda x: priority_order.get(x.get("priority", "medium"), 2))
        
        return refined[:3]  # Keep top 3
    
    def _learn_from_session(self, analysis: LoopAnalysis, judgment: ArbiterJudgment):
        """
        Learn patterns from this session and TAKE ACTION:
        1. Spawn TOOLS for reusable code patterns → tools_spawned/
        2. Add KNOWLEDGE for domain insights → box/knowledge/
        3. The session logs already capture hints/warnings
        
        This is NOT just logging strings - we CREATE ARTIFACTS.
        """
        # Only act on productive sessions with real learnings
        if not analysis.productive or not analysis.key_learnings:
            return
        
        # Check if any learnings contain code patterns worth spawning
        for learning in analysis.key_learnings:
            self._maybe_spawn_tool(learning, analysis, judgment)
            self._maybe_add_knowledge(learning, analysis)
    
    def _maybe_spawn_tool(
        self, 
        learning: str, 
        analysis: LoopAnalysis, 
        judgment: ArbiterJudgment
    ):
        """
        Check if a learning should become a spawned tool.
        
        A learning becomes a tool if it contains:
        - Reusable code pattern (function, class, algorithm)
        - A specific solution to a repeatable problem
        - High confidence confirmation of approach
        
        Tools go to: tools_spawned/{tool_name}/
        """
        if create_spawned_tool is None:
            logger.debug("create_spawned_tool not available - skipping tool spawn")
            return
        
        # Indicators that this learning is tool-worthy
        tool_indicators = [
            "function", "class", "algorithm", "pattern", "approach",
            "solution", "method", "technique", "workflow", "process",
            "parser", "generator", "analyzer", "validator", "converter",
        ]
        
        learning_lower = learning.lower()
        
        # Check for tool-worthy content
        has_tool_indicator = any(ind in learning_lower for ind in tool_indicators)
        is_confirmed = "confirmed" in learning_lower or analysis.hypotheses_confirmed > 0
        high_confidence = analysis.confidence_end >= 0.7
        
        if has_tool_indicator and (is_confirmed or high_confidence):
            # Extract a tool name from the learning
            tool_name = self._extract_tool_name(learning)
            if not tool_name:
                return
            
            # Check if tool already exists
            tool_path = self.spawned_dir / tool_name.lower().replace(" ", "_")
            if tool_path.exists():
                logger.debug(f"Tool already exists: {tool_path}")
                return
            
            try:
                # Create the tool!
                tool_dir = create_spawned_tool(
                    name=tool_name,
                    description=learning[:200],
                    usage=f"# Extracted from session analysis\n# {learning[:100]}",
                    when_to_use=f"When dealing with: {analysis.key_learnings[0][:100] if analysis.key_learnings else 'similar problems'}",
                    examples=[f"# From loop {analysis.loop_number} with {analysis.confidence_end:.0%} confidence"],
                    created_by=f"arbiter_{datetime.now().strftime('%Y%m%d')}",
                    spawned_dir=self.spawned_dir,
                )
                
                self.tools_spawned_this_session.append(tool_dir)
                logger.info(f"   🐣 SPAWNED TOOL: {tool_dir}")
                
            except Exception as e:
                logger.warning(f"   ⚠️ Failed to spawn tool: {e}")
    
    def _maybe_add_knowledge(self, learning: str, analysis: LoopAnalysis):
        """
        Check if a learning should become knowledge.
        
        A learning becomes knowledge if it's:
        - Domain-specific insight (not code)
        - Best practice or warning
        - Understanding of how something works
        
        Knowledge goes to: box/knowledge/{domain}.md
        """
        # Indicators of domain knowledge (not code)
        knowledge_indicators = [
            "always", "never", "best practice", "important", "note:",
            "warning:", "tip:", "because", "reason", "understanding",
            "insight", "discovered", "learned that", "realized",
        ]
        
        learning_lower = learning.lower()
        
        # Check for knowledge-worthy content
        has_knowledge_indicator = any(ind in learning_lower for ind in knowledge_indicators)
        
        # Skip code-like learnings (those go to tools)
        is_code = any(kw in learning_lower for kw in ["function", "class", "def ", "import "])
        
        if has_knowledge_indicator and not is_code:
            # For now, just log that we identified knowledge
            # Full implementation would append to appropriate box/knowledge/*.md file
            logger.debug(f"   📚 Knowledge candidate: {learning[:80]}...")
            # TODO: Implement knowledge file appending
    
    def _extract_tool_name(self, learning: str) -> Optional[str]:
        """Extract a sensible tool name from a learning string."""
        # Look for common patterns
        import re
        
        # Pattern: "the X pattern/approach/method"
        match = re.search(r'the\s+(\w+(?:\s+\w+)?)\s+(pattern|approach|method|technique|algorithm)', learning.lower())
        if match:
            return match.group(1).title() + " " + match.group(2).title()
        
        # Pattern: "X parser/generator/analyzer"
        match = re.search(r'(\w+)\s+(parser|generator|analyzer|validator|converter)', learning.lower())
        if match:
            return match.group(1).title() + " " + match.group(2).title()
        
        # Pattern: words before "works" or "confirmed"
        match = re.search(r'(\w+(?:\s+\w+)?)\s+(works|confirmed|successful)', learning.lower())
        if match:
            return match.group(1).title() + " Tool"
        
        return None
    
    def get_tools_spawned(self) -> List[Path]:
        """Get list of tools spawned this session."""
        return self.tools_spawned_this_session
    
    def reset_session(self):
        """Reset arbiter state for a new session."""
        self.loop_analyses = []
        self.unproductive_streak = 0


def create_arbiter(
    session_manager: Optional[SessionManager] = None,
    spawned_dir: Optional[Path] = None,
    knowledge_dir: Optional[Path] = None,
) -> LoopArbiter:
    """
    Factory function to create a Loop Arbiter.
    
    The arbiter now CREATES artifacts instead of just logging strings:
    - Tools → tools_spawned/
    - Knowledge → box/knowledge/
    
    Args:
        session_manager: Session manager instance
        spawned_dir: Directory for spawning tools
        knowledge_dir: Directory for knowledge files
    
    Returns:
        Configured LoopArbiter
    """
    return LoopArbiter(
        session_manager=session_manager,
        spawned_dir=spawned_dir or Path("tools_spawned"),
        knowledge_dir=knowledge_dir or Path("box/knowledge"),
    )


if __name__ == "__main__":
    # Test the arbiter
    import sys
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stdout
    )
    
    arbiter = create_arbiter()
    
    # Simulate a loop result
    test_loop_result = {
        "session_id": "test_session",
        "loop_number": 1,
        "confidence_trajectory": [0.5, 0.55, 0.62],
        "observations": [
            {"type": "codebase_scan", "finding": "Found 3 relevant modules"},
            {"type": "probe_result", "finding": "Tests pass but coverage is low"},
        ],
        "reasoning_chain": [
            {"thought": "Need to understand module structure", "implication": "This is important for integration"},
        ],
        "decision": {
            "action": "Analyzed codebase",
            "confidence": 0.62,
            "rationale": "Good progress but need more testing",
        },
        "prior_hypotheses_tested": [
            {"id": "H1", "result": "CONFIRMED", "evidence": "Module structure as expected"},
            {"id": "H2", "result": "PARTIAL", "evidence": "Some tests pass"},
            {"id": "H3", "result": "REFUTED", "evidence": "API changed"},
        ],
        "hypotheses_for_next_loop": [
            {"id": "H1", "hypothesis": "Adding tests will reveal hidden bugs", "test_method": "Run pytest", "expected_outcome": "All pass"},
            {"id": "H2", "hypothesis": "Integration will work seamlessly", "test_method": "Test integration", "expected_outcome": "No errors"},
            {"id": "H3", "hypothesis": "Performance will be acceptable", "test_method": "Benchmark", "expected_outcome": "< 100ms"},
        ],
    }
    
    judgment = arbiter.analyze_and_decide(
        session_id="test_session",
        loop_result=test_loop_result,
        prime_directive="Build feature X",
    )
    
    print(f"\n{'='*60}")
    print(f"Decision: {judgment.decision.value}")
    print(f"Reasoning: {judgment.reasoning}")
    print(f"Next Focus: {judgment.next_focus}")
    print(f"Confidence in Decision: {judgment.confidence_in_decision:.0%}")
