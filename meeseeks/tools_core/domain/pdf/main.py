import typer
from typing import List, Optional
from pathlib import Path
from . import pdf_utils, ai_utils
import concurrent.futures
import tempfile

app = typer.Typer()

@app.command()
def edit(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    edits: List[str] = typer.Argument(..., help="Pairs of 'PageNumber Prompt' (e.g. 1 'Fix typo' 2 'Make blue')"),
    style_refs: Optional[str] = typer.Option(None, help="Comma-separated list of extra reference page numbers (e.g. '5,6')"),
    use_context: bool = typer.Option(False, help="Include full PDF text as context (can confuse the model)"),
    output: Optional[str] = typer.Option(None, help="Output path for the edited PDF. Defaults to 'edited_<filename>'"),
    resolution: str = typer.Option("4K", help="Image resolution: '4K', '2K', '1K' (higher = better quality but slower)"),
    disable_google_search: bool = typer.Option(False, help="Disable Google Search (enabled by default)")
):
    """
    Edit a PDF page using Gemini 3 Pro Image.
    Usage: legion-pdf-playbooks edit deck.pdf 1 "prompt A" 2 "prompt B"
    """
    # Check system dependencies first
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    if not output:
        output = f"edited_{input_path.name}"
    
    # Parse Edits
    if len(edits) % 2 != 0:
        typer.echo("Error: Edits must be pairs of 'PageNumber Prompt'.")
        raise typer.Exit(code=1)

    # Merge duplicate page edits into a single prompt
    edits_by_page = {}
    for i in range(0, len(edits), 2):
        try:
            p_num = int(edits[i])
            prompt = edits[i+1]
            if p_num in edits_by_page:
                # Merge prompts with separator
                edits_by_page[p_num] += f"\n\nALSO: {prompt}"
            else:
                edits_by_page[p_num] = prompt
        except ValueError:
            typer.echo(f"Error: Invalid page number '{edits[i]}'")
            raise typer.Exit(code=1)

    parsed_edits = list(edits_by_page.items())

    # Validate page numbers are within range
    total_pages = pdf_utils.get_page_count(str(input_path))
    invalid_pages = [p for p, _ in parsed_edits if p < 1 or p > total_pages]
    if invalid_pages:
        typer.echo(f"Error: Invalid page number(s) {invalid_pages}. PDF has {total_pages} pages.")
        raise typer.Exit(code=1)

    typer.echo(f"Processing {pdf_path} with {len(parsed_edits)} edits...")
    
    # 1. Extract Full Text Context (Once)
    full_text = ""
    if use_context:
        typer.echo("Extracting text context...")
        full_text = pdf_utils.extract_full_text(str(input_path))
        if not full_text:
            typer.echo("Warning: Could not extract text from PDF. Context will be limited.")
    else:
        typer.echo("Skipping text context (use --use-context to enable)...")
    
    # 2. Prepare Visual Context (Style Anchors)
    typer.echo("Rendering reference images...")
    style_images = []
    
    # Add user-defined style refs
    if style_refs:
        for ref_page in style_refs.split(','):
            try:
                p_num = int(ref_page.strip())
                style_images.append(pdf_utils.render_page_as_image(str(input_path), p_num))
            except ValueError:
                typer.echo(f"Warning: Invalid style ref '{ref_page}'")
            except Exception as e:
                typer.echo(f"Warning: Could not render Page {ref_page}: {e}")

    # 3. Process Each Edit (Parallel)
    replacements = {} # page_num -> temp_pdf_path
    temp_files = []

    def process_single_page(page_num: int, prompt_text: str):
        typer.echo(f"Starting Page {page_num}...")
        try:
            target_image = pdf_utils.render_page_as_image(str(input_path), page_num)
            
            # Generate
            generated_image, response_text = ai_utils.generate_edited_slide(
                target_image=target_image,
                style_reference_images=style_images,
                full_text_context=full_text,
                user_prompt=prompt_text,
                resolution=resolution,
                enable_search=not disable_google_search
            )

            # Print model's text response if any
            if response_text:
                typer.echo(f"Model response for page {page_num}: {response_text}")

            # Re-hydrate
            temp_pdf_file = tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False)
            temp_pdf = temp_pdf_file.name
            temp_pdf_file.close()
            pdf_utils.rehydrate_image_to_pdf(generated_image, temp_pdf)
            
            typer.echo(f"Finished Page {page_num}")
            return (page_num, temp_pdf)
        except Exception as e:
            typer.echo(f"Error processing Page {page_num}: {e}")
            return None

    typer.echo(f"Processing {len(parsed_edits)} pages in parallel...")

    completed_count = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(process_single_page, p, prompt) for p, prompt in parsed_edits]

        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                p_num, temp_pdf = result
                replacements[p_num] = temp_pdf
                temp_files.append(temp_pdf)
            completed_count += 1
            typer.echo(f"Progress: {completed_count}/{len(parsed_edits)} pages completed")

    if not replacements:
        typer.echo("No pages were successfully processed.")
        raise typer.Exit(code=1)

    # 4. Batch Stitch
    typer.echo(f"\nStitching {len(replacements)} pages into final PDF...")
    try:
        pdf_utils.batch_replace_pages(str(input_path), replacements, output)
    except Exception as e:
        typer.echo(f"Error stitching PDF: {e}")
        raise typer.Exit(code=1)
    finally:
        # Cleanup
        for f in temp_files:
            if Path(f).exists():
                Path(f).unlink()

    typer.echo(f"Done! Saved to {output}")

