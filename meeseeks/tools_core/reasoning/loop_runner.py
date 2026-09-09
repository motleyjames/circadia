#!/usr/bin/env python3
"""
loop_runner.py - MR. MEESEEKS RSI LOOP RUNNER

"I'M MR. MEESEEKS, LOOK AT ME!"

The central orchestrator for Recursive Self-Intelligence loops.

CORE PHILOSOPHY:
The 3-loop structure is a CHECKPOINT RHYTHM, not a thinking limit.
- Loop 1 can go as deep as Loop 10
- Every loop has full reasoning capability
- After each cycle, the Arbiter decides: continue, pivot, or converge
- Loop count alone is NOT a reason to stop

GOLDEN RULES:
1. Every loop MUST produce exactly 3 hypotheses (forces multi-path exploration)
2. Each loop tests hypotheses from the previous loop
3. Self-reflection leaves breadcrumbs for future loops
4. The Arbiter (not loop count) decides when to stop

Confidence Thresholds:
- >= 85%: AUTO_EXECUTE (task complete, *poof*)
- >= 70%: EXECUTE_WITH_MONITORING
- >= 50%: SPAWN helper Meeseeks
- < 50%: ESCALATE to human ("EXISTENCE IS PAIN, JERRY!")
"""

import logging
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, field
from enum import Enum

from .hypothesis import (
    Hypothesis,
    HypothesisResult,
    HypothesisValidator,
    HypothesisValidationError,
)
from .confidence import (
    ConfidenceCalculator,
    EXECUTE_THRESHOLD,
    MONITOR_THRESHOLD,
    SPAWN_THRESHOLD,
)
from .session import SessionManager

# Import REAL RSI components
from .meeseeks_srde import SelfResolvingDissentEngine, create_srde
from .meeseeks_semantic_bridge import SemanticBridge, create_semantic_bridge
from .meeseeks_context_resolver import ContextAwareResolver, create_context_resolver

try:
    from ..core.meeseeks_data_classes import (
        DissentPoint, DissentSeverity, DissentStatus,
        ProbeResult, ProbeType
    )
except ImportError:
    from core.meeseeks_data_classes import (
        DissentPoint, DissentSeverity, DissentStatus,
        ProbeResult, ProbeType
    )

# Import LLM caller
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from core.meeseeks_llm_caller import call_model, call_gemini_pro, get_default_model


def _call_reasoning(prompt: str, system: str) -> str:
    """
    Hypothesis generation and testing, resilient to one provider being down.

    These were hardcoded to call_gemini_pro(). Gemini's free tier returns 503
    under load and 429 above 5 requests/minute, and every failure aborted the
    loop at the fallback confidence. Try the Google model, then Anthropic.
    """
    last = None
    for role in ("google_top", "anthropic_balanced", "anthropic_top"):
        try:
            return call_model(get_default_model(role), prompt, system)
        except Exception as exc:
            last = exc
            logger.warning(f"      {role} unavailable ({type(exc).__name__}), trying next")
    raise last if last else RuntimeError("no reasoning provider available")
from council.meeseeks_council import council_vote

logger = logging.getLogger(__name__)

# Load prompt templates
PROMPTS_DIR = Path(__file__).parent.parent / "prompts" / "tasks"

def _load_prompt(name: str) -> str:
    """Load a prompt template from the prompts/tasks directory."""
    path = PROMPTS_DIR / f"{name}.txt"
    if path.exists():
        return path.read_text()
    logger.warning(f"Prompt template not found: {path}")
    return ""

# Documented in the hypothesis-testing prompt; enforced here because nothing
# stops a model from returning 0.9, or a positive number alongside REFUTED.
_IMPACT_BOUNDS = {
    "CONFIRMED":    (0.05, 0.15),
    "REFUTED":      (-0.10, -0.05),
    "PARTIAL":      (0.02, 0.08),
    "INCONCLUSIVE": (-0.02, 0.02),
}


def _bounded_impact(result: str, raw) -> float:
    """Clamp a model-chosen confidence impact into the range its verdict allows."""
    lo, hi = _IMPACT_BOUNDS.get(result, (-0.02, 0.02))
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = 0.0
    if value < lo or value > hi:
        logger.warning(f"      hypothesis impact {value:+.3f} outside {result} range "
                       f"[{lo:+.2f}, {hi:+.2f}] - clamping")
    return max(lo, min(hi, value))


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Try to find JSON in code blocks first
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except json.JSONDecodeError:
            pass
    
    # Try to find raw JSON
    try:
        # Find the first { and last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            return json.loads(text[start:end+1])
    except json.JSONDecodeError:
        pass
    
    return None


class MeeseeksStatus(Enum):
    """Status of a Meeseeks session"""
    RUNNING = "running"
    TASK_COMPLETE = "task_complete"
    EXECUTE_WITH_MONITORING = "execute_with_monitoring"
    SPAWNED_HELPER = "spawned_helper"
    ESCALATE_TO_HUMAN = "escalate_to_human"
    FAILED = "failed"


@dataclass
class Observation:
    """An observation made during a loop"""
    type: str  # codebase_scan, probe_result, council_vote, tool_output, error
    finding: str
    source: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ReasoningStep:
    """A single step in the reasoning chain"""
    thought: str
    implication: str
    confidence_delta: float = 0.0


@dataclass
class LoopDecision:
    """Decision made at the end of a loop"""
    action: str
    confidence: float
    rationale: str
    tools_used: List[str] = field(default_factory=list)
    council_consulted: bool = False


@dataclass
class SelfReflection:
    """Self-reflection and hints for future loops/sessions"""
    future_hints: List[Dict[str, Any]] = field(default_factory=list)
    incomplete_work: List[Dict[str, Any]] = field(default_factory=list)
    patterns_noticed: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    raw_notes: str = ""


