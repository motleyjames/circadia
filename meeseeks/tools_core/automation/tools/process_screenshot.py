#!/usr/bin/env python3
"""
UI Screenshot Analysis Pipeline using Gemini Vision.

Processes UI screenshots through 6 cognitive steps:
1. UI Transcription - Extract visible text, identify page purpose
2. Element Detection - Identify interactive UI components
3. Semantic Analysis - Understand user goals and workflows
4. Test Plan Generation - Create actionable test scenarios for agents
5. Design Commentary - Analyze visual design, brand, colors, typography
6. Improvement Hypotheses - Generate UX and design improvement ideas

Usage:
    # Run all steps
    python process_screenshot.py <screenshot_path>
    
    # Run specific step(s)
    python process_screenshot.py <screenshot_path> --step 1
    python process_screenshot.py <screenshot_path> --step elements
    python process_screenshot.py <screenshot_path> --step 5 6
    python process_screenshot.py <screenshot_path> --step design hypotheses
    
Step names:
    1, transcription, text, ocr     - UI Transcription
    2, elements, detect, components - Element Detection
    3, semantic, analysis, goals    - Semantic Analysis
    4, tests, plan, scenarios       - Test Plan Generation
    5, design, ux, visual, brand    - Design Commentary
    6, improve, hypotheses          - Improvement Suggestions
"""

import argparse
import base64
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Step name mappings
STEP_ALIASES = {
    "1": 1, "transcription": 1, "text": 1, "ocr": 1, "transcript": 1,
    "2": 2, "elements": 2, "detect": 2, "components": 2, "ui": 2,
    "3": 3, "semantic": 3, "analysis": 3, "goals": 3, "workflow": 3,
    "4": 4, "tests": 4, "plan": 4, "scenarios": 4, "agent": 4,
    "5": 5, "design": 5, "ux": 5, "visual": 5, "brand": 5, "aesthetic": 5,
    "6": 6, "improve": 6, "hypotheses": 6, "suggestions": 6, "recommendations": 6,
}

# Get paths
TOOLS_DIR = Path(__file__).parent.absolute()
AUTOMATION_DIR = TOOLS_DIR.parent
PROMPTS_DIR = TOOLS_DIR / "prompts"
DEFAULT_OUTPUT_DIR = AUTOMATION_DIR / "artifacts" / "analysis"


