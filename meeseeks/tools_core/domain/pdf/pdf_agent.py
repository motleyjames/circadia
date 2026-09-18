"""
PDF Agent - An intelligent agent that selects the best approach for PDF editing,
validates results with AI vision, and retries with alternative methods if needed.

Refactored to use utils.py and prompts.py for DRY compliance.
"""

import os
import tempfile
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from dataclasses import dataclass
from enum import Enum

from PIL import Image

from . import pdf_utils, ai_utils, prompts
from .pdf_tools import (
    PDFToolbox, PDFCapability, detect_pdf_features,
    get_available_tools, HAS_PYMUPDF,
    validate_page_dimensions, get_page_structure,
    get_page_elements_summary, execute_pymupdf_script
)
from .utils import (
    clean_json_response, render_page, call_gemini_json,
    call_gemini_text, is_blank_image, DEFAULT_MODEL, FAST_MODEL
)


class EditType(Enum):
    """Types of PDF edits we can perform"""
    FILL_FORM = "fill_form"
    ADD_TEXT = "add_text"
    REPLACE_TEXT = "replace_text"
    ADD_WATERMARK = "add_watermark"
    GENERATE_PAGE = "generate_page"
    CREATIVE_EDIT = "creative_edit"
    IMPROVE_LAYOUT = "improve_layout"
    NATIVE_SCRIPT = "native_script"
    MOVE_ELEMENT = "move_element"
    STYLE_CHANGE = "style_change"
    UNKNOWN = "unknown"


@dataclass
class EditPlan:
    """A plan for how to execute a PDF edit"""
    edit_type: EditType
    tools_to_try: List[str]
    params: Dict[str, Any]
    requires_validation: bool
    description: str


