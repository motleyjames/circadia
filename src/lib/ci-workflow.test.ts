import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Canonical workflow. `.github/workflows/ci.yml` is a copy; GitHub App tokens without `workflow` scope cannot create that path. */
const SOURCE = "scripts/github-ci.yml";
const LIVE = ".github/workflows/ci.yml";
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

function loadCi(): string {
  expect(existsSync(SOURCE), "scripts/github-ci.yml is the CI workflow Circadia can actually commit").toBe(true);
  const ci = readFileSync(SOURCE, "utf8");
  if (existsSync(LIVE)) {
    expect(readFileSync(LIVE, "utf8"), "live GitHub workflow must match scripts/github-ci.yml").toBe(ci);
  }
  return ci;
}

describe("GitHub CI workflow", () => {
  it("runs typecheck, lint, and test on Node 20 for push and pull_request", () => {
    const ci = loadCi();
    expect(ci).toMatch(/on:\s*\n\s*push:/);
    expect(ci).toContain("pull_request:");
    expect(ci).toContain("ubuntu-latest");
    expect(ci).toContain('node-version: "20"');
    expect(ci).toContain("npm ci");
    expect(ci).not.toContain("typegen");
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm test");
    expect(ci).toMatch(/timeout-minutes:\s*([2-9]\d|[1][5-9])/);
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    expect(pkg.scripts.lint).toBe("eslint");
    expect(readFileSync("eslint.config.mjs", "utf8")).toContain("scripts/**");
    expect(pkg.scripts["pack:static"]).toBe("node electron/build-ui.cjs");
  });

  it("does not compile the Dock, Swift, or a macOS app", () => {
    const ci = loadCi();
    expect(ci).not.toContain("macos");
    expect(ci).not.toContain("npm run dock");
    expect(ci).not.toContain("put-on-dock");
    expect(ci).not.toContain("swiftc");
    expect(ci).not.toContain("electron-builder");
    expect(ci).not.toContain("CIRCADIA_PACK_STATIC");
  });
});
