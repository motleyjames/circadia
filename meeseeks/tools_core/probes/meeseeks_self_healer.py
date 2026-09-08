#!/usr/bin/env python3
"""
Self-Healer Tool
================
A recursive self-intelligence tool for self-healing code and DSL parsing.

When the parser encounters something it doesn't understand, this tool:
1. Analyzes the context
2. Calls LLMs to determine user intent
3. Suggests resolutions with confidence scores
4. Learns from user feedback

Usage:
    python self_healer.py --input "unclear value" --context "surrounding code"
    python self_healer.py --batch clarity_requests.json
    
Example:
    python self_healer.py --input "gap: cozy" --context "Panel layout"
"""

import argparse
import json
import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

# Import from core - try both import paths for flexibility
try:
    from core.meeseeks_tracer import Tracer, Phase
    from core.meeseeks_llm_caller import call_gemini_flash, call_claude_sonnet
except ImportError:
    from tools_core.core.meeseeks_tracer import Tracer, Phase
    from tools_core.core.meeseeks_llm_caller import call_gemini_flash, call_claude_sonnet


class ClarityType(Enum):
    TYPO = "typo"
    UNKNOWN_VALUE = "unknown_value"  
    AMBIGUOUS_INTENT = "ambiguous_intent"
    MISSING_CONTEXT = "missing_context"
    SEMANTIC_MISMATCH = "semantic_mismatch"


@dataclass
class Resolution:
    """A suggested resolution for an unclear value."""
    value: str
    confidence: float  # 0.0 to 1.0
    reasoning: str
    source: str  # 'fuzzy_match', 'llm', 'context_inference'


@dataclass  
class ClarityRequest:
    """A request for clarity on an unclear value."""
    id: str
    original_value: str
    context: str
    line: int
    attribute: str
    clarity_type: ClarityType
    suggestions: List[Resolution]
    resolved: bool = False
    final_value: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'original_value': self.original_value,
            'context': self.context,
            'line': self.line,
            'attribute': self.attribute,
            'clarity_type': self.clarity_type.value,
            'suggestions': [asdict(s) for s in self.suggestions],
            'resolved': self.resolved,
            'final_value': self.final_value,
        }


