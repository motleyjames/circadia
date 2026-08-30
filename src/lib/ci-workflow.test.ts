import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("GitHub CI workflow", () => {
  it("runs typecheck, lint, and test on Node 20 for push and pull_request", () => {
    expect(ci).toMatch(/on:\s*\n\s*push:/);
    expect(ci).toContain("pull_request:");
    expect(ci).toContain("ubuntu-latest");
    expect(ci).toContain('node-version: "20"');
    expect(ci).toContain("npm ci");
    expect(ci).toContain("npm run typegen");
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm test");
    expect(pkg.scripts.typegen).toBe("next typegen");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    expect(pkg.scripts.lint).toBe("eslint");
  });

  it("does not compile the Dock, Swift, or a macOS app", () => {
    expect(ci).not.toContain("macos");
    expect(ci).not.toContain("npm run dock");
    expect(ci).not.toContain("put-on-dock");
    expect(ci).not.toContain("swiftc");
    expect(ci).not.toContain("electron-builder");
    expect(ci).not.toContain("CIRCADIA_PACK_STATIC");
  });
});
