"""
Semantic Bridge - Connect probes ↔ dissents ↔ resolutions

Prevents the system from repeatedly asking about things it has already verified.
"""

import re
import logging
from typing import Dict, List, Set, Optional, Any, Tuple
from dataclasses import dataclass

from ..core.data_classes import SemanticBridgeLink

logger = logging.getLogger(__name__)


class SemanticBridge:
    """
    Semantic Bridge - Connect probes ↔ dissents ↔ resolutions
    
    When a probe answers a question, we link that answer to all related dissents.
    This prevents the system from repeatedly asking about verified facts.
    """
    
    def __init__(self):
        self.links: List[SemanticBridgeLink] = []
        self.probe_index: Dict[str, Any] = {}
        self.dissent_index: Dict[str, str] = {}
        
        # Keyword groups for semantic matching
        self.keyword_groups = {
            'insertion': ['insert', 'row', 'append', 'target', 'write', 'a72'],
            'count': ['count', 'rows', 'csv', 'data', 'number'],
            'empty': ['empty', 'blank', 'clear', 'overwrite', 'safe'],
            'column': ['column', 'header', 'field', 'date'],
            'table': ['table', 'range', 'boundaries', 'listobject', 'expand'],
            'backup': ['backup', 'rollback', 'restore', 'snapshot'],
            'type': ['type', 'numeric', 'format', 'precision'],
            'formula': ['formula', 'sumif', 'index', 'match', 'lookup'],
            'propagate': ['propagate', 'flow', 'cascade', 'update', 'affect'],
        }
    
    def register_probe(self, probe_id: str, result: Any):
        """Register a probe result"""
        self.probe_index[probe_id] = result
        self._build_links_for_probe(probe_id, result)
    
    def register_dissent(self, dissent_id: str, content: str):
        """Register a dissent"""
        self.dissent_index[dissent_id] = content
        self._build_links_for_dissent(dissent_id, content)
    
    def _get_keywords(self, text: str) -> Set[str]:
        """Extract semantic keywords from text"""
        text_lower = text.lower()
        keywords = set()
        for group, terms in self.keyword_groups.items():
            if any(term in text_lower for term in terms):
                keywords.add(group)
        return keywords
    
    def _build_links_for_probe(self, probe_id: str, result: Any):
        """Build links from a new probe to existing dissents"""
        probe_keywords = self._get_keywords(probe_id)
        
        for dissent_id, content in self.dissent_index.items():
            dissent_keywords = self._get_keywords(content)
            
            overlap = probe_keywords & dissent_keywords
            if overlap:
                strength = len(overlap) / max(len(probe_keywords), len(dissent_keywords), 1)
                
                link = SemanticBridgeLink(
                    probe_id=probe_id,
                    probe_result=result,
                    dissent_ids=[dissent_id],
                    link_strength=min(strength * 1.5, 1.0),
                    link_reasoning=f"Matched on: {', '.join(overlap)}"
                )
                self.links.append(link)
    
    def _build_links_for_dissent(self, dissent_id: str, content: str):
        """Build links from a new dissent to existing probes"""
        dissent_keywords = self._get_keywords(content)
        
        for probe_id, result in self.probe_index.items():
            probe_keywords = self._get_keywords(probe_id)
            
            overlap = probe_keywords & dissent_keywords
            if overlap:
                strength = len(overlap) / max(len(probe_keywords), len(dissent_keywords), 1)
                
                link = SemanticBridgeLink(
                    probe_id=probe_id,
                    probe_result=result,
                    dissent_ids=[dissent_id],
                    link_strength=min(strength * 1.5, 1.0),
                    link_reasoning=f"Matched on: {', '.join(overlap)}"
                )
                self.links.append(link)
    
    def is_answered_by_probe(self, dissent_id: str) -> bool:
        """Check if a dissent is answered by any probe"""
        for link in self.links:
            if dissent_id in link.dissent_ids and link.link_strength >= 0.5:
                return True
        return False
    
    def get_answer_for_dissent(self, dissent_id: str) -> Optional[Tuple[str, Any]]:
        """Get the probe answer for a dissent"""
        best_link = None
        best_strength = 0
        
        for link in self.links:
            if dissent_id in link.dissent_ids and link.link_strength > best_strength:
                best_link = link
                best_strength = link.link_strength
        
        if best_link:
            return (best_link.probe_id, best_link.probe_result)
        return None
    
    def get_unanswered_dissents(self) -> List[str]:
        """Get dissent IDs not answered by any probe"""
        answered = set()
        for link in self.links:
            if link.link_strength >= 0.5:
                answered.update(link.dissent_ids)
        
        return [d for d in self.dissent_index.keys() if d not in answered]
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of the semantic bridge state"""
        answered = set()
        for link in self.links:
            if link.link_strength >= 0.5:
                answered.update(link.dissent_ids)
        
        return {
            'total_probes': len(self.probe_index),
            'total_dissents': len(self.dissent_index),
            'total_links': len(self.links),
            'dissents_answered': len(answered),
            'dissents_unanswered': len(self.dissent_index) - len(answered),
            'coverage': len(answered) / max(len(self.dissent_index), 1)
        }

