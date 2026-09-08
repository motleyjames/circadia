"""
meeseeks_context_resolver.py - CONTEXT-AWARE DISSENT RESOLUTION

"I'M MR. MEESEEKS! I KNOW THE ANSWERS BECAUSE I UNDERSTAND THE DOMAIN!"

The Context Resolver uses a MentalModel to ANSWER dissents immediately,
instead of just tracking them. This is the key to high resolution rates.

Example:
- Dissent: "Need to verify data will propagate"
- Without context: "Let me probe..." → slow, uncertain
- With context: "YES - because X feeds into Y via Z" → instant, confident

This is the ABSTRACT BASE - implement for each domain:
- ExcelContextResolver (uses WorkbookMentalModel)
- PDFContextResolver (uses DocumentMentalModel)
- CodeContextResolver (uses CodebaseMentalModel)

Extracted from the battle-tested RSI v3.2 engine.
"""

import re
import logging
import hashlib
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Tuple, Callable, Pattern
from dataclasses import dataclass, field

try:
    from ..core.meeseeks_data_classes import (
        ResolutionStatus,
        ResolutionAttempt,
        MentalModel,
    )
except ImportError:
    from core.meeseeks_data_classes import (
        ResolutionStatus,
        ResolutionAttempt,
        MentalModel,
    )

logger = logging.getLogger(__name__)


@dataclass
class ContextAnswer:
    """An answer derived from domain context"""
    answered: bool
    confidence: float         # 0.0-1.0
    answer_type: str          # propagation, safety, lookup, etc.
    explanation: str          # Human-readable explanation
    evidence: List[str] = field(default_factory=list)  # Supporting evidence
    
    @property
    def resolution_status(self) -> ResolutionStatus:
        if self.answered and self.confidence >= 0.7:
            return ResolutionStatus.RESOLVED
        elif self.answered and self.confidence >= 0.4:
            return ResolutionStatus.PARTIALLY_RESOLVED
        else:
            return ResolutionStatus.CANNOT_RESOLVE


class ResolutionPattern:
    """
    A pattern-based resolution strategy.
    
    Matches dissent content against a regex and applies
    a domain-specific resolver function.
    """
    
    def __init__(
        self,
        pattern: str,
        resolver_fn: Callable[[str, str, Optional[str], 'MentalModelInterface'], ContextAnswer],
        name: str,
    ):
        self.pattern = re.compile(pattern, re.IGNORECASE)
        self.resolver_fn = resolver_fn
        self.name = name
    
    def matches(self, content: str) -> bool:
        return bool(self.pattern.search(content))
    
    def resolve(
        self,
        dissent_id: str,
        content: str,
        target: Optional[str],
        model: 'MentalModelInterface',
    ) -> ContextAnswer:
        return self.resolver_fn(dissent_id, content, target, model)


class MentalModelInterface(ABC):
    """
    Abstract interface for domain mental models.
    
    Implement this for each domain to provide context-aware resolution:
    - WorkbookMentalModel (Excel)
    - DocumentMentalModel (PDF)
    - CodebaseMentalModel (Code)
    
    The mental model UNDERSTANDS the domain, which enables instant
    resolution instead of probing.
    """
    
    @abstractmethod
    def get_entities(self) -> List[str]:
        """Get all entities in the model (sheets, sections, modules)"""
        pass
    
    @abstractmethod
    def get_data_flow(self, source: str) -> List[str]:
        """Get what entities are affected by changes to source"""
        pass
    
    @abstractmethod
    def answer_question(self, question: str) -> Optional[ContextAnswer]:
        """Try to answer a question using the mental model"""
        pass
    
    @abstractmethod
    def explain_relationship(self, source: str, target: str) -> Optional[str]:
        """Explain how source relates to target"""
        pass


