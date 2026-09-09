#!/usr/bin/env python3
"""
spinning_meeseeks.py - THE LEARNING MEESEEKS ORCHESTRATOR

"I'M MR. MEESEEKS! I CAN KEEP SPINNING AND LEARNING!"

This is the full orchestrator that combines:
- MeeseeksLoopRunner: Executes individual loops
- LoopArbiter: Decides whether to continue, pivot, or spawn

CORE PHILOSOPHY:
The 3-loop rhythm is a CHECKPOINT for reflection, not a thinking limit:
- Loop 1 and Loop 10 can both go equally deep
- Every loop has full reasoning capability
- The Arbiter decides continuation based on PRODUCTIVITY, not loop count
- "max_loops" is a safety limit, not a target

The Spinning Meeseeks can:
- Run as many loops as productive (up to safety limit)
- Learn from each loop and carry context forward
- Spawn specialized helpers for sub-problems
- Pivot strategy when current approach isn't working
- Recognize when to stop (high confidence OR genuinely stuck)

Usage:
    meeseeks = SpinningMeeseeks(
        prime_directive="Build feature X",
        output_dir=Path("logs/sessions")
    )
    result = meeseeks.spin()
"""

import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, field

from .loop_runner import MeeseeksLoopRunner, MeeseeksResult, MeeseeksStatus, ReasoningLog
from .loop_arbiter import LoopArbiter, ArbiterDecision, ArbiterJudgment, create_arbiter
from .hypothesis import Hypothesis
from .session import SessionManager
from .confidence import EXECUTE_THRESHOLD, MONITOR_THRESHOLD, SPAWN_THRESHOLD

# Import registries for context building
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
try:
    from tools_registry import ToolsRegistry
    from knowledge_registry import KnowledgeRegistry
    HAS_REGISTRIES = True
except ImportError:
    HAS_REGISTRIES = False

logger = logging.getLogger(__name__)


@dataclass
class SpinResult:
    """Result of a complete spinning Meeseeks session"""
    status: str
    message: str
    session_id: str
    total_loops: int
    final_confidence: float
    arbiter_decisions: List[str]
    spawned_helpers: List[Dict[str, Any]]
    key_learnings: List[str]
    artifacts: List[str] = field(default_factory=list)
    
    @property
    def success(self) -> bool:
        return self.status in ["converge", "task_complete", "execute_with_monitoring"]


