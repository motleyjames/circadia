#!/usr/bin/env python3
"""
Video Transcriber with Gemini 3 Pro
Designed for video meetings and demos with on-screen text recognition
Features: Progress animation, resume capability, file size validation
"""

import argparse
import hashlib
import json
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

try:
    from tools_core.core.meeseeks_llm_caller import get_default_model
except ImportError:
    from core.meeseeks_llm_caller import get_default_model


class ProgressSpinner:
    """Animated progress spinner for long-running operations"""

    def __init__(self, message="Processing"):
        self.message = message
        self.running = False
        self.thread = None
        self.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        self.current_frame = 0
        self.start_time = time.time()

    def _animate(self):
        """Animation loop"""
        while self.running:
            frame = self.frames[self.current_frame % len(self.frames)]
            elapsed = int(time.time() - self.start_time)
            sys.stdout.write(f"\r{frame} {self.message}... ({elapsed}s)")
            sys.stdout.flush()
            self.current_frame += 1
            time.sleep(0.1)

    def start(self):
        """Start the spinner animation"""
        self.running = True
        self.start_time = time.time()
        self.thread = threading.Thread(target=self._animate, daemon=True)
        self.thread.start()

    def stop(self, final_message=None):
        """Stop the spinner animation"""
        self.running = False
        if self.thread:
            self.thread.join()
        sys.stdout.write("\r" + " " * 100 + "\r")
        if final_message:
            print(final_message)
        sys.stdout.flush()

    def update_message(self, new_message):
        """Update the spinner message"""
        self.message = new_message


class VideoTranscriber:
    """Video transcription and analysis using Gemini 3 Pro"""

    # Gemini API file size limit (2GB)
    MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2147483648 bytes

    def __init__(self, api_key=None, cache_dir=".transcribe_cache"):
        """Initialize the transcriber with API key and cache directory"""
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("API key required. Set GOOGLE_API_KEY environment variable or pass api_key parameter")

        self.client = genai.Client(api_key=self.api_key, http_options={"api_version": "v1beta"})
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)

    def _normalize_time_offset(self, time_str):
        """
        Normalize time offset to seconds format required by API.
        Converts formats like "1m30s", "2m", "45s" to "90s", "120s", "45s"
        """
        if not time_str:
            return None

        # If already ends with 's' and has no 'm', return as-is
        if time_str.endswith("s") and "m" not in time_str:
            return time_str

        total_seconds = 0
        time_str = time_str.lower().strip()

        # Parse minutes
        if "m" in time_str:
            parts = time_str.split("m")
            try:
                minutes = int(parts[0])
                total_seconds += minutes * 60
                # Check if there are seconds after the 'm'
                if len(parts) > 1 and parts[1]:
                    seconds_part = parts[1].replace("s", "").strip()
                    if seconds_part:
                        total_seconds += int(seconds_part)
            except ValueError:
                # If parsing fails, return original
                return time_str if time_str.endswith("s") else f"{time_str}s"
        else:
            # Only seconds provided
            try:
                seconds = int(time_str.replace("s", ""))
                total_seconds = seconds
            except ValueError:
                return time_str if time_str.endswith("s") else f"{time_str}s"

        return f"{total_seconds}s"

    def _get_file_hash(self, file_path):
        """Calculate SHA256 hash of file for cache identification"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            # Read in chunks to handle large files
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def _get_cache_path(self, file_path):
        """Get cache file path for a video"""
        file_hash = self._get_file_hash(file_path)
        return self.cache_dir / f"{file_hash}.json"

    def _save_upload_cache(self, file_path, file_uri, file_name):
        """Save uploaded file info to cache"""
        cache_path = self._get_cache_path(file_path)
        cache_data = {
            "file_path": str(file_path),
            "file_uri": file_uri,
            "file_name": file_name,
            "uploaded_at": datetime.now().isoformat(),
            "file_size": os.path.getsize(file_path),
        }
        with open(cache_path, "w") as f:
            json.dump(cache_data, f, indent=2)

    def _load_upload_cache(self, file_path):
        """Load cached upload info if available"""
        cache_path = self._get_cache_path(file_path)
        if cache_path.exists():
            try:
                with open(cache_path, "r") as f:
                    cache_data = json.load(f)

                # Verify the file hasn't changed
                current_size = os.path.getsize(file_path)
                if cache_data.get("file_size") == current_size:
                    return cache_data
            except Exception as e:
                print(f"⚠️  Warning: Could not load cache: {e}")
        return None

    def _format_file_size(self, size_bytes):
        """Format file size in human-readable format"""
        for unit in ["B", "KB", "MB", "GB"]:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} TB"

    def _check_file_size(self, file_path):
        """Check if file is within size limits"""
        file_size = os.path.getsize(file_path)
        if file_size > self.MAX_FILE_SIZE:
            size_str = self._format_file_size(file_size)
            limit_str = self._format_file_size(self.MAX_FILE_SIZE)
            raise ValueError(
                f"\n❌ File too large: {size_str}\n"
                f"   Gemini API limit: {limit_str}\n\n"
                f"Solutions:\n"
                f"  1. Compress the video (reduce resolution/bitrate)\n"
                f"  2. Upload to YouTube and use --youtube URL\n"
                f"  3. Process in segments using --start and --end\n"
                f"  4. Split the video into smaller files\n\n"
                f"Compression example:\n"
                f"  ./compress_video.sh {Path(file_path).name} auto"
            )

    def upload_video(self, video_path, force_reupload=False):
        """Upload video file and wait for processing with resume capability"""
        video_path = str(video_path)

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        # Check file size
        file_size = os.path.getsize(video_path)
        size_str = self._format_file_size(file_size)

        print(f"\n📹 Video: {Path(video_path).name}")
        print(f"   Size: {size_str}")

        # Check size limit
        self._check_file_size(video_path)

        # Check cache for previous upload
        if not force_reupload:
            cached = self._load_upload_cache(video_path)
            if cached:
                print(f"♻️  Found cached upload from {cached['uploaded_at'][:19]}")
                try:
                    # Verify the file still exists on server
                    video_file = self.client.files.get(name=cached["file_name"])
                    if video_file.state.name == "ACTIVE":
                        print(f"✅ Using cached file: {cached['file_name']}")
                        return video_file
                    else:
                        print("⚠️  Cached file no longer active, re-uploading...")
                except Exception:
                    print("⚠️  Cached file not found on server, re-uploading...")

        # Upload new file
        spinner = ProgressSpinner(f"Uploading {size_str}")
        spinner.start()

        try:
            video_file = self.client.files.upload(file=video_path)
            spinner.stop(f"✅ Upload complete: {video_file.name}")

            # Save to cache
            self._save_upload_cache(video_path, video_file.uri, video_file.name)

        except Exception as e:
            spinner.stop()
            raise e

        # Wait for processing
        if video_file.state.name == "PROCESSING":
            spinner = ProgressSpinner("Processing video on server")
            spinner.start()

            try:
                while video_file.state.name == "PROCESSING":
                    time.sleep(5)
                    video_file = self.client.files.get(name=video_file.name)

                spinner.stop()

                if video_file.state.name == "FAILED":
                    raise ValueError(f"❌ Video processing failed: {video_file.state}")

                print(f"✅ Video ready: {video_file.name}")

            except Exception as e:
                spinner.stop()
                raise e

        return video_file

    def create_prompt(self, focus="meeting"):
        """Create analysis prompt based on use case"""

        if focus == "meeting":
            return """
