import { describe, expect, it } from "vitest";
import {
  HEALTHY_EFFICIENCY_PCT,
  bestAndWorst,
  efficiencyBand,
  midpointOffset,
  midpointSpread,
  nightGeometry,
  scoreNights,
  sleepOnsetClock,
  weekDeltas,
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

describe("one timeline, no independent wraps", () => {
  it("reads getting up the same minute you wake as zero, not a whole day", () => {
    // The regression: terminal wakefulness was measured as its own clock pair, and
    // an identical pair wraps to 1440. An eight-hour night reported 24 hours of
    // lying awake at the end, and efficiency was computed around it.
    const g = nightGeometry(night({
      inBedAt: "23:00", triedToSleepAt: "23:00", wokeAt: "07:00", outOfBedAt: "07:00",
      sleepLatencyMinutes: 15, wokeInNight: false, nightWakingMinutes: 0,
    }))!;
    expect(g.terminalMinutes).toBe(0);
    expect(g.timeInBedMinutes).toBe(480);
    expect(g.totalSleepMinutes).toBe(465);
    expect(g.efficiencyPct).toBeCloseTo(96.9, 1);
  });

  it("reads lying down and trying to sleep at the same minute as zero latency to lights out", () => {
    const g = nightGeometry(night({
      inBedAt: "23:00", triedToSleepAt: "23:00", wokeAt: "06:00", outOfBedAt: "06:30",
      sleepLatencyMinutes: 5, wokeInNight: false, nightWakingMinutes: 0,
    }))!;
    expect(g.timeInBedMinutes).toBe(450);
    expect(g.totalSleepMinutes).toBe(415);
    expect(g.terminalMinutes).toBe(30);
  });

  it("keeps every part of the night inside the night", () => {
    for (const report of [
      night(),
      night({ inBedAt: "23:00", triedToSleepAt: "23:00", wokeAt: "07:00", outOfBedAt: "07:00" }),
      night({ inBedAt: "01:15", triedToSleepAt: "01:40", wokeAt: "09:05", outOfBedAt: "09:05" }),
      night({ inBedAt: "19:45", triedToSleepAt: "20:30", wokeAt: "04:00", outOfBedAt: "06:10" }),
    ]) {
      const g = nightGeometry(report);
      if (!g) continue;
      expect(g.terminalMinutes).toBeGreaterThanOrEqual(0);
      expect(g.terminalMinutes).toBeLessThanOrEqual(g.timeInBedMinutes);
      expect(g.totalSleepMinutes + g.latencyMinutes + g.wasoMinutes + g.terminalMinutes)
        .toBeLessThanOrEqual(g.timeInBedMinutes);
    }
  });

  it("refuses a night whose parts are out of order", () => {
    // Woke before lights out.
    expect(nightGeometry(night({ inBedAt: "23:00", triedToSleepAt: "06:00", wokeAt: "01:00", outOfBedAt: "07:00" }))).toBeNull();
    // Woke after already being out of bed.
    expect(nightGeometry(night({ inBedAt: "23:00", triedToSleepAt: "23:10", wokeAt: "08:00", outOfBedAt: "07:00" }))).toBeNull();
  });
});

describe("week over week", () => {
  const good = () => night({ inBedAt: "23:00", triedToSleepAt: "23:00", wokeAt: "07:00", outOfBedAt: "07:10", sleepLatencyMinutes: 15, wokeInNight: false, nightWakingMinutes: 0 });
  const poor = () => night({ inBedAt: "21:30", triedToSleepAt: "21:30", wokeAt: "07:30", outOfBedAt: "08:30", sleepLatencyMinutes: 75, wokeInNight: true, nightWakingMinutes: 45 });

  it("reports movement when both weeks stand on enough nights", () => {
    const current = weekGeometry([good(), good(), good(), good()]);
    const prior = weekGeometry([poor(), poor(), poor(), poor()]);
    const d = weekDeltas(current, prior)!;
    expect(d.efficiencyPct).toBeGreaterThan(0);
    expect(d.priorNights).toBe(4);
  });

  it("says nothing rather than call one night a trend", () => {
    const current = weekGeometry([good(), good(), good(), good()]);
    expect(weekDeltas(current, weekGeometry([poor()]))).toBeNull();
    expect(weekDeltas(current, weekGeometry([poor(), poor()]))).toBeNull();
    expect(weekDeltas(weekGeometry([good()]), weekGeometry([poor(), poor(), poor()]))).toBeNull();
    expect(weekDeltas(current, null)).toBeNull();
    expect(weekDeltas(null, null)).toBeNull();
  });
});

describe("regularity", () => {
  function at(onset: string, woke: string, id: string) {
    return night({ id, inBedAt: onset, triedToSleepAt: onset, wokeAt: woke, outOfBedAt: woke, sleepLatencyMinutes: 5, wokeInNight: false, nightWakingMinutes: 0 });
  }

  it("measures the spread across midnight as the short way round", () => {
    // Midpoints land either side of 4am; the naive answer would be almost a day.
    const nights = scoreNights([at("23:50", "07:50", "a"), at("00:10", "08:10", "b")]);
    const spread = midpointSpread(nights)!;
    expect(spread.nights).toBe(2);
    expect(spread.spreadMinutes).toBe(20);
  });

  it("does not report a 23-hour spread for two nights 20 minutes apart", () => {
    // The same pair placed so their midpoints straddle midnight exactly.
    const nights = scoreNights([at("19:50", "03:50", "a"), at("20:10", "04:10", "b")]);
    const spread = midpointSpread(nights)!;
    expect(spread.spreadMinutes).toBeLessThan(60);
  });

  it("unwraps each night onto the arc it found", () => {
    const nights = scoreNights([at("23:50", "07:50", "a"), at("00:10", "08:10", "b")]);
    const spread = midpointSpread(nights)!;
    const offsets = nights.map((n) => midpointOffset(n.midpointMinutes, spread));
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(spread.spreadMinutes);
    }
    expect(Math.max(...offsets) - Math.min(...offsets)).toBe(20);
  });

  it("returns null with nothing to plot, and zero spread for a single night", () => {
    expect(midpointSpread([])).toBeNull();
    const one = midpointSpread(scoreNights([at("23:00", "07:00", "a")]))!;
    expect(one.spreadMinutes).toBe(0);
    expect(one.nights).toBe(1);
  });
});