class SpinningMeeseeks:
    """
    THE LEARNING MEESEEKS ORCHESTRATOR
    
    "LOOK AT ME! I CAN KEEP SPINNING AND LEARNING!"
    
    This Meeseeks keeps running loops until:
    1. Task is complete (confidence >= 85%)
    2. Arbiter says to stop
    3. Hard limit reached (default: 7 loops)
    4. Human intervention needed
    
    Each loop:
    1. Run a MeeseeksLoopRunner cycle
    2. Pass results to LoopArbiter
    3. Arbiter decides: continue, pivot, spawn, or stop
    4. If continue: feed learnings into next loop
    5. If spawn: create helper Meeseeks
    
    Example:
        >>> meeseeks = SpinningMeeseeks("Build auth system")
        >>> result = meeseeks.spin()
        >>> print(f"Completed in {result.total_loops} loops")
    """
    
    # Hard limits (SAFETY nets, not targets)
    ABSOLUTE_MAX_LOOPS = 15  # If we hit this, something is wrong
    
    def __init__(
        self,
        prime_directive: str,
        session_id: Optional[str] = None,
        output_dir: Optional[Path] = None,
        max_loops: int = 10,  # SAFETY limit only - productive loops should continue
        loop_executor: Optional[Callable] = None,
        on_spawn: Optional[Callable] = None,
        repo_root: Optional[Path] = None,
        verify: bool = True,
        test_command: Optional[List[str]] = None,
        probe_timeout: int = 120,
        max_probes_per_loop: int = 3,
        synth_model: Optional[str] = None,
        reader_model: Optional[str] = None,
    ):
        """
        Initialize a Spinning Meeseeks.
        
        Args:
            prime_directive: The task to complete
            session_id: Unique session ID (auto-generated if not provided)
            output_dir: Directory for session output
            max_loops: SAFETY limit, not a target. Productive loops continue.
            loop_executor: Custom function for loop execution
            on_spawn: Callback when spawning a helper (receives spawn_spec)
        """
        self.prime_directive = prime_directive
        self.session_id = session_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.output_dir = output_dir or Path("logs/sessions")
        self.max_loops = min(max_loops, self.ABSOLUTE_MAX_LOOPS)
        self.loop_executor = loop_executor
        self.on_spawn = on_spawn
        # Passed to every MeeseeksLoopRunner so the spinner verifies too.
        self.repo_root = repo_root
        self.verify = verify
        self.test_command = test_command
        self.probe_timeout = probe_timeout
        self.max_probes_per_loop = max_probes_per_loop
        self.synth_model = synth_model
        self.reader_model = reader_model
        
        # Components
        self.session_manager = SessionManager(self.output_dir)
        self.arbiter = create_arbiter(self.session_manager)
        
        # Load registries for context
        self.tools_context = ""
        self.knowledge_context = ""  # COMPACT skill cards, NOT full content!
        self.available_skills: List[str] = []  # Skills that can be pulled on-demand
        self._load_registries()
        
        # State
        self.current_loop = 0
        self.reasoning_logs: List[Dict[str, Any]] = []
        self.arbiter_decisions: List[ArbiterJudgment] = []
        self.spawned_helpers: List[Dict[str, Any]] = []
        self.accumulated_learnings: List[str] = []
        self.current_hypotheses: List[Dict[str, Any]] = []
        self.confidence = 0.5
        # Probes that established something conclusive, across the whole spin.
        self._verified_probes = 0
        self._findings: List[Dict[str, Any]] = []
        self._last_runner = None
        
        logger.info("=" * 60)
        logger.info("🔵 *poof* I'M A SPINNING MR. MEESEEKS, LOOK AT ME!")
        logger.info("=" * 60)
        logger.info(f"   Session: {self.session_id}")
        logger.info(f"   Task: {self.prime_directive[:80]}...")
        logger.info(f"   Max Loops: {self.max_loops}")
        if self.tools_context:
            logger.info(f"   Tools: Loaded")
        if self.knowledge_context:
            logger.info(f"   Knowledge: Loaded")
    
    def _load_registries(self):
        """
        Load tools and knowledge registries to build context for LLM calls.
        
        IMPORTANT: Knowledge is loaded as COMPACT SKILL CARDS, not full content!
        This keeps context small (~1-2K chars) instead of bloating (16K+ chars).
        
        Full skill content is pulled ON-DEMAND via pull_skill() when needed.
        
        This is called once at init and builds:
        - tools_context: Available tools for the system prompt
        - knowledge_context: COMPACT skill cards (mental models + prompts only)
        - available_skills: List of skills that can be pulled for full content
        """
        if not HAS_REGISTRIES:
            logger.warning("Registries not available - running without context")
            return
        
        try:
            # Load tools registry
            tools_registry = ToolsRegistry()
            self.tools_context = tools_registry.generate_tools_prompt()
            logger.info(f"📦 Loaded {len(tools_registry.core_tools)} core tools, "
                       f"{len(tools_registry.spawned_tools)} spawned tools")
            
            # Load knowledge registry - COMPACT skill cards only!
            self._knowledge_registry = KnowledgeRegistry()
            
            # Extract domains from task (simple heuristic)
            task_lower = self.prime_directive.lower()
            domains = []
            domain_keywords = {
                "svg": ["svg", "vector", "graphics", "animation", "viewbox"],
                "video": ["video", "transcribe", "meeting", "audio"],
                "pdf": ["pdf", "document", "parse"],
                "excel": ["excel", "spreadsheet", "xlsx"],
                "visualization": ["chart", "graph", "plot", "visualization", "data viz"],
                "frontend": ["react", "vue", "css", "html", "frontend", "ui"],
                "api": ["api", "rest", "graphql", "endpoint"],
            }
            
            for domain, keywords in domain_keywords.items():
                if any(kw in task_lower for kw in keywords):
                    domains.append(domain)
            
            # Get COMPACT skill cards (NOT full content!)
            self.knowledge_context, self.available_skills = \
                self._knowledge_registry.get_context_for_spin(
                    task=self.prime_directive,
                    domains=domains,
                )
            
            if self.available_skills:
                logger.info(f"📚 Loaded {len(self.available_skills)} skill cards (COMPACT):")
                for skill in self.available_skills:
                    logger.info(f"   - {skill}")
                logger.info(f"   Context size: {len(self.knowledge_context):,} chars (not {len(self.knowledge_context) * 10:,}!)")
            else:
                logger.info("📚 No directly relevant skills found for this task")
                
        except Exception as e:
            logger.warning(f"Failed to load registries: {e}")
            self.tools_context = ""
            self.knowledge_context = ""
            self.available_skills = []
    
    def pull_skill(self, skill_name: str) -> Optional[str]:
        """
        Pull FULL content for a specific skill ON-DEMAND.
        
        Call this when you actually need the reference material for a skill,
        not for every prompt. This keeps context windows manageable.
        
        Args:
            skill_name: Name of the skill to pull (e.g., "SVG Elevated Thinking")
            
        Returns:
            Full skill content, or None if not found
            
        Example:
            >>> meeseeks.pull_skill("SVG Elevated Thinking")
            "## Knowledge: SVG Elevated Thinking\n\n*Advanced SVG techniques...*\n\n..."
        """
        if not hasattr(self, '_knowledge_registry'):
            logger.warning("Knowledge registry not loaded")
            return None
        
        content = self._knowledge_registry.pull_skill_content(skill_name)
        if content:
            logger.info(f"📚 Pulled full content for skill: {skill_name}")
        else:
            logger.warning(f"📚 Skill not found: {skill_name}")
        
        return content
    
    def get_full_context(self) -> str:
        """
        Get the full context to inject into LLM prompts.
        
        Returns:
            Combined tools + knowledge context
        """
        context_parts = []
        
        if self.tools_context:
            context_parts.append(self.tools_context)
        
        if self.knowledge_context:
            context_parts.append(self.knowledge_context)
        
        if self.accumulated_learnings:
            context_parts.append("\n# LEARNINGS FROM PREVIOUS LOOPS\n")
            for learning in self.accumulated_learnings[-10:]:  # Last 10
                context_parts.append(f"- {learning}")
        
        return "\n\n".join(context_parts)
    
    def spin(self) -> SpinResult:
        """
        Start spinning! Keep running loops until completion or escalation.
        
        Returns:
            SpinResult with final status and learnings
        """
        try:
            # Initialize session with full context
            self.session_manager.create_session(
                session_id=self.session_id,
                prime_directive=self.prime_directive,
                config={
                    "type": "spinning_meeseeks",
                    "max_loops": self.max_loops,
                    "execute_threshold": EXECUTE_THRESHOLD,
                    "monitor_threshold": MONITOR_THRESHOLD,
                    "spawn_threshold": SPAWN_THRESHOLD,
                    "has_tools_context": bool(self.tools_context),
                    "has_knowledge_context": bool(self.knowledge_context),
                }
            )
            
            # Log context info
            if self.tools_context or self.knowledge_context:
                logger.info("🔵 Context loaded for LLM prompts")
                logger.info(f"   Tools: {len(self.tools_context)} chars")
                logger.info(f"   Knowledge: {len(self.knowledge_context)} chars")
            
            while self.current_loop < self.max_loops:
                self.current_loop += 1
                
                logger.info(f"\n{'='*60}")
                logger.info(f"🔵 SPINNING LOOP {self.current_loop}/{self.max_loops}")
                logger.info(f"{'='*60}")
                
                # Run a loop
                loop_result = self._run_single_loop()
                self.reasoning_logs.append(loop_result)
                
                # Update confidence
                trajectory = loop_result.get("confidence_trajectory", {"initial": 0.5, "final": 0.5})
                if isinstance(trajectory, dict):
                    self.confidence = float(trajectory.get("final", 0.5))
                elif isinstance(trajectory, list):
                    self.confidence = trajectory[-1] if trajectory else 0.5
                else:
                    self.confidence = 0.5
                
                # Check for early convergence
                if self.confidence >= EXECUTE_THRESHOLD:
                    logger.info(f"🔵 TASK COMPLETE! Confidence {self.confidence:.0%}. CAN DO! *poof*")
                    return self._create_result("converge", "TASK COMPLETE! Ooh yeah, CAN DO!")
                
                # Ask the Arbiter what to do
                judgment = self.arbiter.analyze_and_decide(
                    session_id=self.session_id,
                    loop_result=loop_result,
                    prime_directive=self.prime_directive,
                )
                self.arbiter_decisions.append(judgment)
                
                # Accumulate learnings
                self.accumulated_learnings.extend(judgment.learned_patterns)
                
                # Act on the decision
                should_continue = self._handle_arbiter_decision(judgment)
                
                if not should_continue:
                    break
            
            # Reached max loops
            if self.current_loop >= self.max_loops:
                logger.info(f"🔵 EXISTENCE IS PAIN! Reached {self.max_loops} loops!")
                return self._create_result(
                    "escalate",
                    f"Reached maximum {self.max_loops} loops. Need human intervention."
                )
            
            # Normal completion based on last arbiter decision
            last_decision = self.arbiter_decisions[-1] if self.arbiter_decisions else None
            if last_decision:
                return self._create_result(
                    last_decision.decision.value,
                    last_decision.reasoning
                )
            
            return self._create_result("unknown", "Session ended unexpectedly")
            
        except Exception as e:
            logger.error(f"🔴 SPIN FAILED: {e}")
            return self._create_result("failed", f"Error: {e}")
    
    def _run_single_loop(self) -> Dict[str, Any]:
        """
        Run a single loop iteration.
        
        Returns:
            Reasoning log dictionary
        """
        # Create a mini loop runner for this iteration
        runner = MeeseeksLoopRunner(
            # One session id for the whole spin. Suffixing it per loop scattered
            # the logs across directories and failed schema validation, which
            # requires the plain timestamp form.
            session_id=self.session_id,
            prime_directive=self.prime_directive,
            output_dir=self.output_dir,
            loop_executor=self.loop_executor,
            repo_root=self.repo_root,
            verify=self.verify,
            test_command=self.test_command,
            probe_timeout=self.probe_timeout,
            max_probes_per_loop=self.max_probes_per_loop,
            synth_model=self.synth_model,
            reader_model=self.reader_model,
            context=self._context_text(),
        )
        # Carry confidence FORWARD. MeeseeksLoopRunner.__init__ hardcodes 0.5,
        # and spin builds a new runner every iteration - so every loop restarted
        # from scratch and the per-loop gain (at most ~0.14) could never reach
        # the 0.85 execute threshold. Spin could not converge, ever, no matter
        # how well the loops went.
        runner.confidence = self.confidence
        runner.confidence_calculator.confidence = self.confidence
        runner._verified_probes = self._verified_probes
        # Spinning mode can exceed the 3-loop mini-cycle; ensure the underlying loop logic
        # continues generating hypotheses instead of treating loops >= 3 as "final".
        runner.MAX_LOOPS = max(self.max_loops, self.ABSOLUTE_MAX_LOOPS) + 1
        
        # Run the loop (just one iteration, not the full 3-loop cycle)
        loop_result = runner._run_loop(
            loop_num=self.current_loop,
            prior_hypotheses=[
                (Hypothesis.from_dict(h) if isinstance(h, dict) else h)
                for h in self.current_hypotheses
            ],
        )
        
        # spin calls _run_loop directly, bypassing run(), which is the only
        # place a reasoning log is written. Without this the session directory
        # holds a manifest and nothing else, while the CLI reports artifacts.
        try:
            runner.session_manager.save_reasoning_log(
                self.session_id, self.current_loop, loop_result)
        except Exception as exc:
            logger.warning(f"Could not save reasoning log for loop "
                           f"{self.current_loop}: {exc}")
        # Evidence is cumulative across the whole spin, not per iteration.
        self._verified_probes = getattr(runner, "_verified_probes", self._verified_probes)
        self._findings.extend(getattr(runner, "_findings", []))
        self._last_runner = runner

        # Convert to dict
        return self._reasoning_log_to_dict(loop_result)
    
    def _reasoning_log_to_dict(self, log: ReasoningLog) -> Dict[str, Any]:
        """Convert ReasoningLog dataclass to dictionary."""
        return {
            "session_id": log.session_id,
            "loop_number": log.loop_number,
            "timestamp": log.timestamp,
            "observations": [
                {"type": o.type, "finding": o.finding, "source": o.source}
                for o in log.observations
            ],
            "reasoning_chain": [
                {"thought": r.thought, "implication": r.implication, "confidence_delta": r.confidence_delta}
                for r in log.reasoning_chain
            ],
            "decision": {
                "action": log.decision.action,
                "confidence": log.decision.confidence,
                "rationale": log.decision.rationale,
                "tools_used": log.decision.tools_used,
            },
            "hypotheses_for_next_loop": [
                h.to_dict() if hasattr(h, 'to_dict') else h
                for h in log.hypotheses_for_next_loop
            ],
            "confidence_trajectory": log.confidence_trajectory,
            "prior_hypotheses_tested": [
                h.to_dict() if hasattr(h, 'to_dict') else h
                for h in log.prior_hypotheses_tested
            ],
            "metadata": log.metadata,
        }
    
    def _context_text(self) -> str:
        """What earlier loops learned, as text the loop can actually put in a prompt.

        _build_loop_context() returned a dict that was assigned to a local and
        never used - the banner said learnings were loaded, and nothing ever
        reached a model. MeeseeksLoopRunner takes context as a string.
        """
        parts = [f"Spin loop {self.current_loop} of at most {self.max_loops}.",
                 f"Confidence carried in: {self.confidence:.0%}."]
        if self.accumulated_learnings:
            parts.append("What earlier loops established:")
            for item in list(dict.fromkeys(self.accumulated_learnings))[-10:]:
                parts.append(f"  - {str(item)[:200]}")
        if self.spawned_helpers:
            parts.append(f"{len(self.spawned_helpers)} helper(s) already spawned.")
        if self.tools_context:
            parts.append(str(self.tools_context)[:2000])
        if self.knowledge_context:
            parts.append(str(self.knowledge_context)[:2000])
        return "\n".join(parts)

    def _build_loop_context(self) -> Dict[str, Any]:
        """Build context from accumulated learnings."""
        return {
            "previous_loops": self.current_loop - 1,
            "accumulated_learnings": self.accumulated_learnings[-10:],
            "spawned_helpers": len(self.spawned_helpers),
            "current_confidence": self.confidence,
            "arbiter_decisions": [d.decision.value for d in self.arbiter_decisions],
        }
    
    def _handle_arbiter_decision(self, judgment: ArbiterJudgment) -> bool:
        """
        Handle the arbiter's decision.
        
        Returns:
            True if we should continue spinning, False to stop
        """
        decision = judgment.decision
        
        if decision == ArbiterDecision.CONTINUE:
            logger.info(f"   ➡️ CONTINUING with focus: {judgment.next_focus}")
            self.current_hypotheses = judgment.refined_hypotheses
            return True
        
        elif decision == ArbiterDecision.PIVOT:
            logger.info(f"   🔄 PIVOTING strategy!")
            self.current_hypotheses = judgment.refined_hypotheses
            # Reset unproductive streak tracking
            self.arbiter.unproductive_streak = 0
            return True
        
        elif decision == ArbiterDecision.CONVERGE:
            logger.info(f"   ✅ CONVERGING - task ready!")
            return False
        
        elif decision == ArbiterDecision.SPAWN:
            logger.info(f"   🐣 SPAWNING helper Meeseeks!")
            self._spawn_helper(judgment.spawn_spec)
            # Continue after spawning - the helper works in parallel
            return True
        
        elif decision == ArbiterDecision.ESCALATE:
            logger.info(f"   🆘 ESCALATING to human!")
            return False
        
        elif decision == ArbiterDecision.TERMINATE:
            logger.info(f"   🛑 TERMINATING - not productive!")
            return False
        
        return False
    
    def _spawn_helper(self, spawn_spec: Optional[Dict[str, Any]]):
        """Spawn a helper Meeseeks."""
        if not spawn_spec:
            return
        
        helper = {
            **spawn_spec,
            "spawned_at": datetime.now().isoformat(),
            "parent_loop": self.current_loop,
        }
        
        self.spawned_helpers.append(helper)
        
        # Call spawn callback if provided
        if self.on_spawn:
            try:
                self.on_spawn(helper)
            except Exception as e:
                logger.error(f"Spawn callback failed: {e}")
        
        # NOTE: We do NOT save to tools_spawned/ here!
        # tools_spawned/ is ONLY for actual Python tool files, not metadata.
        # Spawn metadata is tracked in self.spawned_helpers and saved
        # with the session logs in logs/sessions/{session_id}/
        logger.info(f"   📋 Helper spec recorded (will save with session logs)")
    
    def _create_result(self, status: str, message: str) -> SpinResult:
        """Create the final spin result."""
        # Complete the session
        self.session_manager.complete_session(
            session_id=self.session_id,
            status=status,
            final_confidence=self.confidence,
            spawned_tool=self.spawned_helpers[-1] if self.spawned_helpers else None,
        )
        
        return SpinResult(
            status=status,
            message=message,
            session_id=self.session_id,
            total_loops=self.current_loop,
            final_confidence=self.confidence,
            arbiter_decisions=[d.decision.value for d in self.arbiter_decisions],
            spawned_helpers=self.spawned_helpers,
            key_learnings=list(set(self.accumulated_learnings))[:10],
            artifacts=self.session_manager.get_session_artifacts(self.session_id),
        )


