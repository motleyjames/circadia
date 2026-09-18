#!/usr/bin/env python3
"""
Design Improvement Executor

Takes an analysis folder and executes UX/visual improvements using Gemini.
For each improvement hypothesis, it:
1. Generates a design prompt based on the improvement
2. Has Gemini create a detailed implementation spec
3. Compares original to proposed changes
4. Has Gemini judge the improvement
5. Outputs refinement options

Usage:
    python apply_improvements.py <analysis_folder>
    python apply_improvements.py <analysis_folder> --improvement ux_1
    python apply_improvements.py <analysis_folder> --type visual
    python apply_improvements.py <analysis_folder> --all
"""

import argparse
import base64
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict

# Get paths
TOOLS_DIR = Path(__file__).parent.absolute()
AUTOMATION_DIR = TOOLS_DIR.parent


def encode_image(image_path: str) -> str:
    """Encode image to base64."""
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def get_image_mime_type(image_path: str) -> str:
    """Get MIME type from image path."""
    ext = Path(image_path).suffix.lower()
    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return mime_types.get(ext, "image/png")


def call_gemini(prompt: str, image_path: str = None, model: str = "gemini-2.0-flash") -> str:
    """Call Gemini API with optional image."""
    try:
        import google.generativeai as genai
    except ImportError:
        print("❌ google-generativeai not installed. Run: pip install google-generativeai")
        sys.exit(1)
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY environment variable not set")
        sys.exit(1)
    
    genai.configure(api_key=api_key)
    model_instance = genai.GenerativeModel(model)
    
    if image_path:
        image_data = encode_image(image_path)
        mime_type = get_image_mime_type(image_path)
        response = model_instance.generate_content([
            prompt,
            {"mime_type": mime_type, "data": image_data}
        ])
    else:
        response = model_instance.generate_content(prompt)
    
    return response.text


def extract_json(text: str) -> dict:
    """Extract JSON from text that may contain markdown code blocks."""
    import re
    json_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", text)
    if json_match:
        text = json_match.group(1)
    
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass
    return {}


def load_analysis_data(analysis_folder: Path) -> dict:
    """Load all analysis JSON files from a folder."""
    data = {}
    
    # Load hypotheses
    hypotheses_file = analysis_folder / "step6_hypotheses.json"
    if hypotheses_file.exists():
        with open(hypotheses_file) as f:
            data["hypotheses"] = json.load(f)
    
    # Load design commentary
    design_file = analysis_folder / "step5_design.json"
    if design_file.exists():
        with open(design_file) as f:
            data["design"] = json.load(f)
    
    # Load semantic analysis
    analysis_file = analysis_folder / "step3_analysis.json"
    if analysis_file.exists():
        with open(analysis_file) as f:
            data["semantic"] = json.load(f)
    
    # Load elements
    elements_file = analysis_folder / "step2_elements.json"
    if elements_file.exists():
        with open(elements_file) as f:
            data["elements"] = json.load(f)
    
    # Load summary to get image path
    summary_file = analysis_folder / "summary.json"
    if summary_file.exists():
        with open(summary_file) as f:
            data["summary"] = json.load(f)
    
    return data


def get_improvements_to_apply(data: dict, improvement_type: str = None, improvement_id: str = None) -> List[dict]:
    """Get list of improvements to apply based on filters."""
    improvements = []
    hypotheses = data.get("hypotheses", {})
    
    # Collect UX improvements
    if improvement_type in (None, "ux", "all"):
        for imp in hypotheses.get("ux_improvements", []):
            imp["_type"] = "ux"
            if improvement_id is None or imp.get("id") == improvement_id:
                improvements.append(imp)
    
    # Collect visual design improvements
    if improvement_type in (None, "visual", "all"):
        for imp in hypotheses.get("visual_design_improvements", []):
            imp["_type"] = "visual"
            if improvement_id is None or imp.get("id") == improvement_id:
                improvements.append(imp)
    
    # Collect quick wins (often implementable)
    if improvement_type in (None, "quick", "all"):
        for imp in hypotheses.get("quick_wins", []):
            imp["_type"] = "quick_win"
            if improvement_id is None or imp.get("id") == improvement_id:
                improvements.append(imp)
    
    return improvements


