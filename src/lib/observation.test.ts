import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const FROZEN_MS = vi.hoisted(() => {
  const now = new Date(2026, 8, 26, 16, 0, 0);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  return now.getTime();
});

import { InsightsView } from "@/components/insights-view";
import { TonightView } from "@/components/tonight-view";
import { YouView } from "@/components/you-view";
import { CircadiaPreviewTree, notifyKeyFor } from "@/context/circadia-store";
import { createEpisode } from "@/lib/episode";
import {
  hasSleepFigure,
  isObserving,
  morningInBaseline,
  nightDayInBaseline,
  tonightNight,
} from "@/lib/observation";
import { emptyState } from "@/lib/storage";
import { todayIsoDate } from "@/lib/time";
import type { CircadiaState, MorningReport, Profile } from "@/lib/types";

const FROZEN = new Date(FROZEN_MS);
const ENROLLED = new Date(2026, 8, 20, 22, 0, 0);

const profile: Profile = {
  firstName: "Ada",
  lastName: "West",
  name: "Ada West",
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
  notificationsEnabled: true,
  onboardingComplete: true,
  email: "",
  phone: "",
  scheduledDays: [false, true, true, true, true, true, false],
};

function episode(over: Partial<ReturnType<typeof createEpisode>> = {}) {
  return {
    ...createEpisode({
      clinicianId: "doc-1",
      enrolledAt: ENROLLED.toISOString(),
      baselineNights: 14,
    }),
    ...over,
  };
}

