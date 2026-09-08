#!/usr/bin/env python3
"""
Opportunity Discovery Tool
==========================
A recursive self-intelligence tool for discovering opportunities in codebases.

This tool performs multi-loop discovery:
- Loop 1: Read existing traces and understand context
- Loop 2: Identify gaps and opportunities  
- Loop 3: Design the most magical/impactful opportunity

Usage:
    python opportunity_discovery.py [--loops N] [--focus AREA]
    
Example:
    python opportunity_discovery.py --loops 3 --focus "user experience"
"""

import argparse
import json
import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

# Import from core - try both import paths for flexibility
try:
    from core.meeseeks_tracer import Tracer, Phase
    from core.meeseeks_llm_caller import call_gemini_flash, call_claude_sonnet
except ImportError:
    from tools_core.core.meeseeks_tracer import Tracer, Phase
    from tools_core.core.meeseeks_llm_caller import call_gemini_flash, call_claude_sonnet


def read_existing_traces(traces_dir: Path) -> List[Dict[str, Any]]:
    """Read all existing trace sessions to understand prior context."""
    sessions = []
    
    if not traces_dir.exists():
        return sessions
    
    for session_dir in traces_dir.iterdir():
        if session_dir.is_dir():
            # Read the trace markdown file
            for md_file in session_dir.glob("*.md"):
                try:
                    content = md_file.read_text()
                    sessions.append({
                        'name': session_dir.name,
                        'file': md_file.name,
                        'content': content[:5000],  # First 5k chars
                        'path': str(md_file),
                    })
                except Exception as e:
                    print(f"Warning: Could not read {md_file}: {e}")
    
    return sessions


def synthesize_context(sessions: List[Dict[str, Any]]) -> str:
    """Synthesize understanding from existing traces."""
    if not sessions:
        return "No existing traces found. Starting fresh."
    
    summary = f"Found {len(sessions)} existing trace sessions:\n\n"
    for s in sessions[:10]:  # Limit to 10 most recent
        summary += f"- {s['name']}: {s['content'][:200]}...\n"
    
    return summary


def identify_opportunities(
    context: str, 
    focus_area: Optional[str] = None,
    model: str = "gemini"
) -> List[Dict[str, Any]]:
    """Use LLM to identify opportunities from context."""
    
    prompt = f"""
Analyze this context from a software project and identify 5 unique opportunities
for improvement or new features.

Context:
{context[:8000]}

{f"Focus Area: {focus_area}" if focus_area else ""}

For each opportunity, provide:
1. A short name (3-5 words)
2. Why it's magical (what makes it special)
3. Implementation complexity (low/medium/high)
4. Impact potential (low/medium/high)

Output as JSON array:
[
  {{
    "name": "...",
    "magic": "...",
    "complexity": "low|medium|high",
    "impact": "low|medium|high",
    "implementation_hint": "..."
  }}
]
"""
    
    if model == "gemini":
        response = call_gemini_flash(prompt, system="You are a creative software architect.")
    else:
        response = call_claude_sonnet(prompt, system="You are a creative software architect.")
    
    # Parse JSON from response
    try:
        json_match = re.search(r'\[[\s\S]*\]', response)
        if json_match:
            return json.loads(json_match.group(0))
    except json.JSONDecodeError:
        pass
    
    return [{"name": "Parse Error", "raw": response[:500]}]


