import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FETCH_POLL_MS } from "@/lib/pack-fetch";

const PAGES = [
  "src/app/mod/page.tsx",
  "src/app/mod/testers/page.tsx",
  "src/app/mod/invite/page.tsx",
  "src/app/mod/exports/page.tsx",
];

function walk(dir: string, hits: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, hits);
      continue;
    }
    if (/\.(ts|tsx)$/.test(name)) hits.push(path);
  }
  return hits;
}

describe("operator inbox session", () => {
  it("a tab switch after the first load makes no data request", () => {
    const chrome = readFileSync("src/components/operator-chrome.tsx", "utf8");
    expect(chrome).toContain("event.preventDefault()");
    expect(chrome).toContain("router.push");
    const inbox = readFileSync("src/context/operator-inbox.tsx", "utf8");
    expect(inbox).not.toMatch(/usePathname|useSearchParams/);
    for (const file of PAGES) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/fetch\("\/api\/moderator"\)/);
      expect(text, file).not.toMatch(/setInterval/);
    }
  });

  it("polling still runs every 3 minutes", () => {
    expect(FETCH_POLL_MS).toBe(3 * 60 * 1000);
    const inbox = readFileSync("src/context/operator-inbox.tsx", "utf8");
    expect(inbox).toContain("3 * 60 * 1000");
    expect(inbox).toMatch(/setInterval/);
    expect(inbox).not.toContain("pack-fetch");
    expect(inbox).toContain('method: "POST"');
  });

  it("no browser component imports the private key or the Worker fetch", () => {
    const forbidden = [
      "@/lib/pack-fetch",
      "fetchBookPacks",
      "operatorPrivatePath",
      "OPERATOR_PRIVATE_FILE",
      "importOperatorPrivate",
    ];
    const hits: string[] = [];
    for (const file of [...walk("src/components"), ...walk("src/app/mod"), ...walk("src/context")]) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const text = readFileSync(file, "utf8");
      for (const needle of forbidden) {
        if (text.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
    const route = readFileSync("src/app/api/moderator/route.ts", "utf8");
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(get).not.toContain("fetchBookPacks");
    expect(route.slice(route.indexOf("export async function POST"))).toContain("fetchBookPacks");
  });
});