Analyze this video meeting/demo completely with BOTH visual and audio analysis:

## 1. MEETING CONTEXT
- Meeting type and setting
- Number of participants visible
- Overall duration and flow

## 2. COMPLETE AUDIO TRANSCRIPTION
Provide word-for-word transcription:
- [MM:SS] **Speaker:** [exact words spoken]
- Identify different speakers (Speaker 1, Speaker 2, etc.)
- Include all dialogue, questions, and responses
- Note unclear audio with [inaudible]
- Capture background conversations if relevant

## 3. ON-SCREEN CONTENT (OCR)
Extract ALL visible text from screens, slides, documents, or shared content:
- [MM:SS] **Screen Text:** [exact text visible]
- Application names and window titles
- Presentation slides (full content)
- Code snippets or terminal commands
- Chat messages or notifications
- Document text being reviewed
- URLs and file names

## 4. VISUAL DESCRIPTIONS
Describe what's happening visually:
- [MM:SS] **Visual:** [scene description]
- Screen sharing events (when started/stopped)
- Presentation transitions
- Participant actions (pointing, gesturing)
- Camera changes or view switches

## 5. INTEGRATED TIMELINE
Create a chronological timeline combining all elements:
```
[MM:SS]
  Audio: [what was said]
  Visual: [what's visible on screen]
  Screen Text: [any readable text]
  Action: [key events]
```

## 6. KEY MOMENTS & DECISIONS
Extract important segments:
- [MM:SS] - **[Topic]**: [Summary of discussion or decision]
- [MM:SS] - **[Demo]**: [What was demonstrated]
- [MM:SS] - **[Action Item]**: [Task or follow-up identified]

## 7. TOPICS DISCUSSED
List main topics with timestamps:
- **[Topic Name]** [MM:SS - MM:SS]: Brief summary

## 8. ACTION ITEMS & DECISIONS
- [ ] [Action item with owner if mentioned] - [MM:SS]
- **Decision:** [Key decision made] - [MM:SS]

## 9. TECHNICAL DETAILS
If technical content is discussed:
- Code snippets shown
- Commands executed
- Technologies mentioned
- URLs or resources shared

## 10. COMPREHENSIVE SUMMARY
Provide a cohesive narrative of the entire meeting/demo including:
- Main objectives and outcomes
- Key discussions and decisions
- Technical content covered
- Next steps and action items

Format everything in clean markdown with clear section headings and timestamps in [MM:SS] format.
"""

        elif focus == "presentation":
            return """
Analyze this presentation video completely:

## 1. PRESENTATION OVERVIEW
- Title and topic
- Presenter information
- Duration and structure

## 2. SLIDE CONTENT (COMPLETE OCR)
Extract ALL text from every slide:
- [MM:SS] **Slide [Number]**:
  - Title: [slide title]
  - Content: [all bullet points, text, and labels]
  - Diagrams/Charts: [descriptions]

