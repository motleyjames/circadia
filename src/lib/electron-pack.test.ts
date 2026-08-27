import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    opts: { electronDir: string; payload: object; name: string; version: string },
  ) => string;
};

const CRASH_APP = "/Applications/Circadia.app/Contents/Resources/app";
const CRASH_MAIN = "/Users/jamesmotley/rest-ai/electron/main.cjs";
const CRASH_RESOLVED = "/Applications/Circadia.app/Contents/Resources/app/Users/jamesmotley/rest-ai/electron/main.cjs";

describe("Electron packaged main path", () => {
  it("reproduces the Circadia.app concatenation crash", () => {
    expect(pack.packagedMainPath(CRASH_APP, CRASH_MAIN)).toBe(CRASH_RESOLVED);
  });

  it("refuses an absolute main field", () => {
    expect(() => pack.assertSafeMain(CRASH_MAIN)).toThrow(/main\.cjs/);
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
          version: "0.5.2",
        },
        name: "circadia",
        version: "0.5.2",
      });

      expect(resolved).toBe(path.join(appDir, "main.cjs"));
      expect(resolved).not.toContain("/Users/jamesmotley");

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
});
