"""
Meeseeks Async Council - Parallel LLM Execution

"I'M MR. MEESEEKS! I CAN RUN ALL MY FRIENDS IN PARALLEL!"

Runs all council members (OpenAI, Anthropic, Gemini) in PARALLEL using asyncio.

Instead of:
  OpenAI (15s) → Anthropic (15s) → Gemini (15s) = 45s TOTAL

We get:
  OpenAI ─┐
  Anthropic ─┼─→ All finish in ~15s (the slowest one)
  Gemini ─┘

This 3x speedup is critical for responsive RSI.

IMPROVEMENTS IMPLEMENTED (RSI-identified):
1. Native Gemini async via generate_content_async()
2. Retry with exponential backoff via tenacity
3. Enforced timeout_seconds via asyncio.wait_for
"""

import os
import asyncio
import logging
import json
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime

# Retry decorator - install with: pip install tenacity
try:
    from tenacity import (
        retry,
        stop_after_attempt,
        wait_exponential,
        retry_if_exception_type,
    )
    TENACITY_AVAILABLE = True
except ImportError:
    TENACITY_AVAILABLE = False
    # Fallback: no-op decorator
    def retry(*args, **kwargs):
        def decorator(fn):
            return fn
        return decorator
    stop_after_attempt = lambda x: None
    wait_exponential = lambda **kw: None
    retry_if_exception_type = lambda x: None

# Import from core data classes - try both import paths
try:
    from core.meeseeks_data_classes import (
        CouncilVote,
        CouncilDeliberation,
        DissentPoint,
    )
    from core.meeseeks_llm_caller import get_default_model
except ImportError:
    from tools_core.core.meeseeks_data_classes import (
        CouncilVote,
        CouncilDeliberation,
        DissentPoint,
    )
    from tools_core.core.meeseeks_llm_caller import get_default_model

logger = logging.getLogger(__name__)


@dataclass
class AsyncCouncilConfig:
    """Configuration for async council. Model fields resolve from model_roles at instantiation."""
    openai_model: Optional[str] = None
    anthropic_model: Optional[str] = None
    gemini_model: Optional[str] = None
    timeout_seconds: float = 180.0  # 3 minutes — Opus needs time for thorough code reviews
    max_retries: int = 3  # Used by tenacity
    max_tokens: int = 32000  # Max output tokens per council member

    def __post_init__(self):
        if self.openai_model is None:
            self.openai_model = get_default_model("openai_top")
        if self.anthropic_model is None:
            self.anthropic_model = get_default_model("anthropic_top")
        if self.gemini_model is None:
            self.gemini_model = get_default_model("google_top")


@dataclass 
class VisualVoteResult:
    """Result from a visual analysis vote"""
    model_name: str
    passed: bool
    confidence: float
    observations: str
    anomalies: List[Dict[str, str]] = field(default_factory=list)


# =============================================================================
# RETRY DECORATOR - Exponential backoff for transient failures
# =============================================================================

def _create_retry_decorator(max_retries: int = 3):
    """Create a retry decorator with exponential backoff."""
    if not TENACITY_AVAILABLE:
        logger.warning("tenacity not installed - retries disabled. Run: pip install tenacity")
        return lambda fn: fn
    
    return retry(
        stop=stop_after_attempt(max_retries),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((
            ConnectionError,
            TimeoutError,
            OSError,
        )),
        before_sleep=lambda retry_state: logger.warning(
            f"     ⚠️ Retry {retry_state.attempt_number}/{max_retries} after error..."
        ),
    )