@app.command()
def add(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    after_page: int = typer.Argument(..., help="Insert after this page number (0 for beginning)"),
    prompt: str = typer.Argument(..., help="Description of the new slide to create"),
    style_refs: Optional[str] = typer.Option(None, help="Comma-separated list of reference page numbers for style (e.g. '1,2'). Defaults to first page."),
    use_context: bool = typer.Option(True, help="Include full PDF text as context (enabled by default for better slide generation)"),
    output: Optional[str] = typer.Option(None, help="Output path for the PDF. Defaults to 'edited_<filename>'"),
    resolution: str = typer.Option("4K", help="Image resolution: '4K', '2K', '1K' (higher = better quality but slower)"),
    disable_google_search: bool = typer.Option(False, help="Disable Google Search (enabled by default)")
):
    """
    Add a new slide to a PDF using AI generation.
    Usage: legion-pdf-playbooks add deck.pdf 0 "Title slide with 'Welcome to Q3 Review'"
    """
    # Check system dependencies first
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    if not output:
        output = f"edited_{input_path.name}"

    # Validate after_page
    total_pages = pdf_utils.get_page_count(str(input_path))
    if after_page < 0 or after_page > total_pages:
        typer.echo(f"Error: after_page must be between 0 and {total_pages}. Use 0 to insert at the beginning.")
        raise typer.Exit(code=1)

    typer.echo(f"Adding new slide to {pdf_path} after page {after_page}...")

    # Extract text context
    full_text = ""
    if use_context:
        typer.echo("Extracting text context...")
        full_text = pdf_utils.extract_full_text(str(input_path))
        if not full_text:
            typer.echo("Warning: Could not extract text from PDF. Context will be limited.")

    # Prepare style references
    typer.echo("Rendering style reference images...")
    style_images = []

    if style_refs:
        for ref_page in style_refs.split(','):
            try:
                p_num = int(ref_page.strip())
                if p_num < 1 or p_num > total_pages:
                    typer.echo(f"Warning: Style ref page {p_num} out of range, skipping")
                    continue
                style_images.append(pdf_utils.render_page_as_image(str(input_path), p_num))
            except ValueError:
                typer.echo(f"Warning: Invalid style ref '{ref_page}'")
            except Exception as e:
                typer.echo(f"Warning: Could not render Page {ref_page}: {e}")
    else:
        # Default to first page as style reference
        typer.echo("Using page 1 as default style reference...")
        try:
            style_images.append(pdf_utils.render_page_as_image(str(input_path), 1))
        except Exception as e:
            typer.echo(f"Warning: Could not render Page 1: {e}")

    # Generate the new slide
    typer.echo("Generating new slide with AI...")
    try:
        generated_image, response_text = ai_utils.generate_new_slide(
            style_reference_images=style_images,
            user_prompt=prompt,
            full_text_context=full_text,
            resolution=resolution,
            enable_search=not disable_google_search
        )
    except Exception as e:
        typer.echo(f"Error generating slide: {e}")
        raise typer.Exit(code=1)

    # Print model's text response if any
    if response_text:
        typer.echo(f"Model response: {response_text}")

    # Re-hydrate to PDF
    typer.echo("Converting to PDF with text layer...")
    temp_pdf_file = tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False)
    temp_pdf = temp_pdf_file.name
    temp_pdf_file.close()

    try:
        pdf_utils.rehydrate_image_to_pdf(generated_image, temp_pdf)

        # Insert into the PDF
        typer.echo("Inserting slide into PDF...")
        pdf_utils.insert_page(str(input_path), temp_pdf, after_page, output)
    except Exception as e:
        typer.echo(f"Error creating PDF: {e}")
        raise typer.Exit(code=1)
    finally:
        # Cleanup
        if Path(temp_pdf).exists():
            Path(temp_pdf).unlink()

    typer.echo(f"Done! New slide added after page {after_page}. Saved to {output}")