def ensure_prompts_exist():
    """Create default prompts if they don't exist."""
    PROMPTS_DIR.mkdir(parents=True, exist_ok=True)
    
    prompts = {
        "step1_ui_transcription": '''You are analyzing a UI screenshot. Extract ALL visible text and understand the page.

Provide a structured analysis:

## Page Overview
- What type of page is this? (login, dashboard, form, list, etc.)
- What is the primary purpose?
- What application/website does this appear to be?

## Visible Text
Extract ALL text visible in the screenshot, organized by section:
- Headers/Titles
- Navigation items
- Button labels
- Form labels and placeholders
- Content text
- Footer text
- Error messages (if any)
- Tooltips/hints (if any)

## Visual Layout
- Describe the general layout (sidebar, header, main content, etc.)
- Note any prominent visual elements (logos, images, icons)
- Identify the visual hierarchy

## State Indicators
- Is there a logged-in user shown?
- Are there any loading states?
- Are there error or success messages?
- What appears to be selected/active?

Be thorough and accurate. Only report what you actually see.''',

        "step2_element_detection": '''You are a UI element detector. Analyze this screenshot and identify ALL interactive elements.

For each element, provide:
1. Element type (button, link, input, dropdown, checkbox, etc.)
2. Label/text (what it says or its aria-label)
3. Approximate location (top-left, center, bottom-right, etc.)
4. Estimated bounding box as percentage of screen (x%, y%, width%, height%)
5. Current state (enabled/disabled, checked/unchecked, selected, etc.)
6. Likely action (what happens when clicked/interacted)

Output as JSON:
```json
{
  "page_url_hint": "inferred URL or page name",
  "viewport": {
    "estimated_width": "desktop/tablet/mobile",
    "has_scroll": true/false
  },
  "elements": [
    {
      "id": "elem_1",
      "type": "button",
      "label": "Submit",
      "location": "bottom-right",
      "bbox_pct": {"x": 80, "y": 90, "w": 15, "h": 5},
      "state": "enabled",
      "likely_action": "submits the form",
      "priority": "high"
    }
  ],
  "element_groups": [
    {
      "name": "navigation",
      "elements": ["elem_1", "elem_2"],
      "purpose": "main site navigation"
    }
  ],
  "forms": [
    {
      "name": "login_form",
      "fields": ["email_input", "password_input"],
      "submit_button": "elem_5",
      "validation_visible": false
    }
  ]
}
```

Be exhaustive - identify every clickable, typeable, or interactive element.''',

        "step3_semantic_analysis": '''You are a UX analyst. Given this UI screenshot, analyze what users can accomplish.

Provide analysis as JSON:
```json
{
  "page_purpose": "Brief description of what this page is for",
  "user_goals": [
    {
      "goal": "Log into account",
      "priority": "primary",
      "steps": [
        "Enter email in email field",
        "Enter password in password field", 
        "Click login button"
      ],
      "success_indicator": "Redirect to dashboard or welcome message",
      "failure_indicators": ["Error message appears", "Form shakes", "Fields highlighted red"]
    }
  ],
  "navigation_paths": [
    {
      "from": "this page",
      "to": "forgot password",
      "trigger": "Click 'Forgot Password' link"
    }
  ],
  "state_machine": {
    "current_state": "unauthenticated",
    "possible_transitions": [
      {"action": "successful login", "next_state": "authenticated"},
      {"action": "failed login", "next_state": "error_shown"}
    ]
  },
  "accessibility_observations": [
    "Form has visible labels",
    "Submit button has clear text"
  ],
  "potential_issues": [
    "No visible password requirements",
    "No 'show password' toggle visible"
  ],
  "related_pages": [
    "Registration page",
    "Password reset page",
    "Dashboard (after login)"
  ]
}
```

Think like a user - what would they want to do here?''',

        "step4_test_plan": '''You are a test automation engineer. Create a comprehensive test plan for this UI.

Given the screenshot, generate test scenarios that an automated agent could execute.

Output as JSON:
```json
{
  "test_suite": "Page Name Tests",
  "critical_paths": [
    {
      "name": "Happy path - successful login",
      "priority": "critical",
      "preconditions": ["User has valid credentials", "User is not logged in"],
      "steps": [
        {"action": "type", "target": "email_input", "value": "test@example.com", "expected": "Email appears in field"},
        {"action": "type", "target": "password_input", "value": "validpassword", "expected": "Password masked in field"},
        {"action": "click", "target": "login_button", "expected": "Form submits"},
        {"action": "wait", "condition": "url_contains", "value": "/dashboard", "timeout": 5000}
      ],
      "assertions": [
        {"type": "url", "expected": "contains /dashboard"},
        {"type": "element_visible", "target": "welcome_message"},
        {"type": "element_not_visible", "target": "login_form"}
      ]
    }
  ],
  "edge_cases": [
    {
      "name": "Empty form submission",
      "steps": [
        {"action": "click", "target": "login_button"}
      ],
      "assertions": [
        {"type": "element_visible", "target": "error_message"},
        {"type": "element_has_class", "target": "email_input", "class": "error"}
      ]
    },
    {
      "name": "Invalid email format",
      "steps": [
        {"action": "type", "target": "email_input", "value": "notanemail"},
        {"action": "click", "target": "login_button"}
      ],
      "assertions": [
        {"type": "text_contains", "target": "error_message", "text": "valid email"}
      ]
    }
  ],
  "accessibility_tests": [
    {
      "name": "Keyboard navigation",
      "steps": [
        {"action": "press", "key": "Tab", "expected": "Focus moves to email field"},
        {"action": "press", "key": "Tab", "expected": "Focus moves to password field"},
        {"action": "press", "key": "Tab", "expected": "Focus moves to submit button"},
        {"action": "press", "key": "Enter", "expected": "Form submits"}
      ]
    }
  ],
  "visual_regression": {
    "baseline_name": "login_page_default",
    "areas_to_check": ["form_container", "header", "footer"],
    "ignore_areas": ["dynamic_content", "timestamps"]
  },
  "agent_hints": {
    "element_selectors": {
      "email_input": ["#email", "input[type=email]", "input[name=email]"],
      "password_input": ["#password", "input[type=password]"],
      "login_button": ["button[type=submit]", ".login-btn", "button:contains('Login')"]
    },
    "wait_strategies": [
      "Wait for network idle after form submit",
      "Wait for URL change or error element"
    ],
    "common_failures": [
      "Button may be disabled until fields are filled",
      "CAPTCHA may appear after failed attempts",
      "Rate limiting may block rapid test execution"
    ]
  }
}
```

Think about what could go wrong and how to verify success.''',

        "step5_design_commentary": '''You are a senior UI/UX designer and brand expert. Analyze this screenshot's visual design.

Provide detailed commentary as JSON:
```json
{
  "overall_impression": {
    "style": "minimalist/corporate/playful/brutalist/etc",
    "era": "modern/dated/retro/timeless",
    "professionalism": "1-10 score with explanation",
    "first_impression": "What feeling does this evoke in 2 seconds?"
  },
  "color_analysis": {
    "primary_colors": ["#hexcode - name/role"],
    "secondary_colors": ["#hexcode - name/role"],
    "accent_colors": ["#hexcode - name/role"],
    "background_colors": ["#hexcode - name/role"],
    "color_harmony": "complementary/analogous/triadic/monochromatic/none",
    "contrast_ratio_estimate": "good/adequate/poor",
    "accessibility_concerns": ["any color-related a11y issues"],
    "emotional_impact": "what emotions do these colors convey?"
  },
  "typography": {
    "heading_style": "serif/sans-serif/monospace/display - estimated font family",
    "body_style": "serif/sans-serif/monospace - estimated font family",
    "font_sizes": {
      "headings": "large/medium/small",
      "body": "readable/small/too small",
      "captions": "present/absent"
    },
    "line_height": "comfortable/cramped/too loose",
    "hierarchy_clarity": "clear/somewhat clear/confusing",
    "readability_score": "1-10 with explanation"
  },
  "spacing_and_layout": {
    "whitespace_usage": "generous/adequate/cramped",
    "alignment": "consistent/inconsistent",
    "grid_system": "apparent/not apparent",
    "visual_balance": "balanced/left-heavy/right-heavy/top-heavy",
    "information_density": "sparse/moderate/dense/overwhelming"
  },
  "brand_identity": {
    "logo_presence": "visible/not visible",
    "brand_consistency": "strong/weak/not applicable",
    "memorable_elements": ["what stands out?"],
    "personality_conveyed": "friendly/professional/technical/casual/etc",
    "target_audience_fit": "who does this design appeal to?"
  },
  "visual_hierarchy": {
    "focal_point": "what draws the eye first?",
    "reading_pattern": "F-pattern/Z-pattern/vertical/scattered",
    "cta_visibility": "prominent/subtle/missing",
    "navigation_clarity": "intuitive/learnable/confusing"
  },
  "micro_interactions": {
    "hover_states_visible": "yes/no/unknown",
    "feedback_indicators": "present/absent",
    "animation_hints": "any visible motion/transitions?"
  },
  "design_system_maturity": {
    "consistency_score": "1-10",
    "component_reuse": "apparent/not apparent",
    "design_token_usage": "likely/unlikely/unknown"
  },
  "notable_design_choices": [
    "Specific observations about unique or notable design decisions"
  ],
  "design_flaws": [
    "Specific issues with the visual design"
  ]
}
```

Be specific and reference actual elements you see. Think like a design critic.''',

        "step6_improvement_hypotheses": '''You are a UX strategist and design consultant. Based on this UI screenshot, generate hypotheses for improvements.

For each hypothesis, explain:
1. The current state (what you observe)
2. The problem it creates
3. Your proposed improvement
4. Expected impact
5. Effort level to implement

Output as JSON:
```json
{
  "executive_summary": "Overall assessment and top 3 priorities",
  "quick_wins": [
    {
      "id": "qw_1",
      "observation": "What you see currently",
      "problem": "Why this is suboptimal",
      "hypothesis": "If we [change X], then [outcome Y] because [reason Z]",
      "proposed_change": "Specific actionable change",
      "expected_impact": "high/medium/low",
      "effort": "trivial/easy/moderate/hard",
      "metrics_to_track": ["How to measure success"],
      "risk": "low/medium/high"
    }
  ],
  "ux_improvements": [
    {
      "id": "ux_1",
      "area": "navigation/forms/content/feedback/etc",
      "current_state": "Description of current experience",
      "pain_point": "What frustrates or confuses users",
      "hypothesis": "If we [change X], then [outcome Y] because [reason Z]",
      "proposed_solution": "Detailed solution description",
      "user_benefit": "How this helps the user",
      "business_benefit": "How this helps the business",
      "expected_impact": "high/medium/low",
      "effort": "trivial/easy/moderate/hard",
      "dependencies": ["What needs to happen first"],
      "a_b_test_idea": "How to validate this hypothesis"
    }
  ],
  "visual_design_improvements": [
    {
      "id": "vd_1",
      "element": "What element or area",
      "current_issue": "What's wrong with it",
      "hypothesis": "If we [change X], then [outcome Y] because [reason Z]",
      "proposed_change": "Specific visual change",
      "rationale": "Design principle or research backing this",
      "expected_impact": "high/medium/low",
      "effort": "trivial/easy/moderate/hard"
    }
  ],
  "accessibility_improvements": [
    {
      "id": "a11y_1",
      "issue": "Accessibility problem observed",
      "wcag_guideline": "Relevant WCAG criterion if applicable",
      "hypothesis": "If we [fix X], then [users Y] can [do Z]",
      "proposed_fix": "Specific fix",
      "affected_users": "Who benefits",
      "legal_risk": "none/low/medium/high",
      "effort": "trivial/easy/moderate/hard"
    }
  ],
  "performance_hypotheses": [
    {
      "id": "perf_1",
      "observation": "What suggests a performance issue",
      "hypothesis": "If we [optimize X], then [metric Y] improves because [reason Z]",
      "proposed_optimization": "What to change",
      "expected_improvement": "Estimated impact"
    }
  ],
  "innovation_opportunities": [
    {
      "id": "innov_1",
      "opportunity": "What could be added or reimagined",
      "hypothesis": "If we [add/change X], then [new capability Y] because [trend Z]",
      "inspiration": "Where this idea comes from (competitor, trend, research)",
      "user_value": "Why users would care",
      "differentiation": "How this sets apart from competitors",
      "effort": "moderate/hard/very hard",
      "risk": "medium/high"
    }
  ],
  "prioritized_ideas": [
    {
      "rank": 1,
      "id": "qw_1",
      "rationale": "Why this is highest priority"
    },
    {
      "rank": 2,
      "id": "a11y_1",
      "rationale": "Why this is second"
    },
    {
      "rank": 3,
      "id": "ux_1",
      "rationale": "Why this is third"
    }
  ]
}
```

Be creative but realistic. Ground hypotheses in design principles and user psychology.'''
    }
    
    for name, content in prompts.items():
        prompt_file = PROMPTS_DIR / f"{name}.txt"
        if not prompt_file.exists():
            with open(prompt_file, "w") as f:
                f.write(content)
            print(f"  📝 Created prompt: {prompt_file.name}")


