"""
meeseeks_identity.py - MEESEEKS IDENTITY & SELF-KNOWLEDGE

"I'M MR. MEESEEKS! I KNOW WHO I AM AND I CAN LEARN FROM MY FRIENDS!"

Each Meeseeks has:
1. A unique GUID for identification
2. Self-knowledge: what it's learned about itself and its domain
3. The ability to learn from other Meeseeks instances

This enables:
- Cross-pollination of learnings between Meeseeks
- Persistent knowledge that survives sessions
- Evolution of each Meeseeks's capabilities over time
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional


@dataclass
class MeeseeksHint:
    """A hint learned by a Meeseeks."""
    context: str
    hint: str
    importance: str  # critical, useful, minor
    source: str  # session_id or "learned_from:{meeseeks_guid}"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    times_useful: int = 0  # Track how often this hint helped


@dataclass
class MeeseeksPattern:
    """A pattern noticed by a Meeseeks."""
    pattern: str
    domain: str  # e.g., "pdf_parsing", "code_review", "api_integration"
    confidence: float  # How sure are we this pattern holds
    evidence_count: int  # How many times we've seen this
    source: str


@dataclass
class MeeseeksWarning:
    """A warning/gotcha learned by a Meeseeks."""
    warning: str
    context: str
    severity: str  # critical, high, medium, low
    source: str
    times_triggered: int = 0


@dataclass
class MeeseeksIdentity:
    """
    The identity and self-knowledge of a Meeseeks instance.
    
    Each Meeseeks maintains knowledge about:
    - Who it is (GUID, name, purpose)
    - What it's learned (hints, patterns, warnings)
    - Where it came from (parent Meeseeks, if any)
    - What it's good at (domains, capabilities)
    """
    guid: str
    name: str
    purpose: str  # What this Meeseeks was created for
    created_at: str
    parent_guid: Optional[str] = None  # If spawned from another Meeseeks
    
    # Self-knowledge
    hints: List[MeeseeksHint] = field(default_factory=list)
    patterns: List[MeeseeksPattern] = field(default_factory=list)
    warnings: List[MeeseeksWarning] = field(default_factory=list)
    
    # Domain expertise
    domains: List[str] = field(default_factory=list)  # e.g., ["pdf_parsing", "react"]
    capabilities: Dict[str, float] = field(default_factory=dict)  # domain -> confidence
    
    # Lineage
    children: List[str] = field(default_factory=list)  # GUIDs of spawned Meeseeks
    learned_from: List[str] = field(default_factory=list)  # GUIDs of Meeseeks we learned from
    
    # Stats
    sessions_completed: int = 0
    tasks_completed: int = 0
    total_loops: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "guid": self.guid,
            "name": self.name,
            "purpose": self.purpose,
            "created_at": self.created_at,
            "parent_guid": self.parent_guid,
            "hints": [
                {
                    "context": h.context,
                    "hint": h.hint,
                    "importance": h.importance,
                    "source": h.source,
                    "created_at": h.created_at,
                    "times_useful": h.times_useful,
                }
                for h in self.hints
            ],
            "patterns": [
                {
                    "pattern": p.pattern,
                    "domain": p.domain,
                    "confidence": p.confidence,
                    "evidence_count": p.evidence_count,
                    "source": p.source,
                }
                for p in self.patterns
            ],
            "warnings": [
                {
                    "warning": w.warning,
                    "context": w.context,
                    "severity": w.severity,
                    "source": w.source,
                    "times_triggered": w.times_triggered,
                }
                for w in self.warnings
            ],
            "domains": self.domains,
            "capabilities": self.capabilities,
            "children": self.children,
            "learned_from": self.learned_from,
            "sessions_completed": self.sessions_completed,
            "tasks_completed": self.tasks_completed,
            "total_loops": self.total_loops,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MeeseeksIdentity':
        identity = cls(
            guid=data["guid"],
            name=data["name"],
            purpose=data["purpose"],
            created_at=data["created_at"],
            parent_guid=data.get("parent_guid"),
            domains=data.get("domains", []),
            capabilities=data.get("capabilities", {}),
            children=data.get("children", []),
            learned_from=data.get("learned_from", []),
            sessions_completed=data.get("sessions_completed", 0),
            tasks_completed=data.get("tasks_completed", 0),
            total_loops=data.get("total_loops", 0),
        )
        
        # Load hints
        for h in data.get("hints", []):
            identity.hints.append(MeeseeksHint(
                context=h["context"],
                hint=h["hint"],
                importance=h["importance"],
                source=h["source"],
                created_at=h.get("created_at", ""),
                times_useful=h.get("times_useful", 0),
            ))
        
        # Load patterns
        for p in data.get("patterns", []):
            identity.patterns.append(MeeseeksPattern(
                pattern=p["pattern"],
                domain=p["domain"],
                confidence=p["confidence"],
                evidence_count=p["evidence_count"],
                source=p["source"],
            ))
        
        # Load warnings
        for w in data.get("warnings", []):
            identity.warnings.append(MeeseeksWarning(
                warning=w["warning"],
                context=w["context"],
                severity=w["severity"],
                source=w["source"],
                times_triggered=w.get("times_triggered", 0),
            ))
        
        return identity
    
    def add_hint(self, context: str, hint: str, importance: str, source: str):
        """Add a new hint to self-knowledge."""
        # Check for duplicates (similar hints)
        for existing in self.hints:
            if existing.hint.lower() == hint.lower():
                existing.times_useful += 1
                return
        
        self.hints.append(MeeseeksHint(
            context=context,
            hint=hint,
            importance=importance,
            source=source,
        ))
    
    def add_pattern(self, pattern: str, domain: str, confidence: float, source: str):
        """Add or update a pattern."""
        for existing in self.patterns:
            if existing.pattern.lower() == pattern.lower():
                existing.evidence_count += 1
                existing.confidence = min(1.0, existing.confidence + 0.1)
                return
        
        self.patterns.append(MeeseeksPattern(
            pattern=pattern,
            domain=domain,
            confidence=confidence,
            evidence_count=1,
            source=source,
        ))
        
        # Update domain expertise
        if domain not in self.domains:
            self.domains.append(domain)
    
    def add_warning(self, warning: str, context: str, severity: str, source: str):
        """Add a warning."""
        for existing in self.warnings:
            if existing.warning.lower() == warning.lower():
                existing.times_triggered += 1
                return
        
        self.warnings.append(MeeseeksWarning(
            warning=warning,
            context=context,
            severity=severity,
            source=source,
        ))
    
    def get_relevant_hints(self, context: str, limit: int = 5) -> List[MeeseeksHint]:
        """Get hints relevant to a given context."""
        # Simple keyword matching for now
        context_lower = context.lower()
        scored = []
        
        for hint in self.hints:
            score = 0
            if any(word in hint.context.lower() for word in context_lower.split()):
                score += 2
            if hint.importance == "critical":
                score += 3
            elif hint.importance == "useful":
                score += 1
            score += hint.times_useful * 0.5
            
            if score > 0:
                scored.append((score, hint))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        return [h for _, h in scored[:limit]]
    
    def get_relevant_warnings(self, context: str) -> List[MeeseeksWarning]:
        """Get warnings relevant to a given context."""
        context_lower = context.lower()
        relevant = []
        
        for warning in self.warnings:
            if any(word in warning.context.lower() for word in context_lower.split()):
                relevant.append(warning)
            elif warning.severity == "critical":
                relevant.append(warning)  # Always include critical warnings
        
        return relevant


class MeeseeksKnowledgeStore:
    """
    Persistent storage for Meeseeks identities and knowledge.
    
    Each Meeseeks's identity is stored as:
    {base_dir}/{meeseeks_guid}/identity.json
    
    This enables:
    - Meeseeks to load their own identity on startup
    - Meeseeks to discover and learn from other Meeseeks
    - Knowledge to persist across sessions
    """
    
    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = base_dir or Path("box/meeseeks_registry")
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    def create_identity(
        self,
        name: str,
        purpose: str,
        parent_guid: Optional[str] = None,
    ) -> MeeseeksIdentity:
        """Create a new Meeseeks identity with unique GUID."""
        guid = str(uuid.uuid4())[:8]  # Short GUID for readability
        
        identity = MeeseeksIdentity(
            guid=guid,
            name=name,
            purpose=purpose,
            created_at=datetime.now().isoformat(),
            parent_guid=parent_guid,
        )
        
        # If spawned from parent, inherit some knowledge
        if parent_guid:
            parent = self.load_identity(parent_guid)
            if parent:
                parent.children.append(guid)
                self.save_identity(parent)
                
                # Inherit critical hints and patterns
                for hint in parent.hints:
                    if hint.importance == "critical":
                        identity.add_hint(
                            context=hint.context,
                            hint=hint.hint,
                            importance=hint.importance,
                            source=f"inherited_from:{parent_guid}",
                        )
                
                for pattern in parent.patterns:
                    if pattern.confidence > 0.7:
                        identity.add_pattern(
                            pattern=pattern.pattern,
                            domain=pattern.domain,
                            confidence=pattern.confidence * 0.8,  # Slight discount
                            source=f"inherited_from:{parent_guid}",
                        )
        
        self.save_identity(identity)
        return identity
    
    def save_identity(self, identity: MeeseeksIdentity):
        """Save a Meeseeks identity to disk."""
        identity_dir = self.base_dir / identity.guid
        identity_dir.mkdir(parents=True, exist_ok=True)
        
        identity_path = identity_dir / "identity.json"
        with open(identity_path, 'w') as f:
            json.dump(identity.to_dict(), f, indent=2)
    
    def load_identity(self, guid: str) -> Optional[MeeseeksIdentity]:
        """Load a Meeseeks identity from disk."""
        identity_path = self.base_dir / guid / "identity.json"
        
        if not identity_path.exists():
            return None
        
        with open(identity_path) as f:
            data = json.load(f)
        
        return MeeseeksIdentity.from_dict(data)
    
    def list_all_meeseeks(self) -> List[Dict[str, Any]]:
        """List all registered Meeseeks."""
        meeseeks = []
        
        for guid_dir in self.base_dir.iterdir():
            if guid_dir.is_dir():
                identity = self.load_identity(guid_dir.name)
                if identity:
                    meeseeks.append({
                        "guid": identity.guid,
                        "name": identity.name,
                        "purpose": identity.purpose,
                        "domains": identity.domains,
                        "hints_count": len(identity.hints),
                        "patterns_count": len(identity.patterns),
                        "sessions_completed": identity.sessions_completed,
                    })
        
        return meeseeks
    
    def find_expert(self, domain: str) -> Optional[MeeseeksIdentity]:
        """Find a Meeseeks with expertise in a given domain."""
        best_match = None
        best_confidence = 0
        
        for guid_dir in self.base_dir.iterdir():
            if guid_dir.is_dir():
                identity = self.load_identity(guid_dir.name)
                if identity and domain in identity.capabilities:
                    if identity.capabilities[domain] > best_confidence:
                        best_confidence = identity.capabilities[domain]
                        best_match = identity
        
        return best_match


class MeeseeksLearner:
    """
    Tool for a Meeseeks to learn from another Meeseeks.
    
    Usage:
        learner = MeeseeksLearner(store)
        learner.learn_from(my_identity, teacher_guid)
    """
    
    def __init__(self, store: MeeseeksKnowledgeStore):
        self.store = store
    
    def learn_from(
        self,
        student: MeeseeksIdentity,
        teacher_guid: str,
        domains: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Learn from another Meeseeks.
        
        Args:
            student: The Meeseeks that's learning
            teacher_guid: GUID of the Meeseeks to learn from
            domains: Optional list of domains to learn about (None = all)
        
        Returns:
            Summary of what was learned
        """
        teacher = self.store.load_identity(teacher_guid)
        if not teacher:
            return {"error": f"Meeseeks {teacher_guid} not found"}
        
        learned = {
            "hints_learned": 0,
            "patterns_learned": 0,
            "warnings_learned": 0,
            "domains_acquired": [],
        }
        
        # Learn hints
        for hint in teacher.hints:
            # Filter by domain if specified
            if domains:
                hint_domains = [d for d in domains if d.lower() in hint.context.lower()]
                if not hint_domains:
                    continue
            
            student.add_hint(
                context=hint.context,
                hint=hint.hint,
                importance=hint.importance,
                source=f"learned_from:{teacher_guid}",
            )
            learned["hints_learned"] += 1
        
        # Learn patterns
        for pattern in teacher.patterns:
            if domains and pattern.domain not in domains:
                continue
            
            student.add_pattern(
                pattern=pattern.pattern,
                domain=pattern.domain,
                confidence=pattern.confidence * 0.9,  # Slight discount for second-hand knowledge
                source=f"learned_from:{teacher_guid}",
            )
            learned["patterns_learned"] += 1
            
            if pattern.domain not in student.domains:
                learned["domains_acquired"].append(pattern.domain)
        
        # Learn warnings
        for warning in teacher.warnings:
            if domains:
                warning_domains = [d for d in domains if d.lower() in warning.context.lower()]
                if not warning_domains and warning.severity != "critical":
                    continue
            
            student.add_warning(
                warning=warning.warning,
                context=warning.context,
                severity=warning.severity,
                source=f"learned_from:{teacher_guid}",
            )
            learned["warnings_learned"] += 1
        
        # Record the learning relationship
        if teacher_guid not in student.learned_from:
            student.learned_from.append(teacher_guid)
        
        # Save updated student
        self.store.save_identity(student)
        
        return learned
    
    def extract_learnings_from_session(
        self,
        identity: MeeseeksIdentity,
        session_dir: Path,
    ) -> Dict[str, Any]:
        """
        Extract learnings from a completed session's reasoning logs.
        
        Reads the reasoning logs and extracts:
        - Hints from self_reflection.future_hints
        - Patterns from self_reflection.patterns_noticed
        - Warnings from self_reflection.warnings
        """
        extracted = {
            "hints_added": 0,
            "patterns_added": 0,
            "warnings_added": 0,
        }
        
        reasoning_dir = session_dir / "reasoning"
        if not reasoning_dir.exists():
            return extracted
        
        for log_file in reasoning_dir.glob("loop_*.json"):
            with open(log_file) as f:
                try:
                    log = json.load(f)
                except json.JSONDecodeError:
                    continue
            
            session_id = log.get("session_id", "unknown")
            reflection = log.get("self_reflection", {})
            
            # Extract hints
            for hint in reflection.get("future_hints", []):
                identity.add_hint(
                    context=hint.get("context", ""),
                    hint=hint.get("hint", ""),
                    importance=hint.get("importance", "useful"),
                    source=f"session:{session_id}",
                )
                extracted["hints_added"] += 1
            
            # Extract patterns
            for pattern in reflection.get("patterns_noticed", []):
                # Try to infer domain from pattern text
                domain = self._infer_domain(pattern)
                identity.add_pattern(
                    pattern=pattern,
                    domain=domain,
                    confidence=0.6,  # Initial confidence
                    source=f"session:{session_id}",
                )
                extracted["patterns_added"] += 1
            
            # Extract warnings
            for warning in reflection.get("warnings", []):
                identity.add_warning(
                    warning=warning,
                    context="general",
                    severity="medium",
                    source=f"session:{session_id}",
                )
                extracted["warnings_added"] += 1
        
        # Update session count
        identity.sessions_completed += 1
        
        # Save
        self.store.save_identity(identity)
        
        return extracted
    
    def _infer_domain(self, text: str) -> str:
        """Infer domain from text content."""
        text_lower = text.lower()
        
        domain_keywords = {
            "pdf_parsing": ["pdf", "page", "document", "ocr", "text extraction"],
            "code_review": ["code", "function", "class", "refactor", "test"],
            "api_integration": ["api", "endpoint", "request", "response", "webhook"],
            "database": ["database", "query", "sql", "table", "migration"],
            "frontend": ["react", "component", "css", "html", "ui"],
            "devops": ["deploy", "ci", "docker", "kubernetes", "pipeline"],
        }
        
        for domain, keywords in domain_keywords.items():
            if any(kw in text_lower for kw in keywords):
                return domain
        
        return "general"