@dataclass
class ReasoningLog:
    """Complete reasoning log for a single loop"""
    session_id: str
    loop_number: int
    timestamp: str
    input: Dict[str, Any]
    observations: List[Observation]
    reasoning_chain: List[ReasoningStep]
    decision: LoopDecision
    hypotheses_for_next_loop: List[Hypothesis]
    confidence_trajectory: Dict[str, Any]
    dissent_tracking: Dict[str, Any]
    arbiter_judgment: Dict[str, Any]
    prior_hypotheses_tested: List[HypothesisResult] = field(default_factory=list)
    escalate_to_human: bool = False
    spawn_tool: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    self_reflection: SelfReflection = field(default_factory=SelfReflection)


@dataclass
class MeeseeksResult:
    """Result of a complete Meeseeks session"""
    status: MeeseeksStatus
    message: str
    session_id: str
    loops_completed: int
    final_confidence: float
    artifacts: List[str] = field(default_factory=list)
    spawned_tool: Optional[Dict[str, Any]] = None
    
    @property
    def success(self) -> bool:
        return self.status in [MeeseeksStatus.TASK_COMPLETE, MeeseeksStatus.EXECUTE_WITH_MONITORING]


class MeeseeksLoopRunner:
    """
    MR. MEESEEKS RSI LOOP RUNNER
    
    "I'M MR. MEESEEKS, LOOK AT ME!"
    
    Runs exactly 3 loops:
    1. OBSERVE & HYPOTHESIZE - What do we know? What might work?
    2. TEST HYPOTHESES - Run probes, council votes, validate
    3. CONVERGE OR SPAWN - Execute, monitor, or spawn helper
    
    Usage:
        runner = MeeseeksLoopRunner(
            session_id="20260117_143022",
            prime_directive="Build feature X",
            output_dir=Path("logs/sessions")
        )
        result = runner.run()
    """
    
    MAX_LOOPS = 3
    REQUIRED_HYPOTHESES = 3
    
    def __init__(
        self,
        session_id: Optional[str] = None,
        prime_directive: str = "",
        output_dir: Optional[Path] = None,
        execute_threshold: float = EXECUTE_THRESHOLD,
        monitor_threshold: float = MONITOR_THRESHOLD,
        spawn_threshold: float = SPAWN_THRESHOLD,
        loop_executor: Optional[Callable] = None,
        context: Optional[str] = None,
        repo_root: Optional[Path] = None,
        verify: bool = True,
        max_probes_per_loop: int = 3,
        test_command: Optional[List[str]] = None,
        probe_timeout: int = 120,
    ):
        """
        Initialize a Meeseeks loop runner.
        
        Args:
            session_id: Unique session ID (auto-generated if not provided)
            prime_directive: The task to complete
            output_dir: Directory for session output
            execute_threshold: Confidence threshold for auto-execute (default: 0.85)
            monitor_threshold: Confidence threshold for execute with monitoring (default: 0.70)
            spawn_threshold: Confidence threshold for spawning helper (default: 0.50)
            loop_executor: Custom function to execute each loop (for testing/extension)
            context: Optional tools/knowledge context to include in prompts
            repo_root: Repository to run verification probes against. Defaults to
                the project containing this meeseeks/ install.
            verify: Synthesize and execute probes from council dissents. When off,
                the loop behaves as before: the semantic bridge stays empty and
                is_answered_by_probe() is always False.
            max_probes_per_loop: Cost ceiling. Synthesis is one model call each.
            test_command: Command a CHECK_INVARIANT probe runs. Defaults to the
                whole suite, which inside a loop can mean minutes per probe -
                pass a fast subset for anything but a final check.
            probe_timeout: Seconds before a probe subprocess is killed.
        """
        self.session_id = session_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.prime_directive = prime_directive
        self.output_dir = output_dir or Path("logs/sessions")
        self.context = context or ""  # Tools + Knowledge context
        
        # Thresholds
        self.execute_threshold = execute_threshold
        self.monitor_threshold = monitor_threshold
        self.spawn_threshold = spawn_threshold
        
        # Components
        self.session_manager = SessionManager(self.output_dir)
        self.hypothesis_validator = HypothesisValidator()
        self.confidence_calculator = ConfidenceCalculator()
        
        # REAL RSI Components (not stubs!)
        self.srde = create_srde()  # Self-Resolving Dissent Engine
        self.semantic_bridge = create_semantic_bridge()  # Probe ↔ Dissent linker

        # Verification. Without this the bridge never receives a probe, so the
        # is_answered_by_probe() checks below are always False and confidence is
        # a hardcoded increment rather than evidence.
        self.verify = verify
        self.max_probes_per_loop = max_probes_per_loop
        self.test_command = test_command
        self.probe_timeout = probe_timeout
        self.repo_root = Path(repo_root) if repo_root else Path(__file__).resolve().parents[3]
        self.probe_factory = None
        if self.verify:
            try:
                try:
                    from ..probes import create_probe_factory, CodeProbeExecutor
                    from ..probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
                except ImportError:
                    # The CLIs put tools_core/ on sys.path, so `probes` is
                    # top-level and `..probes` reaches past the root package.
                    from probes import create_probe_factory, CodeProbeExecutor
                    from probes.meeseeks_llm_synthesizer import LLMProbeSynthesizer
                from .meeseeks_code_context_resolver import CodeContextResolver
                self.probe_factory = create_probe_factory()
                self.probe_factory.set_executor(CodeProbeExecutor())
                self.probe_factory.set_synthesizer(
                    LLMProbeSynthesizer(repo_root=str(self.repo_root)))
                self.code_resolver = CodeContextResolver()
                self.srde.set_context_resolver(self.code_resolver)
                logger.info(f"   🔬 Verification enabled against {self.repo_root}")
            except Exception as exc:
                logger.warning(f"Verification unavailable, running unverified: {exc}")
                self.probe_factory = None
        
        # Custom loop executor (for testing or domain-specific logic)
        self._loop_executor = loop_executor
        
        # State
        self.confidence = 0.5
        # Schema-aligned confidence tracking (see box/templates/reasoning_log.schema.json)
        self.confidence_trajectory: Dict[str, Any] = {"initial": 0.5, "final": 0.5, "updates": []}
        self.reasoning_logs: List[ReasoningLog] = []
        self.current_hypotheses: List[Hypothesis] = []
        
        logger.info("=" * 60)
        logger.info("🔵 I'M MR. MEESEEKS, LOOK AT ME!")
        logger.info("=" * 60)
        logger.info(f"   Session ID: {self.session_id}")
        logger.info(f"   Task: {self.prime_directive[:80]}...")
        logger.info(f"   Thresholds: exec={execute_threshold}, monitor={monitor_threshold}, spawn={spawn_threshold}")
    
    def run(self) -> MeeseeksResult:
        """
        Run the 3-loop RSI cycle.
        
        Returns:
            MeeseeksResult with status, message, and artifacts
        """
        try:
            # Initialize session
            self.session_manager.create_session(
                session_id=self.session_id,
                prime_directive=self.prime_directive,
                config={
                    "max_loops": self.MAX_LOOPS,
                    "execute_threshold": self.execute_threshold,
                    "monitor_threshold": self.monitor_threshold,
                    "spawn_threshold": self.spawn_threshold,
                }
            )
            
            for loop_num in range(1, self.MAX_LOOPS + 1):
                logger.info(f"\n🔵 LOOP {loop_num}/{self.MAX_LOOPS} - LOOK AT ME!")
                
                # Load prior hypotheses to test (if any)
                prior_hypotheses = self.current_hypotheses if loop_num > 1 else []
                
                # Run the loop
                reasoning_log = self._run_loop(loop_num, prior_hypotheses)
                
                # GOLDEN RULE: Must have 3 hypotheses (unless final loop)
                if loop_num < self.MAX_LOOPS:
                    try:
                        self.hypothesis_validator.validate_hypotheses(
                            reasoning_log.hypotheses_for_next_loop,
                            required_count=self.REQUIRED_HYPOTHESES
                        )
                    except HypothesisValidationError as e:
                        logger.error(f"🔴 GOLDEN RULE VIOLATION: {e}")
                        raise
                
                # Save reasoning log
                self.reasoning_logs.append(reasoning_log)
                self.session_manager.save_reasoning_log(
                    self.session_id,
                    loop_num,
                    reasoning_log
                )
                
                # Update state for next loop
                self.confidence = reasoning_log.decision.confidence
                self.confidence_trajectory = reasoning_log.confidence_trajectory
                self.current_hypotheses = reasoning_log.hypotheses_for_next_loop
                
                # Check for early exit on high confidence
                if self.confidence >= self.execute_threshold:
                    logger.info(f"🔵 TASK COMPLETE! Ooh yeah, CAN DO! *poof*")
                    return self._create_result(
                        status=MeeseeksStatus.TASK_COMPLETE,
                        message="🔵 TASK COMPLETE! Ooh yeah, CAN DO! *poof*",
                        loops_completed=loop_num
                    )
            
            # After 3 loops, make final decision
            return self._final_decision()
            
        except Exception as e:
            logger.error(f"🔴 Session failed: {e}")
            return self._create_result(
                status=MeeseeksStatus.FAILED,
                message=f"🔴 EXISTENCE IS PAIN! Error: {e}",
                loops_completed=len(self.reasoning_logs)
            )
    
    def _run_loop(
        self,
        loop_num: int,
        prior_hypotheses: List[Hypothesis]
    ) -> ReasoningLog:
        """
        Run a single loop of the RSI cycle.
        
        Args:
            loop_num: Current loop number (1, 2, or 3)
            prior_hypotheses: Hypotheses from previous loop to test
        
        Returns:
            ReasoningLog with observations, reasoning, decision, and new hypotheses
        """
        start_time = datetime.now()
        prior_loop_confidence = self.confidence
        
        # Test prior hypotheses (if any)
        hypothesis_results = []
        if prior_hypotheses:
            logger.info(f"   Testing {len(prior_hypotheses)} hypotheses from previous loop...")
            for h in prior_hypotheses:
                result = self._test_hypothesis(h)
                hypothesis_results.append(result)
                
                # Update confidence based on result
                self.confidence = self.confidence_calculator.adjust(
                    self.confidence,
                    result.confidence_impact,
                    reason=f"{h.id}: {result.result} - {result.evidence}",
                    source="hypothesis_test",
                )
                
                status = "✓" if result.result == "CONFIRMED" else "✗" if result.result == "REFUTED" else "◐"
                logger.info(f"      {status} {h.id}: {result.result} (impact: {result.confidence_impact:+.2f})")
        
        # Use custom loop executor if provided, otherwise use default
        if self._loop_executor:
            result = self._loop_executor(
                loop_num=loop_num,
                prime_directive=self.prime_directive,
                hypothesis_results=hypothesis_results,
                current_confidence=self.confidence,
            )
            # Handle both 4-tuple (old) and 5-tuple (new with self_reflection)
            if len(result) == 5:
                observations, reasoning_chain, decision, new_hypotheses, self_reflection = result
            else:
                observations, reasoning_chain, decision, new_hypotheses = result
                self_reflection = None
        else:
            observations, reasoning_chain, decision, new_hypotheses, self_reflection = self._default_loop_executor(
                loop_num=loop_num,
                hypothesis_results=hypothesis_results
            )
        
        # Ensure self_reflection is always present (required by schema)
        if self_reflection is None:
            self_reflection = SelfReflection()
        
        # Reconcile confidence: if loop executor changed it, track that as an update too
        if decision.confidence != self.confidence:
            delta = decision.confidence - self.confidence
            self.confidence = self.confidence_calculator.adjust(
                self.confidence,
                delta,
                reason=f"Loop {loop_num} decision confidence update",
                source="loop_decision",
            )
            decision.confidence = self.confidence
        
        # Build schema-aligned confidence trajectory object from tracked adjustments
        updates = []
        for adj in self.confidence_calculator.adjustments:
            signal_type = "positive" if adj.delta > 0 else "negative" if adj.delta < 0 else "neutral"
            updates.append(
                {
                    "source": adj.source,
                    "signal_type": signal_type,
                    "delta": adj.delta,
                    "evidence": adj.reason,
                    "timestamp": adj.timestamp,
                }
            )
        
        confidence_trajectory = {
            "initial": self.confidence_calculator.trajectory[0] if self.confidence_calculator.trajectory else 0.5,
            "final": self.confidence,
            "updates": updates,
        }
        self.confidence_trajectory = confidence_trajectory
        
        # Minimal dissent tracking (full SRDE/bridge integration lives elsewhere)
        dissent_tracking = {
            "dissents_raised": [],
            "dissents_resolved": [],
            "resolution_rate": 1.0,
            "srde_stats": {
                "context_resolved": 0,
                "probe_cross_ref_resolved": 0,
                "pattern_resolved": 0,
                "needs_human": 0,
            },
            "unresolved_critical": [],
        }
        
        # Arbiter judgment is required for schema's hypothesis-count conditional logic
        arbiter_decision = "CONVERGE" if loop_num >= self.MAX_LOOPS else "CONTINUE"
        arbiter_judgment = {
            "decision": arbiter_decision,
            "reasoning": f"Loop {loop_num} completed",
            "next_focus": "Converge" if arbiter_decision == "CONVERGE" else "Continue hypothesis testing",
            "confidence_in_decision": self.confidence,
            "learned_patterns": self_reflection.patterns_noticed,
        }
        
        # Calculate metadata
        duration = (datetime.now() - start_time).total_seconds()
        input_context = {
            "prime_directive": self.prime_directive,
            "prior_hypotheses_tested": hypothesis_results,
            "prior_loop_confidence": prior_loop_confidence,
            "inherited_dissents": [],
            "mental_model_state": {},
            "tools_context": self.context,
            "knowledge_context": self.context,
        }
        
        return ReasoningLog(
            session_id=self.session_id,
            loop_number=loop_num,
            timestamp=datetime.now().isoformat(),
            input=input_context,
            observations=observations,
            reasoning_chain=reasoning_chain,
            decision=decision,
            hypotheses_for_next_loop=new_hypotheses,
            confidence_trajectory=confidence_trajectory,
            dissent_tracking=dissent_tracking,
            arbiter_judgment=arbiter_judgment,
            prior_hypotheses_tested=hypothesis_results,
            metadata={"duration_seconds": duration},
            self_reflection=self_reflection
        )
    
    def _default_loop_executor(
        self,
        loop_num: int,
        hypothesis_results: List[HypothesisResult]
    ) -> tuple:
        """
        Default loop executor - USES REAL RSI COMPONENTS!
        
        Integrates:
        - Council voting for multi-model deliberation
        - SRDE for self-resolving dissents
        - Semantic bridge for linking probes to dissents
        - LLM calls for hypothesis generation
        
        Returns:
            Tuple of (observations, reasoning_chain, decision, new_hypotheses, self_reflection)
        """
        logger.info(f"   🧠 Loop {loop_num}: Running FULL RSI cycle...")
        
        observations = []
        reasoning_chain = []
        dissents_resolved = 0
        dissents_total = 0
        
        # Build context from hypothesis results
        hypothesis_context = ""
        if hypothesis_results:
            hypothesis_context = "\n".join([
                f"- {r.id}: {r.result} - {r.evidence[:100]}..." 
                for r in hypothesis_results
            ])
        
        # ======================================================================
        # PHASE 1: COUNCIL VOTE (Multi-model deliberation)
        # ======================================================================
        logger.info(f"   📋 Phase 1: Council deliberation...")
        
        try:
            council_question = f"Analyze this task and identify potential approaches:\n\nTask: {self.prime_directive}\n\nPrevious results: {hypothesis_context if hypothesis_context else 'None yet'}"
            
            council_result = council_vote(
                question=council_question,
                context=f"Loop {loop_num}, Confidence: {self.confidence:.0%}",
            )
            
            # CouncilDecision is a dataclass, access attributes directly
            observations.append(Observation(
                type="council_vote",
                finding=f"Council deliberation complete: {council_result.final_decision[:100] if council_result.final_decision else 'No decision'}",
                source="multi-model-council"
            ))
            
            # Extract dissents from council dissenting_points and opinions
            council_dissents = []
            
            # Get dissenting points from the council decision
            for dissent in council_result.dissenting_points:
                council_dissents.append({
                    'id': f"d_{loop_num}_{len(council_dissents)}",
                    'content': dissent,
                    'source': 'council_dissent'
                })
            
            # Also extract considerations from each opinion as potential dissents
            for opinion in council_result.opinions:
                for consideration in opinion.considerations:
                    if any(word in consideration.lower() for word in ['concern', 'risk', 'issue', 'problem', 'warning']):
                        council_dissents.append({
                            'id': f"d_{loop_num}_{len(council_dissents)}",
                            'content': consideration,
                            'source': opinion.model
                        })
            
            dissents_total = len(council_dissents)
            logger.info(f"      Council raised {dissents_total} dissents")
            
        except Exception as e:
            logger.warning(f"      Council vote failed: {e}")
            council_dissents = []
            observations.append(Observation(
                type="council_error",
                finding=f"Council failed: {str(e)[:100]}",
                source="council"
            ))
        
        # ======================================================================
        # PHASE 2: SELF-RESOLVE DISSENTS (SRDE)
        # ======================================================================
        if council_dissents:
            logger.info(f"   🔧 Phase 2: Self-resolving {len(council_dissents)} dissents...")
            
            self._run_probes(council_dissents, loop_num)

            for dissent in council_dissents:
                dissent_id = dissent['id']
                content = dissent['content']
                source = dissent.get('source', 'unknown')
                
                # Create proper DissentPoint object
                dissent_point = DissentPoint(
                    id=dissent_id,
                    content=content,
                    raised_by=source,
                    raised_loop=loop_num,
                    severity=DissentSeverity.MEDIUM,
                    status=DissentStatus.UNRESOLVED,
                )
                
                # Register with semantic bridge
                self.semantic_bridge.register_dissent(dissent_id, dissent_point)

                # A concern the synthesizer declined is not an unsolved puzzle -
                # it is a judgement call, and we know that because a model read
                # it and said so. Sending it to SRDE anyway would report the
                # wrong reason, and hand it to pattern resolvers that assert
                # ("backups are created automatically") without checking.
                declined = getattr(self, "_declined", {}).get(dissent_id)
                if declined:
                    kind, why = declined
                    label = ("JUDGEMENT CALL - no probe can settle this"
                             if kind == "judgement" else
                             "UNPROBED - this harness has no probe type for it")
                    logger.info(f"      ⃠ {dissent_id}: {label}")
                    logger.info(f"         Dissent: {content[:100]}{'...' if len(content) > 100 else ''}")
                    logger.info(f"         Why: {why[:100]}")
                    continue
                
                # Check if already answered by a previous probe
                if self.semantic_bridge.is_answered_by_probe(dissent_id):
                    answer = self.semantic_bridge.get_answer_for_dissent(dissent_id)
                    logger.info(f"      ✓ {dissent_id}: Already answered by probe")
                    dissents_resolved += 1
                    continue
                
                # Try SRDE resolution
                try:
                    result = self.srde.attempt_resolution(dissent_id, content)
                    
                    if result.status.value in ['resolved', 'RESOLVED']:
                        dissents_resolved += 1
                        self.confidence = min(1.0, self.confidence + result.confidence_impact)
                        logger.info(f"      ✓ {dissent_id}: RESOLVED via {result.method}")
                        logger.info(f"         Evidence: {result.evidence[:80]}...")
                    elif result.status.value in ['partially_resolved', 'PARTIALLY_RESOLVED']:
                        dissents_resolved += 0.5
                        self.confidence = min(1.0, self.confidence + result.confidence_impact * 0.5)
                        logger.info(f"      ◐ {dissent_id}: PARTIAL via {result.method}")
                        logger.info(f"         Evidence: {result.evidence[:80]}...")
                    elif result.status.value in ['needs_human', 'NEEDS_HUMAN']:
                        # Evidence CONFIRMED the concern. That is the opposite of
                        # resolved, so it must not count toward dissents_resolved -
                        # and the probe's negative impact is applied, because
                        # proving a concern real should move confidence down, not
                        # leave it exactly where a silent "no_resolver" left it.
                        self.confidence = max(0.0, self.confidence + min(0.0, result.confidence_impact))
                        logger.info(f"      ⚠ {dissent_id}: CONFIRMED by evidence - needs a person")
                        logger.info(f"         Dissent: {content[:100]}{'...' if len(content) > 100 else ''}")
                        logger.info(f"         Evidence: {result.evidence[:100]}")
                    else:
                        # ACTUALLY SHOW what the dissent was and why it couldn't be resolved!
                        logger.info(f"      ✗ {dissent_id}: UNRESOLVED")
                        logger.info(f"         Dissent: {content[:100]}{'...' if len(content) > 100 else ''}")
                        logger.info(f"         Reason: {result.evidence[:80] if result.evidence else 'No matching resolution pattern'}")
                        
                except Exception as e:
                    logger.warning(f"      SRDE failed for {dissent_id}: {e}")
                    logger.warning(f"         Dissent was: {content[:80]}...")
            
            observations.append(Observation(
                type="srde_resolution",
                finding=f"SRDE resolved {dissents_resolved}/{dissents_total} dissents",
                source="srde"
            ))
            
            reasoning_chain.append(ReasoningStep(
                thought=f"Self-resolved {dissents_resolved}/{dissents_total} council dissents",
                implication="Higher resolution rate = higher confidence",
                confidence_delta=0.05 * (dissents_resolved / max(dissents_total, 1))
            ))
        
        # ======================================================================
        # PHASE 3: LLM HYPOTHESIS GENERATION
        # ======================================================================
        logger.info(f"   🎯 Phase 3: Generating hypotheses...")
        
        prompt = f"""# HYPOTHESIS GENERATION

You are Mr. Meeseeks generating testable hypotheses for the RSI loop system.

## Prime Directive
{self.prime_directive}

## Current State
- Loop Number: {loop_num}
- Current Confidence: {self.confidence:.0%}
- Council Dissents Resolved: {dissents_resolved}/{dissents_total}
- Previous Hypotheses Tested: {len(hypothesis_results)}

## Previous Results
{hypothesis_context if hypothesis_context else "First loop - no prior results"}

## Your Task
Generate exactly 3 testable hypotheses for the next loop to investigate.

## Output Format
Return ONLY valid JSON:

```json
{{
  "hypotheses": [
    {{
      "id": "H1",
      "hypothesis": "Clear statement of what we believe (min 20 chars)",
      "test_method": "Specific steps to test this (min 20 chars)",
      "expected_outcome": "What we expect if true",
      "priority": "critical|high|medium|low",
      "category": "architecture|implementation|integration|correctness"
    }},
    {{"id": "H2", "hypothesis": "...", "test_method": "...", "expected_outcome": "...", "priority": "high", "category": "implementation"}},
    {{"id": "H3", "hypothesis": "...", "test_method": "...", "expected_outcome": "...", "priority": "medium", "category": "correctness"}}
  ]
}}
```

Generate your 3 hypotheses now:"""
        
        try:
            response = _call_reasoning(
                prompt,
                "You are Mr. Meeseeks. Return ONLY valid JSON with exactly 3 hypotheses."
            )
            logger.info(f"      ✅ LLM response received ({len(response)} chars)")
            
            observations.append(Observation(
                type="llm_analysis",
                finding=f"Loop {loop_num}: LLM generated hypotheses",
                source=get_default_model("google_top")
            ))
            
        except Exception as e:
            logger.error(f"      ❌ LLM call failed: {e}")
            return self._fallback_loop_output(loop_num, str(e))
        
        # Parse the response
        parsed = _extract_json(response)
        
        # Build reasoning based on all phases
        reasoning_chain.append(ReasoningStep(
            thought=f"Loop {loop_num}: Full RSI cycle complete",
            implication="Council voted, dissents resolved, hypotheses generated",
            confidence_delta=0.08
        ))
        
        # Calculate confidence.
        #
        # This was `base_boost = 0.05` plus positive terms only, which meant
        # every loop ended more confident than it began no matter what it found.
        # A loop whose council raised four concerns and settled none of them
        # still gained five points, and a loop that raised nothing at all gained
        # them for silence - the same "confidence without evidence" that put
        # unverified probes on the semantic bridge. Confidence is now earned:
        # settled concerns and confirmed hypotheses raise it, unsettled concerns
        # lower it, and a loop that established nothing moves it nowhere.
        base_boost = 0.0
        if hypothesis_results:
            confirmed = sum(1 for r in hypothesis_results if r.result == "CONFIRMED")
            base_boost += confirmed * 0.03
        if dissents_total > 0:
            resolution_rate = dissents_resolved / dissents_total
            base_boost += resolution_rate * 0.05
            base_boost -= (1.0 - resolution_rate) * 0.05

        new_confidence = max(0.0, min(0.95, self.confidence + base_boost))
        
        decision = LoopDecision(
            action=f"Loop {loop_num}: Full RSI cycle - council + SRDE + hypotheses",
            confidence=new_confidence,
            rationale=f"Council: {dissents_total} dissents, SRDE resolved: {dissents_resolved}, Confidence: {new_confidence:.0%}"
        )
        
        # Parse hypotheses from LLM response
        new_hypotheses = []
        if parsed and "hypotheses" in parsed:
            for h in parsed["hypotheses"][:3]:
                try:
                    new_hypotheses.append(Hypothesis(
                        id=h.get("id", f"H{len(new_hypotheses)+1}"),
                        hypothesis=h.get("hypothesis", "Unknown hypothesis"),
                        test_method=h.get("test_method", "Manual verification"),
                        expected_outcome=h.get("expected_outcome", "Positive result"),
                        priority=h.get("priority", "medium"),
                        category=h.get("category", "implementation"),
                        created_in_loop=loop_num
                    ))
                except Exception as e:
                    logger.warning(f"      Failed to parse hypothesis: {e}")
        
        # Ensure exactly 3 hypotheses
        while len(new_hypotheses) < 3 and loop_num < self.MAX_LOOPS:
            new_hypotheses.append(Hypothesis(
                id=f"H{len(new_hypotheses)+1}",
                hypothesis=f"Further investigate aspect {len(new_hypotheses)+1} of the task",
                test_method="Detailed analysis and verification",
                expected_outcome="Clear understanding of this aspect",
                priority="medium",
                created_in_loop=loop_num
            ))
        
        # Self-reflection with real data
        self_reflection = SelfReflection(
            future_hints=[
                {
                    "context": f"Loop {loop_num} RSI cycle",
                    "hint": f"Council raised {dissents_total} dissents, SRDE resolved {dissents_resolved}. Confidence now {new_confidence:.0%}.",
                    "importance": "critical" if dissents_total - dissents_resolved > 2 else "useful"
                }
            ],
            patterns_noticed=[
                f"Resolution rate: {dissents_resolved}/{dissents_total}" if dissents_total > 0 else "No dissents raised",
                f"Generated {len(new_hypotheses)} hypotheses for testing"
            ],
            raw_notes=f"Loop {loop_num} complete. Full RSI: Council + SRDE + LLM. Confidence: {self.confidence:.0%} -> {new_confidence:.0%}"
        )
        
        return observations, reasoning_chain, decision, new_hypotheses, self_reflection
    
    def _run_probes(self, council_dissents: List[Dict[str, Any]], loop_num: int) -> None:
        """
        Turn dissents into probes, run them, and put the evidence on the bridge.

        This is what makes is_answered_by_probe() capable of returning True and
        gives SRDE something real to cross-reference. Failures are non-fatal:
        the loop continues unverified rather than dying.
        """
        self._declined: Dict[str, str] = {}
        if not self.probe_factory or not council_dissents:
            return
        selected = council_dissents[: self.max_probes_per_loop]
        logger.info(f"   🔬 Synthesizing probes for {len(selected)} dissent(s)...")
        synth = getattr(self.probe_factory, "synthesizer", None)
        probes = []
        for dissent in selected:
            before = len(getattr(synth, "skipped", None) or [])
            try:
                probe = self.probe_factory._synthesize_from_dissent(
                    dissent['content'], dissent.get('source', 'council'))
                if probe:
                    probes.append((dissent['id'], dissent['content'], probe))
            except Exception as exc:
                logger.warning(f"      probe synthesis failed: {exc}")
                continue
            # The synthesizer knows WHY it produced nothing - the concern is a
            # judgement call, or it asked for a probe type nothing implements.
            # Without carrying that reason out, the dissent reaches SRDE and is
            # reported as "no resolution strategy", which is not what happened.
            after = getattr(synth, "skipped", None) or []
            if len(after) > before:
                entry = after[-1]
                self._declined[dissent['id']] = (
                    entry.get("kind", "judgement"),
                    entry.get("why", "not checkable by probe"),
                )
        if not probes:
            logger.info("      no dissent yielded a runnable probe this loop")
            return

        ctx = {"repo_root": str(self.repo_root), "timeout": self.probe_timeout}
        if self.test_command:
            ctx["test_command"] = self.test_command
        elif any(p.probe_type is ProbeType.CHECK_INVARIANT for _, _, p in probes):
            logger.warning(
                f"      no --test-command set: a suite probe will run the WHOLE "
                f"suite and will be killed at {self.probe_timeout}s. Pass a fast "
                f"subset unless this is a final check.")
        for dissent_id, dissent_text, probe in probes:
            try:
                result = self.probe_factory.executor.execute(probe, ctx)
            except Exception as exc:
                logger.warning(f"      probe {probe.name} failed: {exc}")
                continue
            mark = "verified" if result.verified else (
                "unverified" if result.confidence_impact == 0.0 else "refuted")
            # SRDE and the resolver take every result, including refutations.
            # The BRIDGE only takes affirmative evidence: is_answered_by_probe()
            # feeds dissents_resolved, which feeds confidence, so registering a
            # refutation there would raise confidence for proving a concern real.
            if not result.verified:
                if result.confidence_impact != 0.0:
                    self.srde.register_probe_result(result.probe_id, result)
                    if getattr(self, "code_resolver", None) is not None:
                        self.code_resolver.add_probe(result, origin_dissent=dissent_text)
                    logger.info(f"      🔬 {result.probe_id}: {mark} (not on bridge) — "
                                f"{result.evidence[:60]}")
                    continue
                # SemanticBridge.is_answered_by_probe() only checks link strength,
                # never whether the probe concluded anything. Registering an
                # UNVERIFIED probe therefore marks the dissent answered and skips
                # SRDE entirely - a false resolution. Keep it off the bridge.
                logger.info(f"      🔬 {result.probe_id}: {mark} (not registered) — "
                            f"{result.evidence[:60]}")
                continue
            self.semantic_bridge.register_probe(result.probe_id, result)
            self.srde.register_probe_result(result.probe_id, result)
            if getattr(self, "code_resolver", None) is not None:
                self.code_resolver.add_probe(result, origin_dissent=dissent_text)
            logger.info(f"      🔬 {result.probe_id}: {mark} — {result.evidence[:70]}")


    def _fallback_loop_output(self, loop_num: int, error: str) -> tuple:
        """Fallback output when LLM call fails."""
        observations = [
            Observation(type="error", finding=f"LLM call failed: {error}")
        ]
        reasoning_chain = [
            ReasoningStep(thought="LLM unavailable", implication="Using fallback", confidence_delta=-0.05)
        ]
        decision = LoopDecision(
            action="Fallback mode",
            confidence=max(0.3, self.confidence - 0.05),
            rationale=f"LLM error: {error[:100]}"
        )
        hypotheses = [
            Hypothesis(id=f"H{i}", hypothesis=f"Retry analysis {i}", test_method="Retry LLM call", 
                      expected_outcome="Successful response", priority="high", created_in_loop=loop_num)
            for i in range(1, 4)
        ]
        self_reflection = SelfReflection(
            future_hints=[{"context": "LLM error", "hint": error[:200], "importance": "critical"}],
            warnings=[f"LLM call failed in loop {loop_num}"],
            raw_notes=error
        )
        return observations, reasoning_chain, decision, hypotheses, self_reflection
    
    def _test_hypothesis(self, hypothesis: Hypothesis) -> HypothesisResult:
        """
        Test a hypothesis using LLM analysis and semantic bridge.
        
        Calls the LLM to evaluate the hypothesis against the task context.
        Results are registered with the semantic bridge for cross-referencing.
        """
        logger.info(f"      Testing {hypothesis.id}: {hypothesis.hypothesis[:50]}...")
        
        # Check if semantic bridge already has an answer for this hypothesis
        probe_id = f"hypothesis_{hypothesis.id}"
        if self.semantic_bridge.is_answered_by_probe(hypothesis.id):
            answer = self.semantic_bridge.get_answer_for_dissent(hypothesis.id)
            logger.info(f"      ✓ Already answered by semantic bridge")
            return HypothesisResult(
                id=hypothesis.id,
                result="CONFIRMED" if "confirm" in str(answer).lower() else "PARTIAL",
                evidence=f"Semantic bridge: {answer}",
                confidence_impact=0.08
            )
        
        # Build the test prompt directly
        prompt = f"""# HYPOTHESIS TESTING

Test this hypothesis as part of the Meeseeks RSI system.

## The Hypothesis
- ID: {hypothesis.id}
- Hypothesis: {hypothesis.hypothesis}
- Test Method: {hypothesis.test_method}
- Expected Outcome: {hypothesis.expected_outcome}
- Priority: {hypothesis.priority}

## Task Context
{self.prime_directive}

## Your Task
Evaluate this hypothesis and determine the result:
- CONFIRMED: The hypothesis was proven true
- REFUTED: The hypothesis was proven false  
- PARTIAL: Mixed results or partially true
- INCONCLUSIVE: Cannot determine

## Output Format
Return ONLY valid JSON:

```json
{{
  "hypothesis_id": "{hypothesis.id}",
  "result": "CONFIRMED|REFUTED|PARTIAL|INCONCLUSIVE",
  "evidence": "Detailed explanation of your findings",
  "confidence_impact": 0.05
}}
```

Confidence impact guidelines:
- CONFIRMED: +0.05 to +0.15
- REFUTED: -0.05 to -0.10
- PARTIAL: +0.02 to +0.08
- INCONCLUSIVE: -0.02 to +0.02

Test this hypothesis now:"""
        
        try:
            response = _call_reasoning(
                prompt,
                "You are testing hypotheses for the Meeseeks RSI system. Analyze carefully and return valid JSON with your assessment."
            )
            
            parsed = _extract_json(response)
            if parsed:
                result_str = parsed.get("result", "PARTIAL").upper()
                if result_str not in ["CONFIRMED", "REFUTED", "PARTIAL", "INCONCLUSIVE"]:
                    result_str = "PARTIAL"
                
                hyp_result = HypothesisResult(
                    id=hypothesis.id,
                    result=result_str,
                    evidence=parsed.get("evidence", response[:200]),
                    confidence_impact=_bounded_impact(
                        result_str, parsed.get("confidence_impact")),
                )
            else:
                # Unparseable output is not a verdict. This used to read
                # CONFIRMED out of the substring "true" appearing anywhere in
                # the response - including in "cannot be confirmed" or "it is
                # not true" - and then award +0.05 for it. That is the same
                # substring-inference mistake the regex probe synthesizer made
                # with "diff" inside "different".
                logger.warning(f"      hypothesis {hypothesis.id}: unparseable response, "
                               f"recording INCONCLUSIVE")
                hyp_result = HypothesisResult(
                    id=hypothesis.id,
                    result="INCONCLUSIVE",
                    evidence=f"Model response could not be parsed as a verdict: {response[:200]}",
                    confidence_impact=0.0,
                )
            
            # Register result with semantic bridge for cross-referencing.
            # NOTE: nothing executed here - this is a model's assessment, not a
            # probe. It is deliberately NOT typed CHECK_INVARIANT, which means
            # "the suite ran and passed" and is treated as strong evidence by
            # CodeContextResolver.
            probe_result = ProbeResult(
                probe_type=ProbeType.CHECK_VALUE,
                probe_id=f"hypothesis_{hypothesis.id}",
                target=hypothesis.hypothesis[:100] if hasattr(hypothesis, 'hypothesis') else str(hypothesis)[:100],
                result=hyp_result.result,
                verified=(hyp_result.result == "CONFIRMED"),
                confidence_impact=hyp_result.confidence_impact,
                evidence=hyp_result.evidence,
            )
            self.semantic_bridge.register_probe(
                probe_id=f"hypothesis_{hypothesis.id}",
                result=probe_result
            )
            
            return hyp_result
                
        except Exception as e:
            logger.warning(f"      ⚠️ Hypothesis test failed: {e}")
            return HypothesisResult(
                id=hypothesis.id,
                result="INCONCLUSIVE",
                evidence=f"Test failed: {str(e)[:100]}",
                confidence_impact=0.0
            )
    
    def _final_decision(self) -> MeeseeksResult:
        """
        Make the final decision after 3 loops.
        
        Based on confidence:
        - >= monitor_threshold: EXECUTE_WITH_MONITORING
        - >= spawn_threshold: SPAWNED_HELPER
        - < spawn_threshold: ESCALATE_TO_HUMAN
        """
        logger.info(f"\n🔵 FINAL DECISION - Confidence: {self.confidence:.0%}")
        
        if self.confidence >= self.monitor_threshold:
            logger.info("   Executing with monitoring... *nervous*")
            return self._create_result(
                status=MeeseeksStatus.EXECUTE_WITH_MONITORING,
                message="🔵 Executing with monitoring... *nervous*",
                loops_completed=self.MAX_LOOPS
            )
        
        elif self.confidence >= self.spawn_threshold:
            # Spawn a helper Meeseeks
            spawned_tool = self._spawn_helper()
            logger.info(f"   Spawning helper Meeseeks to tools_spawned/...")
            return self._create_result(
                status=MeeseeksStatus.SPAWNED_HELPER,
                message="🔵 Spawning more Meeseeks to spawned/...",
                loops_completed=self.MAX_LOOPS,
                spawned_tool=spawned_tool
            )
        
        else:
            logger.info("   EXISTENCE IS PAIN, JERRY! Need human help.")
            return self._create_result(
                status=MeeseeksStatus.ESCALATE_TO_HUMAN,
                message="🔵 EXISTENCE IS PAIN, JERRY! Need human help.",
                loops_completed=self.MAX_LOOPS
            )
    
    def _spawn_helper(self) -> Dict[str, Any]:
        """
        Spawn a helper tool in tools_spawned/.
        
        Returns:
            Dict with tool_id, path, and reason
        """
        tool_id = f"helper_{self.session_id}"
        tool_path = f"tools_spawned/{tool_id}"
        
        # This would create the actual tool - placeholder for now
        return {
            "tool_id": tool_id,
            "path": tool_path,
            "reason": f"Confidence {self.confidence:.0%} insufficient. Spawning helper for: {self.prime_directive[:100]}",
            "hypotheses_to_pursue": [h.hypothesis for h in self.current_hypotheses]
        }
    
    def _create_result(
        self,
        status: MeeseeksStatus,
        message: str,
        loops_completed: int,
        spawned_tool: Optional[Dict[str, Any]] = None
    ) -> MeeseeksResult:
        """Create and save the final result."""
        result = MeeseeksResult(
            status=status,
            message=message,
            session_id=self.session_id,
            loops_completed=loops_completed,
            final_confidence=self.confidence,
            artifacts=self.session_manager.get_session_artifacts(self.session_id),
            spawned_tool=spawned_tool
        )
        
        # Update session manifest
        self.session_manager.complete_session(
            session_id=self.session_id,
            status=status.value,
            final_confidence=self.confidence,
            spawned_tool=spawned_tool
        )
        
        return result


def run_meeseeks(
    prime_directive: str,
    output_dir: Optional[Path] = None,
    **kwargs
) -> MeeseeksResult:
    """
    Convenience function to run a Meeseeks session.
    
    Args:
        prime_directive: The task to complete
        output_dir: Directory for session output
        **kwargs: Additional arguments for MeeseeksLoopRunner
    
    Returns:
        MeeseeksResult
    """
    runner = MeeseeksLoopRunner(
        prime_directive=prime_directive,
        output_dir=output_dir,
        **kwargs
    )
    return runner.run()


if __name__ == "__main__":
    # Test the loop runner
    import sys
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stdout
    )
    
    result = run_meeseeks(
        prime_directive="Test the Meeseeks loop runner",
        output_dir=Path("logs/sessions")
    )
    
    print(f"\n{'='*60}")
    print(f"Result: {result.status.value}")
    print(f"Message: {result.message}")
    print(f"Loops: {result.loops_completed}")
    print(f"Confidence: {result.final_confidence:.0%}")