class AsyncCouncil:
    """
    Async LLM Council - Runs all providers in parallel.
    
    Features:
    - Parallel execution via asyncio.gather
    - Exponential backoff retries (tenacity)
    - Enforced timeout via asyncio.wait_for
    - Native async for all providers (including Gemini)
    
    Usage:
        council = AsyncCouncil()
        result = await council.deliberate(prompt)
        
    Or synchronously:
        result = council.deliberate_sync(prompt)
    """
    
    def __init__(self, config: Optional[AsyncCouncilConfig] = None):
        self.config = config or AsyncCouncilConfig()
        
        # Check available providers
        self.openai_key = os.environ.get("OPENAI_API_KEY")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        self.gemini_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        
        self.available_providers = []
        if self.openai_key:
            self.available_providers.append("openai")
        if self.anthropic_key:
            self.available_providers.append("anthropic")
        if self.gemini_key:
            self.available_providers.append("gemini")
        
        # Create retry decorator with configured max_retries
        self._retry = _create_retry_decorator(self.config.max_retries)
        
        logger.info(f"  ⚡ AsyncCouncil: {len(self.available_providers)} providers")
        logger.info(f"     Timeout: {self.config.timeout_seconds}s, Retries: {self.config.max_retries}")
        for p in self.available_providers:
            logger.info(f"     - {p}")
    
    async def _call_openai_async(self, prompt: str, system: Optional[str] = None) -> CouncilVote:
        """Async OpenAI call with retry"""
        @self._retry
        async def _inner():
            import openai

            client = openai.AsyncOpenAI(api_key=self.openai_key)

            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({
                "role": "user",
                "content": prompt + "\n\nRespond with JSON: {\"decision\": \"APPROVE\"|\"REJECT\"|\"DEFER_TO_HUMAN\", \"confidence\": 0.0-1.0, \"dissents\": [{\"point\": \"...\", \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\"}], \"reasoning\": \"...\"}"
            })

            # GPT-5.x/o3/o4 models require max_completion_tokens, not max_tokens
            create_kwargs = {
                "model": self.config.openai_model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "timeout": self.config.timeout_seconds,
            }
            model = self.config.openai_model
            if model.startswith("gpt-5") or model.startswith("o3") or model.startswith("o4"):
                create_kwargs["max_completion_tokens"] = self.config.max_tokens
            else:
                create_kwargs["max_tokens"] = self.config.max_tokens

            response = await client.chat.completions.create(**create_kwargs)
            
            data = json.loads(response.choices[0].message.content)
            return CouncilVote(
                model=f"OpenAI/{self.config.openai_model}",
                provider="openai",
                decision=data.get("decision", "DEFER_TO_HUMAN"),
                confidence=data.get("confidence", 0.5),
                reasoning=data.get("reasoning", ""),
                dissenting_points=[d.get("point", "") for d in data.get("dissents", [])]
            )
        
        try:
            return await _inner()
        except Exception as e:
            logger.error(f"OpenAI async error (after retries): {e}")
            return self._create_error_vote("openai", str(e))
    
    async def _call_anthropic_async(self, prompt: str, system: Optional[str] = None) -> CouncilVote:
        """Async Anthropic call with retry — uses streaming to avoid SDK timeout on long operations."""
        @self._retry
        async def _inner():
            import anthropic

            # Explicit timeout + streaming prevents SDK "streaming recommended" errors on long Opus calls.
            client = anthropic.AsyncAnthropic(
                api_key=self.anthropic_key,
                timeout=self.config.timeout_seconds * 2,
            )

            # Use streaming to handle long-running Opus responses without timeout issues.
            chunks: list[str] = []
            async with client.messages.stream(
                model=self.config.anthropic_model,
                max_tokens=self.config.max_tokens,
                system=system or "You are a critical reviewer. Respond with valid JSON.",
                messages=[
                    {"role": "user", "content": prompt + "\n\nRespond with valid JSON: {\"decision\": \"APPROVE\"|\"REJECT\"|\"DEFER_TO_HUMAN\", \"confidence\": 0.0-1.0, \"dissents\": [{\"point\": \"...\", \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\"}], \"reasoning\": \"...\"}"}
                ]
            ) as stream:
                async for text in stream.text_stream:
                    chunks.append(text)
            collected_text = "".join(chunks)

            json_match = re.search(r'\{[\s\S]*\}', collected_text)
            if json_match:
                data = json.loads(json_match.group())
                return CouncilVote(
                    model=f"Anthropic/{self.config.anthropic_model}",
                    provider="anthropic",
                    decision=data.get("decision", "DEFER_TO_HUMAN"),
                    confidence=data.get("confidence", 0.5),
                    reasoning=data.get("reasoning", ""),
                    dissenting_points=[d.get("point", "") for d in data.get("dissents", [])]
                )

            raise ValueError("Could not parse JSON response from Anthropic")

        try:
            return await _inner()
        except Exception as e:
            logger.error(f"Anthropic async error (after retries): {e}")
            return self._create_error_vote("anthropic", str(e))
    
    async def _call_gemini_async(self, prompt: str, system: Optional[str] = None) -> CouncilVote:
        """
        Async Gemini call with retry.
        
        IMPROVEMENT: Uses native generate_content_async() instead of run_in_executor!
        This provides true non-blocking I/O instead of thread pool overhead.
        """
        @self._retry
        async def _inner():
            import google.generativeai as genai
            
            genai.configure(api_key=self.gemini_key)
            model = genai.GenerativeModel(
                self.config.gemini_model,
                system_instruction=system
            )
            
            # IMPROVEMENT: Native async instead of run_in_executor
            # Before: await loop.run_in_executor(None, lambda: model.generate_content(...))
            # After: True async call
            response = await model.generate_content_async(
                prompt + "\n\nRespond with valid JSON: {\"decision\": \"APPROVE\"|\"REJECT\"|\"DEFER_TO_HUMAN\", \"confidence\": 0.0-1.0, \"dissents\": [{\"point\": \"...\", \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\"}], \"reasoning\": \"...\"}"
            )
            
            text = response.text
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                data = json.loads(json_match.group())
                return CouncilVote(
                    model=f"Gemini/{self.config.gemini_model}",
                    provider="gemini",
                    decision=data.get("decision", "DEFER_TO_HUMAN"),
                    confidence=data.get("confidence", 0.5),
                    reasoning=data.get("reasoning", ""),
                    dissenting_points=[d.get("point", "") for d in data.get("dissents", [])]
                )
            
            raise ValueError("Could not parse JSON response from Gemini")
        
        try:
            return await _inner()
        except Exception as e:
            logger.error(f"Gemini async error (after retries): {e}")
            return self._create_error_vote("gemini", str(e))
    
    def _create_error_vote(self, provider: str, error: str) -> CouncilVote:
        """Create an error vote when a provider fails"""
        return CouncilVote(
            model=f"{provider}/ERROR",
            provider=provider,
            decision="DEFER_TO_HUMAN",
            confidence=0.0,
            reasoning=f"Error calling {provider}: {error}",
            dissenting_points=[f"Provider {provider} failed: {error}"]
        )
    
    async def deliberate(
        self, 
        prompt: str, 
        system: Optional[str] = None
    ) -> CouncilDeliberation:
        """
        Run all council members in PARALLEL and aggregate results.
        
        IMPROVEMENT: Enforces timeout_seconds via asyncio.wait_for
        Before: asyncio.gather(*tasks) - could hang forever
        After: asyncio.wait_for(gather, timeout) - fails gracefully
        """
        logger.info("  ⚡ ASYNC COUNCIL DELIBERATION")
        start_time = datetime.now()
        
        # Build task list based on available providers
        tasks = []
        task_names = []
        
        if "openai" in self.available_providers:
            tasks.append(self._call_openai_async(prompt, system))
            task_names.append("OpenAI")
        
        if "anthropic" in self.available_providers:
            tasks.append(self._call_anthropic_async(prompt, system))
            task_names.append("Anthropic")
        
        if "gemini" in self.available_providers:
            tasks.append(self._call_gemini_async(prompt, system))
            task_names.append("Gemini")
        
        if not tasks:
            logger.warning("  ⚠️ No council members available!")
            return CouncilDeliberation(
                votes=[],
                consensus="SPLIT",
                consensus_confidence=0.0,
                key_agreements=[],
                key_disagreements=["No LLM providers configured"],
                final_recommendation={"action": "DEFER_TO_HUMAN", "reason": "No providers available"},
                dissent_count=0,
                confidence_adjustment=0.0,
            )
        
        logger.info(f"     Running {len(tasks)} providers in parallel: {task_names}")
        logger.info(f"     Timeout: {self.config.timeout_seconds}s")
        
        # IMPROVEMENT: Enforce timeout via asyncio.wait_for
        try:
            votes: List[CouncilVote] = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=self.config.timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.error(f"     ⏱️ Council deliberation TIMED OUT after {self.config.timeout_seconds}s")
            votes = [self._create_error_vote(name, "Timeout") for name in task_names]
        
        # Handle exceptions
        clean_votes = []
        for i, vote in enumerate(votes):
            if isinstance(vote, Exception):
                clean_votes.append(self._create_error_vote(task_names[i], str(vote)))
            else:
                clean_votes.append(vote)
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"     ✓ All {len(clean_votes)} votes received in {elapsed:.1f}s")
        
        # Aggregate results
        return self._aggregate_votes(clean_votes)
    
    def _aggregate_votes(self, votes: List[CouncilVote]) -> CouncilDeliberation:
        """Aggregate individual votes into a consensus"""
        if not votes:
            return CouncilDeliberation(
                votes=[],
                consensus="SPLIT",
                consensus_confidence=0.0,
                key_agreements=[],
                key_disagreements=[],
                final_recommendation={"action": "DEFER_TO_HUMAN", "reason": "No votes"},
                dissent_count=0,
                confidence_adjustment=0.0,
            )
        
        # Count decisions
        approve_count = sum(1 for v in votes if v.decision in ("APPROVE", "APPROVE_WITH_CONDITIONS"))
        reject_count = sum(1 for v in votes if v.decision == "REJECT")
        total = len(votes)
        
        # Determine consensus
        if approve_count == total:
            consensus = "UNANIMOUS_APPROVE"
        elif reject_count == total:
            consensus = "UNANIMOUS_REJECT"
        elif approve_count > total / 2:
            consensus = "MAJORITY_APPROVE"
        elif reject_count > total / 2:
            consensus = "MAJORITY_REJECT"
        else:
            consensus = "SPLIT"
        
        # Collect all dissents
        all_dissents = []
        for vote in votes:
            all_dissents.extend(vote.dissenting_points)
        
        # Extract key agreements (common themes across votes)
        key_agreements = self._extract_key_agreements(votes)
        
        # Calculate overall confidence
        overall_confidence = sum(v.confidence for v in votes) / total
        
        # Recommend action
        if consensus == "UNANIMOUS_APPROVE" and overall_confidence >= 0.85:
            recommended_action = "AUTO_EXECUTE"
        elif consensus in ("UNANIMOUS_APPROVE", "MAJORITY_APPROVE") and overall_confidence >= 0.70:
            recommended_action = "EXECUTE_WITH_MONITORING"
        elif consensus == "UNANIMOUS_REJECT":
            recommended_action = "ABORT"
        else:
            recommended_action = "DEFER_TO_HUMAN"
        
        # Log summary
        for vote in votes:
            status = "✓" if vote.decision.startswith("APPROVE") else "✗"
            logger.info(f"     {status} {vote.model}: {vote.decision} ({vote.confidence:.0%})")
        logger.info(f"     → Consensus: {consensus}, Action: {recommended_action}")
        
        return CouncilDeliberation(
            votes=votes,
            consensus=consensus,
            consensus_confidence=overall_confidence,
            key_agreements=key_agreements,
            key_disagreements=all_dissents[:5],
            final_recommendation={"action": recommended_action, "reason": consensus},
            dissent_count=len(all_dissents),
            confidence_adjustment=overall_confidence - 0.5,  # Adjustment from baseline 50%
        )
    
    def _extract_key_agreements(self, votes: List[CouncilVote]) -> List[str]:
        """
        Extract common themes from votes.
        
        Simple implementation: if all votes have same decision, that's an agreement.
        More sophisticated: could use embeddings to find semantic overlap.
        """
        agreements = []
        
        # Check if all agree on decision
        decisions = [v.decision for v in votes]
        if len(set(decisions)) == 1:
            agreements.append(f"All models agree: {decisions[0]}")
        
        # Check if confidence is consistently high or low
        confidences = [v.confidence for v in votes]
        if all(c >= 0.8 for c in confidences):
            agreements.append("All models have high confidence (>=80%)")
        elif all(c <= 0.5 for c in confidences):
            agreements.append("All models have low confidence (<=50%)")
        
        return agreements
    
    def deliberate_sync(self, prompt: str, system: Optional[str] = None) -> CouncilDeliberation:
        """Synchronous wrapper for deliberate()"""
        return asyncio.run(self.deliberate(prompt, system))