function night(morningDate: string): MorningReport {
  return {
    id: `n-${morningDate}`,
    morningDate,
    wokeAt: "07:00",
    fellAsleepAt: "23:15",
    rating: 4,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "yes",
    createdAt: `${morningDate}T07:30:00.000Z`,
    inBedAt: "23:00",
    triedToSleepAt: "23:00",
    outOfBedAt: "07:10",
    awakeningCount: 0,
  };
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stabilizeTonight(html: string): string {
  return html
    .replace(/orb-bloom-[^"']+/g, "orb-bloom-ID")
    .replace(/orb-arc-[^"']+/g, "orb-arc-ID")
    .replace(/\d{1,2}:\d{2}:\d{2}/g, "HH:MM:SS");
}

function renderTonight(state: CircadiaState): string {
  return renderToString(createElement(CircadiaPreviewTree, { state }, createElement(TonightView)));
}

function renderNotes(state: CircadiaState): string {
  return renderToString(createElement(CircadiaPreviewTree, { state }, createElement(InsightsView)));
}

function renderYou(state: CircadiaState): string {
  return renderToString(createElement(CircadiaPreviewTree, { state }, createElement(YouView)));
}

async function renderTonightAt(state: CircadiaState, when: Date): Promise<string> {
  vi.setSystemTime(when);
  vi.resetModules();
  const { createElement: el } = await import("react");
  const { renderToString: toString } = await import("react-dom/server");
  const { CircadiaPreviewTree: Tree } = await import("@/context/circadia-store");
  const { TonightView: View } = await import("@/components/tonight-view");
  const html = toString(el(Tree, { state }, el(View)));
  vi.setSystemTime(FROZEN);
  return html;
}

function diary(over: Partial<CircadiaState> = {}): CircadiaState {
  return { ...emptyState(), profile, ...over };
}

function enrolledDaysAgo(days: number, hour = 22): string {
  const enrolled = new Date(FROZEN);
  enrolled.setHours(hour, 0, 0, 0);
  enrolled.setDate(enrolled.getDate() - days);
  return enrolled.toISOString();
}

function observingState(over: Partial<CircadiaState> = {}): CircadiaState {
  return diary({
    episode: {
      ...createEpisode({
        clinicianId: "doc-1",
        enrolledAt: enrolledDaysAgo(5),
        baselineNights: 14,
      }),
      state: "enrolled",
    },
    ...over,
  });
}

describe("isObserving", () => {
  it("is true at night 1 and at night 14, and true for enrolled", () => {
    const ep = episode({ state: "enrolled" });
    expect(isObserving(ep, [], new Date(2026, 8, 20, 22, 0, 0))).toBe(true);
    expect(isObserving(ep, [], new Date(2026, 9, 3, 22, 0, 0))).toBe(true);
    expect(tonightNight(ep, [], new Date(2026, 8, 20, 22, 0, 0))).toBe(1);
    expect(tonightNight(ep, [], new Date(2026, 9, 3, 22, 0, 0))).toBe(14);
  });

  it("is false the moment the slot-13 morning is filed", () => {
    const ep = episode({ state: "enrolled" });
    expect(isObserving(ep, [night("2026-10-04")], new Date(2026, 9, 4, 10, 0, 0))).toBe(false);
  });

  it("is false on the day after the night-14 morning even when that morning is unfiled", () => {
    const ep = episode({ state: "enrolled" });
    expect(isObserving(ep, [], new Date(2026, 9, 5, 10, 0, 0))).toBe(false);
  });

  it("is false for treatment and discharged, and true for enrolled", () => {
    expect(isObserving(episode({ state: "treatment" }), [], new Date(2026, 8, 25, 22, 0, 0))).toBe(
      false,
    );
    expect(isObserving(episode({ state: "discharged" }), [], new Date(2026, 8, 25, 22, 0, 0))).toBe(
      false,
    );
    expect(isObserving(episode({ state: "enrolled" }), [], new Date(2026, 8, 25, 22, 0, 0))).toBe(true);
    expect(isObserving(episode({ state: "baseline" }), [], new Date(2026, 8, 25, 22, 0, 0))).toBe(true);
  });

  it("a missed night does not extend the baseline", () => {
    const ep = episode({ state: "enrolled" });
    const filed = [night("2026-09-21"), night("2026-09-22"), night("2026-09-25")];
    expect(isObserving(ep, filed, new Date(2026, 9, 3, 22, 0, 0))).toBe(true);
    expect(isObserving(ep, filed, new Date(2026, 9, 5, 10, 0, 0))).toBe(false);
  });
});

describe("tonightNight counts the night still being closed", () => {
  it("at 03:00 on the morning after night 6, unfiled, is still night 6", () => {
    const ep = episode({ state: "enrolled" });
    expect(tonightNight(ep, [], new Date(2026, 8, 26, 3, 0, 0))).toBe(6);
  });

  it("at 08:00 on the same morning, filed, is night 7", () => {
    const ep = episode({ state: "enrolled" });
    expect(tonightNight(ep, [night("2026-09-26")], new Date(2026, 8, 26, 8, 0, 0))).toBe(7);
  });

  it("at 03:00 on the morning after night 14, unfiled, is still night 14", () => {
    const ep = episode({ state: "enrolled" });
    expect(tonightNight(ep, [], new Date(2026, 9, 4, 3, 0, 0))).toBe(14);
  });

  it("at 18:00 on that same day, still unfiled, is past night 14", () => {
    const ep = episode({ state: "enrolled" });
    expect(tonightNight(ep, [], new Date(2026, 9, 4, 18, 0, 0))).toBe(15);
  });
});

describe("hasSleepFigure", () => {
  it("is true for percentages, durations, decimals, clocks and countdowns", () => {
    for (const text of ["85%", "20 min", "1 h", "6.5", "07:30", "03:12:09"]) {
      expect(hasSleepFigure(text), text).toBe(true);
    }
  });

  it("is false for Night 6 of 14 and Night 14 of 14 recorded.", () => {
    expect(hasSleepFigure("Night 6 of 14")).toBe(false);
    expect(hasSleepFigure("Night 14 of 14 recorded.")).toBe(false);
  });
});

describe("rendered TonightView", () => {
  it("while observing, non-solo, on night 6 shows Night 6 of 14 and no sleep figure above WindDown", () => {
    const html = renderTonight(observingState());
    const text = visibleText(html);
    expect(text).toContain("Night 6 of 14");
    expect(text).toContain("Your diary for last night is ready.");
    expect(text).toContain("Fill in this morning's diary");
    expect(hasSleepFigure(text)).toBe(false);
    expect(text).not.toMatch(/Screens/);
    expect(text).not.toMatch(/\bping\b/);
    expect(text).not.toContain("until your");
    expect(text).not.toContain("Asleep-by");
    expect(text).not.toContain("Guided meditations");
  });

  it("while observing, solo, names the test and not a clinician", () => {
    const state = diary({
      episode: {
        ...createEpisode({
          clinicianId: null,
          enrolledAt: enrolledDaysAgo(5),
          baselineNights: 14,
        }),
        state: "enrolled",
      },
    });
    const html = renderTonight(state);
    const text = visibleText(html);
    expect(text).toContain("Your diary for last night is ready.");
    expect(text).not.toContain("clinician");
  });

  it("when not observing matches the pre-change render for the same state", async () => {
    const state = diary({ episode: null });
    const cases = [
      [new Date(2026, 8, 26, 16, 0, 0), "src/lib/tonight-pre-observation.afternoon.fixture.html"],
      [new Date(2026, 8, 26, 22, 30, 0), "src/lib/tonight-pre-observation.screens-down.fixture.html"],
      [new Date(2026, 8, 26, 3, 0, 0), "src/lib/tonight-pre-observation.in-window.fixture.html"],
    ] as const;
    for (const [when, path] of cases) {
      const html = await renderTonightAt(state, when);
      const fixture = readFileSync(path, "utf8");
      const stabilized = stabilizeTonight(html);
      expect(stabilized).toContain("23:00");
      expect(stabilized).toContain("07:00");
      expect(stabilized, path).toBe(stabilizeTonight(fixture));
    }
  });

  it("on the night-14 evening with that morning unfiled does not show Night 15", () => {
    const state = diary({
      episode: {
        ...createEpisode({
          clinicianId: "doc-1",
          enrolledAt: enrolledDaysAgo(14),
          baselineNights: 14,
        }),
        state: "enrolled",
      },
    });
    const html = renderTonight(state);
    const text = visibleText(html);
    expect(text).toContain("Your baseline is almost done");
    expect(text).not.toContain("Night 15");
  });

  it("at 03:00 on the morning after night 6, unfiled, shows Night 6 of 14", async () => {
    const html = await renderTonightAt(
      diary({ episode: episode({ state: "enrolled" }) }),
      new Date(2026, 8, 26, 3, 0, 0),
    );
    const text = visibleText(html);
    expect(text).toContain("Night 6 of 14");
    expect(text).toContain("Your diary for last night is ready.");
  });

  it("at 08:00 on the same morning, filed, shows Night 7 of 14", async () => {
    const html = await renderTonightAt(
      diary({
        episode: episode({ state: "enrolled" }),
        reports: [night("2026-09-26")],
      }),
      new Date(2026, 8, 26, 8, 0, 0),
    );
    const text = visibleText(html);
    expect(text).toContain("Night 7 of 14");
    expect(text).toContain("Nothing to change tonight. Sleep the way you usually do.");
  });

  it("at 03:00 on the morning after night 14, unfiled, shows Night 14 of 14, not almost done", async () => {
    const html = await renderTonightAt(
      diary({ episode: episode({ state: "enrolled" }) }),
      new Date(2026, 9, 4, 3, 0, 0),
    );
    const text = visibleText(html);
    expect(text).toContain("Night 14 of 14");
    expect(text).not.toContain("Your baseline is almost done");
  });

  it("at 18:00 on that same day, still unfiled, shows Your baseline is almost done", async () => {
    const html = await renderTonightAt(
      diary({ episode: episode({ state: "enrolled" }) }),
      new Date(2026, 9, 4, 18, 0, 0),
    );
    const text = visibleText(html);
    expect(text).toContain("Your baseline is almost done");
    expect(text).toContain("One morning left to file.");
    expect(text).not.toContain("Night 15");
  });
});

describe("rendered InsightsView", () => {
  it("while observing with 5 filed nights shows no numbers", () => {
    const enrolledAt = enrolledDaysAgo(5);
    const mornings = [1, 2, 3, 4, 5].map((offset) => {
      const day = new Date(enrolledAt);
      day.setDate(day.getDate() + offset);
      return night(todayIsoDate(day));
    });
    const state = diary({
      episode: {
        ...createEpisode({ clinicianId: "doc-1", enrolledAt, baselineNights: 14 }),
        state: "enrolled",
      },
      reports: mornings,
    });
    const html = renderNotes(state);
    const text = visibleText(html);
    expect(text).toContain("Your notes open after night 14.");
    expect(hasSleepFigure(text)).toBe(false);
    expect(text).not.toContain("The numbers");
    expect(text).not.toContain("Your nights");
    expect(text).not.toMatch(/efficiency/i);
  });

  it("once observation has ended contains The week.", () => {
    const state = diary({
      episode: episode({ state: "treatment" }),
      reports: [1, 2, 3, 4, 5].map((n) => night(`2026-09-${20 + n}`)),
    });
    const html = renderNotes(state);
    expect(visibleText(html)).toContain("Your diary");
    expect(visibleText(html)).toContain("Your answers, as you gave them");
    expect(visibleText(html)).not.toContain("The week.");
  });
});

describe("notifyKeyFor", () => {
  it("changes when episode enrolledAt, state or baselineNights move, and not when chat moves", () => {
    const base = observingState();
    const key = notifyKeyFor(base);
    expect(
      notifyKeyFor({
        ...base,
        episode: { ...base.episode!, enrolledAt: new Date(2026, 8, 19, 22, 0, 0).toISOString() },
      }),
    ).not.toBe(key);
    expect(notifyKeyFor({ ...base, episode: { ...base.episode!, state: "baseline" } })).not.toBe(key);
    expect(notifyKeyFor({ ...base, episode: { ...base.episode!, baselineNights: 10 } })).not.toBe(key);
    expect(
      notifyKeyFor({
        ...base,
        chat: [{ id: "c1", role: "you", text: "hello", createdAt: "2026-09-26T16:00:00.000Z" }],
      }),
    ).toBe(key);
  });
});

describe("rendered YouView reminders", () => {
  it("while observing names only the morning reminder", () => {
    const text = visibleText(renderYou(observingState()));
    expect(text).toContain("One reminder each morning while your baseline runs. Nothing in the evening.");
    expect(text).not.toContain("A heads-up an hour before wind-down");
  });

  it("outside a baseline keeps the current reminders hint", () => {
    const text = visibleText(renderYou(diary({ episode: null })));
    expect(text).toContain(
      "A heads-up an hour before wind-down, the wind-down cue itself, a nudge at wake time, and the week when it is in.",
    );
    expect(text).not.toContain("One reminder each morning while your baseline runs");
  });
});

describe("baseline calendar helpers", () => {
  it("names nights that begin on a day and mornings that close them", () => {
    const ep = episode();
    expect(nightDayInBaseline(ep, new Date(2026, 8, 20, 22, 0, 0))).toBe(true);
    expect(nightDayInBaseline(ep, new Date(2026, 9, 3, 22, 0, 0))).toBe(true);
    expect(nightDayInBaseline(ep, new Date(2026, 9, 4, 22, 0, 0))).toBe(false);
    expect(morningInBaseline(ep, new Date(2026, 8, 20, 10, 0, 0))).toBe(false);
    expect(morningInBaseline(ep, new Date(2026, 8, 21, 10, 0, 0))).toBe(true);
    expect(morningInBaseline(ep, new Date(2026, 9, 4, 10, 0, 0))).toBe(true);
    expect(morningInBaseline(ep, new Date(2026, 9, 5, 10, 0, 0))).toBe(false);
  });
});
