import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseInboxPayload } from "./inbox-payload";
import {
  inviteBookPath,
  loadRejectedPacks,
  operatorPrivatePath,
  operatorPublicPath,
  recordRejectedPack,
  reconcileRejectedPacks,
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

  it("a reject record stores only the reason and the arrival stamp", () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-reject-body-"));
    try {
      const payload = {
        schema: "circadia-study-v1",
        name: "Zelda Nightingale",
        dream: "Late to an exam, then the hallway flooded.",
        extra: true,
      };
      const parsed = parseInboxPayload(payload);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      recordRejectedPack(
        { reason: parsed.error, arrivedAt: "2026-09-21T18:04:00.000Z", ...payload } as { reason: string; arrivedAt: string },
        inbox,
      );
      const disk = JSON.parse(readFileSync(rejectLogPath(inbox), "utf8")) as unknown;
      const blob = JSON.stringify(disk);
      expect(blob).not.toContain("Zelda");
      expect(blob).not.toContain("Nightingale");
      expect(blob).not.toContain("hallway");
      expect(blob).not.toContain("dream");
      expect(blob).not.toContain("circadia-study-v1");
      expect(Array.isArray(disk)).toBe(true);
      for (const row of disk as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual(["arrivedAt", "reason"]);
      }
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("inbox rejects that now parse are dropped from the log", () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-reconcile-"));
    try {
      recordRejectedPack(
        { reason: "Invalid night clocks.", file: "study-aaaaaaaa-stamp.json", arrivedAt: "study-aaaaaaaa-stamp.json" },
        inbox,
      );
      recordRejectedPack({ reason: "Invalid JSON.", arrivedAt: "2026-09-01T12:00:00.000Z" }, inbox);
      const next = reconcileRejectedPacks([], inbox);
      expect(next).toEqual([{ reason: "Invalid JSON.", arrivedAt: "2026-09-01T12:00:00.000Z" }]);
      expect(loadRejectedPacks(inbox)).toEqual(next);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("the private key and the public key file are ignored by git", () => {
    const inbox = path.join(process.cwd(), "data", "study-inbox");
    const priv = path.relative(process.cwd(), operatorPrivatePath(inbox));
    const pub = path.relative(process.cwd(), operatorPublicPath(inbox));
    const privOut = execFileSync("git", ["--no-optional-locks", "check-ignore", "-v", priv], { encoding: "utf8" });
    const pubOut = execFileSync("git", ["--no-optional-locks", "check-ignore", "-v", pub], { encoding: "utf8" });
    expect(privOut).toMatch(/study-inbox/);
    expect(pubOut).toMatch(/study-inbox/);
  });

  it("the rejection record is ignored by git", () => {
    const rel = path.relative(process.cwd(), rejectLogPath(path.join(process.cwd(), "data", "study-inbox")));
    const out = execFileSync("git", ["--no-optional-locks", "check-ignore", "-v", rel], { encoding: "utf8" });
    expect(out).toMatch(/study-inbox/);
  });
});
