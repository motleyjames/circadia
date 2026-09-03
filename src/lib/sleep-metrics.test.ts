import { describe, expect, it } from "vitest";
import {
  HEALTHY_EFFICIENCY_PCT,
  efficiencyBand,
  nightGeometry,
  sleepOnsetClock,
  weekGeometry,
} from "@/lib/sleep-metrics";
import type { MorningReport } from "@/lib/types";

function night(over: Partial<MorningReport> = {}): MorningReport {
  return {
    id: "n1",
    morningDate: "2026-08-25",
    wokeAt: "06:50",
    fellAsleepAt: "00:00",
    rating: 3,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 30,
    wokeInNight: true,
    nightWakingMinutes: 25,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: "2026-08-25T07:00:00.000Z",
    inBedAt: "23:10",
    triedToSleepAt: "23:25",
    outOfBedAt: "07:05",
    awakeningCount: 1,
    ...over,
  };
}

describe("night geometry", () => {
  it("scores a night the way a sleep clinic would", () => {
    // In bed 23:10 -> 07:05 is 475 min. Tried 23:25 -> woke 06:50 is 445 min,
    // less 30 latency and 25 awake = 390 asleep. 390/475 = 82.1%.
    const g = nightGeometry(night())!;
    expect(g.timeInBedMinutes).toBe(475);
    expect(g.totalSleepMinutes).toBe(390);
    expect(g.efficiencyPct).toBeCloseTo(82.1, 1);
    expect(g.latencyMinutes).toBe(30);
    expect(g.wasoMinutes).toBe(25);
    expect(g.terminalMinutes).toBe(15);
    expect(g.awakeningCount).toBe(1);
  });

  it("separates the two nights that used to look identical", () => {
    // Six hours of sleep either way. The only difference is time in bed, which is
    // exactly the distinction the diary could not make before.
    const stretched = nightGeometry(night({
      inBedAt: "21:30", triedToSleepAt: "21:30", wokeAt: "07:30", outOfBedAt: "07:30",
      sleepLatencyMinutes: 75, wokeInNight: true, nightWakingMinutes: 45,
    }))!;
    const tight = nightGeometry(night({
      inBedAt: "23:45", triedToSleepAt: "23:45", wokeAt: "06:15", outOfBedAt: "06:15",
      sleepLatencyMinutes: 15, wokeInNight: false, nightWakingMinutes: 0,
    }))!;

    expect(stretched.totalSleepMinutes).toBe(480);
    expect(tight.totalSleepMinutes).toBe(375);
    expect(stretched.efficiencyPct).toBeCloseTo(80, 0);
    expect(tight.efficiencyPct).toBeCloseTo(96.2, 1);
    // The one who slept LONGER is the one with the problem.
    expect(stretched.totalSleepMinutes).toBeGreaterThan(tight.totalSleepMinutes);
    expect(stretched.efficiencyPct).toBeLessThan(tight.efficiencyPct);
  });

  it("counts lying in bed after waking against efficiency", () => {
    const straightUp = nightGeometry(night({ wokeAt: "06:50", outOfBedAt: "06:55" }))!;
    const lingering = nightGeometry(night({ wokeAt: "06:50", outOfBedAt: "08:20" }))!;
    expect(lingering.totalSleepMinutes).toBe(straightUp.totalSleepMinutes);
    expect(lingering.terminalMinutes).toBe(90);
    expect(lingering.efficiencyPct).toBeLessThan(straightUp.efficiencyPct);
  });

  it("falls back to the in-bed time when lights-out was not recorded", () => {
    const g = nightGeometry(night({ triedToSleepAt: undefined }))!;
    expect(g.timeInBedMinutes).toBe(475);
    // Sleep period now runs from 23:10 rather than 23:25, so 15 minutes more.
    expect(g.totalSleepMinutes).toBe(405);
  });
});

describe("night geometry refuses to guess", () => {
  it("returns null for a night filed before these questions existed", () => {
    expect(nightGeometry(night({ inBedAt: undefined, outOfBedAt: undefined }))).toBeNull();
    expect(nightGeometry(night({ outOfBedAt: undefined }))).toBeNull();
  });

  it("returns null rather than a wrong number when the answers contradict", () => {
    // Latency and time awake add up to more than the night.
    expect(nightGeometry(night({ sleepLatencyMinutes: 75, nightWakingMinutes: 70, triedToSleepAt: "05:30" }))).toBeNull();
    // Out of bed before getting in, read as a 20+ hour night.
    expect(nightGeometry(night({ inBedAt: "07:05", outOfBedAt: "06:50" }))).toBeNull();
  });

  it("never reports more sleep than there was bed", () => {
    for (const g of [
      nightGeometry(night({ inBedAt: "02:00", triedToSleepAt: "02:00", wokeAt: "06:50", outOfBedAt: "06:00" })),
      nightGeometry(night({ sleepLatencyMinutes: 5, nightWakingMinutes: 0, wokeInNight: false })),
    ]) {
      if (g) expect(g.totalSleepMinutes).toBeLessThanOrEqual(g.timeInBedMinutes);
    }
  });

  it("derives sleep onset instead of asking for a clock nobody knows", () => {
    expect(sleepOnsetClock(night())).toBe("23:55");
    expect(sleepOnsetClock(night({ triedToSleepAt: "23:50", sleepLatencyMinutes: 30 }))).toBe("00:20");
    expect(sleepOnsetClock(night({ inBedAt: undefined, triedToSleepAt: undefined }))).toBeNull();
  });
});

describe("the week", () => {
  it("aggregates only the nights it can score", () => {
    const week = weekGeometry([
      night(),
      night({ id: "n2", inBedAt: undefined, outOfBedAt: undefined }),
      night({ id: "n3", inBedAt: "22:50", triedToSleepAt: "23:00", wokeAt: "06:45", outOfBedAt: "07:00", sleepLatencyMinutes: 15, wokeInNight: false, nightWakingMinutes: 0 }),
    ])!;
    expect(week.nights).toBe(2);
    expect(week.meanEfficiencyPct).toBeGreaterThan(80);
    expect(week.nightsAtHealthyEfficiency).toBe(1);
  });

  it("returns null when nothing can be scored, rather than zero", () => {
    expect(weekGeometry([])).toBeNull();
    expect(weekGeometry([night({ inBedAt: undefined, outOfBedAt: undefined })])).toBeNull();
  });

  it("bands efficiency with a word, not only a colour", () => {
    expect(efficiencyBand(HEALTHY_EFFICIENCY_PCT).tone).toBe("steady");
    expect(efficiencyBand(81).tone).toBe("watch");
    expect(efficiencyBand(81).label).toMatch(/worth watching/);
    expect(efficiencyBand(91).label).toMatch(/healthy/);
  });
});

describe("migration safety", () => {
  it("leaves every old night readable and simply unscored", () => {
    const legacy: MorningReport = {
      id: "old", morningDate: "2026-07-01", wokeAt: "07:00", fellAsleepAt: "23:30",
      rating: 4, drank: false, screenOffMinutes: 30, sleepLatencyMinutes: 15,
      wokeInNight: false, nightWakingMinutes: 0, usedSupplement: false,
      windDownHelped: "yes", createdAt: "2026-07-01T07:00:00.000Z",
    };
    expect(nightGeometry(legacy)).toBeNull();
    expect(() => weekGeometry([legacy])).not.toThrow();
    expect(weekGeometry([legacy])).toBeNull();
  });
});