def load_prompt(prompt_name: str) -> str:
    """Load a prompt template."""
    prompt_file = PROMPTS_DIR / f"{prompt_name}.txt"
    if not prompt_file.exists():
        ensure_prompts_exist()
    
    with open(prompt_file, "r") as f:
        return f.read()


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


def call_gemini(prompt: str, image_path: str, model: str = "gemini-2.0-flash") -> str:
    """Call Gemini API with image."""
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
    
    # Load image
    image_data = encode_image(image_path)
    mime_type = get_image_mime_type(image_path)
    
    # Create model
    model_instance = genai.GenerativeModel(model)
    
    # Generate with image
    response = model_instance.generate_content([
        prompt,
        {
            "mime_type": mime_type,
            "data": image_data
        }
    ])
    
    return response.text


def extract_json(text: str) -> dict:
    """Extract JSON from text that may contain markdown code blocks."""
    # Try to find JSON in code blocks first
    json_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", text)
    if json_match:
        text = json_match.group(1)
    
    # Try to find raw JSON object
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass
    
    return {}


def save_output(content: str, output_path: Path, fmt: str = "txt"):
    """Save output to file."""
    with open(output_path, "w", encoding="utf-8") as f:
        if fmt == "json" and isinstance(content, dict):
            json.dump(content, f, indent=2)
        else:
            f.write(content if isinstance(content, str) else json.dumps(content, indent=2))
    print(f"  💾 Saved: {output_path.name}")