class SelfHealer:
    """Self-healing parser assistant."""
    
    # Known semantic vocabulary
    SEMANTIC_VOCABULARY = {
        'gap': ['none', 'tight', 'slight', 'comfortable', 'spacious', 'roomy', 'expansive'],
        'padding': ['none', 'tight', 'slight', 'comfortable', 'spacious', 'roomy', 'expansive'],
        'margin': ['none', 'tight', 'slight', 'comfortable', 'spacious', 'roomy', 'expansive'],
        'size': ['tiny', 'xs', 'small', 'sm', 'medium', 'md', 'large', 'lg', 'huge', 'xl', 'massive', '2xl'],
        'color': ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'muted', 'text-primary', 'text-secondary', 'surface', 'background'],
        'weight': ['thin', 'light', 'normal', 'medium', 'semibold', 'bold', 'heavy', 'black'],
        'radius': ['none', 'slight', 'medium', 'large', 'full'],
        'shadow': ['none', 'subtle', 'medium', 'strong', 'dramatic'],
        'opacity': ['invisible', 'faint', 'dim', 'medium', 'visible', 'opaque'],
    }
    
    def __init__(self):
        self.tracer = Tracer('self-healer')
        self.resolution_cache: Dict[str, Resolution] = {}
    
    def levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings."""
        if len(s1) < len(s2):
            return self.levenshtein_distance(s2, s1)
        
        if len(s2) == 0:
            return len(s1)
        
        prev_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = prev_row[j + 1] + 1
                deletions = curr_row[j] + 1
                substitutions = prev_row[j] + (c1 != c2)
                curr_row.append(min(insertions, deletions, substitutions))
            prev_row = curr_row
        
        return prev_row[-1]
    
    def fuzzy_match(self, value: str, candidates: List[str], threshold: float = 0.6) -> List[Tuple[str, float]]:
        """Find fuzzy matches for a value among candidates."""
        matches = []
        value_lower = value.lower()
        
        for candidate in candidates:
            cand_lower = candidate.lower()
            
            # Exact match
            if value_lower == cand_lower:
                matches.append((candidate, 1.0))
                continue
            
            # Levenshtein similarity
            distance = self.levenshtein_distance(value_lower, cand_lower)
            max_len = max(len(value_lower), len(cand_lower))
            similarity = 1 - (distance / max_len) if max_len > 0 else 0
            
            if similarity >= threshold:
                matches.append((candidate, similarity))
        
        return sorted(matches, key=lambda x: x[1], reverse=True)
    
    def detect_clarity_type(self, value: str, attribute: str) -> ClarityType:
        """Detect what type of clarity issue this is."""
        
        vocab = self.SEMANTIC_VOCABULARY.get(attribute, [])
        
        if vocab:
            matches = self.fuzzy_match(value, vocab, threshold=0.5)
            if matches and matches[0][1] > 0.7:
                return ClarityType.TYPO
            elif matches:
                return ClarityType.UNKNOWN_VALUE
        
        # Check if it looks like a different type of value
        if re.match(r'^\d+px$', value):
            return ClarityType.SEMANTIC_MISMATCH
        if re.match(r'^#[0-9a-fA-F]+$', value):
            return ClarityType.SEMANTIC_MISMATCH
        
        return ClarityType.AMBIGUOUS_INTENT
    
    def generate_fuzzy_suggestions(self, value: str, attribute: str) -> List[Resolution]:
        """Generate suggestions using fuzzy matching."""
        suggestions = []
        
        vocab = self.SEMANTIC_VOCABULARY.get(attribute, [])
        if not vocab:
            return suggestions
        
        matches = self.fuzzy_match(value, vocab)
        
        for candidate, similarity in matches[:3]:
            suggestions.append(Resolution(
                value=candidate,
                confidence=similarity,
                reasoning=f"Similar to '{value}' (similarity: {similarity:.0%})",
                source='fuzzy_match',
            ))
        
        return suggestions
    
    def generate_llm_suggestions(
        self, 
        value: str, 
        attribute: str, 
        context: str,
        model: str = "gemini"
    ) -> List[Resolution]:
        """Generate suggestions using LLM."""
        
        vocab = self.SEMANTIC_VOCABULARY.get(attribute, [])
        vocab_str = ', '.join(vocab) if vocab else "any semantic value"
        
        prompt = f"""
A DSL parser encountered an unclear value and needs help understanding user intent.

Attribute: {attribute}
Original Value: "{value}"
Context: {context}
Valid Vocabulary: {vocab_str}

What did the user likely mean? Provide up to 3 suggestions.
For each, explain your reasoning and give a confidence (0.0-1.0).

Output as JSON array:
[
  {{"value": "...", "confidence": 0.9, "reasoning": "..."}}
]
"""
        
        try:
            if model == "gemini":
                response = call_gemini_flash(prompt, system="You are a helpful DSL interpreter.")
            else:
                response = call_claude_sonnet(prompt, system="You are a helpful DSL interpreter.")
            
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                items = json.loads(json_match.group(0))
                return [
                    Resolution(
                        value=item.get('value', ''),
                        confidence=float(item.get('confidence', 0.5)),
                        reasoning=item.get('reasoning', ''),
                        source='llm',
                    )
                    for item in items[:3]
                ]
        except Exception as e:
            print(f"LLM suggestion failed: {e}")
        
        return []
    
    def heal(
        self,
        value: str,
        attribute: str,
        context: str = "",
        line: int = 0,
        use_llm: bool = True,
    ) -> ClarityRequest:
        """Attempt to heal an unclear value."""
        
        # Check cache first
        cache_key = f"{attribute}:{value}"
        if cache_key in self.resolution_cache:
            cached = self.resolution_cache[cache_key]
            return ClarityRequest(
                id=f"cr_{hash(cache_key) % 10000:04d}",
                original_value=value,
                context=context,
                line=line,
                attribute=attribute,
                clarity_type=ClarityType.UNKNOWN_VALUE,
                suggestions=[cached],
                resolved=True,
                final_value=cached.value,
            )
        
        # Detect type
        clarity_type = self.detect_clarity_type(value, attribute)
        
        # Generate suggestions
        suggestions = []
        
        # 1. Fuzzy matching (fast, local)
        fuzzy = self.generate_fuzzy_suggestions(value, attribute)
        suggestions.extend(fuzzy)
        
        # 2. LLM suggestions (slower, smarter)
        if use_llm and (not fuzzy or fuzzy[0].confidence < 0.9):
            llm = self.generate_llm_suggestions(value, attribute, context)
            suggestions.extend(llm)
        
        # Sort by confidence
        suggestions.sort(key=lambda x: x.confidence, reverse=True)
        
        # Auto-resolve if high confidence
        resolved = False
        final_value = None
        if suggestions and suggestions[0].confidence >= 0.95:
            resolved = True
            final_value = suggestions[0].value
            self.resolution_cache[cache_key] = suggestions[0]
        
        request = ClarityRequest(
            id=f"cr_{hash(cache_key) % 10000:04d}",
            original_value=value,
            context=context,
            line=line,
            attribute=attribute,
            clarity_type=clarity_type,
            suggestions=suggestions[:5],
            resolved=resolved,
            final_value=final_value,
        )
        
        # Log to tracer
        self.tracer.log(
            phase=Phase.ANALYSIS,
            title=f"Heal: {attribute}={value}",
            context=f"Line {line}: {context}",
            reasoning=f"""
