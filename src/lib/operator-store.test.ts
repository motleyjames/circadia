import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseInboxPayload } from "./inbox-payload";
import {
  inviteBookPath,
  loadRejectedPacks,
  recordRejectedPack,
  rejectLogPath,
} from "./operator-store";

describe("operator store", () => {
  it("the invite book is ignored by git", () => {
    const rel = path.relative(process.cwd(), inviteBookPath(path.join(process.cwd(), "data", "study-inbox")));
    const out = execFileSync("git", ["--no-optional-locks", "check-ignore", "-v", rel], { encoding: "utf8" });
    expect(out).toMatch(/study-inbox/);
  });

  it("a rejected pack leaves a record carrying the validator's reason and the arrival stamp", () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-rejects-"));
    try {
      const parsed = parseInboxPayload({ schema: "circadia-study-v1", extra: true });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      const arrivedAt = "2026-09-21T18:04:00.000Z";
      const row = recordRejectedPack({ reason: parsed.error, arrivedAt }, inbox);
      expect(row.reason).toBe(parsed.error);
      expect(row.arrivedAt).toBe(arrivedAt);
      expect(loadRejectedPacks(inbox)).toEqual([row]);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("the rejection record is ignored by git", () => {
    const rel = path.relative(process.cwd(), rejectLogPath(path.join(process.cwd(), "data", "study-inbox")));
    const out = execFileSync("git", ["--no-optional-locks", "check-ignore", "-v", rel], { encoding: "utf8" });
    expect(out).toMatch(/study-inbox/);
  });
});
