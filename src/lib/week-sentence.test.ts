import { describe, expect, it } from "vitest";
import { standingOn, weekSentence } from "@/lib/week-sentence";
import type { WeekGeometry } from "@/lib/sleep-metrics";

function week(over: Partial<WeekGeometry> = {}): WeekGeometry {
  return {
    nights: 7,
    meanTimeInBedMinutes: 492,
    meanTotalSleepMinutes: 400,
    meanEfficiencyPct: 81.3,
    meanLatencyMinutes: 32,
    meanWasoMinutes: 22,
    meanTerminalMinutes: 18,
    nightsAtHealthyEfficiency: 2,
    ...over,
  };
}

describe("the week in one paragraph", () => {
  it("states the gap between opportunity and sleep", () => {
    const said = weekSentence(week());
    expect(said.lead).toContain("8h 12m");
    expect(said.lead).toContain("6h 40m");
    expect(said.lead).toContain("7 nights");
  });

  it("names the part of the night the waking time actually sat in", () => {
    expect(weekSentence(week({ meanLatencyMinutes: 60, meanWasoMinutes: 10, meanTerminalMinutes: 10 })).where)
      .toMatch(/at the front/);
    expect(weekSentence(week({ meanLatencyMinutes: 10, meanWasoMinutes: 60, meanTerminalMinutes: 10 })).where)
      .toMatch(/in the middle/);
    expect(weekSentence(week({ meanLatencyMinutes: 10, meanWasoMinutes: 10, meanTerminalMinutes: 60 })).where)
      .toMatch(/at the end/);
  });

  it("does not point at a part of the night when the gap is spread thin", () => {
    const said = weekSentence(week({ meanLatencyMinutes: 5, meanWasoMinutes: 5, meanTerminalMinutes: 5 }));
    expect(said.where).toMatch(/spread thinly/);
    expect(said.where).not.toMatch(/at the front|in the middle|at the end/);
  });

  it("says something different when the week is healthy", () => {
    const said = weekSentence(week({ meanEfficiencyPct: 91, nightsAtHealthyEfficiency: 7 }));
    expect(said.where).toMatch(/settled night/);
  });

  it("never diagnoses, prescribes a window, or scolds", () => {
    const banned = /insomnia|apnea|apnoea|disorder|diagnos|you should|you need to|restrict|sleep window|only spend|limit your time in bed|discipline|lazy/i;
    for (const g of [
      week(),
      week({ meanEfficiencyPct: 55, meanLatencyMinutes: 75, meanWasoMinutes: 70, meanTerminalMinutes: 60 }),
      week({ meanEfficiencyPct: 96, nightsAtHealthyEfficiency: 7 }),
      week({ nights: 1, meanLatencyMinutes: 5, meanWasoMinutes: 5, meanTerminalMinutes: 5 }),
    ]) {
      const said = weekSentence(g);
      expect(said.lead, said.lead).not.toMatch(banned);
      expect(said.where, said.where).not.toMatch(banned);
    }
  });

  it("gets the plural right for a single night", () => {
    expect(weekSentence(week({ nights: 1 })).lead).toContain("1 night ");
  });
});

describe("what the page says it is standing on", () => {
  it("gives the denominator before any of the numbers", () => {
    expect(standingOn(7, 7)).toContain("7 of 7");
    expect(standingOn(7, 7)).toMatch(/nothing here is a diagnosis/i);
  });

  it("calls a short run a sketch rather than a pattern", () => {
    expect(standingOn(3, 3)).toMatch(/sketch/i);
    expect(standingOn(5, 5)).not.toMatch(/sketch/i);
  });

  it("explains a week of filed-but-unscoreable mornings instead of showing nothing", () => {
    expect(standingOn(6, 0)).toMatch(/none of them yet carrying the bed times/i);
  });

  it("handles the very first visit", () => {
    expect(standingOn(0, 0)).toMatch(/starts on night one/i);
  });
});