def step1_ui_transcription(image_path: str, output_dir: Path) -> str:
    """Step 1: Extract text and understand page purpose."""
    print("\n📝 Step 1: UI Transcription")
    print("  Analyzing visible text and page structure...")
    
    prompt = load_prompt("step1_ui_transcription")
    result = call_gemini(prompt, image_path)
    
    save_output(result, output_dir / "step1_transcription.md")
    return result


def step2_element_detection(image_path: str, output_dir: Path) -> dict:
    """Step 2: Detect UI elements."""
    print("\n🔍 Step 2: Element Detection")
    print("  Identifying interactive components...")
    
    prompt = load_prompt("step2_element_detection")
    result = call_gemini(prompt, image_path)
    
    # Save raw output
    save_output(result, output_dir / "step2_elements_raw.md")
    
    # Parse JSON
    elements = extract_json(result)
    if elements:
        save_output(elements, output_dir / "step2_elements.json", "json")
    else:
        print("  ⚠️  Could not parse elements JSON")
        elements = {"elements": [], "error": "Failed to parse"}
    
    return elements


def step3_semantic_analysis(image_path: str, output_dir: Path, elements: dict = None) -> dict:
    """Step 3: Semantic analysis of user goals."""
    print("\n🧠 Step 3: Semantic Analysis")
    print("  Understanding user goals and workflows...")
    
    prompt = load_prompt("step3_semantic_analysis")
    
    # Add element context if available
    if elements and elements.get("elements"):
        prompt += f"\n\nPreviously detected elements:\n```json\n{json.dumps(elements, indent=2)}\n```"
    
    result = call_gemini(prompt, image_path)
    
    # Save raw output
    save_output(result, output_dir / "step3_analysis_raw.md")
    
    # Parse JSON
    analysis = extract_json(result)
    if analysis:
        save_output(analysis, output_dir / "step3_analysis.json", "json")
    else:
        print("  ⚠️  Could not parse analysis JSON")
        analysis = {"user_goals": [], "error": "Failed to parse"}
    
    return analysis