describe("better and worse", () => {
  // Same sleep every night; only the lie-in afterwards differs, so efficiency
  // falls monotonically from n1 to n6 and the ranking is unambiguous.
  function eff(id: string, outOfBed: string) {
    return night({ id, inBedAt: "23:00", triedToSleepAt: "23:00", wokeAt: "07:00", outOfBedAt: outOfBed, sleepLatencyMinutes: 15, wokeInNight: false, nightWakingMinutes: 0 });
  }
  const week = () => [
    eff("n1", "07:00"),
    eff("n2", "07:15"),
    eff("n3", "07:30"),
    eff("n4", "07:45"),
    eff("n5", "08:00"),
    eff("n6", "08:15"),
  ];

  it("puts the most efficient nights first and the least efficient last", () => {
    const split = bestAndWorst(scoreNights(week()))!;
    expect(split.best.map((n) => n.report.id)).toEqual(["n1", "n2", "n3"]);
    expect(split.worst.map((n) => n.report.id)).toEqual(["n6", "n5", "n4"]);
  });

  it("refuses to name a worst night when there is no middle to leave out", () => {
    expect(bestAndWorst(scoreNights(week().slice(0, 5)))).toBeNull();
    expect(bestAndWorst(scoreNights([]))).toBeNull();
  });

  it("does not reorder the array it was handed", () => {
    const nights = scoreNights(week());
    const before = nights.map((n) => n.report.id);
    bestAndWorst(nights);
    expect(nights.map((n) => n.report.id)).toEqual(before);
  });
});
