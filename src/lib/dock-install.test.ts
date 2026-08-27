import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const install = readFileSync("electron/install-mac.cjs", "utf8");
const launcher = readFileSync("electron/launcher.swift", "utf8");
const main = readFileSync("electron/main.cjs", "utf8");

describe("Dock install invariants", () => {
  it("builds a native WKWebView launcher, not a renamed Electron binary", () => {
    expect(install).toContain("swiftc");
    expect(install).toContain("launcher.swift");
    expect(install).toContain("installElectronFallback");
    expect(install).not.toMatch(/renameSync\([^)]*Circadia/);
  });

  it("points the native window at this clone's Next server", () => {
    expect(launcher).toContain("43147");
    expect(launcher).toContain("WKWebView");
    expect(launcher).toContain("install.json");
    expect(launcher).toContain("Library/Logs/Circadia.log");
  });

  it("does not silently quit when a second Electron already exists", () => {
    expect(main).not.toContain("requestSingleInstanceLock");
  });
});
