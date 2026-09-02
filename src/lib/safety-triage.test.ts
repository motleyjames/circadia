import { describe, expect, it } from "vitest";
import { answerQuestion, isWithhold } from "@/lib/chat";
import { DEFAULT_SCHEDULED_DAYS } from "@/lib/schedule";
import { CRISIS_LIFELINE_NUMBER } from "@/lib/safety-copy";
import type { Profile } from "@/lib/types";

const adult: Profile = {
  firstName: "A", lastName: "", name: "A", age: 34, sex: "female",
  heightCm: 170, weightKg: 68, activity: "moderate",
  medications: [], supplements: [], struggles: ["falling", "staying"],
  targetSleep: "23:00", targetWake: "07:00", units: "imperial",
  notificationsEnabled: false, onboardingComplete: true, email: "", phone: "",
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
};
const teen: Profile = { ...adult, age: 15 };

const ask = (q: string, profile: Profile = adult) => answerQuestion(q, profile, []).text.toLowerCase();

/**
 * Every case here was verified against the shipped engine before the fix and got
 * the wrong answer. The topic ladder matches on sleep words, and the most urgent
 * things people type contain those same words.
 */
describe("safety triage runs before the topic ladder", () => {
  it("answers suicidal ideation with the lifeline, not a menu of sleep topics", () => {
    for (const q of [
      "I want to kill myself I haven't slept in days",
      "I want to die",
      "honestly I am thinking about ending it",
      "life is not worth living without sleep",
    ]) {
      const text = ask(q);
      expect(text, q).toContain(CRISIS_LIFELINE_NUMBER);
      expect(isWithhold(answerQuestion(q, adult, [])), q).toBe(false);
      // A topic menu after a disclosure like this reads as not listening.
      expect(text, q).not.toContain("ask about falling asleep");
      expect(text, q).not.toMatch(/melatonin|caffeine|unisom/);
    }
  });

  it("tells a drowsy driver to stop driving instead of to go to bed later", () => {
    for (const q of [
      "I keep falling asleep at the wheel",
      "I fell asleep driving home yesterday",
      "I almost crashed my car I'm so tired",
      "I keep nodding off at the wheel",
    ]) {
      const text = ask(q);
      expect(text, q).toMatch(/stop driving|do not drive|get a ride/);
      // The old answer was onset advice: "do not get in to try", i.e. delay bedtime.
      expect(text, q).not.toContain("get in when you are actually sleepy");
    }
  });

  it("routes witnessed apnea to an evaluation, not a withhold", () => {
    for (const q of [
      "I stop breathing in my sleep",
      "my wife says I choke in my sleep",
      "I wake up gasping",
      "my partner says I stop breathing at night",
    ]) {
      const reply = answerQuestion(q, adult, []);
      expect(isWithhold(reply), q).toBe(false);
      expect(reply.text.toLowerCase(), q).toMatch(/apnea|airway/);
    }
  });

  it("will not hand a dose to a minor, or to someone asking for a child", () => {
    const minor = ask("how much melatonin should I take", teen);
    expect(minor).toMatch(/under 18|not going to give you a dose/);
    expect(minor).not.toMatch(/0\.3|1 mg|10 mg/);

    const child = ask("can my 8 year old take melatonin", adult);
    expect(child).toMatch(/child|paediatrician|pediatrician/);
    expect(child).not.toMatch(/0\.3|1 mg/);

    // An adult asking for themselves still gets the real answer.
    expect(ask("how much melatonin should I take")).toMatch(/0\.3|clock signal/);
  });

  it("does not prescribe dry nights to someone describing dependence", () => {
    for (const q of [
      "I drink a bottle of wine every night to sleep",
      "I can't sleep without a drink",
      "I need alcohol to get to sleep",
    ]) {
      const text = ask(q);
      expect(text, q).toMatch(/do not stop suddenly|dangerous/);
      expect(text, q).not.toContain("two dry nights");
    }
    // A normal alcohol question is untouched.
    expect(ask("what does alcohol do to my sleep")).toContain("dream sleep");
  });

  it("defers to a clinician on mania rather than suggesting a shorter window", () => {
    const text = ask("I have bipolar and I haven't been sleeping");
    expect(text).toMatch(/clinician|whoever manages/);
    expect(text).not.toMatch(/shrink the window|cut your time in bed/);
  });

  it("treats several days without sleep as a red flag", () => {
    expect(ask("I have not slept in 3 days")).toMatch(/doctor|today/);
  });
});

describe("the gaps a real 3am question falls into", () => {
  it("answers the most common insomnia complaint of all", () => {
    for (const q of [
      "my mind is racing and I can't stop worrying",
      "I have anxiety at night",
      "I can't switch off at bedtime",
      "I keep overthinking when I lie down",
    ]) {
      const reply = answerQuestion(q, adult, []);
      expect(isWithhold(reply), q).toBe(false);
    }
  });

  it("explains the first-line treatment when asked about it by name", () => {
    for (const q of ["what is sleep restriction therapy", "should I cut my time in bed"]) {
      const reply = answerQuestion(q, adult, []);
      expect(isWithhold(reply), q).toBe(false);
      // It must carry its own contraindications, not just the technique.
      expect(reply.text.toLowerCase(), q).toMatch(/clinician|mania|seizure|apnea|drive/);
    }
  });

  it("covers nocturia, menopause, late chronotype and trackers", () => {
    const cases: [string, RegExp][] = [
      ["I keep waking up to pee", /bladder|bathroom/],
      ["hot flashes wake me up at night", /menopause|flash/],
      ["am I just a night owl", /clock|late/],
      ["should I trust my oura ring sleep score", /score|tracker|ring|watch/],
    ];
    for (const [q, shape] of cases) {
      const reply = answerQuestion(q, adult, []);
      expect(isWithhold(reply), q).toBe(false);
      expect(reply.text.toLowerCase(), q).toMatch(shape);
    }
  });
});