@app.command()
def create(
    prompts: List[str] = typer.Argument(..., help="One or more prompts - each creates a page (e.g. 'Title slide' 'Agenda' 'Summary')"),
    style_images: Optional[str] = typer.Option(None, help="Comma-separated paths to style reference images (PNG/JPG)"),
    output: Optional[str] = typer.Option(None, help="Output path for the PDF. Defaults to 'created.pdf'"),
    resolution: str = typer.Option("4K", help="Image resolution: '4K', '2K', '1K' (higher = better quality but slower)"),
    disable_google_search: bool = typer.Option(False, help="Disable Google Search (enabled by default)")
):
    """
    Create a new PDF from scratch using AI generation.
    Usage: legion-pdf-playbooks create "Title slide for Q3 Review" "Agenda with 3 items" "Summary"
    """
    from PIL import Image
    
    # Check system dependencies first
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    if not output:
        output = "created.pdf"

    typer.echo(f"Creating PDF with {len(prompts)} page(s)...")

    # Load style reference images if provided
    style_images_list = []
    if style_images:
        typer.echo("Loading style reference images...")
        for img_path in style_images.split(','):
            img_path = img_path.strip()
            try:
                img = Image.open(img_path)
                style_images_list.append(img)
                typer.echo(f"  Loaded: {img_path}")
            except Exception as e:
                typer.echo(f"Warning: Could not load image '{img_path}': {e}")

    # Process each prompt (parallel for multiple pages)
    temp_files = []
    page_pdfs = []  # Ordered list of (page_index, temp_pdf_path)

    def process_single_prompt(index: int, prompt_text: str):
        typer.echo(f"Generating page {index + 1}: {prompt_text[:50]}{'...' if len(prompt_text) > 50 else ''}")
        try:
            generated_image, response_text = ai_utils.generate_new_slide(
                style_reference_images=style_images_list,
                user_prompt=prompt_text,
                full_text_context="",
                resolution=resolution,
                enable_search=not disable_google_search
            )

            if response_text:
                typer.echo(f"  Model response: {response_text}")

            # Re-hydrate to PDF
            temp_pdf_file = tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False)
            temp_pdf = temp_pdf_file.name
            temp_pdf_file.close()
            pdf_utils.rehydrate_image_to_pdf(generated_image, temp_pdf)

            typer.echo(f"  Page {index + 1} complete")
            return (index, temp_pdf)
        except Exception as e:
            typer.echo(f"Error generating page {index + 1}: {e}")
            return None

    if len(prompts) == 1:
        # Single page - no parallelism needed
        result = process_single_prompt(0, prompts[0])
        if result:
            page_pdfs.append(result)
            temp_files.append(result[1])
    else:
        # Multiple pages - process in parallel
        typer.echo(f"Processing {len(prompts)} pages in parallel...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(process_single_prompt, i, p) for i, p in enumerate(prompts)]

            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    page_pdfs.append(result)
                    temp_files.append(result[1])

    if not page_pdfs:
        typer.echo("No pages were successfully generated.")
        raise typer.Exit(code=1)

    # Sort by index to maintain order
    page_pdfs.sort(key=lambda x: x[0])
    ordered_pdf_paths = [p[1] for p in page_pdfs]

    # Merge or copy to output
    typer.echo(f"Creating final PDF...")
    try:
        if len(ordered_pdf_paths) == 1:
            # Single page - just copy
            import shutil
            shutil.copy(ordered_pdf_paths[0], output)
        else:
            # Multiple pages - merge
            pdf_utils.merge_pdfs(ordered_pdf_paths, output)
    except Exception as e:
        typer.echo(f"Error creating PDF: {e}")
        raise typer.Exit(code=1)
    finally:
        # Cleanup temp files
        for f in temp_files:
            if Path(f).exists():
                Path(f).unlink()

    typer.echo(f"Done! Created {output} with {len(page_pdfs)} page(s)")

@app.command()
def search(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    query: str = typer.Argument(..., help="Search query (can be natural language)"),
    visual: bool = typer.Option(False, help="Include visual analysis of pages (slower but finds charts/images)"),
    top_k: int = typer.Option(5, help="Maximum number of results to return"),
    describe: Optional[int] = typer.Option(None, help="Get detailed description of a specific page number")
):
    """
    Semantic search across PDF pages using AI.
    Finds pages by meaning, not just keywords.
    
    Usage: legion-pdf-playbooks search deck.pdf "slides about revenue growth"
    """
    # Check system dependencies first
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    
    # If describe mode, just describe that page
    if describe is not None:
        if describe < 1 or describe > total_pages:
            typer.echo(f"Error: Page {describe} out of range. PDF has {total_pages} pages.")
            raise typer.Exit(code=1)
        
        typer.echo(f"Analyzing page {describe}...")
        try:
            page_image = pdf_utils.render_page_as_image(str(input_path), describe)
            page_texts = pdf_utils.extract_text_per_page(str(input_path))
            page_text = page_texts.get(describe, "")
            
            description = ai_utils.describe_page(page_image, page_text)
            typer.echo(f"\n📄 Page {describe} Description:\n")
            typer.echo(description)
        except Exception as e:
            typer.echo(f"Error describing page: {e}")
            raise typer.Exit(code=1)
        return

    typer.echo(f"Searching {pdf_path} ({total_pages} pages) for: {query}")
    
    # Extract text from all pages
    typer.echo("Extracting text from pages...")
    page_texts = pdf_utils.extract_text_per_page(str(input_path))
    
    if not page_texts:
        typer.echo("Warning: Could not extract text from PDF. Trying visual search...")
        visual = True
    
    # Optionally render pages for visual search
    page_images = None
    if visual:
        typer.echo("Rendering pages for visual analysis (this may take a moment)...")
        page_images = {}
        for page_num in range(1, total_pages + 1):
            try:
                page_images[page_num] = pdf_utils.render_page_as_image(str(input_path), page_num)
            except Exception as e:
                typer.echo(f"Warning: Could not render page {page_num}: {e}")
    
    # Perform semantic search
    typer.echo("Performing semantic search...")
    try:
        results = ai_utils.semantic_search_pages(
            page_texts=page_texts,
            query=query,
            page_images=page_images,
            top_k=top_k
        )
    except Exception as e:
        typer.echo(f"Error during search: {e}")
        raise typer.Exit(code=1)
    
    # Display results
    if not results:
        typer.echo("\n❌ No relevant pages found.")
        return
    
    typer.echo(f"\n🔍 Found {len(results)} relevant page(s):\n")
    
    for i, result in enumerate(results, 1):
        page = result.get('page', '?')
        relevance = result.get('relevance', 0)
        explanation = result.get('explanation', 'No explanation')
        snippet = result.get('snippet', '')
        
        # Create relevance bar
        bar_length = int(relevance * 10)
        bar = '█' * bar_length + '░' * (10 - bar_length)
        
        typer.echo(f"  {i}. 📄 Page {page}  [{bar}] {relevance:.0%}")
        typer.echo(f"     💡 {explanation}")
        if snippet:
            # Truncate long snippets
            if len(snippet) > 100:
                snippet = snippet[:100] + "..."
            typer.echo(f"     📝 \"{snippet}\"")
        typer.echo()


@app.command()
def smart_edit(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    page_num: int = typer.Argument(..., help="Page number to edit (1-indexed)"),
    prompt: str = typer.Argument(..., help="Natural language description of the edit"),
    output: Optional[str] = typer.Option(None, help="Output path for the edited PDF"),
    verbose: bool = typer.Option(True, help="Show detailed execution logs")
):
    """
    Intelligent PDF editing with automatic tool selection and validation.
    
    This command:
    1. Analyzes your edit request and PDF features
    2. Selects the best tool (PyMuPDF, ReportLab, pypdf, or Gemini)
    3. Executes the edit
    4. Validates results with AI vision
    5. Retries with alternative tools if needed
    
    Usage: legion-pdf-playbooks smart-edit document.pdf 1 "Add watermark 'CONFIDENTIAL'"
    """
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    if page_num < 1 or page_num > total_pages:
        typer.echo(f"Error: Page {page_num} out of range. PDF has {total_pages} pages.")
        raise typer.Exit(code=1)

    if not output:
        output = f"edited_{input_path.name}"

    typer.echo(f"🤖 Smart Edit: {pdf_path} page {page_num}")
    typer.echo(f"📝 Task: {prompt}\n")

    try:
        from .pdf_agent import PDFAgent
        
        agent = PDFAgent(verbose=verbose)
        success, out_path, logs = agent.execute_edit(
            str(input_path), page_num, prompt, output
        )
        
        if verbose:
            typer.echo("\n📋 Execution Log:")
            for log in logs:
                typer.echo(f"  {log}")
                
        if success:
            typer.echo(f"\n✅ Success! Saved to {out_path}")
        else:
            typer.echo(f"\n❌ Edit failed. See logs above.")
            raise typer.Exit(code=1)
            
    except ImportError as e:
        typer.echo(f"Error importing agent: {e}")
        typer.echo("Falling back to standard edit...")
        # Fallback to regular edit
        edits = [str(page_num), prompt]
        edit(pdf_path, edits, output=output)


@app.command()
def tools():
    """
    Show available PDF tools and their capabilities.
    
    Install additional tools with: pip install legion-pdf-playbooks[full]
    """
    try:
        from .pdf_tools import TOOLS, PDFCapability
        
        typer.echo("\n📦 PDF Tools Status:\n")
        
        for name, tool in TOOLS.items():
            status = "✓ Available" if tool.available else "✗ Not Installed"
            color = typer.colors.GREEN if tool.available else typer.colors.RED
            
            typer.echo(typer.style(f"  {name}", bold=True))
            typer.echo(typer.style(f"    Status: {status}", fg=color))
            typer.echo(f"    {tool.description}")
            typer.echo(f"    Reliability: {tool.reliability:.0%} | Speed: {tool.speed:.0%}")
            
            caps = [c.value for c in tool.capabilities[:5]]
            if len(tool.capabilities) > 5:
                caps.append(f"+{len(tool.capabilities) - 5} more")
            typer.echo(f"    Can do: {', '.join(caps)}")
            typer.echo()
            
        typer.echo("💡 Install all tools: pip install legion-pdf-playbooks[full]")
        typer.echo("   Or individually: pip install PyMuPDF reportlab pikepdf\n")
        
    except ImportError as e:
        typer.echo(f"Error loading tools: {e}")
        raise typer.Exit(code=1)


@app.command()
def analyze(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
):
    """
    Analyze a PDF's features (forms, text, structure).
    
    Usage: legion-pdf-playbooks analyze document.pdf
    """
    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)
        
    try:
        from .pdf_tools import detect_pdf_features
        
        typer.echo(f"\n🔍 Analyzing {pdf_path}...\n")
        
        features = detect_pdf_features(str(input_path))
        
        typer.echo(f"  📄 Pages: {features.get('page_count', '?')}")
        typer.echo(f"  📝 Has extractable text: {'Yes' if features.get('has_text') else 'No'}")
        typer.echo(f"  🖼️  Is scanned/image-based: {'Yes' if features.get('is_scanned') else 'No'}")
        typer.echo(f"  📋 Has form fields (AcroForm): {'Yes' if features.get('has_acroform') else 'No'}")
        typer.echo(f"  📋 Has XFA forms: {'Yes' if features.get('has_xfa') else 'No'}")
        
        if features.get('form_fields'):
            typer.echo(f"\n  Form fields found ({len(features['form_fields'])}):")
            for field in features['form_fields'][:10]:
                typer.echo(f"    - {field}")
            if len(features['form_fields']) > 10:
                typer.echo(f"    ... and {len(features['form_fields']) - 10} more")
                
        # Recommendations
        typer.echo("\n💡 Recommendations:")
        if features.get('has_acroform'):
            typer.echo("  - Use 'smart-edit' for form filling (will use pypdf/PyMuPDF)")
        if features.get('is_scanned'):
            typer.echo("  - Use 'edit' with --visual for image-based edits")
        if features.get('has_text'):
            typer.echo("  - Use 'search' for semantic search")
            typer.echo("  - 'smart-edit' can do text replacement with PyMuPDF")
        
        typer.echo()
        
    except ImportError as e:
        typer.echo(f"Error: {e}")
        typer.echo("Install with: pip install legion-pdf-playbooks[full]")
        raise typer.Exit(code=1)


