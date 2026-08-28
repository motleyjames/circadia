import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const update = require("../../electron/dock-update.cjs") as {
  UPDATE_URL: string;
  pullDockTree: (
    root: string,
    opts?: { url?: string; skip?: boolean },
  ) => {
    ok: boolean;
    skipped?: string;
    updated?: boolean;
    error?: string;
    to?: string;
  };
};

const temps: string[] = [];

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
  if (result.status !== 0) {
    throw new Error(args.join(" ") + "\n" + (result.stderr || result.stdout));
  }
  return result;
}

function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "circadia-update-"));
  temps.push(dir);
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@circadia.local"]);
  git(dir, ["config", "user.name", "Circadia Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  writeFileSync(path.join(dir, "note.txt"), "one\n");
  git(dir, ["add", "note.txt"]);
  git(dir, ["commit", "-m", "one"]);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("dock-update", () => {
  it("points at the public Circadia GitHub repo", () => {
    expect(update.UPDATE_URL).toBe("https://github.com/motleyjames/circadia.git");
    expect(readFileSync("electron/serve-dock.cjs", "utf8")).toContain("pullDockTree");
    expect(readFileSync("electron/serve-dock.cjs", "utf8")).toContain("dock-update.cjs");
  });

  it("skips when CIRCADIA_SKIP_UPDATE is set", () => {
    const prev = process.env.CIRCADIA_SKIP_UPDATE;
    process.env.CIRCADIA_SKIP_UPDATE = "1";
    try {
      expect(update.pullDockTree("/tmp")).toEqual({ ok: true, skipped: "env" });
    } finally {
      if (prev === undefined) delete process.env.CIRCADIA_SKIP_UPDATE;
      else process.env.CIRCADIA_SKIP_UPDATE = prev;
    }
  });

  it("fast-forwards a clean clone from a local origin", () => {
    const prevNpm = process.env.CIRCADIA_SKIP_NPM;
    process.env.CIRCADIA_SKIP_NPM = "1";
    try {
      const origin = makeRepo();
      const clone = mkdtempSync(path.join(os.tmpdir(), "circadia-clone-"));
      temps.push(clone);
      git(os.tmpdir(), ["clone", origin, clone]);
      const first = spawnSync("git", ["rev-parse", "HEAD"], { cwd: clone, encoding: "utf8" }).stdout.trim();
      writeFileSync(path.join(origin, "note.txt"), "two\n");
      git(origin, ["add", "note.txt"]);
      git(origin, ["commit", "-m", "two"]);
      const expected = spawnSync("git", ["rev-parse", "HEAD"], { cwd: origin, encoding: "utf8" }).stdout.trim();
      const result = update.pullDockTree(clone, { url: origin });
      expect(result.ok).toBe(true);
      expect(result.updated).toBe(true);
      expect(result.to).toBe(expected);
      expect(result.to).not.toBe(first);
      expect(readFileSync(path.join(clone, "note.txt"), "utf8")).toBe("two\n");
    } finally {
      if (prevNpm === undefined) delete process.env.CIRCADIA_SKIP_NPM;
      else process.env.CIRCADIA_SKIP_NPM = prevNpm;
    }
  });

  it("does not overwrite a dirty tree", () => {
    const prevNpm = process.env.CIRCADIA_SKIP_NPM;
    process.env.CIRCADIA_SKIP_NPM = "1";
    try {
      const origin = makeRepo();
      const clone = mkdtempSync(path.join(os.tmpdir(), "circadia-dirty-"));
      temps.push(clone);
      git(os.tmpdir(), ["clone", origin, clone]);
      writeFileSync(path.join(clone, "note.txt"), "local\n");
      writeFileSync(path.join(origin, "note.txt"), "remote\n");
      git(origin, ["add", "note.txt"]);
      git(origin, ["commit", "-m", "remote"]);
      const result = update.pullDockTree(clone, { url: origin });
      expect(result).toEqual({ ok: true, skipped: "dirty" });
      expect(readFileSync(path.join(clone, "note.txt"), "utf8")).toBe("local\n");
    } finally {
      if (prevNpm === undefined) delete process.env.CIRCADIA_SKIP_NPM;
      else process.env.CIRCADIA_SKIP_NPM = prevNpm;
    }
  });

  it("skips a folder that is not git", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "circadia-nogit-"));
    temps.push(dir);
    expect(update.pullDockTree(dir).skipped).toBe("not-git");
  });
});

describe("native install.json", () => {
  it("records the GitHub update URL on new Dock bundles", () => {
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain(
      "https://github.com/motleyjames/circadia.git",
    );
    expect(existsSync("electron/dock-update.cjs")).toBe(true);
  });
});
