import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const pack = require("../../electron/pack-app.cjs") as {
  packagedMainPath: (appDir: string, mainField: string) => string;
  assertSafeMain: (mainField: string) => void;
  writePackagedApp: (
    appDir: string,
    opts: {
      electronDir: string;
      payload: { node: string; repo: string; port: number; version?: string };
      name: string;
      version: string;
    },
  ) => string;
};
const repair = require("../../electron/fix-mac.cjs") as {
  repairAll: () => number;
  packagedMainPath: (appDir: string, mainField: string) => string;
};

const CRASH_APP = "/Applications/Circadia.app/Contents/Resources/app";
const CRASH_MAIN = "/Users/jamesmotley/rest-ai/electron/main.cjs";
const CRASH_RESOLVED = "/Applications/Circadia.app/Contents/Resources/app/Users/jamesmotley/rest-ai/electron/main.cjs";

describe("Electron packaged main path", () => {
  it("reproduces the Circadia.app concatenation crash", () => {
    expect(pack.packagedMainPath(CRASH_APP, CRASH_MAIN)).toBe(CRASH_RESOLVED);
  });

  it("refuses an absolute main field", () => {
    expect(() => pack.assertSafeMain(CRASH_MAIN)).toThrow(/main.cjs/);
    expect(() => pack.assertSafeMain(path.join("/Users/jamesmotley/rest-ai", "electron", "main.cjs"))).toThrow();
  });

  it("writes a bundle Electron can actually load, then verifies require.resolve", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "circadia-pack-"));
    try {
      const appDir = path.join(dir, "Contents", "Resources", "app");
      const resolved = pack.writePackagedApp(appDir, {
        electronDir: path.resolve("electron"),
        payload: {
          node: process.execPath,
          repo: path.resolve("."),
          port: 43148,
          version: "0.5.3",
        },
        name: "circadia",
        version: "0.5.3",
      });

      expect(resolved).toBe(path.join(appDir, "main.cjs"));
      const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8")) as { main: string };
      expect(pkg.main).toBe("main.cjs");
      expect(path.isAbsolute(pkg.main)).toBe(false);
      expect(pack.packagedMainPath(appDir, pkg.main)).toBe(resolved);

      const loaded = require.resolve(resolved);
      expect(loaded).toBe(resolved);
      expect(readFileSync(resolved, "utf8")).toContain("serve-dock.cjs");
      expect(readFileSync(resolved, "utf8")).toContain('require("electron")');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("places a file at the concatenated crash path so a stale absolute main still loads", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "circadia-shim-"));
    try {
      const appDir = path.join(dir, "Contents", "Resources", "app");
      pack.writePackagedApp(appDir, {
        electronDir: path.resolve("electron"),
        payload: {
          node: process.execPath,
          repo: "/Users/jamesmotley/rest-ai",
          port: 43148,
        },
        name: "circadia",
        version: "0.5.3",
      });
      const shim = pack.packagedMainPath(appDir, CRASH_MAIN);
      expect(shim).toBe(path.join(appDir, "Users/jamesmotley/rest-ai/electron/main.cjs"));
      expect(existsSync(shim)).toBe(true);
      expect(require.resolve(shim)).toBe(shim);
      expect(readFileSync(shim, "utf8")).toContain("serve-dock.cjs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("repairs an already-installed Electron app that still has an absolute main", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "circadia-repair-"));
    const prev = process.env.CIRCADIA_REPAIR_ROOT;
    try {
      const dest = path.join(root, "Circadia.app");
      const appDir = path.join(dest, "Contents", "Resources", "app");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(path.join(dest, "Contents", "MacOS"), { recursive: true });
      writeFileSync(path.join(dest, "Contents", "MacOS", "Electron"), "");
      writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ name: "circadia", main: CRASH_MAIN }, null, 2));
      process.env.CIRCADIA_REPAIR_ROOT = root;
      expect(repair.repairAll()).toBe(1);
      const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8")) as { main: string };
      expect(pkg.main).toBe("main.cjs");
      expect(existsSync(path.join(appDir, "main.cjs"))).toBe(true);
      expect(path.isAbsolute(pkg.main)).toBe(false);
      const shim = repair.packagedMainPath(appDir, path.join(path.resolve("."), "electron", "main.cjs"));
      expect(existsSync(shim)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CIRCADIA_REPAIR_ROOT;
      else process.env.CIRCADIA_REPAIR_ROOT = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