@app.command()
def improve(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    pages: Optional[str] = typer.Option(None, help="Page numbers to improve (e.g. '1,4,6' or 'all')"),
    output: Optional[str] = typer.Option(None, help="Output path for the improved PDF"),
    max_per_page: int = typer.Option(2, help="Maximum improvements per page"),
    suggest_only: bool = typer.Option(False, help="Only show suggestions, don't apply them"),
    fast: bool = typer.Option(False, "--fast", help="Use fast model (same as default)")
):
    """
    AI-powered layout improvement for PDF pages.
    
    Analyzes each page and suggests/applies improvements for:
    - Layout and spacing
    - Visual hierarchy  
    - Readability
    - Professional appearance
    
    Each improvement is validated before being applied.
    
    Usage: legion-pdf-playbooks improve document.pdf --pages "1,4,6"
    """
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    
    # Parse page numbers
    if pages is None or pages.lower() == "all":
        page_nums = list(range(1, total_pages + 1))
    else:
        try:
            page_nums = [int(p.strip()) for p in pages.split(",")]
            invalid = [p for p in page_nums if p < 1 or p > total_pages]
            if invalid:
                typer.echo(f"Error: Invalid page(s) {invalid}. PDF has {total_pages} pages.")
                raise typer.Exit(code=1)
        except ValueError:
            typer.echo(f"Error: Invalid page format. Use '1,4,6' or 'all'.")
            raise typer.Exit(code=1)

    if not output:
        output = f"improved_{input_path.name}"

    typer.echo(f"🎨 Improving {pdf_path}")
    typer.echo(f"   Pages: {page_nums}")
    typer.echo(f"   Max improvements per page: {max_per_page}\n")

    try:
        from .pdf_agent import PDFAgent
        import shutil
        
        agent = PDFAgent(verbose=True, fast=fast)
        
        # Work on a copy
        current_path = str(input_path)
        temp_output = output + ".tmp"
        shutil.copy(current_path, temp_output)
        current_path = temp_output
        
        total_improvements = 0
        
        for page_num in page_nums:
            typer.echo(f"\n{'='*50}")
            typer.echo(f"📄 Page {page_num}")
            typer.echo('='*50)
            
            if suggest_only:
                # Just get and display suggestions
                suggestions = agent.get_improvement_suggestions(current_path, page_num)
                if not suggestions:
                    typer.echo("  No improvements suggested")
            else:
                # Apply improvements
                success, new_path, logs = agent.improve_page(
                    current_path,
                    page_num,
                    output_path=current_path,  # Overwrite in place
                    max_improvements=max_per_page
                )
                
                for log in logs:
                    typer.echo(f"  {log}")
                    
                if success and new_path:
                    current_path = new_path
                    # Count improvements from logs
                    applied = sum(1 for l in logs if "Applied and validated" in l)
                    total_improvements += applied
        
        if suggest_only:
            typer.echo(f"\n{'='*50}")
            typer.echo(f"💡 Suggestions complete (--suggest-only mode)")
            typer.echo(f"   Run without --suggest-only to apply improvements")
        else:
            # Move final result to output
            shutil.move(current_path, output)
            
            typer.echo(f"\n{'='*50}")
            typer.echo(f"✅ Complete! Applied {total_improvements} improvement(s)")
            typer.echo(f"   Saved to: {output}")
        
    except ImportError as e:
        typer.echo(f"Error importing agent: {e}")
        raise typer.Exit(code=1)
    except Exception as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)


