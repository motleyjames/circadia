import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const pull = require("../../scripts/ios-pull-vault.cjs") as {
  BUNDLE_ID: string;
  SOURCE_CANDIDATES: string[];
  wrapLockedDiary: (raw: unknown) => { kind: string; vault: { session: null; files: Record<string, unknown> } } | null;
};

describe("ios-pull-vault", () => {
  it("wraps a raw phone vault.json and strips stay-signed-in", () => {
    const pack = pull.wrapLockedDiary({
      v: 1,
      files: { "email:ada@example.com": { enc: true } },
      locks: { "email:ada@example.com": { v: 2 } },
      session: "email:ada@example.com",
    });
    expect(pack?.kind).toBe("circadia.locked-diary");
    expect(pack?.vault.session).toBeNull();
    expect(pack?.vault.files["email:ada@example.com"]).toEqual({ enc: true });
  });

  it("re-wraps an already locked pack and drops session", () => {
    const pack = pull.wrapLockedDiary({
      kind: "circadia.locked-diary",
      v: 1,
      vault: {
        v: 1,
        files: { "email:ada@example.com": { enc: true } },
        session: "email:ada@example.com",
      },
    });
    expect(pack?.vault.session).toBeNull();
  });

  it("fails closed on empty files, wrong kind, and garbage", () => {
    expect(pull.wrapLockedDiary({ v: 1, files: {}, session: "x" })).toBeNull();
    expect(pull.wrapLockedDiary({ kind: "nope", v: 1, vault: { files: { a: 1 } } })).toBeNull();
    expect(pull.wrapLockedDiary("not-json")).toBeNull();
    expect(pull.wrapLockedDiary(null)).toBeNull();
  });

  it("pulls Documents/vault.json for the diary bundle and never decrypts", () => {
    const src = readFileSync("scripts/ios-pull-vault.cjs", "utf8");
    expect(pull.BUNDLE_ID).toBe("app.circadia.diary");
    expect(pull.SOURCE_CANDIDATES).toContain("Documents/vault.json");
    expect(src).toContain("appDataContainer");
    expect(src).toContain("fold-inbox.circadia");
    expect(src).toContain("process.exit(0)");
    expect(src).toContain("Never decrypts");
    expect(src).not.toContain("decryptPayload");
    expect(src).not.toContain("unlockMaster");
    expect(src).toContain("require.main === module");
  });

  it("skips on Linux instead of failing the install", () => {
    const run = spawnSync(process.execPath, ["scripts/ios-pull-vault.cjs", "--target", "00008140-001201901A93001C"], {
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    if (process.platform !== "darwin") {
      expect(run.stdout).toMatch(/Skipping phone vault pull/i);
    }
  });
});