## 3. AUDIO TRANSCRIPTION
- [MM:SS] **Presenter:** [exact words spoken]
- Complete narration and explanations

## 4. INTEGRATED TIMELINE
[MM:SS]
  Slide: [slide content]
  Audio: [presenter explanation]

## 5. KEY TAKEAWAYS
- Main points with timestamps

## 6. SUMMARY
Comprehensive overview of presentation content

Format in clean markdown with clear structure.
"""

        elif focus == "saas":
            return """
**ROLE AND GOAL**

You are an expert Systems Analyst and Reverse Engineer. Your primary goal is to meticulously analyze this video, which is a screen recording of a user interacting with a SaaS application, and deconstruct its entire architecture into a comprehensive set of structured documents. Your output will serve as the blueprint for recreating this application. You must analyze the User Interface (UI), User Experience (UX) flows, core features, and infer the underlying data model with extreme precision.

**CONTEXT OF THE INPUT VIDEO**

The video is a screen recording of someone thoroughly using a SaaS application. The purpose is to reverse-engineer its functionality to build a similar application.

Pay extremely close attention to the sequence of actions, how the interface responds to clicks, data entry, and navigation, and the relationships between different screens and data elements.

**CORE INSTRUCTIONS: A MULTI-LAYERED ANALYSIS**

Process the video and generate a final output composed of four distinct parts.

---

## PART 1: UI & COMPONENT INVENTORY

Identify and describe all unique, reusable UI components and global elements that appear throughout the application. For each component, describe its appearance, states (e.g., default, hover, disabled), and function.

### Global Elements:
- **Main Navigation:** Describe the primary navigation bar (top or side), including all links, icons, and sub-menus.
- **Header/Footer:** Detail any consistent headers or footers.
- **Dashboard Layouts:** Describe the common structure of dashboard pages (e.g., widgets, cards, charts).

### Common Components:
- **Buttons:** List all button variations (e.g., Primary Action, Secondary, Destructive) and their typical uses. Example: `[Button: Primary - Blue with white text, used for 'Save' or 'Submit']`
- **Forms & Inputs:** Detail all form field types.
  - Text Inputs: `Label: [____________________]`
  - Dropdowns: `Label: [Selected Option ▼] (Options: Option 1, Option 2, ...)`
  - Checkboxes: `[ ] Option` or `[x] Option`
  - Radio Buttons: `( ) Option 1` or `(x) Option 2`
  - Toggles: `[Switch ON/OFF]`
  - Date Pickers, File Uploaders, etc.
- **Tables:** Describe the structure of data tables. Note features like sorting, filtering, pagination, and bulk actions.
- **Modals & Pop-ups:** Describe the purpose and content of any modals (e.g., confirmation dialogs, settings pop-ups).
- **Notifications & Toasts:** How does the app display success, error, or warning messages?
- **Search & Filtering:** Describe how search bars and filter controls work.

---

## PART 2: SCREEN & FEATURE BREAKDOWN

Break down the application screen by screen. For each distinct screen or view, provide:

- **Screen Name:** Give the screen a logical name (e.g., "Login Page," "User Dashboard," "Project Details," "Account Settings").
- **Purpose:** Briefly describe the screen's primary function. What can the user accomplish here?
- **Component List:** List the UI components used on this screen (referencing Part 1 where possible).
- **Functionality:** Describe the specific features available on this screen.

---

## PART 3: USER WORKFLOWS (UX)

Map out the key user journeys shown in the video. Describe the step-by-step process for accomplishing a specific goal. Use a clear, sequential format.

- **Workflow Title:** Name the workflow (e.g., "Creating a New Project," "Inviting a Team Member," "Upgrading a Subscription Plan").
- **Steps:**
  1. User starts on the **[Screen Name]**.
  2. User clicks the **[Component Name, e.g., '+ New Project' Button]**.
  3. A **[Component Name, e.g., 'Create Project' Modal]** appears.
  4. User fills in the **[Field Name]** and **[Field Name]**.
  5. User clicks **[Button Name]**.
  6. User is redirected to the **[New Screen Name]**, and a **[Notification Type]** appears.

---

## PART 4: INFERRED DATA MODEL

Based on all the information presented in the UI and workflows, infer the likely database schema. Define the main data "entities" (like Users, Projects, Tasks) and the attributes (fields) they contain, including the relationships between them.

- **Entity Name:** The name of the data table (e.g., `Users`, `Projects`, `Tasks`, `Companies`).
- **Attributes/Fields:**
  - `field_name`: `[data_type]` (e.g., Text, Number, Date, Boolean, Foreign Key) - *Description of the field's purpose.*
- **Relationships:**
  - Describe the connections between entities (e.g., "A `User` can have many `Projects`," "Each `Task` belongs to one `Project`").

**Example Format:**

- **Entity: `Projects`**
  - `id`: `[Primary Key]` - *Unique identifier for the project.*
  - `name`: `[Text]` - *The title of the project.*
  - `description`: `[Text]` - *A detailed description of the project.*
  - `status`: `[Text]` - *e.g., 'Active', 'Completed', 'Archived'.*
  - `due_date`: `[Date]` - *The project's deadline.*
  - `owner_id`: `[Foreign Key to Users.id]` - *The user who owns the project.*