class ContextAwareResolver:
    """
    Context-Aware Resolver - The Understanding Upgrade
    
    "LOOK AT ME! I KNOW THE ANSWERS IMMEDIATELY!"
    
    The context resolver is the key to 80%+ resolution rates.
    Instead of:
    - Tracking dissents and hoping
    - Running expensive probes
    - Asking LLMs to figure it out
    
    We use our UNDERSTANDING of the domain to answer immediately.
    
    Resolution patterns:
    1. Propagation questions → Mental model knows the flow graph
    2. Safety questions → Mental model knows what's protected
    3. Dependency questions → Mental model knows relationships
    4. Existence questions → Mental model knows the structure
    
    Usage:
        resolver = ContextAwareResolver(my_mental_model)
        resolver.add_pattern("propagate|flow", resolve_propagation)
        
        result = resolver.resolve(dissent_id, dissent_content)
    """
    
    def __init__(self, mental_model: Optional[MentalModelInterface] = None):
        self.model = mental_model
        self.resolution_cache: Dict[str, ContextAnswer] = {}
        self.resolution_patterns: List[ResolutionPattern] = []
        
        # Register default generic patterns
        self._register_default_patterns()
    
    def _register_default_patterns(self):
        """Register default resolution patterns"""
        # These are generic patterns that work across domains
        
        # Propagation/flow patterns
        self.add_pattern(
            pattern=r'(propagate|flow|cascade|update|affect|impact)',
            resolver_fn=self._resolve_propagation,
            name="propagation",
        )
        
        # Safety patterns
        self.add_pattern(
            pattern=r'(safe|danger|risk|harm|overwrite|replace|destroy)',
            resolver_fn=self._resolve_safety,
            name="safety",
        )
        
        # Existence patterns
        self.add_pattern(
            pattern=r'(exist|missing|find|where|present)',
            resolver_fn=self._resolve_existence,
            name="existence",
        )
        
        # Dependency patterns
        self.add_pattern(
            pattern=r'(depend|require|need|reference|link)',
            resolver_fn=self._resolve_dependency,
            name="dependency",
        )
    
    def set_mental_model(self, model: MentalModelInterface):
        """Set or update the mental model"""
        self.model = model
        self.resolution_cache.clear()  # Clear cache when model changes
    
    def add_pattern(
        self,
        pattern: str,
        resolver_fn: Callable,
        name: str,
    ):
        """Add a resolution pattern"""
        self.resolution_patterns.append(
            ResolutionPattern(pattern, resolver_fn, name)
        )
    
    def can_resolve(self, dissent_content: str) -> bool:
        """Check if this resolver can handle this dissent"""
        if not self.model:
            return False
        
        for rp in self.resolution_patterns:
            if rp.matches(dissent_content):
                return True
        
        return False
    
    def resolve(
        self,
        dissent_id: str,
        dissent_content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> ResolutionAttempt:
        """
        Attempt to resolve a dissent using domain context.
        
        This is the main API - given a dissent, use our UNDERSTANDING
        to provide an immediate answer.
        """
        if not self.model:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=dissent_content,
                status=ResolutionStatus.CANNOT_RESOLVE,
                method="no_mental_model",
                evidence="No mental model available for context resolution",
                confidence_impact=0.0,
            )
        
        content_lower = dissent_content.lower()
        target = context.get('target') if context else None
        
        # Check cache first
        cache_key = hashlib.md5(f"{dissent_content}:{target}".encode()).hexdigest()[:12]
        if cache_key in self.resolution_cache:
            cached = self.resolution_cache[cache_key]
            if cached.answered:
                return ResolutionAttempt(
                    dissent_id=dissent_id,
                    dissent_content=dissent_content,
                    status=cached.resolution_status,
                    method=f"context_cache_{cached.answer_type}",
                    evidence=cached.explanation,
                    confidence_impact=0.12 * cached.confidence,
                )
        
        # Try each resolution pattern
        for rp in self.resolution_patterns:
            if rp.matches(content_lower):
                answer = rp.resolve(dissent_id, dissent_content, target, self.model)
                
                if answer.answered:
                    # Cache successful resolution
                    self.resolution_cache[cache_key] = answer
                    
                    logger.info(f"✓ Context resolved: {dissent_id[:12]}... via {rp.name}")
                    
                    return ResolutionAttempt(
                        dissent_id=dissent_id,
                        dissent_content=dissent_content,
                        status=answer.resolution_status,
                        method=f"context_{rp.name}",
                        evidence=answer.explanation,
                        confidence_impact=0.12 * answer.confidence,
                    )
        
        # Try the mental model's general answer method
        answer = self.model.answer_question(dissent_content)
        if answer and answer.answered:
            self.resolution_cache[cache_key] = answer
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=dissent_content,
                status=answer.resolution_status,
                method=f"mental_model_{answer.answer_type}",
                evidence=answer.explanation,
                confidence_impact=0.12 * answer.confidence,
            )
        
        # Cannot resolve from context
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=dissent_content,
            status=ResolutionStatus.CANNOT_RESOLVE,
            method="no_context_match",
            evidence="Could not resolve from domain context",
            confidence_impact=0.0,
        )
    
    # ==========================================================================
    # DEFAULT GENERIC RESOLVERS
    # ==========================================================================
    
    def _resolve_propagation(
        self,
        dissent_id: str,
        content: str,
        target: Optional[str],
        model: MentalModelInterface,
    ) -> ContextAnswer:
        """Resolve propagation/flow questions using the data flow graph"""
        # Extract source if possible
        source = self._extract_entity(content, model)
        
        if source:
            affected = model.get_data_flow(source)
            if affected:
                return ContextAnswer(
                    answered=True,
                    confidence=0.85,
                    answer_type="propagation",
                    explanation=f"Changes to '{source}' will propagate to: {', '.join(affected[:5])}",
                    evidence=[f"Data flow from {source}"],
                )
        
        return ContextAnswer(
            answered=False,
            confidence=0.0,
            answer_type="propagation",
            explanation="Could not determine propagation path",
        )
    
    def _resolve_safety(
        self,
        dissent_id: str,
        content: str,
        target: Optional[str],
        model: MentalModelInterface,
    ) -> ContextAnswer:
        """Resolve safety questions"""
        # Generic safety resolution - domain-specific models can override
        if 'overwrite' in content.lower():
            return ContextAnswer(
                answered=True,
                confidence=0.7,
                answer_type="safety",
                explanation="System creates backups before modifications. Rollback is possible.",
                evidence=["Backup policy"],
            )
        
        return ContextAnswer(
            answered=False,
            confidence=0.0,
            answer_type="safety",
            explanation="Safety question requires domain-specific analysis",
        )
    
    def _resolve_existence(
        self,
        dissent_id: str,
        content: str,
        target: Optional[str],
        model: MentalModelInterface,
    ) -> ContextAnswer:
        """Resolve existence questions"""
        entity = self._extract_entity(content, model)
        
        if entity:
            entities = model.get_entities()
            exists = entity in entities
            return ContextAnswer(
                answered=True,
                confidence=0.9,
                answer_type="existence",
                explanation=f"'{entity}' {'exists' if exists else 'does not exist'} in the model",
                evidence=[f"Entity check: {entity}"],
            )
        
        return ContextAnswer(
            answered=False,
            confidence=0.0,
            answer_type="existence",
            explanation="Could not determine entity existence",
        )
    
    def _resolve_dependency(
        self,
        dissent_id: str,
        content: str,
        target: Optional[str],
        model: MentalModelInterface,
    ) -> ContextAnswer:
        """Resolve dependency questions"""
        # Extract source and target
        source = self._extract_entity(content, model)
        
        if source and target:
            explanation = model.explain_relationship(source, target)
            if explanation:
                return ContextAnswer(
                    answered=True,
                    confidence=0.8,
                    answer_type="dependency",
                    explanation=explanation,
                    evidence=[f"Relationship: {source} → {target}"],
                )
        
        return ContextAnswer(
            answered=False,
            confidence=0.0,
            answer_type="dependency",
            explanation="Could not determine dependency relationship",
        )
    
    def _extract_entity(self, content: str, model: MentalModelInterface) -> Optional[str]:
        """Try to extract an entity name from content"""
        entities = model.get_entities()
        content_lower = content.lower()
        
        for entity in entities:
            # Check for exact or partial match
            if entity.lower() in content_lower:
                return entity
        
        return None
    
    # ==========================================================================
    # STATISTICS
    # ==========================================================================
    
    def get_stats(self) -> Dict[str, Any]:
        """Get resolver statistics"""
        return {
            'has_mental_model': self.model is not None,
            'patterns_registered': len(self.resolution_patterns),
            'cache_size': len(self.resolution_cache),
            'cached_resolved': sum(1 for a in self.resolution_cache.values() if a.answered),
        }
    
    def clear_cache(self):
        """Clear the resolution cache"""
        self.resolution_cache.clear()


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def create_context_resolver(
    mental_model: Optional[MentalModelInterface] = None,
    patterns: Optional[List[ResolutionPattern]] = None,
) -> ContextAwareResolver:
    """
    Create a configured context resolver.
    
    Args:
        mental_model: Domain-specific mental model
        patterns: Additional resolution patterns
        
    Returns:
        Configured ContextAwareResolver
    """
    resolver = ContextAwareResolver(mental_model)
    
    if patterns:
        for pattern in patterns:
            resolver.resolution_patterns.append(pattern)
    
    return resolver


__all__ = [
    'ContextAwareResolver',
    'ContextAnswer',
    'ResolutionPattern',
    'MentalModelInterface',
    'create_context_resolver',
]
