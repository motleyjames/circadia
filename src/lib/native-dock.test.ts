import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { weakSelfViolations } from "./swift-weak-self";

const require = createRequire(import.meta.url);
const install = require("../../electron/install-home-native.cjs") as {
  assembleNativeApp: (opts: {
    repo: string;
    dest: string;
    binarySrc: string;
    node?: string;
    version?: string;
  }) => { dest: string; binary: string; payload: { repo: string; port: number } };
};

const BAD_OPTIONAL_SELF = `
DispatchQueue.main.async { [weak self] in
  let alert = NSAlert()
  alert.messageText = self.operatorApp
    ? "Circadia Operator is running. The inbox is not."
    : "Circadia is running. The diary is not."
}
`;

const BAD_BARE = `
DispatchQueue.main.async { [weak self] in
  alert.messageText = operatorApp ? "op" : "diary"
}
`;

const GOOD = `
DispatchQueue.main.async { [weak self] in
  guard let self else { return }
  alert.messageText = self.operatorApp ? "op" : "diary"
}
`;

describe("weak self capture (the Mac swiftc failures)", () => {
  it("flags the exact optional-self error from the terminal", () => {
    expect(weakSelfViolations(BAD_OPTIONAL_SELF).length).toBeGreaterThan(0);
  });

  it("flags the exact bare operatorApp error from the first swiftc", () => {
    expect(weakSelfViolations(BAD_BARE).length).toBeGreaterThan(0);
  });

  it("accepts guard let self then self.property", () => {
    expect(weakSelfViolations(GOOD)).toEqual([]);
  });

  it("passes on dock-shell.swift and launcher.swift", () => {
    expect(weakSelfViolations(readFileSync("electron/dock-shell.swift", "utf8"))).toEqual([]);
    expect(weakSelfViolations(readFileSync("electron/launcher.swift", "utf8"))).toEqual([]);
  });
});

describe("native home assemble (compile-first)", () => {
  it("refuses to assemble without a binary", () => {
    expect(() =>
      install.assembleNativeApp({
        repo: path.resolve("."),
        dest: path.join(os.tmpdir(), "nope.app"),
        binarySrc: path.join(os.tmpdir(), "missing-circadia-bin"),
      }),
    ).toThrow(/refusing to assemble/);
  });

  it("builds a native bundle three times with no Electron leftover", () => {
    const fake = path.join(os.tmpdir(), "CircadiaBin-test");
    writeFileSync(fake, "#!/bin/sh\necho ok\n");
    for (let pass = 1; pass <= 3; pass++) {
      const dest = mkdtempSync(path.join(os.tmpdir(), "circadia-app-")) + ".app";
      try {
        const result = install.assembleNativeApp({
          repo: path.resolve("."),
          dest,
          binarySrc: fake,
          node: process.execPath,
          version: "0.5.0",
        });
        expect(existsSync(result.binary)).toBe(true);
        expect(readFileSync(result.binary, "utf8")).toContain("echo ok");
        expect(existsSync(path.join(dest, "Contents", "MacOS", "Electron"))).toBe(false);
        expect(existsSync(path.join(dest, "Contents", "Resources", "app", "package.json"))).toBe(false);
        const payload = JSON.parse(
          readFileSync(path.join(dest, "Contents", "Resources", "install.json"), "utf8"),
        ) as { port: number; serve: string; repo: string };
        expect(payload.port).toBe(43148);
        expect(payload.serve).toBe("electron/serve-dock.cjs");
        expect(payload.repo).toBe(path.resolve("."));
        const plist = readFileSync(path.join(dest, "Contents", "Info.plist"), "utf8");
        expect(plist).toContain("<string>Circadia</string>");
        expect(plist).toContain("CFBundleExecutable");
        expect(plist).not.toContain("Electron");
      } finally {
        rmSync(dest, { recursive: true, force: true });
      }
    }
    rmSync(fake, { force: true });
  });
});