@app.command()
def native_edit(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    page_num: int = typer.Argument(..., help="Page number to edit (1-indexed)"),
    instruction: str = typer.Argument(..., help="What to do (e.g., 'Move the title up 10 pixels and make it blue')"),
    output: Optional[str] = typer.Option(None, help="Output path for the edited PDF"),
    show_structure: bool = typer.Option(False, help="Show page structure before editing"),
    check_composition: bool = typer.Option(False, "--check-composition", help="Also validate that composition doesn't degrade"),
    fast: bool = typer.Option(False, "--fast", help="Use fast model (same as default)")
):
    """
    Native PDF editing using LLM-generated PyMuPDF scripts.
    
    This preserves text selection, vectors, and accessibility by editing
    PDF objects directly instead of rasterizing to images.
    
    The AI analyzes the page structure, writes a custom PyMuPDF script,
    executes it, and validates the result.
    
    Examples:
        legion-pdf-playbooks native-edit doc.pdf 1 "Move the title up 20 pixels"
        legion-pdf-playbooks native-edit doc.pdf 2 "Change all headers to blue"
        legion-pdf-playbooks native-edit doc.pdf 3 "Add a red border around the table"
    """
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    if page_num < 1 or page_num > total_pages:
        typer.echo(f"Error: Page {page_num} out of range. PDF has {total_pages} pages.")
        raise typer.Exit(code=1)

    if not output:
        output = f"native_edited_{input_path.name}"

    typer.echo(f"🔧 Native Edit: {pdf_path} page {page_num}")
    typer.echo(f"📝 Instruction: {instruction}\n")

    try:
        from .pdf_agent import PDFAgent
        from .pdf_tools import get_page_elements_summary
        
        # Show structure if requested
        if show_structure:
            typer.echo("📋 Page Structure:")
            structure = get_page_elements_summary(str(input_path), page_num)
            typer.echo(structure)
            typer.echo()
        
        agent = PDFAgent(verbose=True, fast=fast)
        success, out_path, logs = agent.execute_native_edit(
            str(input_path), page_num, instruction, output,
            check_composition=check_composition
        )
        
        typer.echo("\n📋 Execution Log:")
        for log in logs:
            typer.echo(f"  {log}")
                
        if success:
            typer.echo(f"\n✅ Success! Saved to {out_path}")
            typer.echo("   ℹ️  Text selection and vectors preserved (native edit)")
        else:
            typer.echo(f"\n❌ Edit failed. See logs above.")
            raise typer.Exit(code=1)
            
    except ImportError as e:
        typer.echo(f"Error importing: {e}")
        raise typer.Exit(code=1)


