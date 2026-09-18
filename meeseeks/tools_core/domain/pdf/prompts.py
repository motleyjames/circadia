"""
Prompt templates for AI interactions.
Centralizes all LLM prompts for easier maintenance.
"""

# =============================================================================
# VALIDATION PROMPTS
# =============================================================================

VALIDATE_EDIT_PROMPT = """You are a strict quality control validator for PDF edits.

EXPECTED CHANGES: {expected_changes}

Compare the ORIGINAL page (first image) with the EDITED page (second image).

Check for these issues IN ORDER:

1. **BLANK CHECK**: Is the edited page mostly blank/white?

2. **CONTENT CHECK**: Does the edited page contain the expected changes?

3. **QUALITY CHECK** (CRITICAL - be very strict):
   - Is any text overlapping other text?
   - Is any text duplicated (same text appearing twice)?
   - Are elements misaligned or jumbled?
   - Does the layout look broken, glitched, or corrupted?
   - Is text cut off or partially visible?
   - Are there visual artifacts or rendering errors?
   - Does it look WORSE than the original?

4. **PROFESSIONAL CHECK**: Would this page be acceptable in a business document?

Return JSON:
{{
    "is_blank": true/false,
    "has_expected_content": true/false,
    "quality_issues": ["list of specific issues found, or empty if none"],
    "is_broken": true/false,
    "is_professional": true/false,
    "success": true/false,
    "explanation": "brief explanation"
}}

IMPORTANT: 
- If ANY quality issues exist (overlapping, duplicated, misaligned), set success=false
- Be STRICT about quality - it's better to reject and retry than accept a broken page
- Only set success=true if the page looks clean and professional

Return ONLY the JSON."""


QUALITY_CHECK_PROMPT = """Analyze this PDF page for quality issues.

Check for:
1. Text overlapping other text
2. Duplicated text (same content appearing multiple times)
3. Misaligned or jumbled elements
4. Broken or glitched appearance
5. Cut off or partially visible text
6. Visual artifacts or rendering errors
7. Unprofessional or messy layout

Return JSON:
{{
    "is_good_quality": true/false,
    "issues_found": ["list of specific issues"],
    "severity": "none/minor/major/critical",
    "description": "brief overall assessment",
    "suggestions": ["how to fix the issues"]
}}

Return ONLY the JSON."""


# =============================================================================
# COMPOSITION PROMPTS
# =============================================================================

COMPOSITION_ANALYSIS_PROMPT = """You are a professional graphic designer analyzing the visual composition of this slide/page.

Evaluate the following aspects:

1. **VISUAL BALANCE** (Critical):
   - Is content distributed evenly across the page?
   - Is there a large empty area that makes the page look lopsided?
   - Divide the page into thirds (left/center/right) - is content concentrated in just one area?
   - Divide the page into thirds (top/middle/bottom) - is content concentrated in just one area?

2. **WHITESPACE USAGE**:
   - Is whitespace intentional and purposeful?
   - Does empty space look like something is missing?
   - Is there too much or too little breathing room?

3. **VISUAL HIERARCHY**:
   - Is the most important content prominently placed?
   - Do the eyes naturally flow through the content?
   - Are headers/titles appropriately sized and positioned?

4. **ALIGNMENT & GRID**:
   - Are elements aligned to an invisible grid?
   - Do columns/sections have consistent margins?
   - Are there orphaned or floating elements?

5. **OVERALL COMPOSITION SCORE** (1-10):
   - 1-3: Poor (major balance issues, looks unfinished)
   - 4-5: Below average (noticeable issues)
   - 6-7: Acceptable (minor issues)
   - 8-9: Good (well-balanced, professional)
   - 10: Excellent (perfect composition)

Return JSON:
{{
    "composition_score": 1-10,
    "is_balanced": true/false,
    "balance_issues": {{
        "horizontal": "description of left/right balance (or 'balanced')",
        "vertical": "description of top/bottom balance (or 'balanced')",
        "empty_areas": ["list of empty areas that look problematic"]
    }},
    "whitespace_assessment": "good/excessive/insufficient/uneven",
    "visual_weight": {{
        "left_third": "heavy/medium/light/empty",
        "center_third": "heavy/medium/light/empty",
        "right_third": "heavy/medium/light/empty"
    }},
    "hierarchy_issues": ["list of hierarchy problems"],
    "alignment_issues": ["list of alignment problems"],
    "overall_assessment": "brief description",
    "improvement_suggestions": ["specific actionable suggestions to improve balance"]
}}

Return ONLY the JSON."""


# =============================================================================
# TASK CLASSIFICATION PROMPTS
# =============================================================================

CLASSIFY_TASK_PROMPT = """You are a PDF editing assistant. Analyze this edit request and classify it.

USER REQUEST: {prompt}

PDF FEATURES:
- Has fillable form fields: {has_acroform}
- Form field names: {form_fields}
- Is scanned/image-based: {is_scanned}
- Has extractable text: {has_text}

Classify this request into ONE of these types:
- fill_form: Filling in form fields with specific values
- add_text: Adding new text to a specific location
- replace_text: Finding and replacing existing text
- add_watermark: Adding a watermark overlay
- generate_page: Creating a new page from scratch
- creative_edit: Complex visual changes requiring AI image generation

Return JSON with this format:
{{
    "edit_type": "one of the types above",
    "params": {{
        // For fill_form: {{"fields": {{"field_name": "value"}}}}
        // For add_text: {{"text": "...", "page": 1, "position": "top/center/bottom"}}
        // For replace_text: {{"old_text": "...", "new_text": "..."}}
        // For add_watermark: {{"text": "...", "opacity": 0.3}}
        // For generate_page: {{"content": {{"title": "...", "body": [...]}}}}
        // For creative_edit: {{"prompt": "detailed description"}}
    }},
    "requires_validation": true/false,
    "description": "one-line description of what we're doing"
}}

Return ONLY the JSON, no other text."""