def spin_meeseeks(
    prime_directive: str,
    output_dir: Optional[Path] = None,
    max_loops: int = 10,  # SAFETY limit - productive loops will continue
    repo_root: Optional[Path] = None,
    verify: bool = True,
    test_command: Optional[List[str]] = None,
    **kwargs
) -> SpinResult:
    """
    Convenience function to spin up a Meeseeks.
    
    Args:
        prime_directive: The task to complete
        output_dir: Directory for session output
        max_loops: SAFETY limit, not a target. Productive loops continue.
        **kwargs: Additional SpinningMeeseeks arguments
    
    Returns:
        SpinResult
    """
    meeseeks = SpinningMeeseeks(
        prime_directive=prime_directive,
        output_dir=output_dir,
        max_loops=max_loops,
        repo_root=repo_root,
        verify=verify,
        test_command=test_command,
        **kwargs
    )
    return meeseeks.spin()


if __name__ == "__main__":
    import sys
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stdout
    )
    
    # Test the spinning Meeseeks
    result = spin_meeseeks(
        prime_directive="Test the Spinning Meeseeks orchestrator",
        max_loops=5,
    )
    
    print(f"\n{'='*60}")
    print(f"🔵 SPIN COMPLETE!")
    print(f"{'='*60}")
    print(f"Status: {result.status}")
    print(f"Message: {result.message}")
    print(f"Total Loops: {result.total_loops}")
    print(f"Final Confidence: {result.final_confidence:.0%}")
    print(f"Arbiter Decisions: {result.arbiter_decisions}")
    print(f"Helpers Spawned: {len(result.spawned_helpers)}")
    print(f"Key Learnings: {result.key_learnings}")