def generate_implementation_prompt(improvement: dict, design_context: dict, elements: dict) -> str:
    """Generate a prompt to create implementation details for an improvement."""
    
    imp_type = improvement.get("_type", "unknown")
    
    prompt = f"""You are a senior UI/UX designer implementing a specific improvement.

## Current Design Context
{json.dumps(design_context, indent=2)}

## UI Elements
{json.dumps(elements, indent=2)}

## Improvement to Implement
Type: {imp_type}
ID: {improvement.get('id', 'unknown')}

Details:
{json.dumps(improvement, indent=2)}

## Your Task
Create a detailed implementation specification for this improvement. Be specific and actionable.

Output as JSON:
```json
{{
  "improvement_id": "{improvement.get('id', 'unknown')}",
  "improvement_type": "{imp_type}",
  "implementation_spec": {{
    "summary": "One sentence description of the change",
    "before_state": "Describe current state in detail",
    "after_state": "Describe the improved state in detail",
    "css_changes": [
      {{
        "selector": "CSS selector or element description",
        "property": "CSS property",
        "old_value": "current value or 'not set'",
        "new_value": "proposed value",
        "rationale": "why this change"
      }}
    ],
    "html_changes": [
      {{
        "element": "element description",
        "change_type": "add/modify/remove/restructure",
        "description": "what to change",
        "rationale": "why"
      }}
    ],
    "interaction_changes": [
      {{
        "trigger": "user action",
        "current_behavior": "what happens now",
        "new_behavior": "what should happen",
        "rationale": "why"
      }}
    ]
  }},
  "design_reasoning": {{
    "problem_addressed": "What user problem this solves",
    "design_principles_applied": ["List of design principles used"],
    "tradeoffs": ["Any tradeoffs or considerations"],
    "assumptions": ["Assumptions made"]
  }},
  "implementation_notes": {{
    "complexity": "trivial/easy/moderate/hard",
    "dependencies": ["What needs to exist first"],
    "risks": ["Potential issues"],
    "testing_approach": "How to verify this works"
  }},
  "visual_description": {{
    "layout_changes": "Description of layout modifications",
    "color_changes": "Description of color modifications",
    "typography_changes": "Description of font/text modifications",
    "spacing_changes": "Description of whitespace/padding modifications",
    "component_changes": "Description of new or modified components"
  }}
}}
```

Be specific with actual values (hex colors, pixel values, etc.) where possible.
"""
    return prompt


def generate_comparison_prompt(improvement: dict, implementation: dict, original_design: dict) -> str:
    """Generate a prompt to compare original vs proposed design."""
    
    prompt = f"""You are evaluating a proposed UI improvement.

## Original Design Analysis
{json.dumps(original_design, indent=2)}

## Proposed Improvement
{json.dumps(improvement, indent=2)}

## Implementation Specification
{json.dumps(implementation, indent=2)}

## Your Task
Compare the original design to the proposed improvement. Analyze the impact.

Output as JSON:
```json
{{
  "comparison": {{
    "original_summary": "Brief description of original state",
    "proposed_summary": "Brief description of proposed state",
    "key_differences": [
      {{
        "aspect": "What aspect (color, layout, etc.)",
        "original": "Original value/state",
        "proposed": "Proposed value/state",
        "impact": "How this affects the user"
      }}
    ]
  }},
  "impact_analysis": {{
    "user_experience": {{
      "score_change": "+2 (scale -5 to +5)",
      "explanation": "How UX improves or degrades"
    }},
    "visual_design": {{
      "score_change": "+1",
      "explanation": "How visual design improves or degrades"
    }},
    "accessibility": {{
      "score_change": "+1",
      "explanation": "How accessibility improves or degrades"
    }},
    "brand_consistency": {{
      "score_change": "0",
      "explanation": "How brand consistency is affected"
    }}
  }},
  "confidence_level": "high/medium/low",
  "confidence_reasoning": "Why this level of confidence"
}}
```
"""
    return prompt