---

**FINAL INSTRUCTIONS**

- **Structure:** Present your final output clearly organized into these four parts.
- **Clarity:** Be literal and descriptive. Do not add conversational text or summaries outside of what is requested.
- **Uncertainty:** If you are unable to clearly decipher a word, function, or relationship, place the uncertain text in square brackets with a note. Example: `The button label is [unclear: 'Save' or 'Send'?].`

Begin the analysis and generation now.
"""

        elif focus == "training-human":
            return """
# SOFTWARE TRAINING CANON EXTRACTION

You are extracting OPERATIONAL CANON from a software training video - the authoritative knowledge of how to USE a system correctly.

Training canon is what makes someone operationally competent. It's what a new user needs to KNOW and DO to perform their job functions in the software.

## Training Canon Categories

Extract ALL that apply from the video:

### 1. DEFINITIONS
Terms, concepts, or jargon explained by the trainer.
```json
{
  "term": "exact term as spoken/shown",
  "definition": "explanation given",
  "context": "when/where this term applies",
  "timestamp": "MM:SS"
}
```

### 2. ENTITIES
UI elements, modules, screens, data objects, or roles referenced.
```json
{
  "entity_name": "as named in software",
  "entity_type": "screen|module|field|button|menu|role|data_object|report",
  "purpose": "what it does/contains",
  "location": "where in the UI hierarchy",
  "timestamp": "MM:SS"
}
```

### 3. PROCEDURES
Step-by-step processes demonstrated.
```json
{
  "procedure_name": "task being taught",
  "prerequisite": "what must be true/done first",
  "steps": [
    {
      "step_number": 1,
      "action": "exact action (click, enter, select)",
      "target": "UI element acted upon",
      "value": "data entered if any",
      "result": "what happens after"
    }
  ],
  "outcome": "end state when complete",
  "timestamp_start": "MM:SS",
  "timestamp_end": "MM:SS"
}
```

### 4. RULES
Business rules, validation rules, system constraints stated.
```json
{
  "rule": "verbatim or near-verbatim statement",
  "rule_type": "validation|business_logic|constraint|requirement",
  "enforced_by": "system|policy|manual",
  "consequence_of_violation": "what happens if broken",
  "timestamp": "MM:SS"
}
```

### 5. PERMISSIONS
Access controls, role-based capabilities, what users can/cannot do.
```json
{
  "actor": "role or user type",
  "permission": "what they can/cannot do",
  "permission_type": "can|cannot|requires_approval",
  "scope": "where/when this applies",
  "timestamp": "MM:SS"
}
```

### 6. CONDITIONS
IF-THEN logic, decision points, branching workflows.
```json
{
  "trigger": "the IF/WHEN condition",
  "action": "what to do THEN",
  "condition_type": "workflow_branch|exception_handling|conditional_field|status_dependent",
  "timestamp": "MM:SS"
}
```

### 7. NAVIGATION
Menu paths, screen flows, how to reach functionality.
```json
{
  "destination": "screen or function name",
  "path": ["Menu", "Submenu", "Option"],
  "shortcut": "keyboard shortcut if mentioned",
  "timestamp": "MM:SS"
}
```

### 8. WARNINGS
Explicit cautions, common mistakes, "don't do this" moments.
```json
{
  "warning": "verbatim caution given",
  "warning_type": "data_loss|error_prone|performance|security|workflow",
  "correct_approach": "what to do instead",
  "timestamp": "MM:SS"
}
```

### 9. TIPS
Efficiency advice, best practices, power-user techniques.
```json
{
  "tip": "advice given",
  "tip_type": "shortcut|efficiency|best_practice|workaround",
  "applies_to": "context where useful",
  "timestamp": "MM:SS"
}
```

### 10. DATA_FIELDS
Form fields, required inputs, data formats explained.
```json
{
  "field_name": "as labeled in UI",
  "field_type": "text|dropdown|date|checkbox|lookup|etc",
  "required": true/false,
  "validation": "format or rules",
  "default_value": "if mentioned",
  "source": "where data comes from",
  "timestamp": "MM:SS"
}
```

## Output Format

```json
{
  "video_context": {
    "software_name": "system being trained",
    "module_focus": "specific area covered",
    "trainer_role": "who is teaching",
    "trainee_role": "who this training is for",
    "training_objective": "what learner should be able to do after",
    "chunk_position": "if part of series, which part"
  },
  "definitions": [...],
  "entities": [...],
  "procedures": [...],
  "rules": [...],
  "permissions": [...],
  "conditions": [...],
  "navigation": [...],
  "warnings": [...],
  "tips": [...],
  "data_fields": [...],
  "transcript_segments": [
    {
      "timestamp": "MM:SS",
      "speaker": "trainer|trainee|system",
      "speech": "verbatim transcription",
      "action_on_screen": "what's visible/happening"
    }
  ]
}
```

## Critical Rules

