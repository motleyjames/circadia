import { describe, expect, it } from "vitest";
import { sampleWeekState } from "./demo";
import {
  NEVER_AUTO_IDS,
  latestMorningReport,
  suggestMorningReading,
  suggestMorningReadingForLogs,
} from "./morning-reading";
import { researchById } from "./research";
import { emptyState } from "./storage";
import type { MorningReport, Profile } from "./types";

const BAN = /aasm|cbt-i|\bscn\b/i;
const BOTTLE_PUSH = /take melatonin|try melatonin|start melatonin|take more melatonin|stop taking/i;
const IRRELEVANT = new Set<string>(NEVER_AUTO_IDS);

const profile: Profile = {
  firstName: "James",
  lastName: "",
  name: "James",
  age: 19,
  sex: "male",
  heightCm: 180,
  weightKg: 75,
  activity: "light",
  medications: [],
  supplements: [],
  struggles: ["falling", "staying"],
  targetSleep: "23:30",
  targetWake: "07:30",
  units: "imperial",
  notificationsEnabled: false,
  onboardingComplete: true,
  email: "",
  phone: "",
};

function report(partial: Partial<MorningReport> & Pick<MorningReport, "morningDate">): MorningReport {
  return {
    id: partial.morningDate,
    wokeAt: "07:30",
    fellAsleepAt: "23:40",
    rating: 4,
    drank: false,
    screenOffMinutes: 60,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "yes",
    createdAt: "2026-08-28T12:00:00.000Z",
    ...partial,
  };
}

function mouth(reading: ReturnType<typeof suggestMorningReading>): string {
  return [reading.kicker, reading.title, reading.why, reading.note].join("\n");
}

