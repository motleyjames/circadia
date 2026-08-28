import { describe, expect, it } from "vitest";
import { buildSleepNotes } from "./advisor";
import { answerQuestion } from "./chat";
import { readDream } from "./dreams";
import { buildRecommendations, NIGHTS_NEEDED } from "./recommendations";
import type { MorningReport, Profile } from "./types";

const profile: Profile = {
  firstName: "James",
  lastName: "",
  name: "James",
  age: 19,
  sex: "male",
  heightCm: 180,
  weightKg: 75,
  activity: "sedentary",
  medications: ["Adderall"],
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

describe("advisor", () => {
  it("starts with schedule guidance when there are no nights", () => {
    const notes = buildSleepNotes(profile, []);
    expect(notes.some((n) => n.id === "empty")).toBe(true);
    expect(notes.some((n) => n.id === "struggle-fall")).toBe(true);
  });

  it("flags alcohol when drinks line up with poor nights", () => {
    const notes = buildSleepNotes(profile, [
      report({
        morningDate: "2026-01-01",
        drank: true,
        drinkCount: 4,
        spins: true,
        rating: 2,
        wokeInNight: true,
      }),
      report({ morningDate: "2026-01-02", rating: 3, drank: true, drinkCount: 2 }),
    ]);
    expect(notes.some((n) => n.id === "alcohol")).toBe(true);
  });

  it("flags wake-time drift", () => {
    const notes = buildSleepNotes(profile, [
      report({ morningDate: "2026-01-01", wokeAt: "07:00" }),
      report({ morningDate: "2026-01-02", wokeAt: "11:30" }),
      report({ morningDate: "2026-01-03", wokeAt: "06:45" }),
    ]);
    expect(notes.some((n) => n.id === "wake-spread")).toBe(true);
  });

  it("flags stimulant medications from the profile", () => {
    const notes = buildSleepNotes(profile, [report({ morningDate: "2026-01-01" })]);
    expect(notes.some((n) => n.id.startsWith("med-"))).toBe(true);
  });

  it("says the stretch is steady when nights are clean", () => {
    const nights = [1, 2, 3, 4, 5].map((d) =>
      report({
        morningDate: `2026-01-0${d}`,
        rating: 4,
        wokeAt: "07:30",
        fellAsleepAt: "23:35",
        screenOffMinutes: 60,
        sleepLatencyMinutes: 15,
      }),
    );
    const notes = buildSleepNotes({ ...profile, activity: "moderate", medications: [] }, nights);
    expect(notes.some((n) => n.kind === "steady")).toBe(true);
    expect(notes.some((n) => n.id === "alcohol")).toBe(false);
  });
});

describe("recommendations", () => {
  it("withholds supplement recs until a week of logs", () => {
    const rec = buildRecommendations(profile, [report({ morningDate: "2026-01-01" })]);
    expect(rec.ready).toBe(false);
    expect(rec.nightsNeeded).toBe(NIGHTS_NEEDED);
    expect(rec.supplements).toHaveLength(0);
    expect(rec.suggestedSessions.length).toBeGreaterThan(0);
  });

  it("refuses melatonin when two drinking nights look like a delayed clock", () => {
    const nights = Array.from({ length: 7 }, (_, i) =>
      report({
        morningDate: `2026-01-${String(i + 1).padStart(2, "0")}`,
        fellAsleepAt: "00:30",
        wokeAt: "08:00",
        screenOffMinutes: 60,
        sleepLatencyMinutes: 15,
        rating: 3,
        drank: i < 2,
        drinkCount: i < 2 ? 3 : undefined,
        spins: i === 0,
      }),
    );
    const rec = buildRecommendations(profile, nights);
    expect(rec.ready).toBe(true);
    expect(rec.supplements.some((s) => s.id === "melatonin")).toBe(false);
    expect(rec.supplements[0]?.id).toBe("none");
  });
});

describe("chat and dreams", () => {
  it("answers melatonin from the library without inventing a dose stack", () => {
    const reply = answerQuestion("should I take melatonin?", profile, []);
    expect(reply.citations).toContain("melatonin");
    expect(reply.text.toLowerCase()).toMatch(/clock|sleeping pill/);
    expect(reply.text.toLowerCase()).not.toMatch(/aasm|cbt-i/);
    expect(reply.text.toLowerCase()).not.toMatch(/10 mg at lights-out is fine/);
  });

  it("treats sleeping in as clock training, with a safety exception", () => {
    const reply = answerQuestion("should I sleep in tomorrow?", profile, []);
    expect(reply.citations).toContain("naps");
    expect(reply.text.toLowerCase()).toMatch(/wake time|20 min/);
    expect(reply.text.toLowerCase()).toMatch(/drive/);
    expect(reply.text.toLowerCase()).not.toMatch(/aasm|cbt-i/);
  });

  it("explains 3am wakings with getting out of bed, not a heavier pill", () => {
    const reply = answerQuestion(
      "I keep waking at 3",
      profile,
      [report({ morningDate: "2026-01-02", wokeInNight: true, drank: true, drinkCount: 3, rating: 2 })],
    );
    expect(reply.text.toLowerCase()).toMatch(/20 minutes|alcohol/);
    expect(reply.text.toLowerCase()).not.toMatch(/aasm|cbt-i/);
  });

  it("names Adderall as a timing problem, never a stop-the-drug order", () => {
    const reply = answerQuestion("is my Adderall wrecking sleep?", profile, []);
    expect(reply.citations).toContain("medications");
    expect(reply.text.toLowerCase()).toMatch(/adderall/);
    expect(reply.text.toLowerCase()).not.toMatch(/stop taking/);
  });

  it("answers Unisom as an aisle antihistamine, not an empty-diary recap", () => {
    const reply = answerQuestion("tell me about unisom", profile, []);
    expect(reply.citations).toContain("otc-antihistamines");
    expect(reply.text.toLowerCase()).toMatch(/doxylamine|allergy/);
    expect(reply.text.toLowerCase()).not.toMatch(/empty diary|need band|aasm|cbt-i/);
  });

  it("names Quviviq and Dayvigo as prescription sleep drugs without a start/stop order", () => {
    const reply = answerQuestion("what is Quviviq", profile, []);
    expect(reply.citations).toContain("prescription-hypnotics");
    expect(reply.text).toMatch(/Dayvigo|Belsomra|Quviviq/);
    expect(reply.text.toLowerCase()).toMatch(/never tell you to start/);
    expect(reply.text.toLowerCase()).not.toMatch(/aasm|cbt-i|\bscn\b|stop taking/);
  });

  it("does not dump the chart when it does not know the topic", () => {
    const reply = answerQuestion("what is the weather in boulder", profile, []);
    expect(reply.text.toLowerCase()).toMatch(/don.?t have a solid note/);
    expect(reply.text.toLowerCase()).not.toMatch(/empty diary|need band/);
  });

  it("reads a dream through alcohol physiology when drinks were logged", () => {
    const night = report({
      morningDate: "2026-01-02",
      drank: true,
      drinkCount: 4,
      spins: true,
      dream: { text: "Hallway flooded, late to the exam, spinning", wantMeaning: true },
    });
    const read = readDream(night.dream!.text, night, profile);
    expect(read.physiology.toLowerCase()).toMatch(/alcohol|rem|spin/);
    expect(read.caution.toLowerCase()).toMatch(/fortune|dictionary|meaning/);
  });
});
