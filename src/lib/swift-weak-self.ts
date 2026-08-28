/** Catches the Swift capture mistakes that failed `swiftc` on James's Mac. */

export type WeakSelfHit = { snippet: string };

export function weakSelfViolations(src: string): WeakSelfHit[] {
  const hits: WeakSelfHit[] = [];
  const marker = "[weak self]";
  let from = 0;
  while (from < src.length) {
    const idx = src.indexOf(marker, from);
    if (idx === -1) break;
    const braceStart = src.lastIndexOf("{", idx);
    if (braceStart === -1) break;
    const end = matchingBrace(src, braceStart);
    const inIdx = src.indexOf("in", idx);
    const body = src.slice(inIdx === -1 ? idx : inIdx + 2, end);
    const guardAt = body.search(/guard\s+let\s+self\b/);
    const beforeGuard = guardAt === -1 ? body : body.slice(0, guardAt);
    const stripped = beforeGuard.replace(/self\?\./g, "OPTIONAL.");
    if (/\bself\./.test(stripped) || /(?<![\w.])operatorApp\b/.test(stripped)) {
      hits.push({ snippet: body.trim().slice(0, 240) });
    }
    from = idx + marker.length;
  }
  return hits;
}

function matchingBrace(src: string, openAt: number): number {
  let depth = 0;
  for (let i = openAt; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return src.length;
}
