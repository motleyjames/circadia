import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEpisode } from "./episode";
import {
  deriveInviteParticipantId,
  deriveInviteParticipantIdV2,
  dismissOrphan,
  enrollWithInvite,
  generateInvite,
  joinInvite,
  nameOrphan,
  normalizeInviteCode,
  normalizeInviteCodeV2,
  parseInviteCode,
  readInviteBook,
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

  it("v1 codes derive the participant ids they did before", async () => {
    expect(await deriveInviteParticipantId(PINNED)).toBe(PINNED_ID);
    expect(await parseInviteCode("A10B-C3D4")).toBe(PINNED_ID);
    expect(normalizeInviteCode("A10B-C3D4")).toBe(PINNED);
  });

  it("the same v2 invite always derives the same ids with or without dashes, in any case", async () => {
    const normalized = "A10BC3D4E5F6G7H8";
    const id = await deriveInviteParticipantIdV2(normalized);
    for (const form of ["a10bc3d4e5f6g7h8", "A10B-C3D4-E5F6-G7H8", "  a10b-c3d4-e5f6-g7h8  ", "AI0BC3D4E5F6G7H8"]) {
      expect(normalizeInviteCodeV2(form)).toBe(normalized);
      expect(await parseInviteCode(form)).toBe(id);
    }
    const { derivePackLocation } = await import("./pack-derive");
    const a = await derivePackLocation(normalized);
    const b = await derivePackLocation(normalizeInviteCodeV2("a10b-c3d4-e5f6-g7h8")!);
    expect(a).toEqual(b);
    expect(a.workerId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a derived v2 participant id passes the receiver's validator unchanged", async () => {
    const invite = await generateInvite("Ada West", "friend");
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
        participantId: invite.participantId,
        lastSentAt: null,
        lastStatus: null,
        lastError: null,
        rosterSentAt: null,
      },
    };
    const pack = buildStudyPack(state);
    expect(pack.participantId).toBe(invite.participantId);
    expect(validateStudyPack(pack).ok).toBe(true);
    const src = readFileSync("src/lib/study.ts", "utf8");
    expect(src).toContain("[1-8]");
    expect(src).toContain("[89ab]");
  });

  it("nothing computes a Worker id or bearer from a participant id", () => {
    const derive = readFileSync("src/lib/pack-derive.ts", "utf8");
    expect(derive).toContain("normalizedInvite");
    expect(derive).not.toMatch(/participantId/);
    expect(derive).toContain("PACK_ID_INFO");
    expect(derive).toContain("PACK_AUTH_INFO");
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
    const mint = src.slice(src.indexOf("function mintInviteCodeV2"), src.indexOf("export async function generateInvite"));
    expect(mint).toMatch(/crypto\.getRandomValues/);
    expect(mint).not.toMatch(/Math\.random/);
    const invite = await generateInvite("Ada West", "friend");
    expect(invite.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
  });

  it("a v2 join replaces a legacy id and keeps the existing episode", async () => {
    const invite = await generateInvite("Ada West", "friend");
    const episode = createEpisode({ clinicianId: null, enrolledAt: "2026-09-08T12:00:00Z" });
    const legacy: CircadiaState = {
      ...blank(),
      episode,
      study: {
        ...blank().study,
        asked: true,
        consented: true,
        participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
    };
    const joined = await enrollWithInvite(legacy, invite.code.toLowerCase(), new Date("2026-09-16T12:00:00Z"));
    expect(joined?.study.participantId).toBe(invite.participantId);
    expect(joined?.episode?.id).toBe(episode.id);
    expect(joined?.study.inviteVersion).toBe(2);
    expect(joined?.study.inviteNormalized).toBeTruthy();
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

  it("naming an orphan never creates a code or a participantId", () => {
    const src = readFileSync("src/lib/invite.ts", "utf8");
    const fn = src.slice(src.indexOf("export function nameOrphan"), src.indexOf("export function dismissOrphan"));
    expect(fn).not.toMatch(/generateInvite|mintInviteCode|deriveInviteParticipantId|crypto\.getRandomValues/);
    const id = "0ed78a9a-bbbb-4ccc-8ddd-eeeeeeee0001";
    const named = nameOrphan([], id, "James M.", "friend");
    expect(named[0]?.code).toBeNull();
    expect(named[0]?.participantId).toBe(id);
    expect(named[0]?.name).toBe("James M.");
    expect(readInviteBook(named)).toEqual(named);
  });

  it("naming and dismissing write only to the gitignored book", () => {
    const store = readFileSync("src/lib/operator-store.ts", "utf8");
    expect(store).toContain('INVITE_BOOK_FILE = "invite-book.json"');
    const save = store.slice(store.indexOf("export function saveInviteBook"), store.indexOf("function coerceRejected"));
    expect(save).toContain("inviteBookPath");
    expect(save).not.toMatch(/study-|nights|pack/);
    const home = readFileSync("src/app/mod/page.tsx", "utf8");
    const persist = home.slice(home.indexOf("function persistBook"), home.indexOf("const nightPeople"));
    expect(persist).toContain("/api/moderator/book");
    expect(persist).not.toContain("/api/study");
    expect(persist).not.toContain("localStorage");
    expect(persist).toContain("JSON.stringify({ invites: next })");
    const testers = readFileSync("src/app/mod/testers/page.tsx", "utf8");
    expect(testers).toContain("/api/moderator/book");
    expect(testers).toContain("restoreOrphan");
    const dismissed = dismissOrphan([], "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0011");
    expect(dismissed[0]?.dismissed).toBe(true);
    expect(dismissed[0]?.code).toBeNull();
  });

  it("the book's entry shape has no field for a phone number or an email; no request to the Operator server carries one; nothing written to browser storage contains one", () => {
    const invite = readFileSync("src/lib/invite.ts", "utf8");
    const shape = invite.slice(invite.indexOf("export type OperatorInvite"), invite.indexOf("export function isCohort"));
    expect(shape).not.toMatch(/phone|email/i);
    const send = readFileSync("src/components/send-invite-code.tsx", "utf8");
    expect(send).not.toMatch(/localStorage/);
    expect(send).not.toMatch(/fetch\(/);
    expect(send).toContain("navigator.clipboard.writeText");
    expect(send).toContain("The message is also on your clipboard.");
    for (const path of ["src/app/mod/invite/page.tsx", "src/app/mod/page.tsx", "src/app/mod/testers/page.tsx"]) {
      const text = readFileSync(path, "utf8");
      expect(text).toContain("JSON.stringify({ invites:");
      expect(text).not.toMatch(/JSON\.stringify\(\{[^}]*\b(phone|email)\b/);
    }
  });
});