Type: {clarity_type.value}
Suggestions: {len(suggestions)}
Top suggestion: {suggestions[0].value if suggestions else 'None'} ({suggestions[0].confidence:.0%} confidence)
Resolved: {resolved}
""",
            decision_action=f"{'Auto-resolved' if resolved else 'Needs user input'}",
            next_steps=["Present to user" if not resolved else "Use resolved value"],
        )
        
        return request


def self_heal(
    value: str,
    attribute: str,
    context: str = "",
    line: int = 0,
    use_llm: bool = True,
) -> ClarityRequest:
    """
    Convenience wrapper for a single self-heal request.
    
    Public API:
        from tools_core.probes import self_heal
        req = self_heal(value="gap: cozy", attribute="gap", context="Panel layout")
    """
    healer = SelfHealer()
    return healer.heal(
        value=value,
        attribute=attribute,
        context=context,
        line=line,
        use_llm=use_llm,
    )
    
    def batch_heal(self, requests: List[Dict[str, Any]]) -> List[ClarityRequest]:
        """Process a batch of clarity requests."""
        results = []
        
        for req in requests:
            result = self.heal(
                value=req.get('value', ''),
                attribute=req.get('attribute', ''),
                context=req.get('context', ''),
                line=req.get('line', 0),
            )
            results.append(result)
        
        return results


def main():
    parser = argparse.ArgumentParser(
        description="Self-healing tool for unclear DSL values"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        help="Unclear value to heal"
    )
    parser.add_argument(
        "--attribute", "-a",
        type=str,
        default="gap",
        help="Attribute name"
    )
    parser.add_argument(
        "--context", "-c",
        type=str,
        default="",
        help="Surrounding context"
    )
    parser.add_argument(
        "--line", "-l",
        type=int,
        default=0,
        help="Line number"
    )
    parser.add_argument(
        "--batch", "-b",
        type=str,
        help="JSON file with batch requests"
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Disable LLM suggestions"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        help="Output file for results"
    )
    
    args = parser.parse_args()
    
    healer = SelfHealer()
    
    if args.batch:
        # Batch mode
        with open(args.batch) as f:
            requests = json.load(f)
        results = healer.batch_heal(requests)
        
        print(f"Processed {len(results)} requests")
        for r in results:
            status = "✅" if r.resolved else "❓"
            print(f"{status} {r.attribute}={r.original_value} → {r.final_value or 'needs input'}")
    
    elif args.input:
        # Single value mode
        result = healer.heal(
            value=args.input,
            attribute=args.attribute,
            context=args.context,
            line=args.line,
            use_llm=not args.no_llm,
        )
        
        print("\n" + "=" * 50)
        print(f"SELF-HEAL: {args.attribute}={args.input}")
        print("=" * 50)
        print(f"Type: {result.clarity_type.value}")
        print(f"Resolved: {result.resolved}")
        
        if result.suggestions:
            print("\nSuggestions:")
            for i, s in enumerate(result.suggestions, 1):
                marker = "→" if result.final_value == s.value else " "
                print(f"  {marker} {i}. {s.value} ({s.confidence:.0%})")
                print(f"       {s.reasoning}")
                print(f"       Source: {s.source}")
        
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(result.to_dict(), f, indent=2)
            print(f"\nSaved to: {args.output}")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

