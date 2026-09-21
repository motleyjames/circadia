import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEpisode } from "./episode";
import {
  deriveInviteParticipantId,
  enrollWithInvite,
  generateInvite,
  joinInvite,
  normalizeInviteCode,
  parseInviteCode,
} from "./invite";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import { emptyState } from "./storage";
import { buildStudyPack, validateStudyPack } from "./study";
import type { CircadiaState } from "./types";

function blank(): CircadiaState {
  return emptyState();
}

const PINNED = "A10BC3D4";
const PINNED_ID = "af3e97d1-ea0e-4678-9582-ea1ef023cf5a";

describe("invite codes", () => {
  it("the same code always derives the same participantId", async () => {
    expect(await deriveInviteParticipantId(PINNED)).toBe(PINNED_ID);
    expect(await deriveInviteParticipantId(PINNED)).toBe(await deriveInviteParticipantId(PINNED));
  });

  it("a derived participantId passes the receiver's validator unchanged", async () => {
    const id = await deriveInviteParticipantId(PINNED);
    expect(id).toBe(PINNED_ID);
    const state: CircadiaState = {
      ...blank(),
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
        participantId: id,
        lastSentAt: null,
        lastStatus: null,
        lastError: null,
        rosterSentAt: null,
      },
    };
    const pack = buildStudyPack(state);
    expect(pack.participantId).toBe(id);
    expect(validateStudyPack(pack).ok).toBe(true);
    const src = readFileSync("src/lib/study.ts", "utf8");
    expect(src).toContain("[1-8]");
    expect(src).toContain("[89ab]");
  });

  it("invite normalization is frozen at v1", async () => {
    expect(normalizeInviteCode("a10bc3d4")).toBe(PINNED);
    expect(normalizeInviteCode("  a10bc3d4  ")).toBe(PINNED);
    expect(normalizeInviteCode("A10B-C3D4")).toBe(PINNED);
    expect(normalizeInviteCode("A10BC3D4")).toBe(PINNED);
    expect(normalizeInviteCode("AI0BC3D4")).toBe(PINNED);
    expect(normalizeInviteCode("AL0BC3D4")).toBe(PINNED);
    expect(normalizeInviteCode("A1OBC3D4")).toBe(PINNED);
    const id = await deriveInviteParticipantId(PINNED);
    for (const form of ["a10bc3d4", "  a10b-c3d4  ", "AI0B C3D4", "al0bc3d4", "a1obc3d4"]) {
      expect(await parseInviteCode(form)).toBe(id);
    }
  });

  it("a code containing U or a non-alphabet character is rejected", () => {
    expect(normalizeInviteCode("A1B2C3DU")).toBeNull();
    expect(normalizeInviteCode("A1B2C3D!")).toBeNull();
    expect(normalizeInviteCode("A1B2C3D")).toBeNull();
    expect(normalizeInviteCode("A1B2C3D45")).toBeNull();
  });

  it("two different codes derive different ids", async () => {
    const a = await deriveInviteParticipantId("A1B2C3D4");
    const b = await deriveInviteParticipantId("A1B2C3D5");
    expect(a).not.toBe(b);
  });

  it("codes are generated from crypto.getRandomValues, never Math.random", async () => {
    const src = readFileSync("src/lib/invite.ts", "utf8");
    const mint = src.slice(src.indexOf("function mintInviteCode"), src.indexOf("export async function generateInvite"));
    expect(mint).toMatch(/crypto\.getRandomValues/);
    expect(mint).not.toMatch(/Math\.random/);
    const invite = await generateInvite("Ada West", "friend");
    expect(normalizeInviteCode(invite.code)).toHaveLength(8);
    expect(invite.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it("a reinstall that re-enters the code rejoins the same record", async () => {
    const invite = await generateInvite("Ada West", "friend");
    const first = await enrollWithInvite(blank(), invite.code, new Date("2026-09-01T12:00:00Z"));
    expect(first?.study.participantId).toBe(invite.participantId);
    expect(first?.episode?.clinicianId).toBeNull();
    expect(first?.episode?.state).toBe("enrolled");
    expect(joinInvite([invite], first!.study.participantId!)).toEqual(invite);

    const reinstalled = await enrollWithInvite(blank(), `  ${invite.code.toLowerCase()}  `, new Date("2026-09-10T08:00:00Z"));
    expect(reinstalled?.study.participantId).toBe(first?.study.participantId);
    expect(joinInvite([invite], reinstalled!.study.participantId!)).toEqual(invite);
  });

  it("refuses a clinical episode and a non-code", async () => {
    const invite = await generateInvite("Ada West", "stranger");
    const clinical: CircadiaState = {
      ...blank(),
      episode: createEpisode({ clinicianId: "clin-1" }),
    };
    expect(await enrollWithInvite(clinical, invite.code)).toBeNull();
    expect(await enrollWithInvite(blank(), "not!!")).toBeNull();
    expect(await parseInviteCode("")).toBeNull();
  });

  it("no shakedown join produces a participantId Operator did not issue", async () => {
    const book = [await generateInvite("Ada West", "friend")];
    const joined = await enrollWithInvite(blank(), book[0]!.code);
    expect(joined).toBeTruthy();
    expect(joinInvite(book, joined!.study.participantId!)).toEqual(book[0]);
    expect(joined!.episode?.clinicianId).toBeNull();

    const inviteSrc = readFileSync("src/lib/invite.ts", "utf8");
    const enrollFn = inviteSrc.slice(inviteSrc.indexOf("export async function enrollWithInvite"));
    expect(enrollFn).toMatch(/parseInviteCode\(code\)/);
    expect(enrollFn).not.toMatch(/newId\(/);

    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    const joinFn = store.slice(store.indexOf("const joinStudy ="), store.indexOf("const enrollSolo ="));
    expect(joinFn).not.toMatch(/newId\(/);
    expect(joinFn).not.toMatch(/createEpisode/);
    expect(joinFn).toMatch(/if \(!snapshot\(\)\.study\.participantId\) return;/);

    const panel = readFileSync("src/components/study-panel.tsx", "utf8");
    const gate = readFileSync("src/components/study-gate.tsx", "utf8");
    expect(panel).toMatch(/enrollSolo/);
    expect(gate).toMatch(/enrollSolo/);
    expect(panel).toMatch(/enrollSolo/);
    expect(gate).toMatch(/enrollSolo/);
  });
});