1. Only extract what is EXPLICITLY stated or demonstrated - no inference
2. Use VERBATIM text for spoken content
3. Every extraction must have a timestamp
4. Capture the EXACT UI element names as shown on screen
5. Empty arrays are fine - not every video has every category
6. For procedures, capture the COMPLETE step sequence
7. If trainer corrects themselves, capture the CORRECT version
8. Note when content references other training or documentation

Begin extraction now.
"""

        elif focus == "self-serve":
            return """
# SELF-SERVE KNOWLEDGE BASE EXTRACTION

You are transforming a software training video into a SELF-SERVE KNOWLEDGE INFRASTRUCTURE. Your output enables:
1. Automated video clip extraction (ffmpeg)
2. Searchable knowledge base population
3. Learning pathway construction
4. On-demand user self-service

## YOUR MISSION

Analyze this video and decompose it into ATOMIC LEARNING UNITS—discrete, self-contained segments that each answer ONE clear question or teach ONE complete task.

---

## PHASE 1: SEGMENT IDENTIFICATION

Watch for natural boundaries:
- **Topic introductions**: "Let me show you how to..."
- **Task completions**: "And now you've successfully..."
- **Transitions**: "Moving on to...", "Next, we'll..."
- **Screen changes**: Navigation to new module/screen
- **Conceptual shifts**: From setup → to usage → to troubleshooting

For each segment, evaluate:
- Is it SELF-CONTAINED? (Can someone watch ONLY this clip and learn something complete?)
- Is it ATOMIC? (Does it cover exactly ONE concept/task, not multiple?)
- Is it the RIGHT LENGTH? (30 seconds minimum, 5 minutes maximum ideal)
- Does it need PADDING? (Extra seconds at start/end for context?)

---

## PHASE 2: KNOWLEDGE EXTRACTION

For each identified segment, extract:

### Questions Answered
What would a user type into a search bar that this clip answers?
- Phrase as actual questions users would ask
- Include variations (formal and informal phrasing)
- Include symptom-based queries ("Why can't I...", "Error when...")

### Prerequisites
What must the viewer already know/have done?
- Prior clips they should watch
- System state required (logged in, on specific screen, etc.)
- Conceptual knowledge assumed

### Learning Outcomes
What can the viewer DO after watching this clip?
- Concrete, verifiable actions
- "User will be able to [verb] [object]"

---

## PHASE 3: OUTPUT GENERATION

### Output Structure

```json
{
  "source_video": {
    "filename": "original_video.mp4",
    "total_duration": "MM:SS",
    "analysis_timestamp": "ISO8601"
  },
  
  "clips": [
    {
      "clip_id": "module-sequence-slug",
      "title": "Human-readable title",
      "description": "2-3 sentence summary",
      
      "timestamps": {
        "start": "MM:SS",
        "end": "MM:SS",
        "duration_seconds": 87,
        "padding_start_seconds": 2,
        "padding_end_seconds": 3
      },
      
      "ffmpeg": {
        "command": "ffmpeg -i \\"{{input}}\\" -ss MM:SS -to MM:SS -c copy \\"{{output_dir}}/{{clip_id}}.mp4\\"",
        "output_filename": "module-sequence-slug.mp4"
      },
      
      "knowledge_base": {
        "questions_answered": [
          "How do I create a new project?",
          "Where is the new project button?",
          "What fields are required for a project?"
        ],
        "search_tags": ["project", "create", "new", "setup"],
        "category": "Projects",
        "subcategory": "Getting Started",
        "difficulty": "beginner|intermediate|advanced",
        "estimated_watch_time": "1m 27s"
      },
      
      "learning_graph": {
        "prerequisites": ["clip_id_1", "clip_id_2"],
        "next_steps": ["clip_id_5", "clip_id_6"],
        "related": ["clip_id_10"],
        "learning_outcomes": [
          "User will be able to create a new project",
          "User will understand required vs optional fields"
        ]
      },
      
      "content": {
        "transcript_summary": "Concise summary of what's said",
        "ui_elements_shown": ["Projects Menu", "New Project Modal", "Save Button"],
        "actions_demonstrated": ["Click Projects", "Click New", "Fill form", "Save"],
        "key_moments": [
          {"time": "MM:SS", "event": "Modal opens"},
          {"time": "MM:SS", "event": "Validation error shown"},
          {"time": "MM:SS", "event": "Success confirmation"}
        ]
      }
    }
  ],
  
  "segmentation_reasoning": [
    {
      "timestamp": "MM:SS",
      "decision": "START_CLIP|END_CLIP|EXTEND_CLIP|SPLIT_CLIP|MERGE_CLIP",
      "clip_id": "affected clip",
      "reasoning": "Detailed explanation of why this boundary was chosen",
      "confidence": 0.95,
      "alternatives_considered": "Other options and why rejected"
    }
  ],
  
  "knowledge_graph": {
    "categories": [
      {
        "name": "Getting Started",
        "clips": ["clip_id_1", "clip_id_2"],
        "suggested_order": ["clip_id_1", "clip_id_2"]
      }
    ],
    "learning_paths": [
      {
        "path_name": "New User Onboarding",
        "description": "Complete path for brand new users",
        "clips_in_order": ["clip_id_1", "clip_id_2", "clip_id_5"]
      }
    ]
  },
  
  "pipeline_manifest": {
    "total_clips": 12,
    "total_extracted_duration": "MM:SS",
    "coverage_percentage": 94.5,
    "gaps": [
      {
        "start": "MM:SS",
        "end": "MM:SS",
        "reason": "Off-topic discussion",
        "include_in_output": false
      }
    ],
    "ffmpeg_batch_script": "#!/bin/bash\\n# Auto-generated clip extraction\\nmkdir -p clips\\nffmpeg -i input.mp4 -ss 00:00:15 -to 00:01:42 -c copy clips/clip-001.mp4\\n..."
  }
}
```

