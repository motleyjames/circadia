import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type Env = Record<string, string | undefined>;

const require = createRequire(import.meta.url);
const dockEnv = require("../../electron/dock-env.cjs") as {
  stripPackLeakEnv: (env?: Env) => Env;
  dockCompileEnv: (operator: boolean, sourceEnv?: Env) => Env;
  isServerCompile: (dir: string) => boolean;
  isDiaryServerKind: (root: string, operator: boolean) => boolean;
  writeDiaryServerKind: (root: string, operator: boolean) => void;
  stashDiaryServer: (root: string) => boolean;
  restoreDiaryServer: (root: string) => boolean;
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function writeCompile(dir: string, output: "standalone" | "export") {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "BUILD_ID"), "test");
  writeFileSync(
    path.join(dir, "required-server-files.json"),
    JSON.stringify({ config: { output } }),
  );
}

describe("dock-env", () => {
  it("strips pack flags that would inline skip-cover into Circadia.app", () => {
    const env = dockEnv.stripPackLeakEnv({
      PATH: "/usr/bin",
      CIRCADIA_PACK_STATIC: "1",
      CIRCADIA_ELECTRON: "1",
      CIRCADIA_SESSION_TOKEN: "secret",
      NEXT_PUBLIC_CIRCADIA_PHONE_PACK: "1",
      CIRCADIA_SURFACE: "mod",
    });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.CIRCADIA_PACK_STATIC).toBeUndefined();
    expect(env.CIRCADIA_ELECTRON).toBeUndefined();
    expect(env.CIRCADIA_SESSION_TOKEN).toBeUndefined();
    expect(env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK).toBeUndefined();
    expect(env.CIRCADIA_SURFACE).toBe("mod");
  });

  it("pins diary vs operator so a leaked SURFACE cannot swap distDir", () => {
    const leaked = {
      CIRCADIA_SURFACE: "mod",
      NEXT_PUBLIC_CIRCADIA_SURFACE: "mod",
      NEXT_PUBLIC_CIRCADIA_PHONE_PACK: "1",
      CIRCADIA_PACK_STATIC: "1",
      PATH: "/usr/bin",
    };
    const diary = dockEnv.dockCompileEnv(false, leaked);
    expect(diary.CIRCADIA_SURFACE).toBeUndefined();
    expect(diary.NEXT_PUBLIC_CIRCADIA_SURFACE).toBeUndefined();
    expect(diary.NEXT_PUBLIC_CIRCADIA_PHONE_PACK).toBeUndefined();
    expect(diary.CIRCADIA_PACK_STATIC).toBeUndefined();

    const operator = dockEnv.dockCompileEnv(true, {
      CIRCADIA_PACK_STATIC: "1",
      PATH: "/usr/bin",
    });
    expect(operator.CIRCADIA_SURFACE).toBe("mod");
    expect(operator.NEXT_PUBLIC_CIRCADIA_SURFACE).toBe("mod");
    expect(operator.CIRCADIA_PACK_STATIC).toBeUndefined();
  });

  it("refuses to treat a static-export .next as the Dock server", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "circadia-kind-"));
    temps.push(root);
    writeCompile(path.join(root, ".next"), "export");
    writeFileSync(path.join(root, ".next", "circadia-kind"), "diary-server");
    expect(dockEnv.isServerCompile(path.join(root, ".next"))).toBe(false);
    expect(dockEnv.isDiaryServerKind(root, false)).toBe(false);
    expect(() => dockEnv.writeDiaryServerKind(root, false)).toThrow(/server tree/);
  });

  it("stamps only a standalone server compile", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "circadia-kind-"));
    temps.push(root);
    writeCompile(path.join(root, ".next"), "standalone");
    expect(dockEnv.isDiaryServerKind(root, false)).toBe(false);
    dockEnv.writeDiaryServerKind(root, false);
    expect(dockEnv.isDiaryServerKind(root, false)).toBe(true);
    expect(dockEnv.isDiaryServerKind(root, true)).toBe(false);
  });

  it("stashes a diary-server .next across a pack-shaped overwrite", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "circadia-stash-"));
    temps.push(root);
    const nextDir = path.join(root, ".next");
    writeCompile(nextDir, "standalone");
    dockEnv.writeDiaryServerKind(root, false);
    writeFileSync(path.join(nextDir, "SENTINEL"), "keep");
    expect(dockEnv.stashDiaryServer(root)).toBe(true);
    expect(existsSync(nextDir)).toBe(false);
    mkdirSync(nextDir, { recursive: true });
    writeFileSync(path.join(nextDir, "PHONE"), "pack");
    expect(dockEnv.restoreDiaryServer(root)).toBe(true);
    expect(readFileSync(path.join(nextDir, "SENTINEL"), "utf8")).toBe("keep");
    expect(existsSync(path.join(nextDir, "PHONE"))).toBe(false);
    expect(dockEnv.isDiaryServerKind(root, false)).toBe(true);
  });

  it("does not stash a phone-export .next, then wipes it on restore", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "circadia-stash-"));
    temps.push(root);
    writeCompile(path.join(root, ".next"), "export");
    expect(dockEnv.stashDiaryServer(root)).toBe(false);
    expect(dockEnv.restoreDiaryServer(root)).toBe(false);
    expect(existsSync(path.join(root, ".next"))).toBe(false);
  });
});