# =============================================================================
# ASYNC VISUAL COUNCIL
# =============================================================================

class AsyncVisualCouncil(AsyncCouncil):
    """
    Async Visual Council - Parallel vision model execution.
    
    Runs GPT-5.2 and Claude vision in parallel with same improvements:
    - Retry with exponential backoff
    - Enforced timeout
    """
    
    async def analyze_image(self, image_b64: str, prompt: str) -> List[VisualVoteResult]:
        """Analyze an image with all available vision models in parallel"""
        tasks = []
        task_names = []
        
        if "openai" in self.available_providers:
            tasks.append(self._analyze_openai_async(image_b64, prompt))
            task_names.append("GPT-5.2")
        
        if "anthropic" in self.available_providers:
            tasks.append(self._analyze_anthropic_async(image_b64, prompt))
            task_names.append("Claude")
        
        if not tasks:
            return []
        
        logger.info(f"     👁️ Running {len(tasks)} vision models in parallel")
        
        # Enforce timeout
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=self.config.timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.error(f"     ⏱️ Visual analysis TIMED OUT after {self.config.timeout_seconds}s")
            results = [TimeoutError("Vision analysis timed out") for _ in task_names]
        
        clean_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                clean_results.append(VisualVoteResult(
                    model_name=task_names[i],
                    passed=False,
                    confidence=0.0,
                    observations=f"Error: {result}",
                    anomalies=[]
                ))
            else:
                clean_results.append(result)
        
        return clean_results
    
    async def _analyze_openai_async(self, image_b64: str, prompt: str) -> VisualVoteResult:
        """Analyze with GPT-5.2 vision with retry"""
        @self._retry
        async def _inner():
            import openai
            
            client = openai.AsyncOpenAI(api_key=self.openai_key)
            
            # GPT-5.x/o3/o4 models require max_completion_tokens, not max_tokens
            create_kwargs = {
                "model": self.config.openai_model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt + "\n\nRespond with JSON: {\"passed\": true/false, \"confidence\": 0.0-1.0, \"observations\": \"...\", \"anomalies\": [{\"description\": \"...\", \"severity\": \"high\"|\"medium\"|\"low\"}]}"},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}}
                        ]
                    }
                ],
            }
            model = self.config.openai_model
            if model.startswith("gpt-5") or model.startswith("o3") or model.startswith("o4"):
                create_kwargs["max_completion_tokens"] = self.config.max_tokens
            else:
                create_kwargs["max_tokens"] = self.config.max_tokens

            response = await client.chat.completions.create(**create_kwargs)
            
            text = response.choices[0].message.content
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                data = json.loads(json_match.group())
                return VisualVoteResult(
                    model_name="GPT-5.2",
                    passed=data.get("passed", False),
                    confidence=data.get("confidence", 0.5),
                    observations=data.get("observations", ""),
                    anomalies=data.get("anomalies", [])
                )
            
            raise ValueError("Could not parse JSON from GPT-5.2 vision")
        
        try:
            return await _inner()
        except Exception as e:
            return VisualVoteResult(
                model_name="GPT-5.2",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    async def _analyze_anthropic_async(self, image_b64: str, prompt: str) -> VisualVoteResult:
        """Analyze with Claude vision with retry — uses streaming to avoid SDK timeout."""
        @self._retry
        async def _inner():
            import anthropic

            client = anthropic.AsyncAnthropic(
                api_key=self.anthropic_key,
                timeout=self.config.timeout_seconds * 2,
            )

            chunks: list[str] = []
            async with client.messages.stream(
                model=self.config.anthropic_model,
                max_tokens=self.config.max_tokens,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                            {"type": "text", "text": prompt + "\n\nRespond with JSON: {\"passed\": true/false, \"confidence\": 0.0-1.0, \"observations\": \"...\", \"anomalies\": [{\"description\": \"...\", \"severity\": \"high\"|\"medium\"|\"low\"}]}"}
                        ]
                    }
                ]
            ) as stream:
                async for text in stream.text_stream:
                    chunks.append(text)
            collected_text = "".join(chunks)

            json_match = re.search(r'\{[\s\S]*\}', collected_text)
            if json_match:
                data = json.loads(json_match.group())
                return VisualVoteResult(
                    model_name="Claude",
                    passed=data.get("passed", False),
                    confidence=data.get("confidence", 0.5),
                    observations=data.get("observations", ""),
                    anomalies=data.get("anomalies", [])
                )

            raise ValueError("Could not parse JSON from Claude vision")

        try:
            return await _inner()
        except Exception as e:
            return VisualVoteResult(
                model_name="Claude",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    def analyze_sync(self, image_b64: str, prompt: str) -> List[VisualVoteResult]:
        """Synchronous wrapper"""
        return asyncio.run(self.analyze_image(image_b64, prompt))


# Factory functions
def create_async_council(config: Optional[AsyncCouncilConfig] = None) -> AsyncCouncil:
    """Create an async council instance."""
    return AsyncCouncil(config)


def create_visual_council(config: Optional[AsyncCouncilConfig] = None) -> AsyncVisualCouncil:
    """Create an async visual council instance."""
    return AsyncVisualCouncil(config)