@app.command()
def structure(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    page_num: int = typer.Argument(..., help="Page number to analyze (1-indexed)"),
    format: str = typer.Option("summary", help="Output format: 'summary' or 'json'")
):
    """
    Show the structure of a PDF page (text blocks, images, coordinates).
    
    This is useful for understanding what elements are on a page
    and their exact positions before performing native edits.
    
    Usage: legion-pdf-playbooks structure document.pdf 1
    """
    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    if page_num < 1 or page_num > total_pages:
        typer.echo(f"Error: Page {page_num} out of range. PDF has {total_pages} pages.")
        raise typer.Exit(code=1)

    try:
        from .pdf_tools import get_page_structure, get_page_elements_summary
        
        if format == "json":
            structure = get_page_structure(str(input_path), page_num)
            typer.echo(structure)
        else:
            summary = get_page_elements_summary(str(input_path), page_num)
            typer.echo(f"\n📋 Page {page_num} Structure:\n")
            typer.echo(summary)
            
    except Exception as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)


@app.command()
def composition(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    page_num: int = typer.Argument(..., help="Page number to analyze"),
    full: bool = typer.Option(False, help="Run full analysis (structure + quality + composition)"),
    fast: bool = typer.Option(False, "--fast", help="Use fast model (same as default)")
):
    """
    Analyze the visual composition and balance of a page.
    
    Checks for:
    - Visual balance (left/right, top/bottom distribution)
    - Whitespace usage (too much, too little, uneven)
    - Visual weight distribution across thirds
    - Alignment and grid consistency
    
    Usage: legion-pdf-playbooks composition document.pdf 9
    """
    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    if page_num < 1 or page_num > total_pages:
        typer.echo(f"Error: Page {page_num} out of range. PDF has {total_pages} pages.")
        raise typer.Exit(code=1)

    try:
        from .pdf_agent import PDFAgent
        
        agent = PDFAgent(verbose=True, fast=fast)
        
        if full:
            # Full analysis
            results = agent.full_page_analysis(str(input_path), page_num)
        else:
            # Just composition
            typer.echo(f"⚖️  Composition Analysis: {pdf_path} page {page_num}\n")
            results = agent.analyze_composition(str(input_path), page_num)
            
            # Additional output
            score = results.get("composition_score", 0)
            if score >= 8:
                typer.echo(f"\n✅ Good composition! Score: {score}/10")
            elif score >= 6:
                typer.echo(f"\n⚠️  Acceptable but could improve. Score: {score}/10")
            else:
                typer.echo(f"\n❌ Needs improvement. Score: {score}/10")
            
    except Exception as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)