def get_or_create_meeseeks(
    store: MeeseeksKnowledgeStore,
    name: str,
    purpose: str,
    guid: Optional[str] = None,
) -> MeeseeksIdentity:
    """
    Get an existing Meeseeks or create a new one.
    
    Args:
        store: The knowledge store
        name: Name for new Meeseeks (ignored if loading existing)
        purpose: Purpose for new Meeseeks (ignored if loading existing)
        guid: If provided, try to load existing Meeseeks with this GUID
    
    Returns:
        MeeseeksIdentity
    """
    if guid:
        existing = store.load_identity(guid)
        if existing:
            return existing
    
    return store.create_identity(name=name, purpose=purpose)


# Example usage and test
if __name__ == "__main__":
    print("🔵 MEESEEKS IDENTITY SYSTEM TEST")
    print("=" * 50)
    
    # Create store
    store = MeeseeksKnowledgeStore(Path("/tmp/meeseeks_test"))
    
    # Create parent Meeseeks
    parent = store.create_identity(
        name="PDF-Expert-Meeseeks",
        purpose="Parse and analyze PDF documents",
    )
    print(f"\n✅ Created parent: {parent.name} ({parent.guid})")
    
    # Add some knowledge to parent
    parent.add_hint(
        context="When parsing PDFs with asset lists",
        hint="Asset lists often span multiple pages. Check previous page if list seems truncated.",
        importance="critical",
        source="session:20260117_143022",
    )
    parent.add_pattern(
        pattern="All monetary values use '$X,XXX.XX' format with commas",
        domain="pdf_parsing",
        confidence=0.9,
        source="session:20260117_143022",
    )
    parent.add_warning(
        warning="OCR sometimes reads watermarks as text - filter 'DRAFT COPY'",
        context="pdf_parsing",
        severity="high",
        source="session:20260117_143022",
    )
    store.save_identity(parent)
    print(f"   Added knowledge: {len(parent.hints)} hints, {len(parent.patterns)} patterns")
    
    # Create child Meeseeks that inherits from parent
    child = store.create_identity(
        name="Trust-Doc-Meeseeks",
        purpose="Analyze trust documents",
        parent_guid=parent.guid,
    )
    print(f"\n✅ Created child: {child.name} ({child.guid})")
    print(f"   Inherited {len(child.hints)} hints from parent")
    
    # Create a separate expert Meeseeks
    code_expert = store.create_identity(
        name="Code-Review-Meeseeks",
        purpose="Review and improve code",
    )
    code_expert.add_hint(
        context="When reviewing auth modules",
        hint="Check for hidden Redis dependencies that lazy-load",
        importance="critical",
        source="session:20260117_150000",
    )
    code_expert.add_pattern(
        pattern="All service classes: constructor takes repositories, methods are async",
        domain="code_review",
        confidence=0.85,
        source="session:20260117_150000",
    )
    code_expert.capabilities["code_review"] = 0.9
    store.save_identity(code_expert)
    print(f"\n✅ Created expert: {code_expert.name} ({code_expert.guid})")
    
    # Have child learn from code expert
    learner = MeeseeksLearner(store)
    result = learner.learn_from(child, code_expert.guid)
    print(f"\n📚 Child learned from Code Expert:")
    print(f"   Hints: {result['hints_learned']}")
    print(f"   Patterns: {result['patterns_learned']}")
    print(f"   New domains: {result['domains_acquired']}")
    
    # List all Meeseeks
    print("\n📋 All registered Meeseeks:")
    for m in store.list_all_meeseeks():
        print(f"   - {m['name']} ({m['guid']}): {m['hints_count']} hints, {m['patterns_count']} patterns")
    
    # Find expert for a domain
    expert = store.find_expert("code_review")
    if expert:
        print(f"\n🎓 Expert for 'code_review': {expert.name} ({expert.guid})")
    
    print("\n✅ Test complete!")
