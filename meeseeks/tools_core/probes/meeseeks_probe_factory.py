"""
meeseeks_probe_factory.py - METACOGNITIVE PROBE SYNTHESIS

"I'M MR. MEESEEKS! I CREATE VERIFICATION TOOLS ON THE FLY!"

The Probe Factory dynamically synthesizes verification probes from:
1. Council dissenting points
2. Hypothesis testing needs
3. Verification requirements

This is DOMAIN-AGNOSTIC - domain-specific probe templates plug in.
Extracted from the battle-tested RSI v3.2 engine.
"""

import re
import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Callable

try:
    from ..core.meeseeks_data_classes import (
        ProbeType,
        SynthesizedProbe,
        ProbeResult,
        CouncilVote,
    )
except ImportError:
    from core.meeseeks_data_classes import (
        ProbeType,
        SynthesizedProbe,
        ProbeResult,
        CouncilVote,
    )

logger = logging.getLogger(__name__)


# =============================================================================
# PROBE TEMPLATES (Generic)
# =============================================================================

GENERIC_PROBE_TEMPLATES = {
    ProbeType.CHECK_EXISTS: '''
def check_exists(target, identifier):
    """Check if something exists"""
    # Override with domain-specific implementation
    return {"exists": target is not None, "identifier": identifier}
''',
    ProbeType.CHECK_VALUE: '''
def check_value(target, expected):
    """Check if value matches expected"""
    actual = target
    return {
        "matches": actual == expected,
        "actual": actual,
        "expected": expected
    }
''',
    ProbeType.COUNT_ITEMS: '''
def count_items(collection, filter_fn=None):
    """Count items, optionally filtered"""
    if filter_fn:
        return len([x for x in collection if filter_fn(x)])
    return len(collection)
''',
    ProbeType.CHECK_INVARIANT: '''
def check_invariant(before, after, relation="equals"):
    """Check if invariant holds between before and after"""
    if relation == "equals":
        return before == after
    elif relation == "greater_than":
        return after > before
    elif relation == "less_than":
        return after < before
    elif relation == "not_changed":
        return before == after
    return None
''',
    ProbeType.VALIDATE_SCHEMA: '''
def validate_schema(data, schema):
    """Validate data against schema"""
    # Basic validation - override with jsonschema etc
    errors = []
    for key, expected_type in schema.items():
        if key not in data:
            errors.append(f"Missing key: {key}")
        elif not isinstance(data[key], expected_type):
            errors.append(f"Type mismatch for {key}")
    return {"valid": len(errors) == 0, "errors": errors}
''',
    ProbeType.COMPARE_BEFORE_AFTER: '''
def compare_before_after(before, after):
    """Compare before and after states"""
    changes = {}
    for key in set(list(before.keys()) + list(after.keys())):
        before_val = before.get(key)
        after_val = after.get(key)
        if before_val != after_val:
            changes[key] = {"before": before_val, "after": after_val}
    return {"changed": len(changes) > 0, "changes": changes}
''',
}


class ProbeTemplate:
    """
    A reusable probe template.
    
    Templates are domain-specific code patterns that can be
    instantiated with parameters.
    """
    
    def __init__(
        self,
        probe_type: ProbeType,
        name: str,
        code: str,
        description: str,
        parameters: List[str],
    ):
        self.probe_type = probe_type
        self.name = name
        self.code = code
        self.description = description
        self.parameters = parameters
    
    def instantiate(
        self,
        params: Dict[str, Any],
        generated_by: str,
        from_dissent: Optional[str] = None,
    ) -> SynthesizedProbe:
        """Create a SynthesizedProbe from this template"""
        return SynthesizedProbe(
            name=f"{self.name}_{hash(str(params)) % 10000}",
            probe_type=self.probe_type,
            description=self.description,
            code=self.code,
            parameters=params,
            generated_by=generated_by,
            from_dissent=from_dissent,
        )


class ProbeExecutor(ABC):
    """
    Abstract base for executing probes in a domain.
    
    Implement this for each domain:
    - ExcelProbeExecutor (executes in openpyxl)
    - PDFProbeExecutor (executes against PDF)
    - CodeProbeExecutor (executes against AST)
    """
    
    @abstractmethod
    def execute(
        self,
        probe: SynthesizedProbe,
        context: Dict[str, Any],
    ) -> ProbeResult:
        """Execute a probe and return results"""
        pass