def step4_test_plan(image_path: str, output_dir: Path, elements: dict = None, analysis: dict = None) -> dict:
    """Step 4: Generate test plan."""
    print("\n🧪 Step 4: Test Plan Generation")
    print("  Creating automated test scenarios...")
    
    prompt = load_prompt("step4_test_plan")
    
    # Add context from previous steps
    context = ""
    if elements and elements.get("elements"):
        context += f"\n\nDetected UI Elements:\n```json\n{json.dumps(elements, indent=2)}\n```"
    if analysis and analysis.get("user_goals"):
        context += f"\n\nSemantic Analysis:\n```json\n{json.dumps(analysis, indent=2)}\n```"
    
    if context:
        prompt += context
    
    result = call_gemini(prompt, image_path)
    
    # Save raw output
    save_output(result, output_dir / "step4_tests_raw.md")
    
    # Parse JSON
    test_plan = extract_json(result)
    if test_plan:
        save_output(test_plan, output_dir / "step4_test_plan.json", "json")
        
        # Also generate Playwright-style test code
        playwright_code = generate_playwright_tests(test_plan)
        save_output(playwright_code, output_dir / "generated_tests.spec.ts")
    else:
        print("  ⚠️  Could not parse test plan JSON")
        test_plan = {"critical_paths": [], "error": "Failed to parse"}
    
    return test_plan


