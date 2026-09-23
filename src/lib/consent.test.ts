import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptExistingConsent,
  AGE_REFUSAL,
  CONSENT_CRISIS_HREF,
  CONSENT_EMAIL,
  CONSENT_LEAVE_PATH,
  CONSENT_LEAVE_UNINSTALL,
  CONSENT_VERSION,
  DISCLOSURE_LINES,
  hasCurrentConsent,
  joinConsentGate,
  joinWithConsent,
  recordStudyConsent,
  receivesCoversEveryMappedKey,
  unmappedPackKeys,
  whatJamesReceives,
} from "./consent";
import { generateInvite } from "./invite";
import {
  DELETE_STUDY_CONFIRM,
  DELETE_TESTER_NIGHTS_CONFIRM,
  deleteAllStudyData,
  deleteTesterNights,
  loadInviteBook,
  loadRejectedPacks,
  loadWithdrawn,
  operatorPrivatePath,
  operatorPublicPath,
  recordRejectedPack,
  saveInviteBook,
} from "./operator-store";
import { writeInboxPack } from "./pack-fetch";
import { generateOperatorKeyPair } from "./pack-seal";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import { emptyState, persistableState } from "./storage";
import { buildStudyPack } from "./study";
import type { CircadiaState, Profile } from "./types";

const adult: Profile = {
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
};

function withProfile(age = 34): CircadiaState {
  return { ...emptyState(), profile: { ...adult, age } };
}

describe("consent disclosure", () => {
  it("every pack key has a disclosure line", () => {
    expect(unmappedPackKeys()).toEqual([]);
    expect(receivesCoversEveryMappedKey()).toEqual([]);
    expect(DISCLOSURE_LINES.inBedAt).toBe("the time you went to bed");
  });
});

describe("consent gates sending", () => {
  it("no pack is sealed or sent without consent at CONSENT_VERSION", async () => {
    const invite = await generateInvite("Ada West", "friend");
    const fresh = await joinWithConsent(withProfile(), invite.code, true);
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(hasCurrentConsent(fresh.state.study)).toBe(true);
    expect(fresh.state.study.consentVersion).toBe(CONSENT_VERSION);

    const enrolled = await (await import("./invite")).enrollWithInvite(withProfile(), invite.code);
    expect(enrolled).toBeTruthy();
    expect(hasCurrentConsent(enrolled!.study)).toBe(false);

    const bumped = {
      ...fresh.state,
      study: { ...fresh.state.study, consentVersion: CONSENT_VERSION + 1 },
    };
    expect(hasCurrentConsent(bumped.study)).toBe(false);

    const { deliverPhonePack } = await import("./pack-deliver");
    const keys = await generateOperatorKeyPair();
    const http = {
      async request() {
        throw new Error("must not send");
      },
    };
    expect(await deliverPhonePack({ state: enrolled!, operatorPublicRaw: keys.publicRaw, http })).toEqual({
      status: "skipped",
    });
    expect(await deliverPhonePack({ state: bumped, operatorPublicRaw: keys.publicRaw, http })).toEqual({
      status: "skipped",
    });
  });

  it("the consent record never enters a pack", async () => {
    const invite = await generateInvite("Ada West", "friend");
    const joined = await joinWithConsent(withProfile(), invite.code, true);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const pack = buildStudyPack(joined.state);
    const blob = JSON.stringify(pack);
    expect(blob).not.toContain("consentVersion");
    expect(blob).not.toContain("consentedAt");
    expect(JSON.stringify(persistableState(joined.state))).toContain(`"consentVersion":${CONSENT_VERSION}`);
  });
});

describe("age gate and not now", () => {
  it("joining is impossible without the box; an intake age under 18 blocks it even with the box ticked", () => {
    expect(joinConsentGate(false, 34)).toBe("box");
    expect(joinConsentGate(true, 16)).toBe("age");
    expect(joinConsentGate(true, 34)).toBeNull();
    expect(acceptExistingConsent(withProfile(16), true)).toEqual({ ok: false, reason: "age" });
    expect(acceptExistingConsent(withProfile(), false)).toEqual({ ok: false, reason: "box" });
  });

  it("a refusal and a Not now store nothing and send nothing", async () => {
    const invite = await generateInvite("Ada West", "friend");
    const before = persistableState(withProfile(16));
    const refused = await joinWithConsent(withProfile(16), invite.code, true);
    expect(refused).toEqual({ ok: false, reason: "age" });
    expect(persistableState(withProfile(16))).toEqual(before);
    const skipped = persistableState(withProfile());
    expect(skipped).toEqual(persistableState(withProfile()));
    expect(AGE_REFUSAL).toBe("Somnadia's test is for adults. You can still keep your diary for yourself.");
  });
});

