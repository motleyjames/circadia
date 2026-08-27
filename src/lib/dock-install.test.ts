import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const install = readFileSync("electron/install-mac.cjs", "utf8");
const launcher = readFileSync("electron/launcher.swift", "utf8");
const main = readFileSync("electron/main.cjs", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");
const onboarding = readFileSync("src/components/onboarding.tsx", "utf8");

describe("Dock install invariants", () => {
  it("builds a native WKWebView launcher, not a renamed Electron binary", () => {
    expect(install).toContain("swiftc");
    expect(install).toContain("launcher.swift");
    expect(install).toContain("installElectronFallback");
    expect(install).not.toMatch(/renameSync\([^)]*Circadia/);
  });

  it("runs production Next on 43148, never turbopack in the Dock window", () => {
    expect(launcher).toContain("43148");
    expect(launcher).toContain('"start"');
    expect(launcher).not.toContain('"dev"');
    expect(launcher).toContain("WKWebView");
    expect(install).toContain("buildDiary");
    expect(install).toContain("[nextBin, \"build\"]");
    expect(main).toContain('"start"');
  });

  it("does not silently quit when a second Electron already exists", () => {
    expect(main).not.toContain("requestSingleInstanceLock");
  });

  it("sends CORS headers so Safari font fetches do not throw Load failed", () => {
    expect(nextConfig).toContain("Access-Control-Allow-Origin");
    expect(nextConfig).toContain("devIndicators: false");
  });

  it("does not let the Next.js overlay steal clicks", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toContain("nextjs-portal");
    expect(readFileSync("src/components/native-chrome.tsx", "utf8")).toContain("disarmNextOverlay");
  });

  it("does not prefetch routes from the cover screen", () => {
    expect(onboarding).not.toContain("useRouter");
  });
});