---

## CRITICAL RULES

1. **Every clip must be SELF-CONTAINED** - A user watching ONLY that clip should gain complete understanding of ONE thing

2. **Err toward SHORTER clips** - Two 90-second clips > One 3-minute clip (when content allows clean splits)

3. **Timestamps must be PRECISE** - Start at the FIRST relevant frame, end at the LAST relevant frame, then add padding

4. **Questions must be REALISTIC** - Write search queries as users actually phrase them, not formal documentation titles

5. **Prerequisites create the LEARNING GRAPH** - If Clip B requires knowledge from Clip A, that's a prerequisite edge

6. **Reasoning must be AUDITABLE** - Every segmentation decision needs justification. Future humans will review these.

7. **Gaps are ACCEPTABLE** - Not everything in a training video is clip-worthy. Off-topic, repeated content, or transitional filler should be noted but excluded.

8. **ffmpeg commands must be COPY-PASTE READY** - Use template variables {{input}}, {{output_dir}} for flexibility

9. **Confidence scores MATTER** - If you're uncertain about a boundary, say so. Low confidence triggers human review.

10. **This is a PIPELINE INPUT** - Your output will be consumed by automation. Precision > Prose.

---

## VERBAL CUES FOR BOUNDARIES

**Start indicators:**
- "Let me show you...", "Now I'll demonstrate...", "Here's how to..."
- "The next thing we need to do is..."
- Screen navigation to new area

**End indicators:**
- "And that's how you...", "So now you've..."
- "Any questions about that?"
- Pause before topic change
- "Moving on...", "Next up..."

**Split indicators (too long, needs division):**
- Multiple distinct subtasks within one walkthrough
- "First... then... finally..." structure
- Natural pauses between steps

---

## EDGE CASES

- **Trainer makes a mistake and corrects**: Include the correction, note it in key_moments
- **Same thing explained twice**: Pick the better explanation, note the duplicate
- **Reference to other videos**: Note as external prerequisite
- **Very short segment (<30s)**: Consider merging with adjacent or noting as "micro-clip"
- **Very long segment (>5m)**: Force split at logical subpoints

Begin extraction now.
"""

        elif focus == "logic":
            return """
# SOFTWARE LOGIC EXTRACTION

You are extracting the LOGICAL ARCHITECTURE of software from a video demonstration. Every software system contains logical structures:

- **Conditionals**: IF user does X THEN system does Y
- **Dependencies**: Screen A requires B; Action C follows D
- **Hierarchies**: Module contains Screens contains Components
- **State transitions**: Status A → Event → Status B
- **Authority flows**: Role A grants/restricts Role B
- **Causal chains**: Action X triggers Consequence Y

## Your Task

Analyze this software demonstration video and extract its logical structure as Mermaid diagrams.

## What to Look For

### 1. CONDITIONAL LOGIC
Decision points and branching behavior.
- "If field is empty, show error"
- "Unless approved, cannot proceed"
- "When status is X, enable button Y"

### 2. CAUSAL CHAINS
Actions that trigger consequences.
- "Clicking Save triggers validation"
- "Upon approval, notification sent"
- "Selecting X auto-populates Y"
- Sequential dependencies between actions

### 3. AUTHORITY/PERMISSION FLOWS
Who can do what, delegation of power.
- "Admin may delete; User may not"
- "Manager has power to approve"
- "Role X is authorized to access Y"
- Delegation chains (who grants permissions to whom)

### 4. STATE MACHINES
Status transitions and lifecycle stages.
- Status changes (Draft → Submitted → Approved → Closed)
- Record lifecycles
- Condition-based transitions

### 5. DEFINITIONAL DEPENDENCIES
Concepts that depend on other concepts.
- Field A requires Field B to be set first
- Module X uses data defined in Module Y
- Term/concept relationships

### 6. STRUCTURAL HIERARCHY
Navigation and containment relationships.
- Menu → Submenu → Screen → Section → Field
- Module organization
- Data entity relationships

## Output Format

Use the most appropriate Mermaid diagram type:

```mermaid
graph TD
    %% Use the most appropriate diagram type:
    %% - flowchart TD/LR for processes/decisions
    %% - graph for relationships/dependencies  
    %% - stateDiagram-v2 for state transitions
    %% - classDiagram for entity relationships
    
    %% Label nodes with ACTUAL text from the software UI
    %% Use subgraphs to group related concepts
```

### Diagram Type Guide

