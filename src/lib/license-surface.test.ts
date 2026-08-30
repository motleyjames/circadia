import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENGINE_IN_MOUTH = /\b(AASM|CBT-I|SCN|melanopsin|MSFsc|MSF|MSW|chronotype)\b/;

function componentFiles(dir: string): string[] {
  const names = readdirSync(dir, { recursive: true, encoding: "utf8" });
  return names
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("proprietary license and package identity", () => {
  it("ships a James Motley 2026 all-rights-reserved LICENSE with no permission granted", () => {
    expect(existsSync("LICENSE")).toBe(true);
    const license = readFileSync("LICENSE", "utf8");
    expect(license).toContain("James Motley");
    expect(license).toContain("2026");
    expect(license).toMatch(/all rights reserved/i);
    expect(license).toMatch(/no permission is granted/i);
  });

  it("marks the package UNLICENSED and private, with author, description, and repository", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      private: boolean;
      license: string;
      author: string;
      description: string;
      repository: { type: string; url: string };
    };
    expect(pkg.private).toBe(true);
    expect(pkg.license).toBe("UNLICENSED");
    expect(pkg.author).toBe("James Motley");
    expect(pkg.description.toLowerCase()).toMatch(/sleep/);
    expect(pkg.description.toLowerCase()).toMatch(/local-first|local first/);
    expect(pkg.repository.url).toContain("github.com/motleyjames/circadia");
  });

  it("does not put a home-directory path in the README", () => {
    expect(readFileSync("README.md", "utf8")).not.toContain("/Users/jamesmotley");
  });
});

describe("mouth register in src/components", () => {
  it("does not put engine jargon in component source", () => {
    const files = componentFiles("src/components");
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(ENGINE_IN_MOUTH);
    }
  });
});