@app.command()
def quality_check(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    pages: Optional[str] = typer.Option(None, help="Page numbers to check (e.g. '1,4,6' or 'all')"),
    fast: bool = typer.Option(False, "--fast", help="Use fast model (same as default)")
):
    """
    Check PDF pages for quality issues (overlapping text, glitches, etc.).
    
    This helps identify broken or corrupted pages that need fixing.
    
    Usage: legion-pdf-playbooks quality-check document.pdf --pages "1,4"
    """
    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    
    # Parse page numbers
    if pages is None or pages.lower() == "all":
        page_nums = list(range(1, total_pages + 1))
    else:
        try:
            page_nums = [int(p.strip()) for p in pages.split(",")]
        except ValueError:
            typer.echo(f"Error: Invalid page format. Use '1,4,6' or 'all'.")
            raise typer.Exit(code=1)

    typer.echo(f"🔍 Quality Check: {pdf_path}")
    typer.echo(f"   Checking pages: {page_nums}\n")

    try:
        from .pdf_agent import PDFAgent
        
        agent = PDFAgent(verbose=True, fast=fast)
        
        issues_found = 0
        for page_num in page_nums:
            typer.echo(f"{'='*40}")
            typer.echo(f"📄 Page {page_num}")
            
            is_good, details = agent.quality_check(str(input_path), page_num)
            
            if not is_good:
                issues_found += 1
                severity = details.get("severity", "unknown")
                typer.echo(f"   Severity: {severity}")
                
                suggestions = details.get("suggestions", [])
                if suggestions:
                    typer.echo("   Suggestions:")
                    for s in suggestions:
                        typer.echo(f"      → {s}")
            typer.echo()
        
        typer.echo(f"{'='*40}")
        if issues_found == 0:
            typer.echo(f"✅ All {len(page_nums)} page(s) passed quality check!")
        else:
            typer.echo(f"⚠️  {issues_found}/{len(page_nums)} page(s) have quality issues")
            
    except Exception as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)


