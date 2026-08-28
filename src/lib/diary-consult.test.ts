import { describe, expect, it } from "vitest";
import { answerQuestion, makeChatMessage } from "./chat";
import { answerDiaryQuestion, parseDiaryAsk } from "./diary-consult";
import type { MorningReport, Profile } from "./types";

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
    wokeAt: "09:10",
    fellAsleepAt: "00:40",
    rating: 2,
    drank: false,
    screenOffMinutes: 15,
    sleepLatencyMinutes: 75,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: "2026-08-28T12:00:00.000Z",
    ...partial,
  };
}

const nights = [
  report({
    morningDate: "2026-08-27",
    wokeAt: "09:00",
    fellAsleepAt: "00:30",
    rating: 3,
    sleepLatencyMinutes: 50,
    screenOffMinutes: 60,
  }),
  report({
    morningDate: "2026-08-28",
    rating: 1,
    sleepLatencyMinutes: 75,
    screenOffMinutes: 0,
  }),
];

describe("diary consult", () => {
  it("parses month names, ordinals, and last-night walk-throughs", () => {
    expect(parseDiaryAsk("deeper breakdown of my sleep on august 28", nights)?.kind).toBe("night");
    expect(parseDiaryAsk("walk me through last night", nights)?.kind).toBe("night");
    expect(parseDiaryAsk("how did I sleep this week", nights)?.kind).toBe("week");
    expect(parseDiaryAsk("who won the game last night", nights)).toBeNull();
  });

  it("answers a dated breakdown from the log, not a withhold", () => {
    const reply = answerQuestion(
      "can i get a deeper breakdown of my sleep on august 28",
      profile,
      nights,
    );
    expect(reply.text).toMatch(/Aug 28/);
    expect(reply.text).toMatch(/1\/5/);
    expect(reply.text).toMatch(/75 minutes/);
    expect(reply.text).toMatch(/Phone in bed|falling-asleep/i);
    expect(reply.text).toMatch(/Aug 27/);
    expect(reply.text.toLowerCase()).not.toMatch(/solid note/);
    expect(reply.citations.length).toBeGreaterThan(0);
    expect(reply.text.toLowerCase()).not.toMatch(/aasm|cbt-i|\bscn\b/);
  });

  it("names the nights on the chart when that date is missing", () => {
    const reply = answerDiaryQuestion("breakdown of august 3", profile, nights);
    expect(reply?.text).toMatch(/do not have a morning for Aug 3/i);
    expect(reply?.text).toMatch(/Aug 27/);
    expect(reply?.text).toMatch(/Aug 28/);
    expect(reply?.text.toLowerCase()).not.toMatch(/solid note/);
  });

  it("folds what about the 27th onto the last night question", () => {
    const first = answerQuestion("deeper breakdown of my sleep on august 28", profile, nights);
    const history = [
      makeChatMessage("you", "deeper breakdown of my sleep on august 28"),
      makeChatMessage("circadia", first.text, first.citations),
    ];
    const reply = answerQuestion("what about the 27th", profile, nights, history);
    expect(reply.text).toMatch(/Aug 27/);
    expect(reply.text).toMatch(/3\/5/);
    expect(reply.text.toLowerCase()).not.toMatch(/solid note/);
  });

  it("does not steal Unisom or a sports withhold", () => {
    expect(answerQuestion("tell me about unisom", profile, nights).citations).toContain("otc-antihistamines");
    expect(answerQuestion("who won the game last night", profile, nights).text.toLowerCase()).toMatch(
      /solid note/,
    );
  });

  it("returns null when the chart is empty so the corpus still withholds", () => {
    expect(answerDiaryQuestion("walk me through last night", profile, [])).toBeNull();
  });
});
