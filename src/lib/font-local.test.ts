import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local self-hosted fonts", () => {
  it("loads Fraunces and Outfit from disk, not fonts.googleapis.com", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('from "next/font/local"');
    expect(layout).not.toContain("next/font/google");
    expect(layout).not.toContain("fonts.googleapis.com");
    expect(layout).toContain('variable: "--font-sans"');
    expect(layout).toContain('variable: "--font-heading"');
    expect(existsSync("src/app/fonts/Outfit-Variable-latin.woff2")).toBe(true);
    expect(existsSync("src/app/fonts/Fraunces-Variable-latin.woff2")).toBe(true);
    expect(existsSync("src/app/fonts/OFL-Outfit.txt")).toBe(true);
    expect(existsSync("src/app/fonts/OFL-Fraunces.txt")).toBe(true);
  });

  it("keeps Fraunces variation settings on .font-heading", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain('font-variation-settings: "SOFT" 50, "WONK" 0.4');
    expect(css).toContain("var(--font-heading)");
    expect(css).toContain("var(--font-sans)");
  });
});
