import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nextOutput } from "./next-output";
import { weakSelfViolations } from "./swift-weak-self";

const require = createRequire(import.meta.url);
const bundle = require("../../electron/native-bundle.cjs") as {
  APP_KINDS: Record<string, { port: number; exec: string; fileName: string; bundleId: string; surface: string | null }>;
  assembleNativeApp: (opts: {
    kind?: string;
    repo: string;
    dest: string;
    binarySrc: string;
    node?: string;
    version?: string;
  }) => {
    dest: string;
    binary: string;
    payload: { repo: string; port: number; surface?: string; title: string; logFile: string };
    kind: { exec: string; bundleId: string; display: string };
  };
  nextBuildEnv: (kind: string) => NodeJS.ProcessEnv;
};
const both = require("../../electron/install-both-native.cjs") as {
  selectedKinds: () => string[];
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

  it("passes on launcher.swift (the only Dock shell)", () => {
    expect(weakSelfViolations(readFileSync("electron/launcher.swift", "utf8"))).toEqual([]);
  });
});

describe("diary vs operator Dock kinds", () => {
  it("keeps ice and gold on different ports, ids, and binaries", () => {
    expect(bundle.APP_KINDS.diary.port).toBe(43148);
    expect(bundle.APP_KINDS.mod.port).toBe(43149);
    expect(bundle.APP_KINDS.diary.exec).toBe("Circadia");
    expect(bundle.APP_KINDS.mod.exec).toBe("CircadiaOperator");
    expect(bundle.APP_KINDS.diary.fileName).toBe("Circadia.app");
    expect(bundle.APP_KINDS.mod.fileName).toBe("Circadia Operator.app");
    expect(bundle.APP_KINDS.diary.bundleId).not.toBe(bundle.APP_KINDS.mod.bundleId);
    expect(bundle.APP_KINDS.diary.surface).toBeNull();
    expect(bundle.APP_KINDS.mod.surface).toBe("mod");
  });

  it("never static-exports Operator even if CIRCADIA_ELECTRON leaked", () => {
    const env = bundle.nextBuildEnv("mod");
    expect(env.CIRCADIA_SURFACE).toBe("mod");
    expect(env.CIRCADIA_ELECTRON).toBeUndefined();
    expect(env.CIRCADIA_PACK_STATIC).toBeUndefined();
    expect(
      nextOutput({
        CIRCADIA_ELECTRON: "1",
        CIRCADIA_SURFACE: "mod",
        NEXT_PUBLIC_CIRCADIA_SURFACE: "mod",
      }),
    ).toBe("standalone");
  });

  it("installs both kinds by default", () => {
    const prev = process.argv.slice();
    try {
      process.argv = ["node", "install-both-native.cjs"];
      expect(both.selectedKinds()).toEqual(["diary", "mod"]);
      process.argv = ["node", "install-both-native.cjs", "--operator"];
      expect(both.selectedKinds()).toEqual(["mod"]);
      process.argv = ["node", "install-both-native.cjs", "--diary"];
      expect(both.selectedKinds()).toEqual(["diary"]);
    } finally {
      process.argv = prev;
    }
  });
});

describe("native assemble of both Dock apps", () => {
  it("refuses to assemble without a binary", () => {
    expect(() =>
      bundle.assembleNativeApp({
        repo: path.resolve("."),
        dest: path.join(os.tmpdir(), "nope.app"),
        binarySrc: path.join(os.tmpdir(), "missing-circadia-bin"),
      }),
    ).toThrow(/refusing to assemble/);
  });

  it("builds diary and operator bundles three times with no Electron leftover", () => {
    const fake = path.join(os.tmpdir(), "CircadiaBin-test");
    writeFileSync(fake, "#!/bin/sh\necho ok\n");
    for (let pass = 1; pass <= 3; pass++) {
      for (const kind of ["diary", "mod"] as const) {
        const dest = mkdtempSync(path.join(os.tmpdir(), `circadia-${kind}-`)) + ".app";
        try {
          const result = bundle.assembleNativeApp({
            kind,
            repo: path.resolve("."),
            dest,
            binarySrc: fake,
            node: process.execPath,
            version: "0.6.5",
          });
          expect(existsSync(result.binary)).toBe(true);
          expect(result.binary.endsWith(result.kind.exec)).toBe(true);
          expect(existsSync(path.join(dest, "Contents", "MacOS", "Electron"))).toBe(false);
          expect(existsSync(path.join(dest, "Contents", "Resources", "app", "package.json"))).toBe(false);
          const payload = JSON.parse(
            readFileSync(path.join(dest, "Contents", "Resources", "install.json"), "utf8"),
          ) as { port: number; serve: string; surface?: string; title: string };
          expect(payload.serve).toBe("electron/serve-dock.cjs");
          expect(payload.port).toBe(bundle.APP_KINDS[kind].port);
          expect(payload.title).toBe(result.kind.display);
          if (kind === "mod") {
            expect(payload.surface).toBe("mod");
            expect(payload.port).toBe(43149);
          } else {
            expect(payload.surface).toBeUndefined();
            expect(payload.port).toBe(43148);
          }
          const plist = readFileSync(path.join(dest, "Contents", "Info.plist"), "utf8");
          expect(plist).toContain(result.kind.bundleId);
          expect(plist).toContain(`<string>${result.kind.exec}</string>`);
          expect(plist).not.toContain("Electron");
        } finally {
          rmSync(dest, { recursive: true, force: true });
        }
      }
    }
    rmSync(fake, { force: true });
  });
});
