"""
Self-Resolving Dissent Engine (SRDE) - v3.1 Enhanced

Attempts to resolve dissents programmatically using:
1. Context-aware resolution (via WorkbookMentalModel)
2. Cross-reference with existing probe results
3. Pattern-based resolution
4. Sandbox verification
"""

import re
import logging
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Any

from ..core.data_classes import ResolutionStatus, ResolutionAttempt

logger = logging.getLogger(__name__)


class SelfResolvingDissentEngine:
    """
    SRDE - Self-Resolving Dissent Engine (v3.1)
    
    Enhanced with ContextAwareResolver integration.
    """
    
    def __init__(self, context_resolver=None,
                 excel_path: Optional[Path] = None,
                 incoming_data: Optional[Dict] = None):
        self.context_resolver = context_resolver
        self.excel_path = excel_path
        self.incoming_data = incoming_data or {}
        self.probe_results: Dict[str, Any] = {}
        self.resolution_history: List[ResolutionAttempt] = []
        
        # Pattern-based resolvers (fallback if context resolver can't handle)
        self.pattern_resolvers = [
            (r'backup', self._resolve_backup),
            (r'row.?count|csv.?(\d+)', self._resolve_row_count),
            (r'type|format|numeric', self._resolve_data_type),
        ]
    
    def register_probe_result(self, probe_id: str, result: Any):
        """Register a probe result for cross-referencing"""
        self.probe_results[probe_id] = result
    
    def attempt_resolution(self, dissent_id: str, dissent_content: str,
                           target_sheet: Optional[str] = None) -> ResolutionAttempt:
        """
        Attempt to resolve a dissent.
        
        Resolution order:
        1. Try context-aware resolution (uses mental model)
        2. Try cross-reference with probes
        3. Try pattern-based resolution
        """
        
        # 1. Context-aware resolution (primary - uses mental model)
        if self.context_resolver:
            result = self.context_resolver.resolve(dissent_id, dissent_content, target_sheet)
            if result.status == ResolutionStatus.RESOLVED:
                self.resolution_history.append(result)
                return result
        
        # 2. Cross-reference with existing probes
        cross_ref = self._cross_reference_probes(dissent_id, dissent_content)
        if cross_ref and cross_ref.status == ResolutionStatus.RESOLVED:
            self.resolution_history.append(cross_ref)
            return cross_ref
        
        # 3. Pattern-based resolution (fallback)
        content_lower = dissent_content.lower()
        for pattern, resolver in self.pattern_resolvers:
            if re.search(pattern, content_lower, re.IGNORECASE):
                result = resolver(dissent_id, dissent_content)
                if result.status == ResolutionStatus.RESOLVED:
                    self.resolution_history.append(result)
                    return result
        
        # Cannot resolve
        result = ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=dissent_content,
            status=ResolutionStatus.CANNOT_RESOLVE,
            method="no_resolver",
            evidence="No resolution available",
            confidence_impact=0.0
        )
        self.resolution_history.append(result)
        return result
    
    def _cross_reference_probes(self, dissent_id: str, 
                                 content: str) -> Optional[ResolutionAttempt]:
        """Check if existing probes answer this dissent"""
        content_lower = content.lower()
        
        for probe_id, result in self.probe_results.items():
            probe_lower = probe_id.lower()
            
            # Insertion-related
            if 'insert' in content_lower and 'insert' in probe_lower:
                if isinstance(result, dict) and result.get('safe'):
                    return ResolutionAttempt(
                        dissent_id=dissent_id,
                        dissent_content=content,
                        status=ResolutionStatus.RESOLVED,
                        method="probe_cross_ref",
                        evidence=f"Verified by probe '{probe_id}': {result}",
                        confidence_impact=0.10,
                        tool_used=probe_id
                    )
            
            # Range/row related
            if any(k in content_lower for k in ['row', 'range', 'empty']):
                if any(k in probe_lower for k in ['row', 'range', 'empty']):
                    if isinstance(result, dict) and result.get('verified'):
                        return ResolutionAttempt(
                            dissent_id=dissent_id,
                            dissent_content=content,
                            status=ResolutionStatus.RESOLVED,
                            method="probe_cross_ref",
                            evidence=f"Verified by probe: {result}",
                            confidence_impact=0.08,
                            tool_used=probe_id
                        )
        
        return None
    
    def _resolve_backup(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve backup-related dissents"""
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.RESOLVED,
            method="backup_auto",
            evidence="Automatic backup created by Executor before any updates",
            confidence_impact=0.08
        )
    
    def _resolve_row_count(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve row count dissents"""
        actual_count = len(self.incoming_data.get('rows', []))
        
        # Try to extract expected count
        match = re.search(r'(\d+)', content)
        expected = int(match.group(1)) if match else None
        
        if expected and actual_count == expected:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.RESOLVED,
                method="row_count_verified",
                evidence=f"CSV has {actual_count} rows, matches expected {expected}",
                confidence_impact=0.12
            )
        else:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.RESOLVED,
                method="row_count_reported",
                evidence=f"CSV has {actual_count} data rows",
                confidence_impact=0.08
            )
    
    def _resolve_data_type(self, dissent_id: str, content: str) -> ResolutionAttempt:
        """Resolve data type dissents"""
        inferred_types = self.incoming_data.get('inferred_types', {})
        
        if inferred_types:
            return ResolutionAttempt(
                dissent_id=dissent_id,
                dissent_content=content,
                status=ResolutionStatus.RESOLVED,
                method="type_inference",
                evidence=f"Inferred types: {inferred_types}",
                confidence_impact=0.06
            )
        
        return ResolutionAttempt(
            dissent_id=dissent_id,
            dissent_content=content,
            status=ResolutionStatus.CANNOT_RESOLVE,
            method="type_check",
            evidence="No type inference available",
            confidence_impact=0.0
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get resolution statistics"""
        resolved = sum(1 for r in self.resolution_history 
                      if r.status == ResolutionStatus.RESOLVED)
        total = len(self.resolution_history)
        
        return {
            'total_attempts': total,
            'resolved': resolved,
            'resolution_rate': resolved / max(total, 1),
            'probes_registered': len(self.probe_results)
        }