def generate_judgment_prompt(improvement: dict, implementation: dict, comparison: dict, image_path: str) -> str:
    """Generate a prompt for Gemini to judge the improvement."""
    
    prompt = f"""You are a design critic evaluating a proposed UI improvement. Look at this screenshot of the CURRENT design.

## Proposed Improvement
{json.dumps(improvement, indent=2)}

## Implementation Details
{json.dumps(implementation, indent=2)}

## Comparison Analysis
{json.dumps(comparison, indent=2)}

## Your Task
Judge whether this improvement should be implemented. Consider the current screenshot carefully.

Output as JSON:
```json
{{
  "verdict": "approve/approve_with_changes/reject/needs_more_info",
  "verdict_reasoning": "Clear explanation of your decision",
  "scores": {{
    "impact": 8,
    "feasibility": 9,
    "risk": 3,
    "overall": 8
  }},
  "strengths": [
    "What's good about this improvement"
  ],
  "concerns": [
    "What could be problematic"
  ],
  "refinement_options": [
    {{
      "option_id": "ref_1",
      "description": "Alternative or refinement to consider",
      "pros": ["Benefits of this refinement"],
      "cons": ["Drawbacks of this refinement"],
      "recommended": true
    }}
  ],
  "implementation_order": {{
    "priority": "high/medium/low",
    "reasoning": "Why this priority",
    "dependencies": ["What should be done first"]
  }},
  "success_criteria": [
    "How to measure if this improvement worked"
  ],
  "rollback_plan": "What to do if this doesn't work"
}}
```

Be honest and critical. Not every improvement is a good idea.
"""
    return prompt