@app.command()
def best_edit(
    pdf_path: str = typer.Argument(..., help="Path to the PDF file"),
    page_num: int = typer.Argument(..., help="Page number to edit (1-indexed)"),
    instruction: str = typer.Argument(..., help="What to do"),
    output: Optional[str] = typer.Option(None, help="Output path for the edited PDF"),
    prefer_native: bool = typer.Option(True, help="Prefer native edit on tie (preserves PDF features)"),
    fast: bool = typer.Option(False, "--fast", help="Use fast model (same as default)")
):
    """
    Best-of-Both editing: tries native AND AI regeneration, picks the winner.
    
    This command runs both approaches in parallel and uses AI to judge
    which result is better, giving you the best of both worlds:
    
    - Native editing preserves text selection, vectors, accessibility
    - AI regeneration can produce more polished visual results
    
    The AI judge considers:
    - Accuracy of the edit
    - Content preservation  
    - Visual quality
    - Layout balance
    - Absence of artifacts
    
    Examples:
        legion-pdf-playbooks best-edit doc.pdf 1 "Add a blue underline under the title"
        legion-pdf-playbooks best-edit doc.pdf 2 "Improve the layout balance"
    """
    try:
        pdf_utils.check_system_dependencies()
    except RuntimeError as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)

    input_path = Path(pdf_path)
    if not input_path.exists():
        typer.echo(f"Error: File {pdf_path} not found.")
        raise typer.Exit(code=1)

    total_pages = pdf_utils.get_page_count(str(input_path))
    if page_num < 1 or page_num > total_pages:
        typer.echo(f"Error: Page {page_num} out of range. PDF has {total_pages} pages.")
        raise typer.Exit(code=1)

    typer.echo(f"🔀 Best-of-Both Edit: {pdf_path} page {page_num}")
    typer.echo(f"📝 Instruction: {instruction}\n")

    try:
        from .pdf_agent import PDFAgent
        
        agent = PDFAgent(verbose=True, fast=fast)
        success, out_path, logs, comparison = agent.execute_best_of_both(
            str(input_path), page_num, instruction, output, prefer_native
        )
        
        typer.echo("\n📋 Execution Log:")
        for log in logs:
            typer.echo(f"  {log}")
        
        if success:
            typer.echo(f"\n✅ Success! Saved to {out_path}")
            
            # Show comparison details
            if comparison and "winner" in comparison:
                typer.echo(f"\n📊 Comparison Results:")
                typer.echo(f"   Option A (Native):  {comparison.get('option_a_score', '?')}/10")
                typer.echo(f"   Option B (AI Regen): {comparison.get('option_b_score', '?')}/10")
                typer.echo(f"   Winner: {comparison.get('winner', '?')}")
                
                chosen = comparison.get("chosen", "unknown")
                if chosen == "native":
                    typer.echo("   ℹ️  Using native edit (text selection & vectors preserved)")
                else:
                    typer.echo("   ℹ️  Using AI regeneration (better visual quality)")
        else:
            typer.echo(f"\n❌ Edit failed")
            raise typer.Exit(code=1)
            
    except Exception as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)


@app.command()
def version():
    """
    Show version.
    """
    typer.echo("Legion PDF Playbooks v0.7.0")
    typer.echo("  - Core: edit, add, create, search")
    typer.echo("  - Smart: smart-edit, analyze, tools, improve")
    typer.echo("  - Native: native-edit, structure, quality-check")
    typer.echo("  - Best: best-edit (A/B comparison with AI judge)")

if __name__ == "__main__":
    app()

