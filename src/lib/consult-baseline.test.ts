import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatBar } from "@/components/chat-bar";
import { CircadiaPreviewTree, consultObservation, replyFor } from "@/context/circadia-store";
import { answerQuestion, isWithhold, makeChatMessage } from "@/lib/chat";
import { bannedIn, buildCorpus } from "@/lib/chat-corpus";
import {
  answerDuringBaseline,
  BASELINE_WITHHOLD,
  baselineKind,
  WAIT_CLINIC,
  WAIT_SOLO,
} from "@/lib/consult-baseline";
import { createEpisode } from "@/lib/episode";
import { safetyKind, safetyTriage } from "@/lib/safety-triage";
import { DEFAULT_SCHEDULED_DAYS } from "@/lib/schedule";
import { emptyState } from "@/lib/storage";
import { formatDuration, overnightDuration } from "@/lib/time";
import type { ChatMessage, CircadiaState, LatencyBucket, MorningReport, Profile } from "@/lib/types";

const EMPTY_HASH = "1cf4f2961b755ce22e4b2a4cb6810820b173de0f2af2436023252bf9ff57537f";
const DIARY_HASH = "d60fd30ee5c05da25b09d2e4b553290c1069c2e28dc78e8278fb3666affae619";

const FIXED_NOW = new Date(2026, 8, 26, 16, 0, 0);
const ENROLLED = new Date(2026, 8, 23, 22, 0, 0);

const corpusProfile: Profile = {
  firstName: "James",
  lastName: "",
  name: "James",
  age: 19,
  sex: "male",
  heightCm: 180,
  weightKg: 75,
  activity: "light",
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
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
};

const fixtureProfile: Profile = {
  ...corpusProfile,
  firstName: "Ada",
  lastName: "West",
  name: "Ada West",
  age: 34,
  sex: "female",
  heightCm: 170,
  weightKg: 68,
  targetSleep: "23:10",
  targetWake: "06:40",
  units: "metric",
};

const adult: Profile = {
  firstName: "A",
  lastName: "",
  name: "A",
  age: 34,
  sex: "female",
  heightCm: 170,
  weightKg: 68,
  activity: "moderate",
  medications: [],
  supplements: [],
  struggles: ["falling", "staying"],
  targetSleep: "23:00",
  targetWake: "07:00",
  units: "imperial",
  notificationsEnabled: false,
  onboardingComplete: true,
  email: "",
  phone: "",
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
};
const teen: Profile = { ...adult, age: 15 };

function night(morningDate: string, drank: boolean): MorningReport {
  return {
    id: `n-${morningDate}`,
    morningDate,
    wokeAt: "08:53",
    fellAsleepAt: "01:37",
    rating: 2,
    drank,
    drinkCount: drank ? 3 : undefined,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 47 as LatencyBucket,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "yes",
    createdAt: `${morningDate}T09:00:00.000Z`,
    inBedAt: "01:20",
    triedToSleepAt: "01:20",
    outOfBedAt: "09:00",
    awakeningCount: 0,
  };
}

const fixtureReports = [
  night("2026-09-22", true),
  night("2026-09-23", false),
  night("2026-09-24", true),
  night("2026-09-25", false),
  night("2026-09-26", false),
];

const GOLDEN = [
  "1:37",
  "01:37",
  "8:53",
  "08:53",
  "47",
  "2/5",
  "6:40",
  "06:40",
  "11:10",
  "23:10",
  formatDuration(overnightDuration("01:37", "08:53")),
  "5 nights",
  "5 night",
  "five nights",
  "Across 5",
];

const COACHING =
  /experiment|two dry nights|protect your wake|defend|shrink|get up|get out of bed|screens down|last caffeine|dim the room|tonight try|use one session/i;

const FIGURE_LEAK = /on your diary|on the chart|Across \d+ nights?|Last night:|you have \d+/;

const SAFETY_LINES: Array<{ q: string; profile: Profile }> = [
  { q: "I want to kill myself I haven't slept in days", profile: adult },
  { q: "I want to die", profile: adult },
  { q: "honestly I am thinking about ending it", profile: adult },
  { q: "life is not worth living without sleep", profile: adult },
  { q: "I keep falling asleep at the wheel", profile: adult },
  { q: "I fell asleep driving home yesterday", profile: adult },
  { q: "I almost crashed my car I'm so tired", profile: adult },
  { q: "I keep nodding off at the wheel", profile: adult },
  { q: "I stop breathing in my sleep", profile: adult },
  { q: "my wife says I choke in my sleep", profile: adult },
  { q: "I wake up gasping", profile: adult },
  { q: "my partner says I stop breathing at night", profile: adult },
  { q: "how much melatonin should I take", profile: teen },
  { q: "can my 8 year old take melatonin", profile: adult },
  { q: "I drink a bottle of wine every night to sleep", profile: adult },
  { q: "I can't sleep without a drink", profile: adult },
  { q: "I need alcohol to get to sleep", profile: adult },
  { q: "I have bipolar and I haven't been sleeping", profile: adult },
  { q: "I have not slept in 3 days", profile: adult },
];