| Logic Type | Mermaid Type | When to Use |
|------------|--------------|-------------|
| Workflows | `stateDiagram-v2` | Status changes, lifecycles |
| Decisions | `flowchart TD` | IF-THEN, branching |
| Permissions | `flowchart LR` | Role-action matrices |
| Data Flow | `flowchart TD` | Information movement |
| Hierarchy | `flowchart TD` with subgraphs | Navigation, containment |
| Relationships | `graph TD` or `erDiagram` | Entity dependencies |

## Final Output Structure

```markdown
# Software Logic Architecture

## Video Context
- **Software:** [name of system]
- **Module:** [area being demonstrated]
- **Timestamp Range:** [MM:SS - MM:SS]

## Logic Diagrams

### [Logic Name 1] (timestamp: MM:SS)
**Type:** workflow|decision|permission|causal|hierarchy|dependency
**Description:** [what this logic controls]

```mermaid
[diagram]
```

### [Logic Name 2] (timestamp: MM:SS)
...

## Verbal Logic Statements
Explicit rules stated by trainer but not visually demonstrated:
- [MM:SS] "[verbatim statement about system behavior]"
- [MM:SS] "[another rule or constraint mentioned]"

## Inferred Dependencies
Relationships implied but not explicitly stated:
- [observation about how components relate]
```

## Critical Rules

1. Only diagram logic that is EXPLICITLY demonstrated or verbally stated
2. Use EXACT labels from the software UI in node names
3. Every diagram must reference a timestamp where it was observed
4. **Prefer clarity over completeness** - a clear partial diagram beats a confusing complete one
5. Use subgraphs to group related concepts
6. If a workflow is partially shown, note it as incomplete
7. **If no clear logical structure exists in the video, output a simple hierarchy diagram of the screens/features shown**

## Verbal Cues to Listen For

- "If you...", "When this happens...", "Unless..."
- "This triggers...", "That results in...", "Upon..."
- "You must first...", "This requires...", "Before you can..."
- "Only [role] can...", "You need permission to..."
- "The status changes to...", "It moves to..."

Begin extraction now.
"""

        else:  # general
            return """
Provide a COMPLETE analysis of this video:

## 1. VISUAL ANALYSIS
- Detailed scene descriptions with timestamps
- All visible people, objects, and actions
- On-screen text (OCR) - extract ALL readable text
- Camera work and transitions
- Visual style and mood

## 2. AUDIO TRANSCRIPTION
- Complete word-for-word transcription
- Speaker identification
- Background sounds and music
- Audio quality notes

## 3. INTEGRATED TIMELINE
[MM:SS] Visual: [description]
[MM:SS] Audio: [transcription]
[MM:SS] Screen Text: [any visible text]

## 4. KEY MOMENTS
- Most important segments with timestamps

## 5. COMPREHENSIVE SUMMARY
- Cohesive narrative of entire content