# =============================================================================
# CODE GENERATION PROMPTS
# =============================================================================

PYMUPDF_SCRIPT_PROMPT = """You are a PDF manipulation expert. Generate a Python script using PyMuPDF (fitz) to accomplish this task.

USER INSTRUCTION: {instruction}

PAGE STRUCTURE SUMMARY:
{structure_summary}

DETAILED STRUCTURE (JSON):
{structure_json}

AVAILABLE VARIABLES:
- `doc`: The opened fitz.Document (already opened, don't call fitz.open())
- `fitz`: The fitz module

SCRIPT REQUIREMENTS:
1. Access pages with `page = doc[{page_idx}]` (0-indexed)
2. Use PyMuPDF methods like:
   - `page.insert_text(point, text, fontsize=, color=)` for adding text
   - `page.draw_rect(rect, color=, fill=)` for shapes
   - `page.search_for(text)` to find text locations
   - `page.add_redact_annot(rect)` then `page.apply_redactions()` to remove
   - `page.get_text("dict")` to analyze structure
3. Do NOT call doc.save() or doc.close() - handled externally
4. Keep the script simple and focused on the single task
5. Use coordinates from the structure JSON when targeting specific elements

Return ONLY the Python code, no markdown, no explanations. Start directly with the code."""


# =============================================================================
# IMPROVEMENT PROMPTS
# =============================================================================

IMPROVEMENT_SUGGESTIONS_PROMPT = """You are a professional document designer reviewing a PDF slide.
Analyze this page and suggest 1-3 specific, actionable improvements for:
- Layout and spacing
- Visual hierarchy
- Readability
- Professional appearance
- Alignment and balance

Focus on practical improvements that would make a noticeable difference.
DO NOT suggest changes to the actual content/data, only the presentation.

Return JSON array of suggestions:
[
    {{"improvement": "brief description", "priority": "high/medium/low", "area": "layout/typography/spacing/alignment"}},
    ...
]

Return ONLY the JSON array, maximum 3 suggestions."""


APPLY_IMPROVEMENT_PROMPT = """TASK: Make this ONE specific improvement to this slide:
"{improvement}"

CRITICAL REQUIREMENTS:
1. PRESERVE ALL TEXT EXACTLY - every word, number, and label must remain
2. This is the text that MUST appear in your output:
{page_text}

3. Only change the visual PRESENTATION, not the content
4. Keep the same slide dimensions (landscape format)
5. Do NOT create a blank slide - all content must be visible

Make the improvement while keeping ALL existing content visible."""


# =============================================================================
# SEARCH PROMPTS
# =============================================================================

SEMANTIC_SEARCH_PROMPT = """You are a semantic search engine for PDF documents. 
Find pages that are relevant to the user's query. Consider:
- Semantic meaning, not just keyword matching
- Related concepts and synonyms
- Context and intent of the query

USER QUERY: {query}

Analyze the following pages and return the most relevant ones.
Return your response as a JSON array with this exact format:
[
  {{"page": 1, "relevance": 0.95, "explanation": "Why this page matches", "snippet": "Key relevant text from page"}},
  ...
]

Only include pages with relevance > 0.3. Sort by relevance descending. Maximum {top_k} results.
If no pages are relevant, return an empty array: []

IMPORTANT: Return ONLY the JSON array, no other text.

PAGES TO SEARCH:
{pages_content}"""


DESCRIBE_PAGE_PROMPT = """Describe this PDF page in detail. Include:
- Main topic/title
- Key content and information
- Any charts, graphs, diagrams, or images and what they show
- Layout and visual elements
- Important data points or figures"""


# =============================================================================
# A/B COMPARISON PROMPTS
# =============================================================================

COMPARE_EDITS_PROMPT = """You are a professional document quality judge comparing two different edit approaches.

ORIGINAL PAGE: The first image shows the original, unedited page.

EDIT INSTRUCTION: "{instruction}"

OPTION A (Native Edit): The second image shows the result of a native PDF edit that preserves text selectability and vector graphics.

OPTION B (AI Regeneration): The third image shows a complete AI-regenerated version of the page.

Compare both options and decide which is BETTER based on:

1. **ACCURACY**: Does it correctly implement the requested edit?
2. **CONTENT PRESERVATION**: Is ALL original content still present and readable?
3. **VISUAL QUALITY**: Does it look professional and clean?
4. **LAYOUT**: Is the layout well-balanced and not broken?
5. **NO ARTIFACTS**: Are there any glitches, overlaps, or visual errors?

Return JSON:
{{
    "winner": "A" or "B" or "TIE",
    "option_a_score": 1-10,
    "option_b_score": 1-10,
    "option_a_pros": ["list of strengths"],
    "option_a_cons": ["list of weaknesses"],
    "option_b_pros": ["list of strengths"],
    "option_b_cons": ["list of weaknesses"],
    "reasoning": "1-2 sentence explanation of why the winner is better",
    "recommendation": "Use A because..." or "Use B because..."
}}

IMPORTANT:
- Be strict about content preservation - missing text is a major flaw
- Native edits (A) should be preferred if quality is similar (preserves PDF features)
- AI regeneration (B) should only win if it's clearly superior visually

Return ONLY the JSON."""