describe("morning reading", () => {
  it("hands the alcohol note after a drink night, not Unisom or pregnancy", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-28",
        drank: true,
        drinkCount: 4,
        spins: true,
        rating: 1,
        sleepLatencyMinutes: 50,
        usedSupplement: true,
        supplementKind: "antihistamine",
      }),
    );
    expect(reading.articleId).toBe("alcohol");
    expect(reading.why).toMatch(/Aug 28/);
    expect(reading.why).toMatch(/drinks/);
    expect(reading.why).toMatch(/spins/);
    expect(reading.why).toMatch(/1\/5/);
    expect(reading.note).toBe(researchById("alcohol")?.say);
    expect(IRRELEVANT.has(reading.articleId)).toBe(false);
    expect(reading.articleId).not.toBe("otc-antihistamines");
    expect(reading.articleId).not.toBe("pregnancy-sleep");
  });

  it("hands sleep pressure after a dry high-latency night, not alcohol", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-27",
        drank: false,
        sleepLatencyMinutes: 50,
        screenOffMinutes: 60,
      }),
    );
    expect(reading.articleId).toBe("sleep-pressure");
    expect(reading.why).toMatch(/50 minutes/);
    expect(reading.why).not.toMatch(/drink/i);
    expect(reading.articleId).not.toBe("alcohol");
  });

  it("hands the clock note after a clean night, not melatonin", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-26",
        rating: 4,
        wokeAt: "07:10",
        drank: false,
        usedSupplement: false,
        sleepLatencyMinutes: 15,
        screenOffMinutes: 45,
        windDownHelped: "yes",
      }),
    );
    expect(reading.articleId).toBe("circadian-anchor");
    expect(reading.why).toMatch(/7:10 am/);
    expect(reading.articleId).not.toBe("melatonin");
    expect(mouth(reading)).not.toMatch(BOTTLE_PUSH);
  });

  it("hands the aisle-antihistamine note when Unisom was the night's bottle", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-25",
        usedSupplement: true,
        supplementKind: "antihistamine",
      }),
    );
    expect(reading.articleId).toBe("otc-antihistamines");
    expect(reading.why).toMatch(/aisle sleep aid/);
  });

  it("educates on melatonin only when that night used it — never as a first-line push", () => {
    const used = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-24",
        usedSupplement: true,
        supplementKind: "melatonin",
      }),
    );
    expect(used.articleId).toBe("melatonin");
    expect(used.why).toMatch(/clock signal/);
    expect(mouth(used)).not.toMatch(BOTTLE_PUSH);

    const unused = suggestMorningReading(profile, report({ morningDate: "2026-08-24" }));
    expect(unused.articleId).not.toBe("melatonin");
  });

  it("pins magnesium only on an otherwise quiet night that used it", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-23",
        usedSupplement: true,
        supplementKind: "magnesium",
      }),
    );
    expect(reading.articleId).toBe("magnesium");
    expect(reading.note).toBe(researchById("magnesium")?.say ?? researchById("magnesium")?.summary);
  });

  it("names a stimulant on file when latency is long, and never tells you to stop it", () => {
    const reading = suggestMorningReading(
      { ...profile, medications: ["Adderall"] },
      report({ morningDate: "2026-08-22", sleepLatencyMinutes: 50 }),
    );
    expect(reading.articleId).toBe("medications");
    expect(reading.why).toMatch(/stimulant-class/);
    expect(reading.why).toMatch(/prescriber/);
    expect(mouth(reading)).not.toMatch(/stop taking/i);
  });

  it("hands screens when the phone was in bed and latency was not the louder fact", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-21",
        screenOffMinutes: 0,
        sleepLatencyMinutes: 15,
      }),
    );
    expect(reading.articleId).toBe("light-screens");
    expect(reading.why).toMatch(/phone was still in bed/);
  });

  it("hands sleep debt after a short night, not a late-wake lecture", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-20",
        fellAsleepAt: "03:00",
        wokeAt: "07:00",
        sleepLatencyMinutes: 15,
        screenOffMinutes: 60,
      }),
    );
    expect(reading.articleId).toBe("sleep-debt");
    expect(reading.why).toMatch(/Aug 20/);
  });

  it("protects a late get-up with the clock note, not naps-as-lifestyle", () => {
    const reading = suggestMorningReading(
      profile,
      report({
        morningDate: "2026-08-19",
        wokeAt: "11:20",
        fellAsleepAt: "02:10",
        sleepLatencyMinutes: 15,
        screenOffMinutes: 60,
        rating: 3,
      }),
    );
    expect(reading.articleId).toBe("circadian-anchor");
    expect(reading.why).toMatch(/11:20 am/);
    expect(reading.articleId).not.toBe("naps");
  });

  it("does not diagnose apnea from placeholder body numbers", () => {
    const reading = suggestMorningReading(
      { ...profile, heightCm: 175, weightKg: 70 },
      report({
        morningDate: "2026-08-18",
        rating: 1,
        fellAsleepAt: "22:00",
        wokeAt: "07:30",
      }),
    );
    expect(reading.articleId).not.toBe("bmi-osa");
  });

  it("mentions airway only when measured BMI, a long night, and a wrecked rating line up", () => {
    const reading = suggestMorningReading(
      { ...profile, heightCm: 178, weightKg: 110 },
      report({
        morningDate: "2026-08-17",
        rating: 1,
        fellAsleepAt: "22:00",
        wokeAt: "07:30",
        sleepLatencyMinutes: 15,
        screenOffMinutes: 60,
      }),
    );
    expect(reading.articleId).toBe("bmi-osa");
    expect(reading.why).toMatch(/clinician/);
  });

  it("is deterministic for the same morning — no rotation for variety", () => {
    const night = report({ morningDate: "2026-08-16", drank: true, drinkCount: 2 });
    expect(suggestMorningReading(profile, night).articleId).toBe(
      suggestMorningReading(profile, night).articleId,
    );
  });

  it("reads the latest morning from the log, not the first", () => {
    const older = report({ morningDate: "2026-08-10", drank: true, spins: true, rating: 1 });
    const newer = report({ morningDate: "2026-08-28", rating: 4, wokeAt: "07:28" });
    expect(latestMorningReport([newer, older])?.morningDate).toBe("2026-08-28");
    const reading = suggestMorningReadingForLogs(profile, [newer, older]);
    expect(reading?.articleId).toBe("circadian-anchor");
  });

  it("returns nothing until a morning exists", () => {
    expect(suggestMorningReadingForLogs(profile, [])).toBeNull();
  });

  it("pins the clock note on the sample week's latest morning", () => {
    const sample = sampleWeekState(emptyState());
    const reading = suggestMorningReadingForLogs(sample.profile ?? profile, sample.reports);
    expect(reading?.articleId).toBe("circadian-anchor");
  });

  it("keeps the mouth free of engine jargon and never quotes the library body", () => {
    const nights: MorningReport[] = [
      report({ morningDate: "2026-08-28", drank: true, drinkCount: 3, spins: true, rating: 1 }),
      report({ morningDate: "2026-08-27", sleepLatencyMinutes: 75 }),
      report({ morningDate: "2026-08-26" }),
      report({
        morningDate: "2026-08-25",
        usedSupplement: true,
        supplementKind: "antihistamine",
      }),
      report({ morningDate: "2026-08-24", usedSupplement: true, supplementKind: "melatonin" }),
      report({ morningDate: "2026-08-23", screenOffMinutes: 0 }),
      report({
        morningDate: "2026-08-22",
        dream: { text: "Late to an exam.", wantMeaning: true },
      }),
    ];
    for (const night of nights) {
      const reading = suggestMorningReading(profile, night);
      expect(mouth(reading), reading.articleId).not.toMatch(BAN);
      expect(mouth(reading), reading.articleId).not.toMatch(BOTTLE_PUSH);
      expect(IRRELEVANT.has(reading.articleId), reading.articleId).toBe(false);
      const article = researchById(reading.articleId);
      expect(reading.note).toBe(article?.say ?? article?.summary);
      expect(reading.note).not.toBe(article?.body);
    }
  });
});