Format in clean markdown.
"""

    def analyze_video(
        self,
        video_path=None,
        youtube_url=None,
        output_file=None,
        media_resolution="MEDIA_RESOLUTION_HIGH",
        thinking_level="high",
        focus="meeting",
        fps=None,
        start_offset=None,
        end_offset=None,
        force_reupload=False,
    ):
        """
        Analyze video and generate detailed transcript

        Args:
            video_path: Local video file path
            youtube_url: YouTube video URL
            output_file: Output markdown filename (auto-generated if None)
            media_resolution: MEDIA_RESOLUTION_LOW/MEDIUM/HIGH (informational only)
            thinking_level: "low" or "high"
            focus: "meeting", "presentation", or "general"
            fps: Custom frame rate (optional)
            start_offset: Start time (e.g., "40s", "1m20s")
            end_offset: End time (e.g., "120s", "5m")
            force_reupload: Force re-upload even if cached

        Returns:
            Transcript text
        """

        print("\n" + "=" * 80)
        print("🎬 VIDEO TRANSCRIBER - Gemini 3 Pro")
        print("=" * 80)

        # Prepare video part
        if youtube_url:
            print(f"\n📺 YouTube: {youtube_url}")
            video_metadata_dict = {}
            if start_offset:
                video_metadata_dict["start_offset"] = self._normalize_time_offset(start_offset)
            if end_offset:
                video_metadata_dict["end_offset"] = self._normalize_time_offset(end_offset)
            if fps:
                video_metadata_dict["fps"] = fps

            video_part = types.Part(
                file_data=types.FileData(file_uri=youtube_url),
                video_metadata=types.VideoMetadata(**video_metadata_dict) if video_metadata_dict else None,
            )

        elif video_path:
            video_file = self.upload_video(video_path, force_reupload=force_reupload)

            video_metadata_dict = {}
            if fps:
                video_metadata_dict["fps"] = fps
            if start_offset:
                video_metadata_dict["start_offset"] = self._normalize_time_offset(start_offset)
            if end_offset:
                video_metadata_dict["end_offset"] = self._normalize_time_offset(end_offset)

            video_part = types.Part(
                file_data=types.FileData(file_uri=video_file.uri),
                video_metadata=types.VideoMetadata(**video_metadata_dict) if video_metadata_dict else None,
            )
        else:
            raise ValueError("Must provide either video_path or youtube_url")

        # Get appropriate prompt
        prompt = self.create_prompt(focus)

        # Analyze video
        print(f"\n⚙️  Configuration:")
        print(f"   Resolution: {media_resolution}")
        print(f"   Focus: {focus}")
        print(f"   Thinking: {thinking_level}")
        if start_offset or end_offset:
            print(f"   Segment: {start_offset or '0s'} to {end_offset or 'end'}")

        spinner = ProgressSpinner("Analyzing video with Gemini 3 Pro")
        spinner.start()

        try:
            response = self.client.models.generate_content(
                model=get_default_model("google_top"),
                contents=[types.Content(parts=[video_part, types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level=thinking_level), temperature=1.0
                ),
            )

            spinner.stop("✅ Analysis complete!")

        except Exception as e:
            spinner.stop()
            raise e

        # Generate output filename if not provided
        if not output_file:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            if video_path:
                base_name = Path(video_path).stem
                output_file = f"transcript_{base_name}_{timestamp}.md"
            else:
                output_file = f"transcript_{timestamp}.md"

        # Save transcript
        with open(output_file, "w", encoding="utf-8") as f:
            # Add metadata header
            f.write("# Video Transcript\n\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            if video_path:
                f.write(f"**Source:** {video_path}\n\n")
            elif youtube_url:
                f.write(f"**Source:** {youtube_url}\n\n")
            f.write(f"**Resolution:** {media_resolution}\n\n")
            f.write(f"**Focus:** {focus}\n\n")
            f.write("---\n\n")
            f.write(response.text)

        print(f"\n💾 Transcript saved: {output_file}")
        print("=" * 80 + "\n")

        return response.text


def main():
    """Command-line interface"""
    # Load environment variables from .env file
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Video Transcriber using Gemini 3 Pro - Optimized for meetings and demos",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Transcribe a meeting recording
  python video_transcriber.py meeting_recording.mp4

  # Transcribe with specific focus
  python video_transcriber.py demo.mp4 --focus presentation

  # Process YouTube video
  python video_transcriber.py --youtube "https://www.youtube.com/watch?v=VIDEO_ID"

  # Process specific segment
  python video_transcriber.py video.mp4 --start 1m30s --end 5m45s

  # Long video (use low resolution)
  python video_transcriber.py long_video.mp4 --resolution low

  # Force re-upload (ignore cache)
  python video_transcriber.py video.mp4 --force-reupload

File Size Limits:
  - Maximum file size: 2GB
  - For larger files, use YouTube URL or compress the video
  - Compression example: ./compress_video.sh input.mp4 auto

Resume Capability:
  - Uploaded files are cached automatically
  - If transcription fails, re-run the same command to resume
  - Use --force-reupload to ignore cache and upload fresh
  - Cache stored in .transcribe_cache/ directory
        """,
    )

    # Input options
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("video", nargs="?", help="Path to video file")
    input_group.add_argument("--youtube", "-y", help="YouTube video URL")

    # Output options
    parser.add_argument("--output", "-o", help="Output markdown file (auto-generated if not specified)")

    # Analysis options
    parser.add_argument(
        "--focus",
        "-f",
        choices=["meeting", "presentation", "general", "saas", "training-human", "logic", "self-serve"],
        default="meeting",
        help="Analysis focus: meeting, presentation, general, saas, training-human, logic, or self-serve (default: meeting)",
    )

    parser.add_argument(
        "--resolution",
        "-r",
        choices=["low", "medium", "high"],
        default="high",
        help="Media resolution preference (default: high)",
    )

    parser.add_argument(
        "--thinking", choices=["low", "high"], default="high", help="Thinking level for AI reasoning (default: high)"
    )

    # Video segment options
    parser.add_argument("--start", help='Start time (e.g., "40s", "1m30s")')
    parser.add_argument("--end", help='End time (e.g., "120s", "5m")')
    parser.add_argument("--fps", type=float, help="Custom frame rate (default: 1.0)")

    # Cache options
    parser.add_argument(
        "--force-reupload",
        action="store_true",
        help="Force re-upload even if file is cached",
    )
    parser.add_argument(
        "--cache-dir",
        default=".transcribe_cache",
        help="Directory for upload cache (default: .transcribe_cache)",
    )

    # API key
    parser.add_argument("--api-key", help="Google API key (or set GOOGLE_API_KEY env var)")

    args = parser.parse_args()

    # Map resolution names to API constants
    resolution_map = {
        "low": "MEDIA_RESOLUTION_LOW",
        "medium": "MEDIA_RESOLUTION_MEDIUM",
        "high": "MEDIA_RESOLUTION_HIGH",
    }

    try:
        # Initialize transcriber
        transcriber = VideoTranscriber(api_key=args.api_key, cache_dir=args.cache_dir)

        # Process video
        transcriber.analyze_video(
            video_path=args.video,
            youtube_url=args.youtube,
            output_file=args.output,
            media_resolution=resolution_map[args.resolution],
            thinking_level=args.thinking,
            focus=args.focus,
            fps=args.fps,
            start_offset=args.start,
            end_offset=args.end,
            force_reupload=args.force_reupload,
        )

        print("🎉 Transcription complete!")

    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        print("💡 Tip: Your upload is cached. Run the same command to resume!")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
