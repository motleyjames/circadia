#!/usr/bin/env python3
"""
Code-reading probe: the only probe here that can answer a question about
BEHAVIOUR rather than about the presence of text.

Every other probe is a grep or an AST lookup. They answer "is X in this file?"
Real review concerns are almost never that shape - "does the retry loop retry
permanent 5xx errors", "can this error path leak the password" - and a lexical
probe answering them produces exactly the failures this harness has been
chasing: a probe finds `except Exception` and reports a credential leak without
seeing that the next line returns `type(e).__name__`.

So this reads the actual source and asks a model. That would normally be the
thing this codebase refuses to trust - "an LLM said so" is not evidence. The
difference is the citation check: the model must quote a span from the source
verbatim, and that quote is verified byte-for-byte against the file before the
verdict is accepted. A model that invents a line gets its verdict thrown away
and the probe reports UNVERIFIED. What survives is not an opinion; it is a
claim anchored to a line you can go read.
"""

from __future__ import annotations

import ast
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

MAX_SOURCE_CHARS = 14000

PROMPT = """You are answering ONE question about a specific piece of source code.
You answer only from the code shown. You do not speculate about code you cannot see.

## The concern
{question}

## The source: {label}
```python
{source}
```

## How to answer
- Decide whether the concern is TRUE of this code as written.
- You MUST quote one line from the source above that settles it, copied EXACTLY,
  character for character, including indentation. A quote that does not appear
  verbatim in the source will be rejected and your answer discarded.
- If the code shown genuinely cannot settle it - the relevant logic is elsewhere,
  or the concern is about runtime behaviour you cannot see - say cannot_tell.
  That is a respectable answer. Guessing is not.

Return ONLY this JSON:
{{"verdict": "concern_is_real" | "concern_is_unfounded" | "cannot_tell",
  "quote": "<one line copied exactly from the source above>",
  "line": <the line number shown next to that line>,
  "why": "<one sentence, referring to what the quoted line does>"}}"""


def extract_symbol(source: str, name: str) -> Optional[Tuple[str, int]]:
    """Source text of a named function/class plus its starting line, via AST."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    lines = source.splitlines()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) \
                and node.name == name:
            start = node.lineno - 1
            end = getattr(node, "end_lineno", None) or min(start + 120, len(lines))
            return "\n".join(lines[start:end]), node.lineno
    return None


def module_header(source: str) -> str:
    """Imports and module-level constants - everything before the first def/class.

    Extracting a function alone hides the module scope it depends on. Reading
    only send_email(), a model sees `except TRANSIENT_EXCEPTIONS` and cannot
    know what is in that tuple, because the tuple is defined eleven lines above
    the function. It then correctly answers "cannot tell" to every question
    about which exceptions are caught - a true answer to a question we broke.
    """
    lines = source.splitlines()
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("def ", "async def ", "class ", "@")):
            break
        out.append(line)
    return "\n".join(out)


def number_lines(source: str, first_line: int = 1) -> str:
    out = []
    for i, line in enumerate(source.splitlines(), start=first_line):
        out.append(f"{i:5d} | {line}")
    return "\n".join(out)


def parse_verdict(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    if start < 0:
        return None
    # Brace matching MUST ignore braces inside string literals. The whole point
    # of this parser is to read a verdict whose "quote" field is a line of
    # source code, and source code is full of braces - a dict literal, an
    # f-string, a set. Counting them naively means any cited line with an
    # unbalanced brace never closes the object, and a perfectly good verdict is
    # thrown away as unparseable.
    depth = 0
    in_string = False
    escaped = False
    for i, ch in enumerate(text[start:], start=start):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def citation_holds(quote: str, source: str) -> bool:
    """Is this quote really in the source? Byte-exact after trimming outer space.

    This is the whole reason the verdict can be trusted. A model that cannot
    point at a real line does not get to have an opinion recorded as evidence.
    """
    if not quote or not isinstance(quote, str):
        return False
    needle = quote.strip()
    if len(needle) < 4:
        return False
    return needle in source
