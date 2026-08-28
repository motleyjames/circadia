import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sampleWeekState } from "./demo";
import { emptyState } from "./storage";
import type { MorningReport, Profile } from "./types";
import { buildWeekReview, formatMorningDate, weekReviewMouth } from "./week-review";

const BAN = /aasm|cbt-i|\bscn\b/i;
const BOTTLE_LEAD = /take melatonin|try melatonin|start melatonin|magnesium glycinate/i;
const ROBOT = /on the board|close a case|restedness averaged|loudest signal|i will not overclaim|against the \d[–-]\d hours/i;
const DATE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/;

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
    windDownHelped: "did_not_use",
    createdAt: "2026-01-01T12:00:00.000Z",
    ...partial,
  };
}

function mouthOf(reports: MorningReport[], p: Profile = profile): string {
  return weekReviewMouth(buildWeekReview(p, reports));
}

describe("week review", () => {
  it("formats a morning as a calendar date, not a machine stamp", () => {
    expect(formatMorningDate("2026-08-27")).toBe("Aug 27");
    expect(formatMorningDate("2026-01-01")).toBe("Jan 1");
  });

  it("returns an empty review when there are no mornings", () => {
    const review = buildWeekReview(profile, []);
    expect(review.nightsLogged).toBe(0);
    expect(review.read).toBe("");
    expect(review.doThis).toEqual([]);
  });

  it("reads a messy drink week: dated better/worse nights, dry-night advice, no jargon", () => {
    const reports = [
      report({
        morningDate: "2026-01-01",
        wokeAt: "09:10",
        fellAsleepAt: "01:40",
        rating: 2,
        drank: true,
        drinkCount: 4,
        spins: true,
        screenOffMinutes: 0,
        sleepLatencyMinutes: 50,
        wokeInNight: true,
        nightWakingMinutes: 45,
      }),
      report({
        morningDate: "2026-01-02",
        wokeAt: "08:05",
        fellAsleepAt: "00:50",
        rating: 3,
        screenOffMinutes: 15,
        sleepLatencyMinutes: 50,
      }),
      report({
        morningDate: "2026-01-03",
        wokeAt: "07:40",
        fellAsleepAt: "00:20",
        rating: 3,
        screenOffMinutes: 30,
        sleepLatencyMinutes: 30,
        wokeInNight: true,
        nightWakingMinutes: 25,
        windDownHelped: "a_bit",
      }),
      report({
        morningDate: "2026-01-04",
        wokeAt: "07:35",
        fellAsleepAt: "23:55",
        rating: 4,
        screenOffMinutes: 60,
        sleepLatencyMinutes: 15,
        windDownHelped: "yes",
      }),
      report({
        morningDate: "2026-01-05",
        wokeAt: "11:20",
        fellAsleepAt: "02:10",
        rating: 2,
        drank: true,
        drinkCount: 3,
        screenOffMinutes: 0,
        sleepLatencyMinutes: 30,
        wokeInNight: true,
        nightWakingMinutes: 45,
      }),
      report({
        morningDate: "2026-01-06",
        wokeAt: "07:30",
        fellAsleepAt: "23:45",
        rating: 4,
        screenOffMinutes: 60,
        sleepLatencyMinutes: 15,
        windDownHelped: "yes",
      }),
      report({
        morningDate: "2026-01-07",
        wokeAt: "07:28",
        fellAsleepAt: "23:40",
        rating: 4,
        screenOffMinutes: 45,
        sleepLatencyMinutes: 15,
        windDownHelped: "yes",
      }),
    ];
    const review = buildWeekReview(profile, reports);
    expect(review.nightsLogged).toBe(7);
    expect(review.sketch).toBe(false);
    expect(review.read).toMatch(/Jan 4/);
    expect(review.read).toMatch(/Jan 1/);
    expect(review.read).toMatch(/Jan 5/);
    expect(review.read).toMatch(/drinks/i);
    expect(review.hurt.join(" ")).toMatch(/Jan 1/);
    expect(review.hurt.join(" ")).toMatch(/Jan 5/);
    expect(review.hurt.join(" ")).toMatch(/drinks/i);
    expect(review.worked[0]).toBe("Jan 4, Jan 6, and Jan 7 — 4/5, no drinks, wind-down.");
    expect(review.hurt[0]).toBe("Jan 1 and Jan 5 — 2/5, drinks, slow to fall asleep.");
    expect(review.doThis[0]).toMatch(/dry/i);
    expect(review.doThis.join(" ")).not.toMatch(BOTTLE_LEAD);
    expect(weekReviewMouth(review)).not.toMatch(BAN);
    expect(weekReviewMouth(review)).not.toMatch(ROBOT);
    if (review.hurt[0]) expect(review.read).not.toContain(review.hurt[0]);
  });

  it("reads a clean week as dated and steady, not a bottle pitch", () => {
    const reports = [1, 2, 3, 4, 5, 6, 7].map((d) =>
      report({
        morningDate: `2026-01-0${d}`,
        wokeAt: "07:30",
        fellAsleepAt: "23:35",
        rating: 4,
        screenOffMinutes: 60,
        sleepLatencyMinutes: 15,
        windDownHelped: "yes",
      }),
    );
    const review = buildWeekReview(profile, reports);
    expect(review.sketch).toBe(false);
    expect(review.hurt.join(" ")).not.toMatch(/drinks/i);
    expect(review.worked.length).toBeGreaterThan(0);
    expect(review.worked.join(" ")).toMatch(DATE);
    expect(review.doThis.join(" ")).toMatch(/repeat|keep going|wind-down/i);
    expect(review.doThis.join(" ")).not.toMatch(BOTTLE_LEAD);
    expect(weekReviewMouth(review)).not.toMatch(BAN);
    expect(weekReviewMouth(review)).not.toMatch(ROBOT);
  });

  it("treats one morning as a dated snapshot", () => {
    const review = buildWeekReview(profile, [
      report({
        morningDate: "2026-01-01",
        rating: 2,
        drank: true,
        drinkCount: 4,
        spins: true,
        screenOffMinutes: 0,
        sleepLatencyMinutes: 50,
        wokeAt: "10:40",
        fellAsleepAt: "02:10",
      }),
    ]);
    expect(review.nightsLogged).toBe(1);
    expect(review.sketch).toBe(true);
    expect(review.headline).toMatch(/one morning/i);
    expect(review.read).toMatch(/Jan 1/);
    expect(review.read).toMatch(/snapshot/i);
    expect(review.hurt.join(" ") + review.doThis.join(" ")).toMatch(/dry/i);
    expect(weekReviewMouth(review)).not.toMatch(BAN);
    expect(weekReviewMouth(review)).not.toMatch(BOTTLE_LEAD);
    expect(weekReviewMouth(review)).not.toMatch(ROBOT);
  });

  it("names both dates when two rough mornings look the same", () => {
    const review = buildWeekReview(profile, [
      report({
        morningDate: "2026-08-27",
        wokeAt: "09:00",
        fellAsleepAt: "00:30",
        rating: 2,
        sleepLatencyMinutes: 50,
        screenOffMinutes: 0,
      }),
      report({
        morningDate: "2026-08-28",
        wokeAt: "09:10",
        fellAsleepAt: "00:40",
        rating: 2,
        sleepLatencyMinutes: 75,
        screenOffMinutes: 15,
      }),
    ]);
    expect(review.headline).toMatch(/early look/i);
    expect(review.read).toMatch(/Aug 27/);
    expect(review.read).toMatch(/Aug 28/);
    expect(review.read).toMatch(/fall asleep/i);
    expect(review.hurt[0]).toBe("Aug 27 and Aug 28 — about 63 minutes to fall asleep.");
    if (review.hurt[0]) expect(review.read).not.toContain(review.hurt[0]);
    expect(weekReviewMouth(review)).not.toMatch(ROBOT);
    expect(review.doThis[0]).toMatch(/get out of bed/i);
  });

  it("uses only the last seven mornings when more are logged", () => {
    const old = report({
      morningDate: "2025-12-20",
      rating: 1,
      drank: true,
      drinkCount: 5,
      spins: true,
      screenOffMinutes: 0,
      sleepLatencyMinutes: 75,
    });
    const clean = [1, 2, 3, 4, 5, 6, 7].map((d) =>
      report({
        morningDate: `2026-01-0${d}`,
        rating: 4,
        screenOffMinutes: 60,
        sleepLatencyMinutes: 15,
        windDownHelped: "yes",
      }),
    );
    const review = buildWeekReview(profile, [old, ...clean]);
    expect(review.nightsLogged).toBe(7);
    expect(review.hurt.join(" ")).not.toMatch(/drinks/i);
  });

  it("names a listed stimulant without telling anyone to stop it", () => {
    const onStim = { ...profile, medications: ["Adderall"] };
    const review = buildWeekReview(onStim, [
      report({ morningDate: "2026-01-01" }),
      report({ morningDate: "2026-01-02" }),
    ]);
    expect(review.hurt.join(" ")).toMatch(/adderall/i);
    expect(weekReviewMouth(review).toLowerCase()).not.toMatch(/stop taking|stop the drug/);
    expect(review.hurt.join(" ")).toMatch(/will not tell you to stop/i);
  });

  it("reads the labeled sample student week as good / bad / advice", () => {
    const state = sampleWeekState(emptyState());
    const review = buildWeekReview(state.profile ?? profile, state.reports);
    expect(review.nightsLogged).toBe(7);
    expect(review.hurt.join(" ")).toMatch(/drinks/i);
    expect(review.worked.join(" ")).toMatch(/wind-down/i);
    expect(review.doThis[0]).toMatch(/dry/i);
    expect(weekReviewMouth(review)).not.toMatch(BAN);
    expect(review.read).toMatch(DATE);
    expect(review.hurt.join(" ")).toMatch(DATE);
    expect(weekReviewMouth(review)).not.toMatch(ROBOT);
  });

  it("keeps the Notes page a week read, not a melatonin gate", () => {
    const src = readFileSync("src/components/insights-view.tsx", "utf8");
    expect(src).toContain("buildWeekReview");
    expect(src).not.toContain("After enough data");
    expect(src).not.toContain("Melatonin / magnesium talk");
    expect(src).not.toContain("buildRecommendations");
  });

  it("never puts jargon in any fixture mouth", () => {
    const mouths = [
      mouthOf([]),
      mouthOf([report({ morningDate: "2026-01-01", rating: 2 })]),
      mouthOf(
        [1, 2, 3, 4, 5, 6, 7].map((d) =>
          report({ morningDate: `2026-01-0${d}`, rating: 3, drank: d % 2 === 0 }),
        ),
      ),
    ];
    for (const text of mouths) {
      expect(text).not.toMatch(BAN);
      expect(text).not.toMatch(ROBOT);
    }
  });
});
