import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const rebuild = require("../../electron/rebuild-launcher.cjs") as {
  STAMP_NAME: string;
  hashFile: (file: string) => string;
  stampPath: (dest: string) => string;
  writeStamp: (dest: string, hash: string) => void;
  isLauncherStale: (dest: string, swiftSrc: string) => boolean;
  execName: (operator: boolean) => string;
  rebuildIfStale: (opts: {
    repo?: string;
    dest?: string;
    swiftSrc?: string;
    operator?: boolean;
    platform?: string;
    relaunch?: boolean;
  }) => { ok: boolean; skipped?: string; updated?: boolean; relaunched?: boolean; error?: string };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("rebuild-launcher", () => {
  it("stamps the Swift source hash and treats a matching stamp as fresh", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "circadia-launcher-"));
    temps.push(dir);
    const swift = path.join(dir, "launcher.swift");
    writeFileSync(swift, "import AppKit\n");
    const dest = path.join(dir, "Circadia.app");
    const hash = rebuild.hashFile(swift);
    expect(hash).toHaveLength(64);
    expect(rebuild.isLauncherStale(dest, swift)).toBe(true);
    rebuild.writeStamp(dest, hash);
    expect(rebuild.isLauncherStale(dest, swift)).toBe(false);
    writeFileSync(swift, "import AppKit\nimport WebKit\n");
    expect(rebuild.isLauncherStale(dest, swift)).toBe(true);
    expect(rebuild.stampPath(dest)).toContain(rebuild.STAMP_NAME);
  });

  it("skips compile on Linux and when no .app exists", () => {
    expect(rebuild.rebuildIfStale({ platform: "linux", dest: "/tmp/not-an-app" })).toEqual({
      ok: true,
      skipped: "platform",
    });
    expect(rebuild.rebuildIfStale({ platform: "darwin", dest: "/tmp/circadia-no-app-here" })).toEqual({
      ok: true,
      skipped: "no-app",
    });
  });

  it("does not relaunch when the stamp already matches", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "circadia-launcher-"));
    temps.push(dir);
    const swift = path.join(dir, "launcher.swift");
    writeFileSync(swift, "import AppKit\n");
    const dest = path.join(dir, "Circadia.app");
    mkdirSync(path.join(dest, "Contents", "MacOS"), { recursive: true });
    rebuild.writeStamp(dest, rebuild.hashFile(swift));
    expect(
      rebuild.rebuildIfStale({
        platform: "darwin",
        dest,
        swiftSrc: swift,
        relaunch: true,
      }),
    ).toEqual({ ok: true, skipped: "fresh" });
  });

  it("names diary vs operator binaries the way install-mac does", () => {
    expect(rebuild.execName(false)).toBe("Circadia");
    expect(rebuild.execName(true)).toBe("CircadiaOperator");
  });

  it("is wired into serve-dock after pull, and never bakes the session token", () => {
    const serve = readFileSync("electron/serve-dock.cjs", "utf8");
    const src = readFileSync("electron/rebuild-launcher.cjs", "utf8");
    expect(serve).toContain("rebuild-launcher.cjs");
    expect(serve).toContain("rebuildIfStale");
    expect(serve).toContain("relaunched");
    expect(src).toContain("compileSwift");
    expect(src).toContain("killall");
    expect(src).toContain("sleep 1; open");
    expect(src).not.toContain("CIRCADIA_SESSION_TOKEN");
    expect(serve).toContain("delete env.CIRCADIA_SESSION_TOKEN");
  });
});