describe("consent screen copy", () => {
  it("the consent screen contains the 988 tel link and the leave path, verbatim", () => {
    const src = readFileSync("src/components/consent-screen.tsx", "utf8");
    expect(src).toContain(CONSENT_CRISIS_HREF);
    expect(src).toContain("tel:988");
    expect(src).toContain(CONSENT_LEAVE_PATH);
    expect(src).toContain("You → Leave the study");
    expect(CONSENT_LEAVE_UNINSTALL).toBe(
      "If you delete Somnadia without leaving first, email James and he'll delete your nights.",
    );
    expect(src).toContain("CONSENT_LEAVE_UNINSTALL");
    expect(src).toContain(CONSENT_EMAIL);
    expect(src).toContain("Join the test");
    expect(src).toContain("Not now");
    expect(src).toContain("I&apos;m 18 or older");
    expect(src).toContain("disabled={!eighteen || busy}");
  });

  it("the Leaving section tells testers to email James if they delete the app without leaving", () => {
    expect(CONSENT_LEAVE_UNINSTALL).toBe(
      "If you delete Somnadia without leaving first, email James and he'll delete your nights.",
    );
    const src = readFileSync("src/components/consent-screen.tsx", "utf8");
    expect(src).toContain("Your diary stays on\n        your phone. {CONSENT_LEAVE_UNINSTALL}");
  });
});

describe("delete all study data", () => {
  it("delete-all removes packs, rejects and the book, keeps the key pair, and does nothing without the typed confirmation", async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-erase-"));
    try {
      const invite = await generateInvite("Ada West", "friend");
      saveInviteBook([invite], inbox);
      writeFileSync(path.join(inbox, "study-aaaaaaaa-2026.json"), "{\"schema\":\"circadia-study-v1\"}", {
        encoding: "utf8",
      });
      recordRejectedPack({ reason: "Invalid night clocks.", arrivedAt: "2026-09-01T12:00:00.000Z" }, inbox);
      writeFileSync(operatorPrivatePath(inbox), "{\"kty\":\"EC\"}", { encoding: "utf8" });
      writeFileSync(operatorPublicPath(inbox), "cHVibGlj", { encoding: "utf8" });
      expect(deleteAllStudyData("nope", inbox)).toEqual({ ok: false });
      expect(readdirSync(inbox).some((n) => n.startsWith("study-"))).toBe(true);
      expect(loadInviteBook(inbox)).toHaveLength(1);
      expect(loadRejectedPacks(inbox)).toHaveLength(1);
      expect(deleteAllStudyData(DELETE_STUDY_CONFIRM, inbox)).toEqual({ ok: true });
      expect(readdirSync(inbox).filter((n) => n.endsWith(".json"))).toEqual([]);
      expect(loadInviteBook(inbox)).toEqual([]);
      expect(loadRejectedPacks(inbox)).toEqual([]);
      expect(existsSync(operatorPrivatePath(inbox))).toBe(true);
      expect(existsSync(operatorPublicPath(inbox))).toBe(true);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });

  it("delete this tester's nights removes only that participant's packs, and does nothing without the typed confirmation", async () => {
    const inbox = mkdtempSync(path.join(tmpdir(), "circadia-nights-"));
    try {
      const ada = await generateInvite("Ada West", "friend");
      const bea = await generateInvite("Bea Cole", "friend");
      saveInviteBook([ada, bea], inbox);
      const adaPack = writeInboxPack(
        buildStudyPack({
          ...withProfile(),
          study: { ...emptyState().study, asked: true, consented: true, participantId: ada.participantId },
        }),
        new Date("2026-09-01T12:00:00.000Z"),
        inbox,
      );
      const beaPack = writeInboxPack(
        buildStudyPack({
          ...withProfile(),
          study: { ...emptyState().study, asked: true, consented: true, participantId: bea.participantId },
        }),
        new Date("2026-09-01T13:00:00.000Z"),
        inbox,
      );
      writeFileSync(operatorPrivatePath(inbox), "{\"kty\":\"EC\"}", { encoding: "utf8" });
      writeFileSync(operatorPublicPath(inbox), "cHVibGlj", { encoding: "utf8" });
      expect(deleteTesterNights(ada.participantId, "nope", inbox)).toEqual({ ok: false });
      expect(readdirSync(inbox)).toEqual(expect.arrayContaining([adaPack, beaPack]));
      expect(loadInviteBook(inbox)).toHaveLength(2);
      expect(loadWithdrawn(inbox)[ada.participantId.toLowerCase()]).toBeUndefined();
      const week = readFileSync("src/app/mod/page.tsx", "utf8");
      const testers = readFileSync("src/app/mod/testers/page.tsx", "utf8");
      const control = readFileSync("src/components/delete-tester-nights.tsx", "utf8");
      expect(week).toContain("<DeleteTesterNights");
      expect(testers).toContain("<DeleteTesterNights");
      expect(control).toContain("Delete this tester&apos;s nights");
      expect(control).toContain("DELETE_TESTER_NIGHTS_CONFIRM");
      const gone = deleteTesterNights(ada.participantId, DELETE_TESTER_NIGHTS_CONFIRM, inbox);
      expect(gone).toEqual({ ok: true, removed: [adaPack] });
      expect(readdirSync(inbox)).not.toContain(adaPack);
      expect(readdirSync(inbox)).toContain(beaPack);
      expect(loadInviteBook(inbox)).toHaveLength(2);
      expect(loadWithdrawn(inbox)[ada.participantId.toLowerCase()]).toBe(true);
      expect(existsSync(operatorPrivatePath(inbox))).toBe(true);
      expect(existsSync(operatorPublicPath(inbox))).toBe(true);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
    }
  });
});