def step5_design_commentary(image_path: str, output_dir: Path) -> dict:
    """Step 5: Design and UX commentary."""
    print("\n🎨 Step 5: Design Commentary")
    print("  Analyzing visual design, brand, colors, typography...")
    
    prompt = load_prompt("step5_design_commentary")
    result = call_gemini(prompt, image_path)
    
    # Save raw output
    save_output(result, output_dir / "step5_design_raw.md")
    
    # Parse JSON
    design = extract_json(result)
    if design:
        save_output(design, output_dir / "step5_design.json", "json")
    else:
        print("  ⚠️  Could not parse design commentary JSON")
        design = {"overall_impression": {}, "error": "Failed to parse"}
    
    return design


def step6_improvement_hypotheses(image_path: str, output_dir: Path, design: dict = None, analysis: dict = None) -> dict:
    """Step 6: Generate improvement hypotheses."""
    print("\n💡 Step 6: Improvement Hypotheses")
    print("  Generating UX and design improvement ideas...")
    
    prompt = load_prompt("step6_improvement_hypotheses")
    
    # Add context from previous steps
    context = ""
    if design and design.get("overall_impression"):
        context += f"\n\nDesign Analysis:\n```json\n{json.dumps(design, indent=2)}\n```"
    if analysis and analysis.get("user_goals"):
        context += f"\n\nSemantic Analysis:\n```json\n{json.dumps(analysis, indent=2)}\n```"
    
    if context:
        prompt += context
    
    result = call_gemini(prompt, image_path)
    
    # Save raw output
    save_output(result, output_dir / "step6_hypotheses_raw.md")
    
    # Parse JSON
    hypotheses = extract_json(result)
    if hypotheses:
        save_output(hypotheses, output_dir / "step6_hypotheses.json", "json")
    else:
        print("  ⚠️  Could not parse hypotheses JSON")
        hypotheses = {"quick_wins": [], "error": "Failed to parse"}
    
    return hypotheses


def generate_playwright_tests(test_plan: dict) -> str:
    """Generate Playwright test code from test plan."""
    code = '''import { test, expect } from '@playwright/test';

/**
 * Auto-generated tests from UI screenshot analysis
 * Generated: {timestamp}
 */

'''
    code = code.replace("{timestamp}", datetime.now().isoformat())
    
    suite_name = test_plan.get("test_suite", "UI Tests")
    
    code += f"test.describe('{suite_name}', () => {{\n"
    
    # Critical paths
    for path in test_plan.get("critical_paths", []):
        test_name = path.get("name", "Unnamed test")
        priority = path.get("priority", "medium")
        
        code += f"\n  test('{test_name}', async ({{ page }}) => {{\n"
        code += f"    // Priority: {priority}\n"
        
        # Preconditions as comments
        for precond in path.get("preconditions", []):
            code += f"    // Precondition: {precond}\n"
        
        code += "\n"
        
        # Steps
        for step in path.get("steps", []):
            action = step.get("action", "")
            target = step.get("target", "")
            value = step.get("value", "")
            
            if action == "type":
                code += f"    await page.locator('[data-testid=\"{target}\"]').fill('{value}');\n"
            elif action == "click":
                code += f"    await page.locator('[data-testid=\"{target}\"]').click();\n"
            elif action == "wait":
                condition = step.get("condition", "")
                if condition == "url_contains":
                    code += f"    await expect(page).toHaveURL(/{value}/);\n"
            elif action == "press":
                key = step.get("key", "")
                code += f"    await page.keyboard.press('{key}');\n"
        
        # Assertions
        code += "\n    // Assertions\n"
        for assertion in path.get("assertions", []):
            a_type = assertion.get("type", "")
            target = assertion.get("target", "")
            expected = assertion.get("expected", "")
            
            if a_type == "url":
                code += f"    await expect(page).toHaveURL(/{expected.replace('contains ', '')}/i);\n"
            elif a_type == "element_visible":
                code += f"    await expect(page.locator('[data-testid=\"{target}\"]')).toBeVisible();\n"
            elif a_type == "element_not_visible":
                code += f"    await expect(page.locator('[data-testid=\"{target}\"]')).not.toBeVisible();\n"
            elif a_type == "text_contains":
                text = assertion.get("text", "")
                code += f"    await expect(page.locator('[data-testid=\"{target}\"]')).toContainText('{text}');\n"
        
        code += "  });\n"
    
    # Edge cases
    for edge in test_plan.get("edge_cases", []):
        test_name = edge.get("name", "Edge case")
        
        code += f"\n  test('{test_name}', async ({{ page }}) => {{\n"
        
        for step in edge.get("steps", []):
            action = step.get("action", "")
            target = step.get("target", "")
            value = step.get("value", "")
            
            if action == "type":
                code += f"    await page.locator('[data-testid=\"{target}\"]').fill('{value}');\n"
            elif action == "click":
                code += f"    await page.locator('[data-testid=\"{target}\"]').click();\n"
        
        for assertion in edge.get("assertions", []):
            a_type = assertion.get("type", "")
            target = assertion.get("target", "")
            
            if a_type == "element_visible":
                code += f"    await expect(page.locator('[data-testid=\"{target}\"]')).toBeVisible();\n"
        
        code += "  });\n"
    
    code += "});\n"
    
    return code