def apply_improvement(
    improvement: dict,
    data: dict,
    output_dir: Path,
    image_path: str
) -> dict:
    """Apply a single improvement and generate all artifacts."""
    
    imp_id = improvement.get("id", "unknown")
    imp_type = improvement.get("_type", "unknown")
    
    print(f"\n{'='*60}")
    print(f"🔧 Processing: {imp_id} ({imp_type})")
    print(f"{'='*60}")
    
    # Create output directory for this improvement
    imp_output_dir = output_dir / imp_id
    imp_output_dir.mkdir(parents=True, exist_ok=True)
    
    results = {
        "improvement_id": imp_id,
        "improvement_type": imp_type,
        "original_improvement": improvement,
        "timestamp": datetime.now().isoformat(),
    }
    
    # Step 1: Generate implementation spec
    print("\n📋 Step 1: Generating implementation specification...")
    impl_prompt = generate_implementation_prompt(
        improvement,
        data.get("design", {}),
        data.get("elements", {})
    )
    
    impl_response = call_gemini(impl_prompt, image_path)
    implementation = extract_json(impl_response)
    
    # Save implementation
    with open(imp_output_dir / "1_implementation_prompt.txt", "w") as f:
        f.write(impl_prompt)
    with open(imp_output_dir / "1_implementation_raw.md", "w") as f:
        f.write(impl_response)
    if implementation:
        with open(imp_output_dir / "1_implementation.json", "w") as f:
            json.dump(implementation, f, indent=2)
        print(f"   💾 Saved implementation spec")
    else:
        print(f"   ⚠️  Could not parse implementation JSON")
        implementation = {"error": "Failed to parse"}
    
    results["implementation"] = implementation
    results["implementation_prompt"] = impl_prompt
    
    # Step 2: Compare original to proposed
    print("\n🔄 Step 2: Comparing original to proposed...")
    compare_prompt = generate_comparison_prompt(
        improvement,
        implementation,
        data.get("design", {})
    )
    
    compare_response = call_gemini(compare_prompt)
    comparison = extract_json(compare_response)
    
    # Save comparison
    with open(imp_output_dir / "2_comparison_prompt.txt", "w") as f:
        f.write(compare_prompt)
    with open(imp_output_dir / "2_comparison_raw.md", "w") as f:
        f.write(compare_response)
    if comparison:
        with open(imp_output_dir / "2_comparison.json", "w") as f:
            json.dump(comparison, f, indent=2)
        print(f"   💾 Saved comparison analysis")
    else:
        print(f"   ⚠️  Could not parse comparison JSON")
        comparison = {"error": "Failed to parse"}
    
    results["comparison"] = comparison
    
    # Step 3: Judge the improvement
    print("\n⚖️  Step 3: Judging improvement quality...")
    judge_prompt = generate_judgment_prompt(
        improvement,
        implementation,
        comparison,
        image_path
    )
    
    judge_response = call_gemini(judge_prompt, image_path)
    judgment = extract_json(judge_response)
    
    # Save judgment
    with open(imp_output_dir / "3_judgment_prompt.txt", "w") as f:
        f.write(judge_prompt)
    with open(imp_output_dir / "3_judgment_raw.md", "w") as f:
        f.write(judge_response)
    if judgment:
        with open(imp_output_dir / "3_judgment.json", "w") as f:
            json.dump(judgment, f, indent=2)
        print(f"   💾 Saved judgment")
    else:
        print(f"   ⚠️  Could not parse judgment JSON")
        judgment = {"error": "Failed to parse"}
    
    results["judgment"] = judgment
    
    # Save complete results
    with open(imp_output_dir / "complete_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    # Print summary
    verdict = judgment.get("verdict", "unknown")
    scores = judgment.get("scores", {})
    refinements = judgment.get("refinement_options", [])
    
    print(f"\n{'='*60}")
    print(f"📊 Results for {imp_id}")
    print(f"{'='*60}")
    print(f"   Verdict: {verdict}")
    if scores:
        print(f"   Impact: {scores.get('impact', '?')}/10")
        print(f"   Feasibility: {scores.get('feasibility', '?')}/10")
        print(f"   Risk: {scores.get('risk', '?')}/10")
        print(f"   Overall: {scores.get('overall', '?')}/10")
    if refinements:
        print(f"   Refinement options: {len(refinements)}")
    print(f"\n📁 Output: {imp_output_dir}")
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Apply UI improvements from analysis and evaluate them",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python apply_improvements.py ./analysis_folder
  python apply_improvements.py ./analysis_folder --improvement ux_1
  python apply_improvements.py ./analysis_folder --type visual
  python apply_improvements.py ./analysis_folder --all
"""
    )
    parser.add_argument("analysis_folder", type=Path, help="Path to analysis output folder")
    parser.add_argument("--improvement", "-i", type=str, help="Specific improvement ID to apply")
    parser.add_argument("--type", "-t", type=str, choices=["ux", "visual", "quick", "all"],
                       help="Type of improvements to apply")
    parser.add_argument("--all", "-a", action="store_true", help="Apply all improvements")
    parser.add_argument("--output", "-o", type=Path, help="Output directory (default: analysis_folder/improvements)")
    
    args = parser.parse_args()
    
    if not args.analysis_folder.exists():
        print(f"❌ Analysis folder not found: {args.analysis_folder}")
        sys.exit(1)
    
    # Load analysis data
    print(f"\n📂 Loading analysis from: {args.analysis_folder}")
    data = load_analysis_data(args.analysis_folder)
    
    if "hypotheses" not in data:
        print("❌ No hypotheses file found (step6_hypotheses.json)")
        sys.exit(1)
    
    # Get image path from summary
    image_path = data.get("summary", {}).get("image")
    if not image_path or not Path(image_path).exists():
        print("❌ Original image not found")
        sys.exit(1)
    
    print(f"   🖼️  Original image: {Path(image_path).name}")
    
    # Determine output directory
    output_dir = args.output or (args.analysis_folder / "improvements")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Get improvements to apply
    imp_type = "all" if args.all else args.type
    improvements = get_improvements_to_apply(data, imp_type, args.improvement)
    
    if not improvements:
        print("❌ No improvements found matching criteria")
        sys.exit(1)
    
    print(f"   📋 Found {len(improvements)} improvement(s) to apply")
    
    # Apply each improvement
    all_results = []
    for improvement in improvements:
        result = apply_improvement(improvement, data, output_dir, image_path)
        all_results.append(result)
    
    # Save combined results
    combined_path = output_dir / "all_results.json"
    with open(combined_path, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "source_folder": str(args.analysis_folder),
            "image_path": image_path,
            "improvements_processed": len(all_results),
            "results": all_results
        }, f, indent=2)
    
    # Print final summary
    print(f"\n{'='*60}")
    print("✨ All Improvements Processed!")
    print(f"{'='*60}")
    
    approved = sum(1 for r in all_results if r.get("judgment", {}).get("verdict") == "approve")
    approved_with_changes = sum(1 for r in all_results if r.get("judgment", {}).get("verdict") == "approve_with_changes")
    rejected = sum(1 for r in all_results if r.get("judgment", {}).get("verdict") == "reject")
    
    print(f"   ✅ Approved: {approved}")
    print(f"   🔄 Approved with changes: {approved_with_changes}")
    print(f"   ❌ Rejected: {rejected}")
    print(f"\n📁 All outputs: {output_dir}")
    print(f"📄 Combined results: {combined_path}")


if __name__ == "__main__":
    main()