def rank_opportunities(opportunities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Rank opportunities by impact/complexity ratio."""
    
    complexity_scores = {"low": 3, "medium": 2, "high": 1}
    impact_scores = {"low": 1, "medium": 2, "high": 3}
    
    for opp in opportunities:
        c = complexity_scores.get(opp.get("complexity", "medium"), 2)
        i = impact_scores.get(opp.get("impact", "medium"), 2)
        opp["score"] = c * i  # Higher is better (high impact, low complexity)
    
    return sorted(opportunities, key=lambda x: x.get("score", 0), reverse=True)


def design_opportunity(
    opportunity: Dict[str, Any],
    model: str = "gemini"
) -> Dict[str, Any]:
    """Design the selected opportunity in detail."""
    
    prompt = f"""
Design this feature in detail:

Feature: {opportunity.get('name', 'Unknown')}
Magic: {opportunity.get('magic', 'Unknown')}

Provide a detailed design including:
1. UI/UX considerations
2. Data structures needed
3. Integration points
4. Implementation steps (numbered list)
5. Potential challenges

Output as JSON:
{{
  "name": "...",
  "ui_design": "...",
  "data_structures": [...],
  "integration_points": [...],
  "implementation_steps": [...],
  "challenges": [...],
  "estimated_effort": "X hours/days"
}}
"""
    
    if model == "gemini":
        response = call_gemini_flash(prompt, system="You are a senior software designer.")
    else:
        response = call_claude_sonnet(prompt, system="You are a senior software designer.")
    
    try:
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            return json.loads(json_match.group(0))
    except json.JSONDecodeError:
        pass
    
    return {"name": opportunity.get("name"), "raw_design": response[:1000]}


def run_discovery(
    loops: int = 3,
    focus_area: Optional[str] = None,
    output_dir: Optional[Path] = None
) -> Dict[str, Any]:
    """Run the full opportunity discovery process."""
    
    script_dir = Path(__file__).parent
    traces_dir = script_dir / "traces"
    
    tracer = Tracer(f"opportunity-discovery-{loops}loops")
    
    results = {
        "loops_completed": 0,
        "opportunities": [],
        "selected": None,
        "design": None,
    }
    
    print("=" * 60)
    print(f"OPPORTUNITY DISCOVERY - {loops} Loops")
    print("=" * 60)
    
    # Loop 1: Understand Context
    print("\n🔍 Loop 1: Understanding Context...")
    sessions = read_existing_traces(traces_dir)
    context = synthesize_context(sessions)
    
    tracer.log(
        phase=Phase.ANALYSIS,
        title="Loop 1: Context Understanding",
        context=f"Read {len(sessions)} existing trace sessions",
        reasoning=context[:2000],
        decision_action="Proceed to opportunity identification",
        next_steps=["Identify opportunities", "Rank by impact"],
    )
    
    results["loops_completed"] = 1
    print(f"   ✅ Read {len(sessions)} trace sessions")
    
    if loops < 2:
        return results
    
    # Loop 2: Identify Opportunities
    print("\n💡 Loop 2: Identifying Opportunities...")
    opportunities = identify_opportunities(context, focus_area)
    ranked = rank_opportunities(opportunities)
    
    tracer.log(
        phase=Phase.ARCHITECTURE,
        title="Loop 2: Opportunity Identification",
        context=f"Identified {len(ranked)} opportunities",
        reasoning=json.dumps(ranked, indent=2)[:3000],
        decision_action="Rank and select best opportunity",
        next_steps=["Design selected opportunity"],
    )
    
    results["loops_completed"] = 2
    results["opportunities"] = ranked
    
    for i, opp in enumerate(ranked[:5], 1):
        print(f"   {i}. {opp.get('name', 'Unknown')} (score: {opp.get('score', 0)})")
    
    if loops < 3:
        return results
    
    # Loop 3: Design Best Opportunity
    print("\n🎨 Loop 3: Designing Best Opportunity...")
    
    if ranked:
        selected = ranked[0]
        design = design_opportunity(selected)
        
        tracer.log(
            phase=Phase.IMPLEMENTATION,
            title="Loop 3: Opportunity Design",
            context=f"Designing: {selected.get('name', 'Unknown')}",
            reasoning=json.dumps(design, indent=2)[:3000],
            decision_action="Design complete",
            next_steps=design.get("implementation_steps", [])[:5],
        )
        
        results["loops_completed"] = 3
        results["selected"] = selected
        results["design"] = design
        
        print(f"   ✅ Selected: {selected.get('name', 'Unknown')}")
        print(f"   📐 Design complete")
    
    # Save results
    if output_dir:
        output_file = output_dir / "discovery_results.json"
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n📁 Results saved to: {output_file}")
    
    print(f"\n🎯 Trace saved to: {tracer.get_session_path()}")
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Discover opportunities in a codebase using recursive self-intelligence"
    )
    parser.add_argument(
        "--loops", "-l",
        type=int,
        default=3,
        help="Number of discovery loops (1-3)"
    )
    parser.add_argument(
        "--focus", "-f",
        type=str,
        default=None,
        help="Focus area for opportunity discovery"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Output directory for results"
    )
    
    args = parser.parse_args()
    
    output_dir = Path(args.output) if args.output else None
    
    results = run_discovery(
        loops=min(max(args.loops, 1), 3),
        focus_area=args.focus,
        output_dir=output_dir,
    )
    
    print("\n" + "=" * 60)
    print("DISCOVERY COMPLETE")
    print("=" * 60)
    print(f"Loops: {results['loops_completed']}")
    print(f"Opportunities found: {len(results.get('opportunities', []))}")
    if results.get('selected'):
        print(f"Selected: {results['selected'].get('name', 'Unknown')}")


if __name__ == "__main__":
    main()