def process_screenshot(
    image_path: str,
    output_dir: Path = None,
    steps: set = None,
    url_hint: str = None
) -> dict:
    """
    Process a UI screenshot through the analysis pipeline.
    
    Args:
        image_path: Path to screenshot
        output_dir: Output directory
        steps: Set of steps to run (1-4). None = all
        url_hint: Optional URL hint for context
    
    Returns:
        Summary dict with all outputs
    """
    image_path = os.path.abspath(image_path)
    image_name = Path(image_path).stem
    
    # Default to all steps
    if steps is None or not steps:
        steps = {1, 2, 3, 4, 5, 6}
    
    # Setup output directory
    if output_dir is None:
        output_dir = DEFAULT_OUTPUT_DIR
    
    # Create page-specific output dir
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    page_output_dir = output_dir / f"{image_name}_{timestamp}"
    page_output_dir.mkdir(parents=True, exist_ok=True)
    
    # Build step names for display
    step_names = {1: "Transcription", 2: "Elements", 3: "Semantic", 4: "Test Plan", 5: "Design", 6: "Hypotheses"}
    running_steps = ", ".join([step_names[s] for s in sorted(steps)])
    
    print("=" * 60)
    print(f"🖼️  UI Screenshot Analysis")
    print(f"   Image: {Path(image_path).name}")
    print(f"   Output: {page_output_dir}")
    print(f"   Steps: {running_steps}")
    if url_hint:
        print(f"   URL: {url_hint}")
    print("=" * 60)
    
    results = {
        "image": image_path,
        "output_dir": str(page_output_dir),
        "timestamp": datetime.now().isoformat(),
        "steps_run": list(steps),
        "url_hint": url_hint,
    }
    
    # Step 1: Transcription
    transcription = None
    if 1 in steps:
        transcription = step1_ui_transcription(image_path, page_output_dir)
        results["transcription"] = str(page_output_dir / "step1_transcription.md")
    
    # Step 2: Element Detection
    elements = None
    if 2 in steps:
        elements = step2_element_detection(image_path, page_output_dir)
        results["elements"] = elements
        results["element_count"] = len(elements.get("elements", []))
    
    # Step 3: Semantic Analysis
    analysis = None
    if 3 in steps:
        analysis = step3_semantic_analysis(image_path, page_output_dir, elements)
        results["analysis"] = analysis
        results["user_goals"] = len(analysis.get("user_goals", []))
    
    # Step 4: Test Plan
    test_plan = None
    if 4 in steps:
        test_plan = step4_test_plan(image_path, page_output_dir, elements, analysis)
        results["test_plan"] = test_plan
        results["test_count"] = len(test_plan.get("critical_paths", [])) + len(test_plan.get("edge_cases", []))
    
    # Step 5: Design Commentary
    design = None
    if 5 in steps:
        design = step5_design_commentary(image_path, page_output_dir)
        results["design"] = design
        results["design_style"] = design.get("overall_impression", {}).get("style", "unknown")
    
    # Step 6: Improvement Hypotheses
    hypotheses = None
    if 6 in steps:
        hypotheses = step6_improvement_hypotheses(image_path, page_output_dir, design, analysis)
        results["hypotheses"] = hypotheses
        results["quick_wins_count"] = len(hypotheses.get("quick_wins", []))
        results["improvement_count"] = (
            len(hypotheses.get("quick_wins", [])) +
            len(hypotheses.get("ux_improvements", [])) +
            len(hypotheses.get("visual_design_improvements", []))
        )
    
    # Save summary
    summary_path = page_output_dir / "summary.json"
    with open(summary_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    # Print summary
    print("\n" + "=" * 60)
    print("✨ Analysis Complete!")
    print("=" * 60)
    if results.get("element_count"):
        print(f"   🔍 Elements detected: {results['element_count']}")
    if results.get("user_goals"):
        print(f"   🎯 User goals identified: {results['user_goals']}")
    if results.get("test_count"):
        print(f"   🧪 Test scenarios generated: {results['test_count']}")
    if results.get("design_style"):
        print(f"   🎨 Design style: {results['design_style']}")
    if results.get("improvement_count"):
        print(f"   💡 Improvement ideas: {results['improvement_count']}")
    if results.get("quick_wins_count"):
        print(f"   ⚡ Quick wins: {results['quick_wins_count']}")
    print(f"\n📁 Output: {page_output_dir}")
    print("=" * 60)
    
    return results


def parse_steps(step_args: list) -> set:
    """Parse step arguments into a set of step numbers."""
    if not step_args:
        return {1, 2, 3, 4, 5, 6}
    
    steps = set()
    for s in step_args:
        s_lower = str(s).lower()
        if s_lower in STEP_ALIASES:
            steps.add(STEP_ALIASES[s_lower])
        else:
            try:
                step_num = int(s)
                if 1 <= step_num <= 6:
                    steps.add(step_num)
                else:
                    print(f"⚠️  Invalid step number: {s} (must be 1-6)")
            except ValueError:
                print(f"⚠️  Unknown step: {s}")
    
    return steps if steps else {1, 2, 3, 4, 5, 6}


def main():
    parser = argparse.ArgumentParser(
        description="Analyze UI screenshots for automated testing and UX insights",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Step names (use with --step):
  1, transcription, text       - Extract visible text
  2, elements, detect          - Detect UI elements
  3, semantic, analysis, goals - Analyze user goals
  4, tests, plan, scenarios    - Generate test plan
  5, design, ux, visual, brand - Design & UX commentary
  6, improve, hypotheses       - Improvement suggestions

Examples:
  python process_screenshot.py screenshot.png              # All 6 steps
  python process_screenshot.py screenshot.png --step 2     # Just elements
  python process_screenshot.py screenshot.png --step 5 6   # Design + improvements
  python process_screenshot.py screenshot.png --step design hypotheses
  python process_screenshot.py screenshot.png --url https://example.com
"""
    )
    parser.add_argument("image_path", help="Path to UI screenshot")
    parser.add_argument(
        "--step", "-s",
        nargs="+",
        default=None,
        help="Specific step(s) to run"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})"
    )
    parser.add_argument(
        "--url", "-u",
        type=str,
        default=None,
        help="URL hint for context"
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default="gemini-2.0-flash",
        help="Gemini model to use (default: gemini-2.0-flash)"
    )
    
    args = parser.parse_args()
    
    if not os.path.exists(args.image_path):
        print(f"❌ Image not found: {args.image_path}")
        sys.exit(1)
    
    # Ensure prompts exist
    ensure_prompts_exist()
    
    # Parse steps
    steps_to_run = parse_steps(args.step)
    
    # Process
    result = process_screenshot(
        args.image_path,
        args.output_dir,
        steps_to_run,
        args.url
    )
    
    # Exit with appropriate code
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
