import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateInvite, normalizeInviteCodeV2 } from "./invite";
import { loadRejectedPacks, loadWithdrawn } from "./operator-store";
import { derivePackLocation } from "./pack-derive";
import { fetchBookPacks, writeInboxPack } from "./pack-fetch";
import { generateOperatorKeyPair, sealPayload } from "./pack-seal";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import { emptyState } from "./storage";
import { buildStudyPack } from "./study";
import type { CircadiaState } from "./types";

function packFor(participantId: string) {
  const state: CircadiaState = {
    ...emptyState(),
    profile: {
      firstName: "A",
      lastName: "",
      name: "A",
      age: 34,
      sex: "female",
      heightCm: 170,
      weightKg: 68,
      activity: "light",
      medications: [],
      supplements: [],
      struggles: ["falling"],
      targetSleep: "23:00",
      targetWake: "07:00",
      units: "metric",
      notificationsEnabled: false,
      onboardingComplete: true,
      email: "",
      phone: "",
      scheduledDays: DEFAULT_SCHEDULED_DAYS,
    },
    study: {
      asked: true,
      consented: true,
      participantId,
      lastSentAt: null,
      lastStatus: null,
      lastError: null,
      rosterSentAt: null,
    },
  };
  return buildStudyPack(state);
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/octet-stream", ...headers },
  });
}

describe("pack fetch", () => {
  it("an opened pack that fails validateStudyPack is rejected and never enters the inbox", async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-fetch-bad-"));
    try {
      const invite = await generateInvite("Ada West", "friend");
      const keys = await generateOperatorKeyPair();
      const loc = await derivePackLocation(normalizeInviteCodeV2(invite.code)!);
      const envelope = await sealPayload(
        { ...packFor(invite.participantId), extra: true },
        keys.publicRaw,
        invite.participantId,
      );
      const result = await fetchBookPacks({
        book: [invite],
        privateKey: keys.privateKey,
        inbox,
        fetchImpl: async () => jsonResponse(envelope, 200, { etag: '"e1"' }),
      });
      expect(result.unreachable).toBe(false);
      expect(result.written).toEqual([]);
      expect(readdirSync(inbox).filter((n) => n.endsWith(".json"))).toEqual([]);
      expect(result.rejects).toEqual([
        expect.objectContaining({
          reason: "Unknown pack field: extra",
          file: `fetch:${invite.participantId}`,
        }),
      ]);
      expect(loadRejectedPacks(inbox).every((row) => !("schema" in row))).toBe(true);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("a withdrawal marks the tester withdrawn, deletes nothing, and never reaches the reject log", async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-fetch-wd-"));
    try {
      const invite = await generateInvite("Ada West", "friend");
      const keys = await generateOperatorKeyPair();
      const pack = packFor(invite.participantId);
      const kept = writeInboxPack(pack, new Date("2026-09-01T12:00:00.000Z"), inbox);
      const envelope = await sealPayload({ withdrawn: true }, keys.publicRaw, invite.participantId);
      const first = await fetchBookPacks({
        book: [invite],
        privateKey: keys.privateKey,
        inbox,
        fetchImpl: async () => jsonResponse(envelope, 200, { etag: '"w1"' }),
      });
      expect(first.withdrawn[invite.participantId.toLowerCase()]).toBe(true);
      expect(readdirSync(inbox)).toContain(kept);
      expect(first.rejects).toEqual([]);
      expect(loadRejectedPacks(inbox)).toEqual([]);
      expect(loadWithdrawn(inbox)[invite.participantId.toLowerCase()]).toBe(true);

      const later = await sealPayload(pack, keys.publicRaw, invite.participantId);
      const second = await fetchBookPacks({
        book: [invite],
        privateKey: keys.privateKey,
        inbox,
        fetchImpl: async () => jsonResponse(later, 200, { etag: '"p2"' }),
      });
      expect(second.withdrawn[invite.participantId.toLowerCase()]).toBe(false);
      expect(second.written.length).toBe(1);
      expect(readdirSync(inbox)).toContain(kept);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("an unreachable Worker changes nothing already stored", async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-fetch-down-"));
    try {
      const invite = await generateInvite("Ada West", "friend");
      const keys = await generateOperatorKeyPair();
      const pack = packFor(invite.participantId);
      const kept = writeInboxPack(pack, new Date("2026-09-01T12:00:00.000Z"), inbox);
      const before = readdirSync(inbox).sort();
      const result = await fetchBookPacks({
        book: [invite],
        privateKey: keys.privateKey,
        inbox,
        fetchImpl: async () => {
          throw new Error("offline");
        },
      });
      expect(result.unreachable).toBe(true);
      expect(result.written).toEqual([]);
      expect(readdirSync(inbox).sort()).toEqual(before);
      expect(readdirSync(inbox)).toContain(kept);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("fetching an unchanged object twice writes one inbox file", async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-fetch-once-"));
    try {
      const invite = await generateInvite("Ada West", "friend");
      const keys = await generateOperatorKeyPair();
      const pack = packFor(invite.participantId);
      const envelope = await sealPayload(pack, keys.publicRaw, invite.participantId);
      const fetchImpl = async () => jsonResponse(envelope, 200, { etag: '"same"' });
      const first = await fetchBookPacks({ book: [invite], privateKey: keys.privateKey, inbox, fetchImpl });
      const second = await fetchBookPacks({ book: [invite], privateKey: keys.privateKey, inbox, fetchImpl });
      expect(first.written).toHaveLength(1);
      expect(second.written).toEqual([]);
      expect(readdirSync(inbox).filter((n) => n.startsWith("study-") && n.endsWith(".json"))).toHaveLength(1);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });
});