class MetacognitiveProbeFactory:
    """
    MPS - Metacognitive Probe Synthesis
    
    "LOOK AT ME! I CREATE PROBES FROM DISSENTS!"
    
    The probe factory:
    1. Parses council dissenting points
    2. Identifies what needs verification
    3. Synthesizes appropriate probes
    4. Executes them (via domain-specific executor)
    5. Returns results for resolution
    
    This is the key to programmatic verification - instead of
    asking humans to verify, we CREATE tools to verify automatically.
    
    Usage:
        factory = MetacognitiveProbeFactory()
        factory.register_template(excel_count_rows_template)
        factory.set_executor(excel_executor)
        
        probes = factory.synthesize_from_council(votes)
        results = factory.execute_probes(probes, context)
    """
    
    def __init__(self):
        self.templates: Dict[str, ProbeTemplate] = {}
        self.synthesized_probes: List[SynthesizedProbe] = []
        self.executor: Optional[ProbeExecutor] = None
        
        # Dissent-to-probe-type mapping
        self.dissent_patterns: List[tuple] = [
            # (regex_pattern, probe_type, param_extractor)
            (r'count|number|total|(\d+)\s*(items?|rows?|records?)', 
             ProbeType.COUNT_ITEMS, self._extract_count_params),
            (r'exist|missing|find|where', 
             ProbeType.CHECK_EXISTS, self._extract_exists_params),
            (r'value|equals?|match|same', 
             ProbeType.CHECK_VALUE, self._extract_value_params),
            (r'valid|schema|type|format', 
             ProbeType.VALIDATE_SCHEMA, self._extract_schema_params),
            (r'chang|diff|before|after|compar', 
             ProbeType.COMPARE_BEFORE_AFTER, self._extract_compare_params),
            (r'invariant|unchanged|constant|preserved', 
             ProbeType.CHECK_INVARIANT, self._extract_invariant_params),
        ]
        
        # Register generic templates
        self._register_generic_templates()
    
    def _register_generic_templates(self):
        """Register the built-in generic templates"""
        for probe_type, code in GENERIC_PROBE_TEMPLATES.items():
            self.templates[probe_type.value] = ProbeTemplate(
                probe_type=probe_type,
                name=probe_type.value,
                code=code,
                description=f"Generic {probe_type.value} probe",
                parameters=[],
            )
    
    def register_template(self, template: ProbeTemplate):
        """Register a domain-specific probe template"""
        self.templates[template.name] = template
        logger.debug(f"Registered probe template: {template.name}")
    
    def set_executor(self, executor: ProbeExecutor):
        """Set the domain-specific probe executor"""
        self.executor = executor
    
    def synthesize_from_council(
        self,
        votes: List[CouncilVote],
    ) -> List[SynthesizedProbe]:
        """
        Parse council feedback and synthesize probes for dissenting points.
        
        This is the key innovation - dissents become verification tools!
        """
        new_probes = []
        
        for vote in votes:
            for dissent in vote.dissenting_points:
                probe = self._synthesize_from_dissent(dissent, vote.model)
                if probe:
                    new_probes.append(probe)
                    self.synthesized_probes.append(probe)
        
        if new_probes:
            logger.info(f"🔬 Synthesized {len(new_probes)} probes from council dissents")
        
        return new_probes
    
    def synthesize_from_hypothesis(
        self,
        hypothesis: str,
        test_method: str,
        model: str = "hypothesis",
    ) -> Optional[SynthesizedProbe]:
        """
        Synthesize a probe to test a hypothesis.
        """
        return self._synthesize_from_dissent(
            f"{hypothesis}: {test_method}",
            model,
        )
    
    def _synthesize_from_dissent(
        self,
        dissent: str,
        model: str,
    ) -> Optional[SynthesizedProbe]:
        """Synthesize a probe from a dissenting point"""
        dissent_lower = dissent.lower()
        
        for pattern, probe_type, param_extractor in self.dissent_patterns:
            if re.search(pattern, dissent_lower):
                params = param_extractor(dissent)
                
                # Find best template
                template = self.templates.get(probe_type.value)
                if template:
                    return template.instantiate(
                        params=params,
                        generated_by=model,
                        from_dissent=dissent[:200],
                    )
                else:
                    # Use generic template
                    return SynthesizedProbe(
                        name=f"{probe_type.value}_{len(self.synthesized_probes)}",
                        probe_type=probe_type,
                        description=f"Auto-generated from: {dissent[:100]}",
                        code=GENERIC_PROBE_TEMPLATES.get(probe_type, "pass"),
                        parameters=params,
                        generated_by=model,
                        from_dissent=dissent[:200],
                    )
        
        return None
    
    def execute_probes(
        self,
        probes: List[SynthesizedProbe],
        context: Dict[str, Any],
    ) -> List[ProbeResult]:
        """Execute a list of probes using the domain executor"""
        if not self.executor:
            logger.warning("No executor set - cannot execute probes")
            return []
        
        results = []
        for probe in probes:
            try:
                result = self.executor.execute(probe, context)
                results.append(result)
                logger.debug(f"Executed probe {probe.name}: verified={result.verified}")
            except Exception as e:
                logger.error(f"Failed to execute probe {probe.name}: {e}")
                results.append(ProbeResult(
                    probe_type=probe.probe_type,
                    probe_id=probe.name,
                    target="unknown",
                    result={"error": str(e)},
                    verified=False,
                    confidence_impact=-0.05,
                    evidence=f"Probe failed: {e}",
                ))
        
        return results
    
    # ==========================================================================
    # PARAMETER EXTRACTORS
    # ==========================================================================
    
    def _extract_count_params(self, dissent: str) -> Dict[str, Any]:
        """Extract parameters for count probes"""
        params = {}
        
        # Try to extract expected count
        match = re.search(r'(\d+)', dissent)
        if match:
            params['expected_count'] = int(match.group(1))
        
        # Try to extract target
        target_match = re.search(r'(rows?|items?|records?|entries)', dissent.lower())
        if target_match:
            params['target_type'] = target_match.group(1)
        
        return params
    
    def _extract_exists_params(self, dissent: str) -> Dict[str, Any]:
        """Extract parameters for existence probes"""
        params = {}
        
        # Try to extract quoted identifier
        match = re.search(r'["\']([^"\']+)["\']', dissent)
        if match:
            params['identifier'] = match.group(1)
        
        return params
    
    def _extract_value_params(self, dissent: str) -> Dict[str, Any]:
        """Extract parameters for value check probes"""
        params = {}
        
        # Try to extract expected value
        match = re.search(r'(?:equals?|value|match)\s*[=:]\s*["\']?([^"\']+)["\']?', dissent.lower())
        if match:
            params['expected'] = match.group(1)
        
        return params
    
    def _extract_schema_params(self, dissent: str) -> Dict[str, Any]:
        """Extract parameters for schema validation probes"""
        return {}  # Schema usually provided separately
    
    def _extract_compare_params(self, dissent: str) -> Dict[str, Any]:
        """Extract parameters for comparison probes"""
        return {}  # Before/after provided at execution
    
    def _extract_invariant_params(self, dissent: str) -> Dict[str, Any]:
        """Extract parameters for invariant probes"""
        params = {'relation': 'not_changed'}
        
        if 'greater' in dissent.lower():
            params['relation'] = 'greater_than'
        elif 'less' in dissent.lower():
            params['relation'] = 'less_than'
        
        return params
    
    # ==========================================================================
    # STATISTICS
    # ==========================================================================
    
    def get_stats(self) -> Dict[str, Any]:
        """Get factory statistics"""
        by_type = {}
        for probe in self.synthesized_probes:
            t = probe.probe_type.value
            by_type[t] = by_type.get(t, 0) + 1
        
        return {
            'total_synthesized': len(self.synthesized_probes),
            'templates_registered': len(self.templates),
            'by_type': by_type,
            'has_executor': self.executor is not None,
        }


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def create_probe_factory(
    executor: Optional[ProbeExecutor] = None,
    templates: Optional[List[ProbeTemplate]] = None,
) -> MetacognitiveProbeFactory:
    """
    Create a configured probe factory.
    
    Args:
        executor: Domain-specific probe executor
        templates: Additional domain-specific templates
        
    Returns:
        Configured MetacognitiveProbeFactory
    """
    factory = MetacognitiveProbeFactory()
    
    if executor:
        factory.set_executor(executor)
    
    if templates:
        for template in templates:
            factory.register_template(template)
    
    return factory


__all__ = [
    'MetacognitiveProbeFactory',
    'ProbeTemplate',
    'ProbeExecutor',
    'create_probe_factory',
    'GENERIC_PROBE_TEMPLATES',
]
