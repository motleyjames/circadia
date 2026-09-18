"""
Async Council - Parallel LLM Execution

Runs all council members (OpenAI, Anthropic, Gemini, UI-Tars-2) 
in PARALLEL using asyncio.

Instead of:
  OpenAI (15s) → Anthropic (15s) → Gemini (15s) = 45s TOTAL

We get:
  OpenAI ─┐
  Anthropic ─┼─→ All finish in ~15s (the slowest one)
  Gemini ─┘

This 3x speedup is critical for responsive RSI.
"""

import os
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

try:
    from tools_core.core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model

from .structured_outputs import (
    CouncilVote, 
    CouncilDeliberationResult,
    DissentItem,
    VisualVoteResult,
    VisualComparisonResult
)

logger = logging.getLogger(__name__)


@dataclass
class AsyncCouncilConfig:
    """Configuration for async council. Model fields resolve from model_roles at instantiation."""
    openai_model: Optional[str] = None
    anthropic_model: Optional[str] = None
    gemini_model: Optional[str] = None
    ui_tars_model: str = "bytedance-research/UI-TARS-2-7B"
    timeout_seconds: float = 60.0
    max_retries: int = 2

    def __post_init__(self):
        if self.openai_model is None:
            self.openai_model = get_default_model("openai_top")
        if self.anthropic_model is None:
            self.anthropic_model = get_default_model("anthropic_top")
        if self.gemini_model is None:
            self.gemini_model = get_default_model("google_top")