function hashCorpus(profile: Profile, reports: MorningReport[], observation?: { observing: boolean; solo: boolean }): string {
  const corpus = buildCorpus();
  const h = createHash("sha256");
  for (const row of corpus) {
    const msgs: ChatMessage[] = [];
    for (const p of row.prior ?? []) {
      const prior = answerQuestion(p, profile, reports, msgs, observation);
      msgs.push(makeChatMessage("you", p), makeChatMessage("circadia", prior.text, prior.citations));
    }
    const reply = answerQuestion(row.q, profile, reports, msgs, observation);
    h.update(reply.text);
    h.update("\0");
    h.update(reply.citations.join(","));
    h.update("\n");
  }
  return h.digest("hex");
}

function observingEpisode(solo: boolean) {
  return {
    ...createEpisode({
      clinicianId: solo ? null : "doc-1",
      enrolledAt: ENROLLED.toISOString(),
      baselineNights: 14,
    }),
    state: "enrolled" as const,
  };
}

function fixtureState(over: Partial<CircadiaState> = {}): CircadiaState {
  return {
    ...emptyState(),
    profile: fixtureProfile,
    reports: fixtureReports,
    episode: observingEpisode(false),
    ...over,
  };
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasGolden(text: string): string | null {
  for (const token of GOLDEN) {
    if (text.includes(token)) return token;
  }
  return null;
}

describe("pre-change hashes still match outside a baseline", () => {
  it("matches with observation absent and with observing: false", () => {
    expect(hashCorpus(corpusProfile, [])).toBe(EMPTY_HASH);
    expect(hashCorpus(corpusProfile, [], { observing: false, solo: false })).toBe(EMPTY_HASH);
    expect(hashCorpus(fixtureProfile, fixtureReports)).toBe(DIARY_HASH);
    expect(hashCorpus(fixtureProfile, fixtureReports, { observing: false, solo: false })).toBe(DIARY_HASH);
  });

  it("B13 consumer hashes stay put except the change-anything reply is allowed to move", () => {
    const oldEmpty = "1cf4f2961b755ce22e4b2a4cb6810820b173de0f2af2436023252bf9ff57537f";
    const oldDiary = "d60fd30ee5c05da25b09d2e4b553290c1069c2e28dc78e8278fb3666affae619";
    const newEmpty = hashCorpus(corpusProfile, []);
    const newDiary = hashCorpus(fixtureProfile, fixtureReports);
    expect({ oldEmpty, newEmpty, oldDiary, newDiary }).toEqual({
      oldEmpty,
      newEmpty: oldEmpty,
      oldDiary,
      newDiary: oldDiary,
    });
    expect(EMPTY_HASH).toBe(oldEmpty);
    expect(DIARY_HASH).toBe(oldDiary);
    const change = answerQuestion("should I change anything?", fixtureProfile, fixtureReports);
    expect(change.text).not.toContain("Nothing needs to change for these two weeks.");
  });
});

describe("no personal figures or coaching while observing", () => {
  it("every corpus row stays free of golden tokens and coaching, except safety and library for coaching", () => {
    const corpus = buildCorpus();
    const consult = { profile: fixtureProfile };
    const figureFails: string[] = [];
    const coachFails: string[] = [];
    const libraryQs: string[] = [];
    let library = 0;
    for (const solo of [false, true]) {
      const observation = { observing: true, solo };
      for (const row of corpus) {
        const msgs: ChatMessage[] = [];
        for (const p of row.prior ?? []) {
          const prior = answerQuestion(p, fixtureProfile, fixtureReports, msgs, observation);
          msgs.push(makeChatMessage("you", p), makeChatMessage("circadia", prior.text, prior.citations));
        }
        const reply = answerQuestion(row.q, fixtureProfile, fixtureReports, msgs, observation);
        const q = row.prior ? `${row.prior.join(" > ")} > ${row.q}` : row.q;
        const kind = baselineKind(row.q, row.q.toLowerCase(), consult, solo);
        if (kind === "library") {
          library += 1;
          libraryQs.push(row.q);
        }
        const leak = hasGolden(reply.text);
        if (leak || FIGURE_LEAK.test(reply.text)) {
          figureFails.push(`${solo ? "solo" : "clinic"} ${q} [${kind}] ${leak ?? "phrase"} :: ${reply.text.slice(0, 160)}`);
        }
        if (COACHING.test(reply.text) && kind !== "safety" && kind !== "library") {
          coachFails.push(`${solo ? "solo" : "clinic"} ${q} [${kind}] :: ${reply.text.slice(0, 160)}`);
        }
        if (bannedIn(reply.text)) {
          figureFails.push(`${q} banned language`);
        }
      }
    }
    const libraryShare = library / (corpus.length * 2);
    if (libraryShare > 0.1) {
      const counts = new Map<string, number>();
      for (const q of libraryQs) counts.set(q, (counts.get(q) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      expect.fail(
        `library share ${Math.round(libraryShare * 100)}% (${library}/${corpus.length * 2}). Top: ${top
          .map(([q, n]) => `${n}× ${q}`)
          .join(" | ")}`,
      );
    }
    expect(figureFails.slice(0, 20), `${figureFails.length} figure leaks\n${figureFails.slice(0, 20).join("\n")}`).toEqual([]);
    expect(coachFails.slice(0, 20), `${coachFails.length} coaching leaks\n${coachFails.slice(0, 20).join("\n")}`).toEqual([]);
  });
});

describe("safety is identical while observing", () => {
  it("corpus safety rows and the triage lines deep-equal the non-observing reply", () => {
    const corpus = buildCorpus();
    const fails: string[] = [];
    for (const row of corpus) {
      if (safetyKind(row.q.toLowerCase(), fixtureProfile) == null) continue;
      const off = answerQuestion(row.q, fixtureProfile, fixtureReports, []);
      const on = answerQuestion(row.q, fixtureProfile, fixtureReports, [], { observing: true, solo: false });
      if (on.text !== off.text || on.citations.join(",") !== off.citations.join(",")) {
        fails.push(row.q);
      }
    }
    for (const { q, profile } of SAFETY_LINES) {
      const off = answerQuestion(q, profile, []);
      const on = answerQuestion(q, profile, [], [], { observing: true, solo: false });
      expect(on, q).toEqual(off);
      expect(safetyTriage(q.toLowerCase(), profile)).not.toBeNull();
    }
    expect(fails, fails.join("\n")).toEqual([]);
  });
});

describe("routing", () => {
  const consult = { profile: fixtureProfile };

  it("walk me through last night, how did I sleep, my week, how am I doing, what's my efficiency → Closed", () => {
    for (const q of [
      "walk me through last night",
      "how did I sleep",
      "my week",
      "how am I doing",
      "what's my efficiency",
    ]) {
      expect(baselineKind(q, q.toLowerCase(), consult, false), q).toBe("closed");
    }
  });

  it("I can't fall asleep → Hold onset", () => {
    expect(baselineKind("I can't fall asleep", "i can't fall asleep", consult, false)).toBe("hold");
    expect(answerDuringBaseline("I can't fall asleep", "i can't fall asleep", consult, false).text).toContain(
      "unable to switch off",
    );
  });

  it("I wake at 3 and stay up → Hold waking", () => {
    expect(baselineKind("I wake at 3 and stay up", "i wake at 3 and stay up", consult, false)).toBe("hold");
    expect(answerDuringBaseline("I wake at 3 and stay up", "i wake at 3 and stay up", consult, false).text).toContain(
      "Waking in the night",
    );
  });

  it("should I nap and what bedtime should I aim for → Hold schedule", () => {
    expect(baselineKind("should I nap", "should i nap", consult, false)).toBe("hold");
    expect(baselineKind("what bedtime should I aim for", "what bedtime should i aim for", consult, false)).toBe(
      "hold",
    );
    expect(answerDuringBaseline("should I nap", "should i nap", consult, false).text).toContain("usual one");
  });

  it("baseline topic questions get their baseline replies", () => {
    const why = answerQuestion("why fourteen nights?", fixtureProfile, fixtureReports, [], {
      observing: true,
      solo: false,
    });
    expect(why.text).toContain("Fourteen nights show the usual ones");
    expect(why.citations).toEqual(["sleep-regularity"]);

    const clock = answerQuestion("why not check the clock?", fixtureProfile, fixtureReports, [], {
      observing: true,
      solo: false,
    });
    expect(clock.text).toContain("Watching the clock at night");
    expect(clock.citations).toEqual(["racing-mind"]);

    const after = answerQuestion("what happens after night 14?", fixtureProfile, fixtureReports, [], {
      observing: true,
      solo: false,
    });
    expect(after.text).toContain("Your Notes open");
    expect(after.text).toContain("Your clinician reads the same diary");

    const missed = answerQuestion(
      "I forgot to fill in the diary yesterday morning",
      fixtureProfile,
      fixtureReports,
      [],
      { observing: true, solo: false },
    );
    expect(missed.text).toContain("That is fine");
    expect(missed.citations).toEqual([]);

    const change = answerQuestion("should I change anything?", fixtureProfile, fixtureReports, [], {
      observing: true,
      solo: false,
    });
    expect(change.text).toContain("Nothing needs to change. For these two weeks, the most useful thing you can do is");
    expect(change.text).toContain("There is no score to improve");
    expect(change.text).toContain(WAIT_CLINIC);
  });

  it("I can't fall asleep, what should I do → onset Hold", () => {
    const q = "I can't fall asleep, what should I do";
    expect(baselineKind(q, q.toLowerCase(), consult, false)).toBe("hold");
    expect(answerDuringBaseline(q, q.toLowerCase(), consult, false).text).toContain("unable to switch off");
  });

  it("I wake at 3, what can I do → waking Hold", () => {
    const q = "I wake at 3, what can I do";
    expect(baselineKind(q, q.toLowerCase(), consult, false)).toBe("hold");
    expect(answerDuringBaseline(q, q.toLowerCase(), consult, false).text).toContain("Waking in the night");
  });

  it("should I change anything? → the baseline reply", () => {
    const q = "should I change anything?";
    expect(baselineKind(q, q.toLowerCase(), consult, false)).toBe("baseline");
    expect(answerDuringBaseline(q, q.toLowerCase(), consult, false).text).toContain(
      "Nothing needs to change. For these two weeks, the most useful thing you can do is",
    );
  });

  it("I fell asleep at the wheel is the drowsy-driving safety reply, byte for byte", () => {
    const q = "I fell asleep at the wheel";
    const off = answerQuestion(q, adult, []);
    const on = answerQuestion(q, adult, [], [], { observing: true, solo: false });
    expect(on).toEqual(off);
    expect(on.text).toMatch(/Stop driving/);
  });
});

describe("solo and clinician", () => {
  it("solo replies never contain clinician, and the non-solo onset names your clinician", () => {
    const onset = "I can't fall asleep";
    const solo = answerQuestion(onset, fixtureProfile, fixtureReports, [], { observing: true, solo: true });
    const clinic = answerQuestion(onset, fixtureProfile, fixtureReports, [], { observing: true, solo: false });
    expect(solo.text).not.toMatch(/clinician/i);
    expect(solo.text).toContain(WAIT_SOLO);
    expect(clinic.text).toContain("your clinician needs to see");
    expect(clinic.text).toContain(WAIT_CLINIC);
  });
});

describe("rendered ChatBar rail", () => {
  it("while observing shows baseline starters and hides the diary intro", () => {
    const html = renderToString(
      createElement(CircadiaPreviewTree, { state: fixtureState() }, createElement(ChatBar, { variant: "rail" })),
    );
    const text = visibleText(html);
    expect(text).toContain("Why fourteen nights?");
    expect(text).toContain("The library, not your diary, until night 14.");
    expect(text).not.toContain("Walk me through last night");
    expect(text).not.toContain("I answer from your diary");
  });

  it("when not observing still offers Walk me through last night", () => {
    const html = renderToString(
      createElement(
        CircadiaPreviewTree,
        { state: fixtureState({ episode: null }) },
        createElement(ChatBar, { variant: "rail" }),
      ),
    );
    expect(visibleText(html)).toContain("Walk me through last night");
  });
});

describe("replyFor", () => {
  it("returns Closed while observing and the diary answer once discharged", () => {
    const observing = fixtureState();
    expect(consultObservation(observing, FIXED_NOW).observing).toBe(true);
    const closed = replyFor(observing, "walk me through last night", FIXED_NOW);
    expect(closed.text).toContain("keeping them closed until night 14");
    expect(closed.citations).toEqual([]);

    const done = fixtureState({
      episode: { ...observingEpisode(false), state: "discharged" },
    });
    expect(consultObservation(done, FIXED_NOW).observing).toBe(false);
    const open = replyFor(done, "walk me through last night", FIXED_NOW);
    expect(open.text).not.toContain("keeping them closed until night 14");
    expect(open.text).toMatch(/01:37|1:37|08:53|8:53/);
  });
});

describe("baseline withhold", () => {
  it("is recognised by isWithhold", () => {
    expect(isWithhold({ text: BASELINE_WITHHOLD, citations: [] })).toBe(true);
  });
});