class PDFAgent:
    """
    Intelligent PDF editing agent that:
    1. Analyzes the task and PDF to understand what's needed
    2. Selects the best tool/approach
    3. Executes the edit
    4. Validates results with AI vision
    5. Retries with alternative approaches if needed
    """
    
    def __init__(self, verbose: bool = True, fast: bool = False):
        self.verbose = verbose
        self.fast = fast  # Use fast model (same as default - top models only)
        self.toolbox = PDFToolbox()
        self.max_retries = 3
        
    def log(self, msg: str):
        if self.verbose:
            print(msg)

    # =========================================================================
    # TASK ANALYSIS
    # =========================================================================
            
    def analyze_task(self, pdf_path: str, prompt: str) -> EditPlan:
        """Use AI to understand what the user wants and create an execution plan."""
        self.log("🔍 Analyzing task...")
        
        features = detect_pdf_features(pdf_path)
        self.log(f"   PDF has {features['page_count']} pages")
        self.log(f"   Has form fields: {features['has_acroform']}")
        self.log(f"   Is scanned/image: {features['is_scanned']}")
        
        try:
            plan = self._ai_classify_task(prompt, features)
            self.log(f"   Edit type: {plan.edit_type.value}")
            self.log(f"   Tools to try: {plan.tools_to_try}")
            return plan
        except Exception as e:
            self.log(f"   ⚠️ AI classification failed: {e}")
            return EditPlan(
                edit_type=EditType.CREATIVE_EDIT,
                tools_to_try=["gemini_image"],
                params={"prompt": prompt},
                requires_validation=True,
                description=prompt
            )
            
    def _ai_classify_task(self, prompt: str, pdf_features: Dict) -> EditPlan:
        """Use Gemini to classify the edit task and create a plan"""
        classification_prompt = prompts.CLASSIFY_TASK_PROMPT.format(
            prompt=prompt,
            has_acroform=pdf_features.get('has_acroform', False),
            form_fields=pdf_features.get('form_fields', [])[:10],
            is_scanned=pdf_features.get('is_scanned', False),
            has_text=pdf_features.get('has_text', True)
        )
        
        success, result = call_gemini_json(classification_prompt, fast=self.fast)
        
        if not success:
            raise RuntimeError(f"Classification failed: {result.get('error', 'Unknown')}")
        
        edit_type = EditType(result.get("edit_type", "creative_edit"))
        tools_to_try = self._get_tools_for_type(edit_type, pdf_features)
        
        return EditPlan(
            edit_type=edit_type,
            tools_to_try=tools_to_try,
            params=result.get("params", {}),
            requires_validation=result.get("requires_validation", True),
            description=result.get("description", "")
        )
        
    def _get_tools_for_type(self, edit_type: EditType, pdf_features: Dict) -> List[str]:
        """Determine which tools to try for an edit type"""
        tool_map = {
            EditType.FILL_FORM: (
                ["pypdf", "pymupdf", "pikepdf", "gemini_image"] 
                if pdf_features.get("has_acroform") 
                else ["pymupdf", "reportlab", "gemini_image"]
            ),
            EditType.ADD_TEXT: ["pymupdf", "reportlab", "gemini_image"],
            EditType.REPLACE_TEXT: (
                ["pymupdf", "gemini_image"] 
                if pdf_features.get("has_text") 
                else ["gemini_image"]
            ),
            EditType.ADD_WATERMARK: ["pymupdf", "pypdf", "gemini_image"],
            EditType.GENERATE_PAGE: ["reportlab", "gemini_image"],
            EditType.CREATIVE_EDIT: ["gemini_image"],
        }
        return tool_map.get(edit_type, ["gemini_image"])

    # =========================================================================
    # VALIDATION
    # =========================================================================

    def validate_edit(
        self, 
        original_path: str,
        edited_path: str, 
        page_num: int,
        expected_changes: str,
        check_composition: bool = False
    ) -> Tuple[bool, str]:
        """
        Validate that an edit was successful using multiple checks:
        1. Dimension check
        2. AI vision quality check
        3. Optional composition check
        """
        self.log("🔎 Validating edit...")
        
        # Step 1: Dimension validation
        dim_valid, dim_msg = validate_page_dimensions(original_path, edited_path, page_num)
        if not dim_valid:
            self.log(f"   ✗ Dimension validation failed: {dim_msg}")
            return False, f"Dimension mismatch: {dim_msg}"
        self.log(f"   ✓ Dimensions OK")
        
        # Step 2: AI vision validation
        try:
            edited_image = render_page(edited_path, page_num)
            original_image = render_page(original_path, page_num)
                
            if edited_image is None:
                return False, "Could not render edited page"
            
            prompt = prompts.VALIDATE_EDIT_PROMPT.format(expected_changes=expected_changes)
            
            images = []
            if original_image:
                images.extend(["ORIGINAL PAGE:", original_image])
            images.extend(["EDITED PAGE:", edited_image])
            
            success, result = call_gemini_json(prompt, images, fast=self.fast)
            
            if not success:
                self.log(f"   ⚠️ Validation API error: {result.get('error')}")
                return False, f"Validation error: {result.get('error')}"
            
            # Check each validation criterion
            if result.get("is_blank", True):
                self.log(f"   ✗ Page is blank")
                return False, "Page is blank"
                
            if not result.get("has_expected_content", False):
                self.log(f"   ✗ Expected content not found")
                return False, f"Expected content not found: {result.get('explanation', '')}"
                
            quality_issues = result.get("quality_issues", [])
            if quality_issues:
                self.log(f"   ✗ Quality issues detected:")
                for issue in quality_issues:
                    self.log(f"      - {issue}")
                return False, f"Quality issues: {', '.join(quality_issues)}"
                
            if result.get("is_broken", False):
                self.log(f"   ✗ Page appears broken/glitched")
                return False, f"Page is broken: {result.get('explanation', '')}"
                
            if not result.get("is_professional", True):
                self.log(f"   ✗ Page not professional quality")
                return False, f"Not professional: {result.get('explanation', '')}"
            
            if not result.get("success", False):
                self.log(f"   ✗ Validation failed: {result.get('explanation', '')}")
                return False, result.get("explanation", "Validation failed")
                
            self.log(f"   ✓ Content validation passed")
            self.log(f"   ✓ Quality check passed")
            self.log(f"   ✓ Professional appearance confirmed")
            
            # Step 3: Optional composition check
            if check_composition:
                return self._validate_composition(original_path, edited_path, page_num)
                
            return True, result.get("explanation", "")
            
        except Exception as e:
            self.log(f"   ⚠️ Validation error: {e}")
            return False, f"Validation error: {e}"

    def _validate_composition(
        self, original_path: str, edited_path: str, page_num: int
    ) -> Tuple[bool, str]:
        """Check that composition didn't degrade after edit."""
        self.log("   ⚖️  Checking composition...")
        
        original_comp = self.analyze_composition(original_path, page_num)
        edited_comp = self.analyze_composition(edited_path, page_num)
        
        original_score = original_comp.get("composition_score", 5)
        edited_score = edited_comp.get("composition_score", 5)
        original_balanced = original_comp.get("is_balanced", False)
        edited_balanced = edited_comp.get("is_balanced", False)
        
        if edited_score < original_score:
            self.log(f"   ✗ Composition degraded: {original_score} → {edited_score}")
            return False, f"Composition got worse ({original_score} → {edited_score})"
        
        if original_balanced and not edited_balanced:
            self.log(f"   ✗ Balance was lost")
            return False, "Edit broke the page balance"
        
        if edited_score > original_score:
            self.log(f"   ✓ Composition improved: {original_score} → {edited_score}")
        elif edited_balanced and not original_balanced:
            self.log(f"   ✓ Balance improved!")
        else:
            self.log(f"   ~ Composition stable: {edited_score}/10")
            
        # Warn about new empty areas
        original_empty = len(original_comp.get("balance_issues", {}).get("empty_areas", []))
        edited_empty = len(edited_comp.get("balance_issues", {}).get("empty_areas", []))
        if edited_empty > original_empty:
            self.log(f"   ⚠️  More empty areas detected ({original_empty} → {edited_empty})")
        
        return True, f"Composition score: {edited_score}/10"

    # =========================================================================
    # QUALITY & COMPOSITION ANALYSIS
    # =========================================================================

    def quality_check(self, pdf_path: str, page_num: int) -> Tuple[bool, Dict[str, Any]]:
        """Perform a standalone quality check on a page."""
        self.log(f"🔍 Quality checking page {page_num}...")
        
        page_image = render_page(pdf_path, page_num)
        if page_image is None:
            return False, {"error": "Could not render page"}
        
        success, result = call_gemini_json(prompts.QUALITY_CHECK_PROMPT, [page_image], fast=self.fast)
        
        if not success:
            self.log(f"   ⚠️ Quality check error: {result.get('error')}")
            return False, result
        
        is_good = result.get("is_good_quality", False)
        severity = result.get("severity", "unknown")
        issues = result.get("issues_found", [])
        
        if is_good:
            self.log(f"   ✓ Page quality is good")
        else:
            self.log(f"   ✗ Quality issues found (severity: {severity})")
            for issue in issues:
                self.log(f"      - {issue}")
                
        return is_good, result

    def analyze_composition(self, pdf_path: str, page_num: int) -> Dict[str, Any]:
        """Analyze the visual composition and balance of a page."""
        self.log(f"⚖️  Analyzing composition of page {page_num}...")
        
        page_image = render_page(pdf_path, page_num)
        if page_image is None:
            return {"error": "Could not render page"}
        
        success, result = call_gemini_json(
            prompts.COMPOSITION_ANALYSIS_PROMPT, 
            [page_image],
            temperature=0.2,
            fast=self.fast
        )
        
        if not success:
            self.log(f"   ⚠️ Composition analysis error: {result.get('error')}")
            return result
        
        score = result.get("composition_score", 0)
        is_balanced = result.get("is_balanced", False)
        
        score_emoji = "🟢" if score >= 8 else "🟡" if score >= 6 else "🔴"
        self.log(f"   {score_emoji} Composition score: {score}/10")
        self.log(f"   {'✓' if is_balanced else '✗'} Balance: {'Good' if is_balanced else 'Issues detected'}")
        
        vw = result.get("visual_weight", {})
        self.log(f"   📊 Visual weight: L={vw.get('left_third', '?')} | C={vw.get('center_third', '?')} | R={vw.get('right_third', '?')}")
        
        balance_issues = result.get("balance_issues", {})
        empty_areas = balance_issues.get("empty_areas", [])
        if empty_areas:
            self.log(f"   ⚠️  Empty areas:")
            for area in empty_areas:
                self.log(f"      - {area}")
                
        suggestions = result.get("improvement_suggestions", [])
        if suggestions and score < 8:
            self.log(f"   💡 Suggestions:")
            for s in suggestions[:3]:
                self.log(f"      → {s}")
                
        return result

    def full_page_analysis(self, pdf_path: str, page_num: int) -> Dict[str, Any]:
        """Comprehensive page analysis: structure + quality + composition."""
        self.log(f"\n{'='*50}")
        self.log(f"📄 Full Analysis: Page {page_num}")
        self.log('='*50)
        
        results = {
            "page_num": page_num,
            "structure": None,
            "quality": None,
            "composition": None,
            "overall_score": 0,
            "needs_improvement": False,
            "priority_fixes": []
        }
        
        # Structure
        self.log("\n📋 Structure:")
        structure = get_page_elements_summary(pdf_path, page_num)
        self.log(structure)
        results["structure"] = structure
        
        # Quality
        self.log("\n🔍 Quality:")
        is_quality_good, quality_details = self.quality_check(pdf_path, page_num)
        results["quality"] = quality_details
        
        # Composition
        self.log("\n⚖️  Composition:")
        composition = self.analyze_composition(pdf_path, page_num)
        results["composition"] = composition
        
        # Calculate scores
        quality_score = 10 if is_quality_good else 5
        comp_score = composition.get("composition_score", 5)
        results["overall_score"] = (quality_score + comp_score) / 2
        
        results["needs_improvement"] = (
            not is_quality_good or 
            comp_score < 7 or
            not composition.get("is_balanced", True)
        )
        
        fixes = []
        if not is_quality_good:
            fixes.extend(quality_details.get("suggestions", []))
        if comp_score < 7:
            fixes.extend(composition.get("improvement_suggestions", []))
        results["priority_fixes"] = fixes[:5]
        
        self.log(f"\n📊 Summary:")
        self.log(f"   Overall score: {results['overall_score']:.1f}/10")
        self.log(f"   Needs improvement: {'Yes' if results['needs_improvement'] else 'No'}")
        if results['priority_fixes']:
            self.log(f"   Top fixes:")
            for fix in results['priority_fixes'][:3]:
                self.log(f"      → {fix}")
        
        return results

    # =========================================================================
    # EDIT EXECUTION
    # =========================================================================

    def execute_edit(
        self,
        pdf_path: str,
        page_num: int,
        prompt: str,
        output_path: str = None
    ) -> Tuple[bool, str, List[str]]:
        """Execute a PDF edit with intelligent tool selection and validation."""
        logs = []
        
        if not output_path:
            input_path = Path(pdf_path)
            output_path = f"edited_{input_path.name}"
            
        plan = self.analyze_task(pdf_path, prompt)
        logs.append(f"Plan: {plan.description}")
        logs.append(f"Edit type: {plan.edit_type.value}")
        logs.append(f"Tools: {plan.tools_to_try}")
        
        for tool_name in plan.tools_to_try:
            logs.append(f"\n🔧 Trying {tool_name}...")
            
            try:
                if tool_name == "gemini_image":
                    success = self._execute_gemini_edit(pdf_path, page_num, prompt, output_path)
                else:
                    success = self._execute_tool_edit(tool_name, pdf_path, page_num, plan, output_path)
                    
                if not success:
                    logs.append(f"   ✗ {tool_name} failed to execute")
                    continue
                    
                if plan.requires_validation:
                    is_valid, reason = self.validate_edit(
                        pdf_path, output_path, page_num, plan.description
                    )
                    if not is_valid:
                        logs.append(f"   ✗ Validation failed: {reason}")
                        continue
                        
                logs.append(f"   ✓ {tool_name} succeeded!")
                return True, output_path, logs
                
            except Exception as e:
                logs.append(f"   ✗ {tool_name} error: {str(e)}")
                continue
                
        logs.append("\n❌ All approaches failed!")
        return False, None, logs
        
    def _execute_gemini_edit(
        self, pdf_path: str, page_num: int, prompt: str, output_path: str
    ) -> bool:
        """Execute edit using Gemini image generation"""
        try:
            target_image = pdf_utils.render_page_as_image(pdf_path, page_num)
            
            # Get original page dimensions for proper sizing
            from .utils import get_page_dimensions
            target_width, target_height = get_page_dimensions(pdf_path, page_num)
            
            generated_image, _ = ai_utils.generate_edited_slide(
                target_image=target_image,
                style_reference_images=[],
                full_text_context="",
                user_prompt=prompt
            )
            
            temp_pdf = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
            temp_pdf.close()
            
            # Create PDF with correct dimensions
            pdf_utils.image_to_pdf_with_size(
                generated_image, temp_pdf.name, 
                target_width, target_height
            )
            
            pdf_utils.batch_replace_pages(pdf_path, {page_num: temp_pdf.name}, output_path)
            os.unlink(temp_pdf.name)
            
            return True
        except Exception as e:
            self.log(f"Gemini edit failed: {e}")
            return False
            
    def _execute_tool_edit(
        self, tool_name: str, pdf_path: str, page_num: int, 
        plan: EditPlan, output_path: str
    ) -> bool:
        """Execute edit using a traditional PDF tool"""
        from .pdf_tools import (
            fill_form_pypdf, add_text_pymupdf, 
            add_watermark_pymupdf, replace_text_pymupdf,
            generate_page_reportlab, HAS_PYMUPDF, HAS_REPORTLAB
        )
        
        params = plan.params
        
        if tool_name == "pypdf" and plan.edit_type == EditType.FILL_FORM:
            return fill_form_pypdf(pdf_path, params.get("fields", {}), output_path)
                
        elif tool_name == "pymupdf" and HAS_PYMUPDF:
            if plan.edit_type == EditType.ADD_TEXT:
                position = self._get_position_coords(params.get("position", "center"))
                return add_text_pymupdf(
                    pdf_path, page_num, params.get("text", ""),
                    position, output_path=output_path
                )
            elif plan.edit_type == EditType.ADD_WATERMARK:
                return add_watermark_pymupdf(
                    pdf_path, params.get("text", "WATERMARK"),
                    output_path, params.get("opacity", 0.3)
                )
            elif plan.edit_type == EditType.REPLACE_TEXT:
                success, _ = replace_text_pymupdf(
                    pdf_path, params.get("old_text", ""),
                    params.get("new_text", ""), output_path
                )
                return success
                
        elif tool_name == "reportlab" and HAS_REPORTLAB:
            if plan.edit_type == EditType.GENERATE_PAGE:
                return generate_page_reportlab(params.get("content", {}), output_path)
                
        return False
        
    def _get_position_coords(self, position: str) -> Tuple[float, float]:
        """Convert position string to coordinates"""
        positions = {
            "top": (100, 750), "center": (100, 400), "bottom": (100, 100),
            "top-left": (50, 750), "top-right": (450, 750),
        }
        return positions.get(position, (100, 400))

    # =========================================================================
    # NATIVE EDITING (Code-as-Policy)
    # =========================================================================

    def generate_pymupdf_script(
        self, pdf_path: str, page_num: int, instruction: str
    ) -> Tuple[bool, str, str]:
        """Generate a PyMuPDF script to accomplish the user's instruction."""
        self.log(f"   🧠 Generating PyMuPDF script...")
        
        structure_summary = get_page_elements_summary(pdf_path, page_num)
        structure_json = get_page_structure(pdf_path, page_num)
        
        prompt = prompts.PYMUPDF_SCRIPT_PROMPT.format(
            instruction=instruction,
            structure_summary=structure_summary,
            structure_json=structure_json[:2000],
            page_idx=page_num - 1
        )
        
        success, text = call_gemini_text(prompt, temperature=0.2, fast=self.fast)
        
        if not success:
            return False, "", text
        
        script = text.strip()
        
        # Clean markdown
        if script.startswith("```python"):
            script = script[9:]
        if script.startswith("```"):
            script = script[3:]
        if script.endswith("```"):
            script = script[:-3]
        script = script.strip()
        
        # Remove dangerous operations
        forbidden = ["fitz.open(", "doc.save(", "doc.close("]
        lines = script.split('\n')
        lines = [l for l in lines if not any(f in l for f in forbidden)]
        script = '\n'.join(lines)
        
        self.log(f"   📝 Generated {len(lines)} line script")
        return True, script, ""

    def execute_native_edit(
        self,
        pdf_path: str,
        page_num: int,
        instruction: str,
        output_path: str = None,
        max_attempts: int = 3,
        check_composition: bool = False
    ) -> Tuple[bool, str, List[str]]:
        """Execute a native PDF edit using LLM-generated PyMuPDF scripts."""
        logs = []
        
        if not output_path:
            output_path = pdf_path.replace(".pdf", "_edited.pdf")
        
        logs.append(f"📋 Analyzing page {page_num} structure...")
        structure = get_page_elements_summary(pdf_path, page_num)
        logs.append(structure[:200] + "..." if len(structure) > 200 else structure)
        
        last_error = None
        failed_approaches = []
        
        for attempt in range(max_attempts):
            logs.append(f"\n🔧 Attempt {attempt + 1}/{max_attempts}")
            
            # Build instruction with error context
            full_instruction = instruction
            if last_error or failed_approaches:
                full_instruction = f"""
{instruction}

⚠️ PREVIOUS ATTEMPTS FAILED - USE A DIFFERENT APPROACH:
{"LAST ERROR: " + last_error if last_error else ""}

FAILED APPROACHES (DO NOT USE):
{chr(10).join('- ' + a for a in failed_approaches) if failed_approaches else 'None yet'}

GUIDELINES TO AVOID BREAKING THE PAGE:
1. Do NOT modify or delete existing text unless necessary
2. Add shapes BEHIND text (use overlay=False)
3. Use exact coordinates from the structure
4. Do NOT insert duplicate text
5. Ensure boxes don't overlap text
"""
            
            success, script, gen_error = self.generate_pymupdf_script(
                pdf_path, page_num, full_instruction
            )
            
            if not success:
                logs.append(f"   ✗ Script generation failed: {gen_error}")
                last_error = gen_error
                failed_approaches.append(f"Script generation: {gen_error}")
                continue
            
            logs.append(f"   📝 Generated script ({len(script)} chars)")
            
            exec_success, message = execute_pymupdf_script(pdf_path, script, output_path)
            
            if not exec_success:
                logs.append(f"   ✗ Execution failed: {message}")
                last_error = message
                failed_approaches.append(f"Execution: {message}")
                continue
            
            logs.append(f"   ✓ Script executed successfully")
            
            is_valid, reason = self.validate_edit(
                pdf_path, output_path, page_num, instruction,
                check_composition=check_composition
            )
            
            if is_valid:
                logs.append(f"   ✓ All validations passed!")
                return True, output_path, logs
            else:
                logs.append(f"   ✗ Validation failed: {reason}")
                last_error = reason
                failed_approaches.append(f"Validation: {reason}")
        
        logs.append(f"\n❌ All {max_attempts} attempts failed")
        logs.append("   💡 Consider using 'edit' command for AI image regeneration")
        return False, None, logs

    # =========================================================================
    # A/B COMPARISON (Best of Both)
    # =========================================================================

    def compare_edits(
        self,
        original_path: str,
        option_a_path: str,
        option_b_path: str,
        page_num: int,
        instruction: str
    ) -> Dict[str, Any]:
        """
        Compare two edit approaches and pick the winner.
        
        Args:
            original_path: Path to original PDF
            option_a_path: Path to Option A result (typically native edit)
            option_b_path: Path to Option B result (typically AI regeneration)
            page_num: Page number to compare
            instruction: The edit instruction for context
            
        Returns:
            Dict with winner, scores, pros/cons, and reasoning
        """
        self.log("⚖️  Comparing edit approaches...")
        
        original_image = render_page(original_path, page_num)
        option_a_image = render_page(option_a_path, page_num)
        option_b_image = render_page(option_b_path, page_num)
        
        if not all([original_image, option_a_image, option_b_image]):
            return {"error": "Could not render one or more pages", "winner": "TIE"}
        
        prompt = prompts.COMPARE_EDITS_PROMPT.format(instruction=instruction)
        
        images = [
            "ORIGINAL:", original_image,
            "OPTION A (Native Edit):", option_a_image,
            "OPTION B (AI Regeneration):", option_b_image
        ]
        
        success, result = call_gemini_json(prompt, images, temperature=0.1, fast=self.fast)
        
        if not success:
            self.log(f"   ⚠️ Comparison failed: {result.get('error')}")
            return {"error": result.get("error"), "winner": "TIE"}
        
        winner = result.get("winner", "TIE")
        a_score = result.get("option_a_score", 5)
        b_score = result.get("option_b_score", 5)
        
        self.log(f"   📊 Option A (Native): {a_score}/10")
        self.log(f"   📊 Option B (AI Regen): {b_score}/10")
        self.log(f"   🏆 Winner: {winner}")
        self.log(f"   💬 {result.get('reasoning', '')}")
        
        return result

    def execute_best_of_both(
        self,
        pdf_path: str,
        page_num: int,
        instruction: str,
        output_path: str = None,
        prefer_native: bool = True
    ) -> Tuple[bool, str, List[str], Dict[str, Any]]:
        """
        Try both native editing and AI regeneration, then pick the best result.
        
        This gives you the best of both worlds:
        - Native editing preserves text selection, vectors, accessibility
        - AI regeneration can produce more polished visual results
        
        Args:
            pdf_path: Path to the PDF
            page_num: Page to edit
            instruction: What to do
            output_path: Where to save the winner
            prefer_native: If tie, prefer native (preserves PDF features)
            
        Returns:
            (success, output_path, logs, comparison_result)
        """
        logs = []
        
        if not output_path:
            output_path = pdf_path.replace(".pdf", "_best.pdf")
        
        logs.append("🔀 Running Best-of-Both comparison...")
        logs.append(f"   Instruction: {instruction[:60]}...")
        
        # Create temp paths for both approaches
        native_path = pdf_path.replace(".pdf", "_native_temp.pdf")
        regen_path = pdf_path.replace(".pdf", "_regen_temp.pdf")
        
        native_success = False
        regen_success = False
        
        # Try Option A: Native edit
        logs.append("\n🅰️  Attempting Native Edit...")
        try:
            native_success, _, native_logs = self.execute_native_edit(
                pdf_path, page_num, instruction, native_path, max_attempts=2
            )
            if native_success:
                logs.append("   ✓ Native edit succeeded")
            else:
                logs.append("   ✗ Native edit failed")
        except Exception as e:
            logs.append(f"   ✗ Native edit error: {e}")
        
        # Try Option B: AI regeneration
        logs.append("\n🅱️  Attempting AI Regeneration...")
        try:
            regen_success = self._execute_gemini_edit(
                pdf_path, page_num, instruction, regen_path
            )
            if regen_success:
                # Validate the regeneration
                is_valid, reason = self.validate_edit(
                    pdf_path, regen_path, page_num, instruction
                )
                if is_valid:
                    logs.append("   ✓ AI regeneration succeeded")
                else:
                    logs.append(f"   ✗ AI regeneration failed validation: {reason}")
                    regen_success = False
            else:
                logs.append("   ✗ AI regeneration failed")
        except Exception as e:
            logs.append(f"   ✗ AI regeneration error: {e}")
        
        # Decide winner
        comparison_result = {}
        
        if native_success and regen_success:
            # Both succeeded - let AI judge
            logs.append("\n⚖️  Both approaches succeeded - comparing...")
            comparison_result = self.compare_edits(
                pdf_path, native_path, regen_path, page_num, instruction
            )
            
            winner = comparison_result.get("winner", "TIE")
            
            if winner == "A" or (winner == "TIE" and prefer_native):
                # Native wins
                logs.append("   🏆 Winner: Native Edit (preserves PDF features)")
                import shutil
                shutil.copy(native_path, output_path)
                comparison_result["chosen"] = "native"
            else:
                # AI regen wins
                logs.append("   🏆 Winner: AI Regeneration (better visual quality)")
                import shutil
                shutil.copy(regen_path, output_path)
                comparison_result["chosen"] = "regeneration"
                
        elif native_success:
            logs.append("\n✓ Only native edit succeeded - using it")
            import shutil
            shutil.copy(native_path, output_path)
            comparison_result = {"winner": "A", "chosen": "native", "reason": "Only option that worked"}
            
        elif regen_success:
            logs.append("\n✓ Only AI regeneration succeeded - using it")
            import shutil
            shutil.copy(regen_path, output_path)
            comparison_result = {"winner": "B", "chosen": "regeneration", "reason": "Only option that worked"}
            
        else:
            logs.append("\n❌ Both approaches failed!")
            return False, None, logs, {"error": "Both approaches failed"}
        
        # Cleanup temp files
        import os
        for temp_path in [native_path, regen_path]:
            try:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            except:
                pass
        
        logs.append(f"\n✅ Saved best result to: {output_path}")
        return True, output_path, logs, comparison_result

    # =========================================================================
    # IMPROVEMENTS
    # =========================================================================

    def get_improvement_suggestions(self, pdf_path: str, page_num: int) -> List[Dict]:
        """Use AI to analyze a page and suggest layout improvements."""
        self.log("💡 Analyzing page for potential improvements...")
        
        page_image = render_page(pdf_path, page_num)
        if page_image is None:
            return []
        
        success, result = call_gemini_json(
            prompts.IMPROVEMENT_SUGGESTIONS_PROMPT,
            [page_image],
            temperature=0.3,
            fast=self.fast
        )
        
        if not success or not isinstance(result, list):
            self.log(f"   ⚠️ Could not get suggestions")
            return []
        
        for s in result:
            priority = s.get("priority", "medium")
            improvement = s.get("improvement", "")
            self.log(f"   📌 [{priority.upper()}] {improvement}")
            
        return result

    def apply_improvement(
        self,
        pdf_path: str,
        page_num: int,
        suggestion: Dict[str, str],
        output_path: str,
        max_retries: int = 2
    ) -> Tuple[bool, str]:
        """Apply a single improvement suggestion to a page."""
        improvement = suggestion.get("improvement", "")
        self.log(f"   🎨 Applying: {improvement}")
        
        for attempt in range(max_retries):
            try:
                target_image = pdf_utils.render_page_as_image(pdf_path, page_num)
                
                page_text = ""
                try:
                    page_texts = pdf_utils.extract_text_per_page(pdf_path)
                    page_text = page_texts.get(page_num, "")
                except:
                    pass
                
                improve_prompt = prompts.APPLY_IMPROVEMENT_PROMPT.format(
                    improvement=improvement,
                    page_text=page_text[:500] if page_text else "(text visible in image)"
                )
                
                generated_image, _ = ai_utils.generate_edited_slide(
                    target_image=target_image,
                    style_reference_images=[target_image],
                    full_text_context=page_text,
                    user_prompt=improve_prompt,
                    resolution="2K"
                )
                
                if is_blank_image(generated_image):
                    self.log(f"   ⚠️ Generated image appears blank (attempt {attempt + 1})")
                    continue
                
                temp_pdf = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
                temp_pdf.close()
                pdf_utils.rehydrate_image_to_pdf(generated_image, temp_pdf.name)
                
                pdf_utils.batch_replace_pages(pdf_path, {page_num: temp_pdf.name}, output_path)
                os.unlink(temp_pdf.name)
                return True, output_path
                
            except Exception as e:
                self.log(f"   ⚠️ Attempt {attempt + 1} failed: {e}")
                continue
                
        self.log(f"   ✗ All improvement attempts failed")
        return False, None

    def improve_page(
        self,
        pdf_path: str,
        page_num: int,
        output_path: str = None,
        max_improvements: int = 2
    ) -> Tuple[bool, str, List[str]]:
        """Run improvement loop on a page with validation."""
        logs = []
        current_path = pdf_path
        
        if not output_path:
            input_path = Path(pdf_path)
            output_path = f"improved_{input_path.name}"
        
        suggestions = self.get_improvement_suggestions(pdf_path, page_num)
        
        if not suggestions:
            logs.append("No improvements suggested")
            return True, pdf_path, logs
            
        priority_order = {"high": 0, "medium": 1, "low": 2}
        suggestions.sort(key=lambda s: priority_order.get(s.get("priority", "low"), 2))
        suggestions = suggestions[:max_improvements]
        
        logs.append(f"Found {len(suggestions)} improvement(s) to apply")
        
        improvements_applied = 0
        for i, suggestion in enumerate(suggestions):
            improvement = suggestion.get("improvement", "")
            area = suggestion.get("area", "layout")
            
            logs.append(f"\n🎨 Improvement {i+1}: {improvement}")
            
            success = False
            new_path = None
            
            # Try PyMuPDF first for structural improvements
            if HAS_PYMUPDF and area in ["spacing", "alignment", "layout"]:
                logs.append(f"   Trying PyMuPDF for {area}...")
                success, new_path = self._apply_pymupdf_improvement(
                    current_path, page_num, suggestion, output_path
                )
                
            if not success:
                logs.append(f"   Trying Gemini image regeneration...")
                success, new_path = self.apply_improvement(
                    current_path, page_num, suggestion, output_path
                )
            
            if not success:
                logs.append(f"   ✗ Failed to apply")
                continue
                
            is_valid, reason = self.validate_edit(
                pdf_path, new_path, page_num, f"Improved: {improvement}"
            )
            
            if is_valid:
                logs.append(f"   ✓ Applied and validated!")
                current_path = new_path
                improvements_applied += 1
            else:
                logs.append(f"   ✗ Validation failed: {reason}")
                logs.append(f"   ↩ Reverting this improvement")
                
        if improvements_applied > 0:
            logs.append(f"\n✅ Applied {improvements_applied} improvement(s)")
            return True, current_path, logs
        else:
            logs.append("\n⚠️ No improvements could be applied")
            return True, pdf_path, logs
    
    def _apply_pymupdf_improvement(
        self, pdf_path: str, page_num: int, 
        suggestion: Dict[str, str], output_path: str
    ) -> Tuple[bool, str]:
        """Apply structural improvements using PyMuPDF."""
        if not HAS_PYMUPDF:
            return False, None
            
        improvement = suggestion.get("improvement", "")
        
        success, script, error = self.generate_pymupdf_script(
            pdf_path, page_num, improvement
        )
        
        if not success:
            self.log(f"   Could not generate script: {error}")
            return False, None
            
        exec_success, message = execute_pymupdf_script(pdf_path, script, output_path)
        
        if exec_success:
            self.log(f"   ✓ Script executed: {message}")
            return True, output_path
        else:
            self.log(f"   ✗ Script failed: {message}")
            return False, None


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def smart_edit(
    pdf_path: str,
    page_num: int,
    prompt: str,
    output_path: str = None,
    verbose: bool = True
) -> Tuple[bool, str]:
    """Convenience function for intelligent PDF editing."""
    agent = PDFAgent(verbose=verbose)
    success, out_path, logs = agent.execute_edit(pdf_path, page_num, prompt, output_path)
    
    if verbose:
        print("\n📋 Execution Log:")
        for log in logs:
            print(f"  {log}")
            
    return success, out_path
