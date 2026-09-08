"""
knowledge_registry.py - MEESEEKS KNOWLEDGE AWARENESS SYSTEM

"I'M MR. MEESEEKS! I KNOW THINGS!"

This module manages domain knowledge that can be injected into prompts:
- Scans box/knowledge/ for knowledge files with frontmatter
- Determines relevance based on domains, keywords, and task context
- Manages token budgets for prompt injection

Knowledge is different from tools:
- Tools: DO things (actions)
- Knowledge: INFORM thinking (context)

Each knowledge file has YAML frontmatter:
---
name: SVG Elevated Thinking
description: Advanced SVG techniques
domains: [svg, animation, graphics]
keywords: [viewBox, path, filter]
when_to_use: When working with SVG graphics
priority: high
max_tokens: 4000
---
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import yaml


@dataclass
class MentalModel:
    """A paradigm-shifting mental model extracted from knowledge."""
    reframe: str  # "SVG is not just an image - it's a coordinate system"
    implication: str  # "Design in abstract space, not pixels"
    application: str  # "Use viewBox as a camera"


@dataclass
class KnowledgeEntry:
    """A piece of domain knowledge."""
    name: str
    description: str
    domains: List[str]
    keywords: List[str]
    when_to_use: str
    content: str
    path: str
    priority: str = "medium"  # critical, high, medium, low
    max_tokens: int = 2000
    version: Optional[str] = None
    source: Optional[str] = None
    
    # Elevated thinking components
    mental_models: List[MentalModel] = field(default_factory=list)
    elevated_prompts: List[str] = field(default_factory=list)
    
    # Computed relevance score (set during query)
    relevance_score: float = 0.0
    
    def to_prompt_section(self, include_metadata: bool = True, elevated_only: bool = False) -> str:
        """Convert to a section for prompt injection."""
        section = f"## Knowledge: {self.name}\n\n"
        
        if include_metadata:
            section += f"*{self.description}*\n\n"
        
        # Always lead with mental models if available (this is the gold!)
        if self.mental_models:
            section += "### 🧠 Key Mental Models (INTERNALIZE THESE)\n\n"
            for model in self.mental_models:
                section += f"**{model.reframe}**\n"
                section += f"- *Implication:* {model.implication}\n"
                section += f"- *Application:* {model.application}\n\n"
        
        # Include elevated prompts if available
        if self.elevated_prompts:
            section += "### 💡 Elevated Thinking Prompts\n\n"
            section += "Before solving, ask yourself:\n"
            for prompt in self.elevated_prompts:
                section += f"- {prompt}\n"
            section += "\n"
        
        # Include full content unless elevated_only
        if not elevated_only:
            section += "### Reference\n\n"
            section += self.content
        
        return section
    
    def to_elevated_summary(self) -> str:
        """Get just the elevated thinking parts (mental models + prompts)."""
        if not self.mental_models and not self.elevated_prompts:
            return ""
        
        section = f"## {self.name} - Elevated Thinking\n\n"
        
        if self.mental_models:
            section += "**Mental Models:**\n"
            for model in self.mental_models:
                section += f"- {model.reframe} → {model.implication}\n"
            section += "\n"
        
        if self.elevated_prompts:
            section += "**Before solving, ask:**\n"
            for prompt in self.elevated_prompts:
                section += f"- {prompt}\n"
        
        return section
    
    @property
    def priority_weight(self) -> float:
        """Convert priority to numeric weight."""
        weights = {"critical": 4.0, "high": 3.0, "medium": 2.0, "low": 1.0}
        return weights.get(self.priority, 2.0)


class KnowledgeRegistry:
    """
    Registry of all knowledge available to Meeseeks.
    
    Scans box/knowledge/ for markdown files with YAML frontmatter.
    """
    
    # Frontmatter pattern
    FRONTMATTER_PATTERN = re.compile(
        r'^---\s*\n(.*?)\n---\s*\n',
        re.DOTALL
    )
    
    def __init__(self, knowledge_dir: Optional[Path] = None):
        self.knowledge_dir = knowledge_dir or Path("box/knowledge")
        self._entries: List[KnowledgeEntry] = []
        
        # Scan for knowledge
        self._scan_knowledge()
    
    def _scan_knowledge(self):
        """Scan knowledge directory for files with frontmatter."""
        if not self.knowledge_dir.exists():
            return
        
        for file_path in self.knowledge_dir.glob("*.md"):
            # Skip README
            if file_path.name.lower() == "readme.md":
                continue
            
            entry = self._parse_knowledge_file(file_path)
            if entry:
                self._entries.append(entry)
        
        # Also check for JSON knowledge files (like repo_analysis.json)
        for file_path in self.knowledge_dir.glob("*.json"):
            entry = self._parse_json_knowledge(file_path)
            if entry:
                self._entries.append(entry)
    
    def _parse_knowledge_file(self, file_path: Path) -> Optional[KnowledgeEntry]:
        """Parse a markdown knowledge file with frontmatter."""
        try:
            content = file_path.read_text()
            
            # Extract frontmatter
            match = self.FRONTMATTER_PATTERN.match(content)
            
            if match:
                # Has frontmatter
                frontmatter_text = match.group(1)
                body = content[match.end():]
                
                try:
                    frontmatter = yaml.safe_load(frontmatter_text)
                except yaml.YAMLError:
                    frontmatter = {}
            else:
                # No frontmatter - infer from content
                frontmatter = self._infer_frontmatter(file_path, content)
                body = content
            
            # Require at minimum name and domains
            if not frontmatter.get("name"):
                frontmatter["name"] = file_path.stem.replace("-", " ").replace("_", " ").title()
            
            if not frontmatter.get("domains"):
                frontmatter["domains"] = [file_path.stem.split("-")[0]]
            
            # Extract mental models and elevated prompts from content
            mental_models = self._extract_mental_models(body)
            elevated_prompts = self._extract_elevated_prompts(body)
            
            return KnowledgeEntry(
                name=frontmatter.get("name", file_path.stem),
                description=frontmatter.get("description", ""),
                domains=frontmatter.get("domains", []),
                keywords=frontmatter.get("keywords", []),
                when_to_use=frontmatter.get("when_to_use", ""),
                content=body.strip(),
                path=str(file_path),
                priority=frontmatter.get("priority", "medium"),
                max_tokens=frontmatter.get("max_tokens", 2000),
                version=frontmatter.get("version"),
                source=frontmatter.get("source"),
                mental_models=mental_models,
                elevated_prompts=elevated_prompts,
            )
            
        except Exception as e:
            print(f"Warning: Failed to parse {file_path}: {e}")
            return None
    
    def _parse_json_knowledge(self, file_path: Path) -> Optional[KnowledgeEntry]:
        """Parse a JSON knowledge file."""
        try:
            import json
            with open(file_path) as f:
                data = json.load(f)
            
            # Check if it has knowledge metadata
            if "name" in data or "domains" in data:
                return KnowledgeEntry(
                    name=data.get("name", file_path.stem),
                    description=data.get("description", ""),
                    domains=data.get("domains", [file_path.stem]),
                    keywords=data.get("keywords", []),
                    when_to_use=data.get("when_to_use", ""),
                    content=json.dumps(data, indent=2),
                    path=str(file_path),
                    priority=data.get("priority", "medium"),
                    max_tokens=data.get("max_tokens", 2000),
                )
            
            # For repo_analysis.json style files
            if "tech_stack" in data or "structure" in data:
                return KnowledgeEntry(
                    name="Repository Analysis",
                    description="Auto-generated analysis of the repository",
                    domains=["repo", "codebase", "architecture"],
                    keywords=list(data.get("tech_stack", {}).keys()) if isinstance(data.get("tech_stack"), dict) else [],
                    when_to_use="When understanding the repository structure or tech stack",
                    content=json.dumps(data, indent=2),
                    path=str(file_path),
                    priority="high",
                    max_tokens=1500,
                )
            
            return None
            
        except Exception as e:
            print(f"Warning: Failed to parse {file_path}: {e}")
            return None
    
    def _extract_mental_models(self, content: str) -> List[MentalModel]:
        """
        Extract paradigm-shifting mental models from knowledge content.
        
        Looks for patterns like:
        - "X is not just A—it's B"
        - "Think of X as Y"
        - "**X is a Y**, not a Z"
        - Items in "Key Mental Models" sections
        """
        models = []
        lines = content.split('\n')
        
        # Pattern 1: Look for "Key Mental Models" section with numbered items
        # Format: "1. **SVG is a coordinate system**, not just an image"
        in_section = False
        for line in lines:
            if "Mental Models" in line and line.startswith('#'):
                in_section = True
                continue
            if in_section:
                if line.startswith('#'):
                    break  # New section
                
                # Match: "1. **Something**, description"
                match = re.match(r'^\d+\.\s*\*\*(.+?)\*\*[,—–-]*\s*(.*)$', line.strip())
                if match:
                    reframe = match.group(1).strip()
                    rest = match.group(2).strip()
                    
                    # Parse implication from the rest
                    implication = rest if rest else "See this differently"
                    
                    # Generate application based on the subject
                    subject = reframe.split(' is ')[0] if ' is ' in reframe else reframe.split()[0]
                    application = f"When working with {subject}, apply this lens"
                    
                    models.append(MentalModel(
                        reframe=reframe,
                        implication=implication,
                        application=application,
                    ))
        
        # Pattern 2: Look for standalone paradigm shifts in text
        # "SVG is not just an image format—it's a programmable..."
        paradigm_patterns = [
            # "X is not just A—it's B"
            (r'([A-Z][^.]+?) is not just ([^—–-]+?)[—–-]+it\'?s ([^.]+)', 
             lambda m: (f"{m.group(1)} is not just {m.group(2)}—it's {m.group(3)}", 
                       f"Think of {m.group(1)} as {m.group(3)}", 
                       m.group(1))),
            # "Think of X as Y"
            (r'[Tt]hink of ([^.]+?) as ([^.,]+)',
             lambda m: (f"Think of {m.group(1)} as {m.group(2)}",
                       f"This reframes {m.group(1)}",
                       m.group(1))),
        ]
        
        for pattern, extractor in paradigm_patterns:
            for match in re.finditer(pattern, content):
                reframe, implication, subject = extractor(match)
                if len(reframe) < 150:
                    if not any(m.reframe == reframe for m in models):
                        models.append(MentalModel(
                            reframe=reframe,
                            implication=implication,
                            application=f"Apply this when working with {subject}",
                        ))
        
        return models[:10]
    
    def _extract_elevated_prompts(self, content: str) -> List[str]:
        """
        Extract elevated thinking prompts from knowledge content.
        
        Looks for:
        - "Elevated Thinking Prompts" sections (and subsections like "Composability Prompts")
        - Questions that start with "Can this", "Should this", "What if"
        - Numbered items that end with "?"
        """
        prompts = []
        lines = content.split('\n')
        
        # Look for "Elevated Thinking Prompts" section and subsections
        in_section = False
        for i, line in enumerate(lines):
            # Start capturing at main section or subsections with "Prompts"
            if "Elevated Thinking Prompts" in line or "Elevated Thinking" in line:
                in_section = True
                continue
            
            # Also capture subsections like "Composability Prompts"
            if in_section and "Prompts" in line and line.startswith('#'):
                continue  # Stay in section, this is a subsection
            
            if in_section:
                # Stop at next major section (## without "Prompts" in it)
                if line.startswith('## ') and "Prompts" not in line:
                    break
                if line.startswith('# '):
                    break
                if line.startswith('---'):
                    break
                
                # Match numbered items: "1. Can this be done...?"
                match = re.match(r'^\d+\.\s*(.+\?)$', line.strip())
                if match:
                    question = match.group(1).strip()
                    if len(question) > 10:
                        prompts.append(question)
                
                # Match bullet items with questions
                elif line.strip().startswith('-'):
                    question = line.strip()[1:].strip()
                    if question.endswith('?') and len(question) > 10:
                        prompts.append(question)
        
        # Also look for "always consider" or "ask yourself" patterns
        if not prompts:
            for i, line in enumerate(lines):
                if "always consider" in line.lower() or "ask yourself" in line.lower():
                    # Get the next few numbered/bulleted items
                    for j in range(i + 1, min(i + 20, len(lines))):
                        next_line = lines[j].strip()
                        match = re.match(r'^\d+\.\s*(.+\?)$', next_line)
                        if match:
                            prompts.append(match.group(1))
                        elif next_line.startswith('## ') or next_line.startswith('# '):
                            break
        
        return prompts[:15]  # Allow up to 15 prompts
    
    def _infer_frontmatter(self, file_path: Path, content: str) -> Dict[str, Any]:
        """Infer frontmatter from file name and content."""
        name = file_path.stem.replace("-", " ").replace("_", " ").title()
        
        # Try to extract description from first paragraph
        lines = content.strip().split("\n")
        description = ""
        for line in lines:
            if line.startswith("# "):
                name = line[2:].strip()
            elif line.strip() and not line.startswith("#"):
                description = line.strip()
                break
        
        # Infer domains from filename
        parts = file_path.stem.lower().split("-")
        domains = [parts[0]] if parts else ["general"]
        
        # Extract keywords from headings
        keywords = []
        for line in lines:
            if line.startswith("## "):
                keywords.append(line[3:].strip().lower())
        
        return {
            "name": name,
            "description": description[:200],
            "domains": domains,
            "keywords": keywords[:10],
            "when_to_use": f"When working with {domains[0]}",
        }
    
    @property
    def all_knowledge(self) -> List[KnowledgeEntry]:
        """Get all knowledge entries."""
        return self._entries
    
    def get_by_domain(self, domain: str) -> List[KnowledgeEntry]:
        """Get knowledge entries for a specific domain."""
        domain_lower = domain.lower()
        return [
            k for k in self._entries
            if domain_lower in [d.lower() for d in k.domains]
        ]
    
    def get_relevant_knowledge(
        self,
        task: str,
        domains: Optional[List[str]] = None,
        max_tokens: int = 8000,
        min_relevance: float = 0.3,
    ) -> List[KnowledgeEntry]:
        """
        Get knowledge relevant to a task, within token budget.
        
        Args:
            task: The task description
            domains: Optional list of domains to prioritize
            max_tokens: Maximum total tokens for knowledge
            min_relevance: Minimum relevance score to include
        
        Returns:
            List of relevant KnowledgeEntry objects, sorted by relevance
        """
        task_lower = task.lower()
        task_words = set(task_lower.split())
        domains = domains or []
        domains_lower = set(d.lower() for d in domains)
        
        # Score each knowledge entry
        scored = []
        for entry in self._entries:
            score = 0.0
            
            # Domain match (high weight)
            entry_domains = set(d.lower() for d in entry.domains)
            domain_overlap = len(entry_domains & domains_lower)
            if domain_overlap:
                score += domain_overlap * 2.0
            
            # Keyword match
            for keyword in entry.keywords:
                if keyword.lower() in task_lower:
                    score += 1.5
            
            # Word overlap
            entry_words = set(entry.name.lower().split())
            entry_words.update(entry.description.lower().split())
            word_overlap = len(task_words & entry_words)
            score += word_overlap * 0.5
            
            # Name mentioned directly
            if entry.name.lower() in task_lower:
                score += 3.0
            
            # Priority weight
            score *= entry.priority_weight / 2.0
            
            if score >= min_relevance:
                entry.relevance_score = score
                scored.append(entry)
        
        # Sort by relevance
        scored.sort(key=lambda e: e.relevance_score, reverse=True)
        
        # Select within token budget
        selected = []
        total_tokens = 0
        
        for entry in scored:
            if total_tokens + entry.max_tokens <= max_tokens:
                selected.append(entry)
                total_tokens += entry.max_tokens
            elif entry.priority == "critical":
                # Always include critical knowledge
                selected.append(entry)
                total_tokens += entry.max_tokens
        
        return selected
    
    def generate_knowledge_prompt(
        self,
        entries: List[KnowledgeEntry],
        include_metadata: bool = True,
        elevated_first: bool = True,
    ) -> str:
        """
        Generate prompt section from knowledge entries.
        
        Args:
            entries: Knowledge entries to include
            include_metadata: Include domains, keywords, etc.
            elevated_first: Lead with mental models and elevated prompts
        """
        if not entries:
            return ""
        
        prompt = "# RELEVANT KNOWLEDGE\n\n"
        
        # Lead with elevated thinking if available
        if elevated_first:
            elevated_sections = []
            for entry in entries:
                elevated = entry.to_elevated_summary()
                if elevated:
                    elevated_sections.append(elevated)
            
            if elevated_sections:
                prompt += "## 🧠 ELEVATED THINKING (Internalize These First!)\n\n"
                prompt += "These mental models will help you think DIFFERENTLY about this problem:\n\n"
                for section in elevated_sections:
                    prompt += section + "\n"
                prompt += "---\n\n"
                prompt += "**Remember:** Don't just reference knowledge - THINK in these new paradigms!\n\n"
                prompt += "---\n\n"
        
        prompt += "## Reference Knowledge\n\n"
        
        for entry in entries:
            # If we already showed elevated content, use a shorter version
            if elevated_first and (entry.mental_models or entry.elevated_prompts):
                prompt += f"### {entry.name}\n\n"
                if include_metadata:
                    prompt += f"*{entry.description}*\n\n"
                prompt += entry.content + "\n\n---\n\n"
            else:
                prompt += entry.to_prompt_section(include_metadata) + "\n\n---\n\n"
        
        return prompt
    
    def get_elevated_summary(self) -> str:
        """
        Get just the elevated thinking parts from ALL knowledge.
        
        Useful for injecting mental models without full content.
        """
        summaries = []
        for entry in self._entries:
            summary = entry.to_elevated_summary()
            if summary:
                summaries.append(summary)
        
        if not summaries:
            return ""
        
        prompt = "# 🧠 ELEVATED THINKING MODELS\n\n"
        prompt += "Internalize these paradigm shifts before solving:\n\n"
        for summary in summaries:
            prompt += summary + "\n"
        
        return prompt
    
    def get_skill_cards(self, entries: Optional[List[KnowledgeEntry]] = None) -> str:
        """
        Get COMPACT skill cards - just enough to know WHAT skills exist.
        
        This is the TINY context that goes into every prompt:
        - Skill name
        - When to use it
        - Key mental models (1-liners)
        - Elevated prompts (questions to ask)
        
        Does NOT include full reference content!
        Use pull_skill_content() when you actually need the full knowledge.
        
        Returns:
            ~500-1000 chars per skill (vs 4000+ for full content)
        """
        entries = entries or self._entries
        
        if not entries:
            return ""
        
        cards = []
        for entry in entries:
            card = f"### 🎯 {entry.name}\n"
            card += f"**Use when:** {entry.when_to_use}\n"
            
            # Compact mental models (just the reframes, no details)
            if entry.mental_models:
                card += "**Think:**\n"
                for model in entry.mental_models[:5]:  # Top 5 only
                    card += f"  - {model.reframe}\n"
            
            # Compact elevated prompts (just first 5)
            if entry.elevated_prompts:
                card += "**Ask yourself:**\n"
                for prompt in entry.elevated_prompts[:5]:
                    card += f"  - {prompt}\n"
            
            card += f"\n*For full reference: request '{entry.name}' skill*\n"
            cards.append(card)
        
        header = "# 🧠 AVAILABLE SKILLS (Compact)\n\n"
        header += "These are paradigm shifts to internalize. "
        header += "Request full content with `pull_skill('name')` when needed.\n\n"
        
        return header + "\n---\n\n".join(cards)
    
    def pull_skill_content(self, skill_name: str) -> Optional[str]:
        """
        Pull FULL content for a specific skill ON-DEMAND.
        
        Use this when you actually need the reference material,
        not for every prompt.
        
        Args:
            skill_name: Name of the skill to pull
            
        Returns:
            Full knowledge content, or None if not found
        """
        for entry in self._entries:
            if entry.name.lower() == skill_name.lower():
                return entry.to_prompt_section(include_metadata=True)
        
        # Fuzzy match
        skill_lower = skill_name.lower()
        for entry in self._entries:
            if skill_lower in entry.name.lower() or any(
                skill_lower in d.lower() for d in entry.domains
            ):
                return entry.to_prompt_section(include_metadata=True)
        
        return None
    
    def get_context_for_spin(
        self,
        task: str,
        domains: Optional[List[str]] = None,
    ) -> Tuple[str, List[str]]:
        """
        Get the RIGHT amount of context for a spinning meeseeks.
        
        Returns:
            Tuple of (compact_context, available_skill_names)
            
        The compact_context includes:
        - Skill cards (mental models + prompts) for relevant skills
        - NOT the full reference content
        
        The available_skill_names list tells the LLM what it can pull later.
        """
        # Find relevant knowledge
        relevant = self.get_relevant_knowledge(
            task=task,
            domains=domains,
            max_tokens=50000,  # We're not using tokens, just relevance
            min_relevance=0.2,
        )
        
        if not relevant:
            return "", []
        
        # Return compact cards + list of available skills
        compact = self.get_skill_cards(relevant)
        skill_names = [e.name for e in relevant]
        
        return compact, skill_names


def create_knowledge(
    name: str,
    description: str,
    domains: List[str],
    keywords: List[str],
    when_to_use: str,
    content: str,
    priority: str = "medium",
    max_tokens: int = 2000,
    knowledge_dir: Optional[Path] = None,
) -> Path:
    """
    Create a new knowledge file with frontmatter.
    
    Args:
        name: Knowledge name
        description: Brief description
        domains: List of domains
        keywords: List of keywords
        when_to_use: When to include this knowledge
        content: The actual knowledge content
        priority: critical, high, medium, low
        max_tokens: Approximate token count
        knowledge_dir: Directory for knowledge files
    
    Returns:
        Path to created file
    """
    base_dir = knowledge_dir or Path("box/knowledge")
    base_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate filename from name
    filename = name.lower().replace(" ", "-").replace("_", "-") + ".md"
    file_path = base_dir / filename
    
    # Build frontmatter
    frontmatter = {
        "name": name,
        "description": description,
        "domains": domains,
        "keywords": keywords,
        "when_to_use": when_to_use,
        "priority": priority,
        "max_tokens": max_tokens,
    }
    
    # Write file
    with open(file_path, 'w') as f:
        f.write("---\n")
        f.write(yaml.dump(frontmatter, default_flow_style=False))
        f.write("---\n\n")
        f.write(content)
    
    return file_path


# Example usage and test
if __name__ == "__main__":
    print("🔵 MEESEEKS KNOWLEDGE REGISTRY")
    print("=" * 50)
    
    # Create registry
    registry = KnowledgeRegistry()
    
    print(f"\n📚 Found {len(registry.all_knowledge)} knowledge entries:")
    for k in registry.all_knowledge:
        print(f"   - {k.name}")
        print(f"     Domains: {k.domains}")
        print(f"     Keywords: {k.keywords[:5]}...")
        print(f"     Priority: {k.priority}")
        print()
    
    # Test relevance search
    print("\n🔍 Testing relevance search...")
    task = "Create an animated SVG data visualization with interactive zoom"
    relevant = registry.get_relevant_knowledge(
        task=task,
        domains=["svg", "animation", "visualization"],
        max_tokens=8000,
    )
    
    print(f"\nTask: '{task}'")
    print(f"Found {len(relevant)} relevant knowledge entries:")
    for k in relevant:
        print(f"   - {k.name} (relevance: {k.relevance_score:.2f})")
    
    print("\n🔵 LOOK AT ME! Knowledge registry complete!")