class AsyncCouncil:
    """
    Async LLM Council - Runs all providers in parallel.
    
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
        self.hf_token = os.environ.get("HF_TOKEN") or os.environ.get("UI_TARS_API_KEY")
        
        self.available_providers = []
        if self.openai_key:
            self.available_providers.append("openai")
        if self.anthropic_key:
            self.available_providers.append("anthropic")
        if self.gemini_key:
            self.available_providers.append("gemini")
        if self.hf_token:
            self.available_providers.append("ui_tars")
        
        logger.info(f"  ⚡ AsyncCouncil: {len(self.available_providers)} providers")
        for p in self.available_providers:
            logger.info(f"     - {p}")
    
    async def _call_openai_async(self, prompt: str) -> CouncilVote:
        """Async OpenAI call with structured output"""
        try:
            import instructor
            import openai
            
            client = instructor.patch(openai.AsyncOpenAI(api_key=self.openai_key))
            
            vote = await client.chat.completions.create(
                model=self.config.openai_model,
                response_model=CouncilVote,
                messages=[
                    {"role": "system", "content": "You are a critical reviewer analyzing a proposed spreadsheet update. Be thorough but fair."},
                    {"role": "user", "content": prompt}
                ],
                timeout=self.config.timeout_seconds
            )
            vote.model_name = f"OpenAI/{self.config.openai_model}"
            return vote
            
        except ImportError:
            # Fallback without instructor
            return await self._call_openai_fallback(prompt)
        except Exception as e:
            logger.error(f"OpenAI async error: {e}")
            return self._create_error_vote("openai", str(e))
    
    async def _call_openai_fallback(self, prompt: str) -> CouncilVote:
        """Fallback OpenAI call without instructor"""
        import openai
        import json
        
        client = openai.AsyncOpenAI(api_key=self.openai_key)
        
        response = await client.chat.completions.create(
            model=self.config.openai_model,
            messages=[
                {"role": "system", "content": "You are a critical reviewer. Respond with valid JSON matching the CouncilVote schema."},
                {"role": "user", "content": prompt + "\n\nRespond with JSON: {decision, confidence, dissents: [{point, severity}], reasoning}"}
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=1024,  # gpt-5.2 requires max_completion_tokens
            timeout=self.config.timeout_seconds
        )
        
        data = json.loads(response.choices[0].message.content)
        return CouncilVote(
            model_name=f"OpenAI/{self.config.openai_model}",
            decision=data.get("decision", "DEFER_TO_HUMAN"),
            confidence=data.get("confidence", 0.5),
            dissents=[DissentItem(**d) for d in data.get("dissents", [])],
            reasoning=data.get("reasoning", "")
        )
    
    async def _call_anthropic_async(self, prompt: str) -> CouncilVote:
        """Async Anthropic call with structured output"""
        try:
            import instructor
            import anthropic
            
            client = instructor.from_anthropic(
                anthropic.AsyncAnthropic(api_key=self.anthropic_key)
            )
            
            vote = await client.messages.create(
                model=self.config.anthropic_model,
                max_tokens=1024,
                response_model=CouncilVote,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            vote.model_name = f"Anthropic/{self.config.anthropic_model}"
            return vote
            
        except ImportError:
            return await self._call_anthropic_fallback(prompt)
        except Exception as e:
            logger.error(f"Anthropic async error: {e}")
            return self._create_error_vote("anthropic", str(e))
    
    async def _call_anthropic_fallback(self, prompt: str) -> CouncilVote:
        """Fallback Anthropic call without instructor"""
        import anthropic
        import json
        
        client = anthropic.AsyncAnthropic(api_key=self.anthropic_key)
        
        response = await client.messages.create(
            model=self.config.anthropic_model,
            max_tokens=1024,
            messages=[
                {"role": "user", "content": prompt + "\n\nRespond with valid JSON: {\"decision\": \"APPROVE\"|\"REJECT\"|\"DEFER_TO_HUMAN\", \"confidence\": 0.0-1.0, \"dissents\": [{\"point\": \"...\", \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\"}], \"reasoning\": \"...\"}"}
            ]
        )
        
        # Extract JSON from response
        text = response.content[0].text
        # Find JSON in response
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            data = json.loads(json_match.group())
            return CouncilVote(
                model_name=f"Anthropic/{self.config.anthropic_model}",
                decision=data.get("decision", "DEFER_TO_HUMAN"),
                confidence=data.get("confidence", 0.5),
                dissents=[DissentItem(**d) for d in data.get("dissents", [])],
                reasoning=data.get("reasoning", "")
            )
        
        return self._create_error_vote("anthropic", "Could not parse JSON response")
    
    async def _call_gemini_async(self, prompt: str) -> CouncilVote:
        """Async Gemini call"""
        try:
            import google.generativeai as genai
            import json
            
            genai.configure(api_key=self.gemini_key)
            model = genai.GenerativeModel(self.config.gemini_model)
            
            # Gemini doesn't have native async, wrap in executor
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: model.generate_content(
                    prompt + "\n\nRespond with valid JSON: {\"decision\": \"APPROVE\"|\"REJECT\"|\"DEFER_TO_HUMAN\", \"confidence\": 0.0-1.0, \"dissents\": [{\"point\": \"...\", \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\"}], \"reasoning\": \"...\"}"
                )
            )
            
            text = response.text
            import re
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                data = json.loads(json_match.group())
                return CouncilVote(
                    model_name=f"Gemini/{self.config.gemini_model}",
                    decision=data.get("decision", "DEFER_TO_HUMAN"),
                    confidence=data.get("confidence", 0.5),
                    dissents=[DissentItem(**d) for d in data.get("dissents", [])],
                    reasoning=data.get("reasoning", "")
                )
            
            return self._create_error_vote("gemini", "Could not parse JSON")
            
        except Exception as e:
            logger.error(f"Gemini async error: {e}")
            return self._create_error_vote("gemini", str(e))
    
    async def _call_ui_tars_async(self, prompt: str, image_b64: Optional[str] = None) -> CouncilVote:
        """Async UI-Tars-2 call via HuggingFace Inference"""
        try:
            import aiohttp
            
            endpoint = f"https://api-inference.huggingface.co/models/{self.config.ui_tars_model}"
            
            headers = {"Authorization": f"Bearer {self.hf_token}"}
            
            payload = {
                "inputs": prompt if not image_b64 else {"text": prompt, "image": image_b64},
                "parameters": {"max_new_tokens": 512}
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    endpoint, 
                    headers=headers, 
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds)
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        text = result[0].get("generated_text", "") if isinstance(result, list) else str(result)
                        
                        # Parse as best we can
                        return CouncilVote(
                            model_name=f"UI-Tars-2/{self.config.ui_tars_model}",
                            decision="APPROVE" if "approve" in text.lower() else "DEFER_TO_HUMAN",
                            confidence=0.7,
                            dissents=[],
                            reasoning=text[:500]
                        )
                    else:
                        return self._create_error_vote("ui_tars", f"HTTP {response.status}")
                        
        except Exception as e:
            logger.error(f"UI-Tars async error: {e}")
            return self._create_error_vote("ui_tars", str(e))
    
    def _create_error_vote(self, provider: str, error: str) -> CouncilVote:
        """Create an error vote when a provider fails"""
        return CouncilVote(
            model_name=f"{provider}/ERROR",
            decision="DEFER_TO_HUMAN",
            confidence=0.0,
            dissents=[DissentItem(
                point=f"Provider {provider} failed: {error}",
                severity="medium"
            )],
            reasoning=f"Error calling {provider}: {error}"
        )
    
    async def deliberate(self, prompt: str) -> CouncilDeliberationResult:
        """
        Run all council members in PARALLEL and aggregate results.
        
        This is the key speedup - instead of sequential calls,
        all LLMs run simultaneously.
        """
        logger.info("  ⚡ ASYNC COUNCIL DELIBERATION")
        start_time = datetime.now()
        
        # Build task list based on available providers
        tasks = []
        task_names = []
        
        if "openai" in self.available_providers:
            tasks.append(self._call_openai_async(prompt))
            task_names.append("OpenAI")
        
        if "anthropic" in self.available_providers:
            tasks.append(self._call_anthropic_async(prompt))
            task_names.append("Anthropic")
        
        if "gemini" in self.available_providers:
            tasks.append(self._call_gemini_async(prompt))
            task_names.append("Gemini")
        
        if "ui_tars" in self.available_providers:
            tasks.append(self._call_ui_tars_async(prompt))
            task_names.append("UI-Tars-2")
        
        if not tasks:
            logger.warning("  ⚠️ No council members available!")
            return CouncilDeliberationResult(
                votes=[],
                consensus="SPLIT",
                overall_confidence=0.0,
                critical_blockers=["No LLM providers configured"],
                all_dissents=[],
                recommended_action="DEFER_TO_HUMAN"
            )
        
        logger.info(f"     Running {len(tasks)} providers in parallel: {task_names}")
        
        # RUN ALL IN PARALLEL
        votes: List[CouncilVote] = await asyncio.gather(*tasks, return_exceptions=True)
        
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
    
    def _aggregate_votes(self, votes: List[CouncilVote]) -> CouncilDeliberationResult:
        """Aggregate individual votes into a consensus"""
        if not votes:
            return CouncilDeliberationResult(
                votes=[],
                consensus="SPLIT",
                overall_confidence=0.0,
                critical_blockers=[],
                all_dissents=[],
                recommended_action="DEFER_TO_HUMAN"
            )
        
        # Count decisions
        approve_count = sum(1 for v in votes if v.decision in ("APPROVE", "APPROVE_WITH_CONDITIONS"))
        reject_count = sum(1 for v in votes if v.decision == "REJECT")
        defer_count = sum(1 for v in votes if v.decision == "DEFER_TO_HUMAN")
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
            all_dissents.extend(vote.dissents)
        
        # Find critical blockers
        critical_blockers = [d.point for d in all_dissents if d.severity in ("critical", "high")]
        
        # Calculate overall confidence
        overall_confidence = sum(v.confidence for v in votes) / total
        
        # Recommend action
        if consensus == "UNANIMOUS_APPROVE" and not critical_blockers and overall_confidence >= 0.85:
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
            logger.info(f"     {status} {vote.model_name}: {vote.decision} ({vote.confidence:.0%})")
        logger.info(f"     → Consensus: {consensus}, Action: {recommended_action}")
        
        return CouncilDeliberationResult(
            votes=votes,
            consensus=consensus,
            overall_confidence=overall_confidence,
            critical_blockers=critical_blockers,
            all_dissents=all_dissents,
            recommended_action=recommended_action
        )
    
    def deliberate_sync(self, prompt: str) -> CouncilDeliberationResult:
        """Synchronous wrapper for deliberate()"""
        return asyncio.run(self.deliberate(prompt))


# =============================================================================
# ASYNC VISUAL COUNCIL
# =============================================================================

class AsyncVisualCouncil(AsyncCouncil):
    """
    Async Visual Council - Parallel vision model execution.
    
    Runs UI-Tars-2, GPT-5.2, and Claude vision in parallel.
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
        
        if "ui_tars" in self.available_providers:
            tasks.append(self._analyze_ui_tars_async(image_b64, prompt))
            task_names.append("UI-Tars-2")
        
        if not tasks:
            return []
        
        logger.info(f"     👁️ Running {len(tasks)} vision models in parallel")
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
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
        """Analyze with GPT-5.2 vision"""
        try:
            import instructor
            import openai
            
            client = instructor.patch(openai.AsyncOpenAI(api_key=self.openai_key))
            
            result = await client.chat.completions.create(
                model=get_default_model("vision"),
                response_model=VisualVoteResult,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}}
                        ]
                    }
                ]
            )
            result.model_name = "GPT-5.2"
            return result
            
        except Exception as e:
            return VisualVoteResult(
                model_name="GPT-5.2",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    async def _analyze_anthropic_async(self, image_b64: str, prompt: str) -> VisualVoteResult:
        """Analyze with Claude vision"""
        try:
            import anthropic
            import json
            
            client = anthropic.AsyncAnthropic(api_key=self.anthropic_key)
            
            response = await client.messages.create(
                model=get_default_model("anthropic_top"),
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                            {"type": "text", "text": prompt + "\n\nRespond with JSON: {passed, confidence, observations, anomalies: [{description, severity}]}"}
                        ]
                    }
                ]
            )
            
            text = response.content[0].text
            import re
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                data = json.loads(json_match.group())
                return VisualVoteResult(
                    model_name="Claude",
                    passed=data.get("passed", False),
                    confidence=data.get("confidence", 0.5),
                    observations=data.get("observations", ""),
                    anomalies=data.get("anomalies", [])
                )
            
            return VisualVoteResult(
                model_name="Claude",
                passed=False,
                confidence=0.0,
                observations=text[:500],
                anomalies=[]
            )
            
        except Exception as e:
            return VisualVoteResult(
                model_name="Claude",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    async def _analyze_ui_tars_async(self, image_b64: str, prompt: str) -> VisualVoteResult:
        """Analyze with UI-Tars-2"""
        try:
            import aiohttp
            
            endpoint = f"https://api-inference.huggingface.co/models/{self.config.ui_tars_model}"
            headers = {"Authorization": f"Bearer {self.hf_token}"}
            
            payload = {
                "inputs": {"text": prompt, "image": image_b64},
                "parameters": {"max_new_tokens": 512}
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(endpoint, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as response:
                    if response.status == 200:
                        result = await response.json()
                        text = result[0].get("generated_text", "") if isinstance(result, list) else str(result)
                        
                        passed = not any(k in text.lower() for k in ["fail", "issue", "problem", "error"])
                        
                        return VisualVoteResult(
                            model_name="UI-Tars-2",
                            passed=passed,
                            confidence=0.7,
                            observations=text[:500],
                            anomalies=[]
                        )
                    else:
                        error_text = await response.text()
                        return VisualVoteResult(
                            model_name="UI-Tars-2",
                            passed=False,
                            confidence=0.0,
                            observations=f"HTTP {response.status}: {error_text[:200]}",
                            anomalies=[]
                        )
                        
        except Exception as e:
            return VisualVoteResult(
                model_name="UI-Tars-2",
                passed=False,
                confidence=0.0,
                observations=f"Error: {e}",
                anomalies=[]
            )
    
    def analyze_sync(self, image_b64: str, prompt: str) -> List[VisualVoteResult]:
        """Synchronous wrapper"""
        return asyncio.run(self.analyze_image(image_b64, prompt))

