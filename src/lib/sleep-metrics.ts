import { clockToMinutes, minutesToClock, overnightDuration } from "@/lib/time";
import type { MorningReport } from "@/lib/types";

/**
 * The numbers a sleep clinic actually reads, scored the way the Consensus Sleep
 * Diary scores them (Carney et al., Sleep 2012;35(2):287-302).
 *
 * The whole point of this module is the denominator. Without time in bed there is
 * no sleep efficiency, and sleep efficiency is what separates "in bed ten hours,
 * asleep six" from "in bed six and a half, asleep six" — the first is textbook
 * insomnia and the second is fine. They were indistinguishable before these fields
 * existed.
 *
 * Every function here returns null rather than a guess. A diary filed before the
 * new questions existed, or one with contradictory clocks, produces no number at
 * all — an estimated efficiency would silently corrupt the one metric this exists
 * to produce.
 *
 * ## Why one timeline instead of clock arithmetic
 *
 * A night crosses midnight, so every duration between two wall clocks is ambiguous:
 * 07:30 to 07:30 is either zero minutes or a full day, and the helper that answers
 * that question has to assume one. Measuring each pair separately let those
 * assumptions disagree — getting up the same minute you woke produced 1440 minutes
 * of terminal wakefulness inside an eight-hour night, because that one pair wrapped
 * while its neighbours did not.
 *
 * So the night is laid out once, as offsets in minutes from getting into bed, and
 * every figure is subtraction on that line. Ambiguity is resolved a single time, in
 * one place, and the ordering check below then rejects anything that cannot be a
 * real night instead of returning a number built on a wrap.
 */

export type NightGeometry = {
  /** Getting into bed → getting out of it. The denominator. */
  timeInBedMinutes: number;
  /** Time actually asleep. */
  totalSleepMinutes: number;
  /** totalSleep / timeInBed, 0-100, rounded to one decimal. */
  efficiencyPct: number;
  /** How long it took to fall asleep. */
  latencyMinutes: number;
  /** Wake after sleep onset — awake in the middle, total. */
  wasoMinutes: number;
  /** Final awakening → out of bed. Lying there afterwards still costs efficiency. */
  terminalMinutes: number;
  /** Awakenings not counting the final one, when recorded. */
  awakeningCount: number | null;
};

/** Sleep clinics generally treat 85% and up as healthy. */
export const HEALTHY_EFFICIENCY_PCT = 85;

/** Nobody sleeps 20 hours. A clock pair that implies it is a typo, not a night. */
const MAX_PLAUSIBLE_TIB_MINUTES = 20 * 60;

const MINUTES_PER_DAY = 24 * 60;

function isClock(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

/**
 * Minutes from `from` to `to`, forward, where landing on the same clock means zero
 * rather than a full day.
 *
 * This is the one place the midnight ambiguity is decided. `overnightDuration`
 * answers 1440 for an identical pair, which is right for "asleep at 23:00, awake at
 * 23:00" and wrong for every other pair in a night's geometry — you can get out of
 * bed the same minute you wake.
 */
function forwardMinutes(from: string, to: string): number {
  return clockToMinutes(from) === clockToMinutes(to) ? 0 : overnightDuration(from, to);
}

/**
 * Score one night, or return null.
 *
 * Null happens for two different reasons and both are correct: the night predates
 * these questions, or the answers cannot describe a real night (out of bed before
 * getting in, asleep longer than in bed, waking before lights out). Rendering
 * "0% efficiency" for any of those would be worse than rendering nothing.
 */
export function nightGeometry(report: MorningReport): NightGeometry | null {
  const { inBedAt, outOfBedAt, wokeAt } = report;
  const triedToSleepAt = report.triedToSleepAt ?? inBedAt;
  if (!isClock(inBedAt) || !isClock(outOfBedAt) || !isClock(triedToSleepAt) || !isClock(wokeAt)) {
    return null;
  }

  // The whole night as offsets from getting into bed. One origin, one direction.
  const timeInBedMinutes = forwardMinutes(inBedAt, outOfBedAt);
  const triedOffset = forwardMinutes(inBedAt, triedToSleepAt);
  const wokeOffset = forwardMinutes(inBedAt, wokeAt);

  if (timeInBedMinutes <= 0 || timeInBedMinutes > MAX_PLAUSIBLE_TIB_MINUTES) return null;

  // Everything must fall in order along that line. Anything else is a mistyped
  // clock, and the ordering check is what stops a wrap becoming a number.
  if (triedOffset > wokeOffset || wokeOffset > timeInBedMinutes) return null;

  const latencyMinutes = Math.max(0, report.sleepLatencyMinutes ?? 0);
  const wasoMinutes = Math.max(0, report.wokeInNight ? (report.nightWakingMinutes ?? 0) : 0);

  const sleepPeriodMinutes = wokeOffset - triedOffset;
  const terminalMinutes = timeInBedMinutes - wokeOffset;
  const totalSleepMinutes = sleepPeriodMinutes - latencyMinutes - wasoMinutes;

  // Contradictory answers: more time awake than there was night.
  if (totalSleepMinutes <= 0 || totalSleepMinutes > timeInBedMinutes) return null;

  return {
    timeInBedMinutes,
    totalSleepMinutes,
    efficiencyPct: Math.round((totalSleepMinutes / timeInBedMinutes) * 1000) / 10,
    latencyMinutes,
    wasoMinutes,
    terminalMinutes,
    awakeningCount: typeof report.awakeningCount === "number" ? report.awakeningCount : null,
  };
}

/** The clock time they actually fell asleep. Derived, never asked — nobody knows it. */
export function sleepOnsetClock(report: MorningReport): string | null {
  const start = report.triedToSleepAt ?? report.inBedAt;
  if (!isClock(start)) return null;
  return minutesToClock(clockToMinutes(start) + Math.max(0, report.sleepLatencyMinutes ?? 0));
}

/** A night that could be scored, with everything the week's screens need. */
export type ScoredNight = {
  report: MorningReport;
  geometry: NightGeometry;
  /** Derived clock of sleep onset. */
  onsetClock: string;
  /** Middle of the sleep period, minutes from midnight (0-1439). */
  midpointMinutes: number;
};

/**
 * Score every night that can be scored, oldest first, and drop the rest.
 *
 * One pass shared by the raster, the regularity plot, the best/worst columns and
 * the table, so those four cannot disagree about which nights count.
 */
export function scoreNights(reports: MorningReport[]): ScoredNight[] {
  const out: ScoredNight[] = [];
  for (const report of reports) {
    const geometry = nightGeometry(report);
    const onsetClock = sleepOnsetClock(report);
    if (!geometry || !onsetClock) continue;
    const sleepPeriod = forwardMinutes(onsetClock, report.wokeAt);
    const midpointMinutes =
      (clockToMinutes(onsetClock) + Math.round(sleepPeriod / 2)) % MINUTES_PER_DAY;
    out.push({ report, geometry, onsetClock, midpointMinutes });
  }
  return out;
}

export type WeekGeometry = {
  /** How many of the week's nights could be scored at all. */
  nights: number;
  meanTimeInBedMinutes: number;
  meanTotalSleepMinutes: number;
  meanEfficiencyPct: number;
  meanLatencyMinutes: number;
  meanWasoMinutes: number;
  /** Mean time lying in bed after the final awakening. */
  meanTerminalMinutes: number;
  /** Nights at or above the healthy threshold. */
  nightsAtHealthyEfficiency: number;
};

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Aggregate whatever can be scored. Returns null when nothing can — the UI says
 * the number starts once there are a few mornings on the new questions, rather
 * than showing a confident zero.
 */
export function weekGeometry(reports: MorningReport[]): WeekGeometry | null {
  const scored = reports.map(nightGeometry).filter((g): g is NightGeometry => g !== null);
  if (scored.length === 0) return null;
  return {
    nights: scored.length,
    meanTimeInBedMinutes: Math.round(mean(scored.map((g) => g.timeInBedMinutes))),
    meanTotalSleepMinutes: Math.round(mean(scored.map((g) => g.totalSleepMinutes))),
    meanEfficiencyPct: Math.round(mean(scored.map((g) => g.efficiencyPct)) * 10) / 10,
    meanLatencyMinutes: Math.round(mean(scored.map((g) => g.latencyMinutes))),
    meanWasoMinutes: Math.round(mean(scored.map((g) => g.wasoMinutes))),
    meanTerminalMinutes: Math.round(mean(scored.map((g) => g.terminalMinutes))),
    nightsAtHealthyEfficiency: scored.filter((g) => g.efficiencyPct >= HEALTHY_EFFICIENCY_PCT).length,
  };
}

/** Week-over-week movement. Null on any figure the comparison cannot support. */
export type WeekDeltas = {
  efficiencyPct: number | null;
  totalSleepMinutes: number | null;
  timeInBedMinutes: number | null;
  latencyMinutes: number | null;
  wasoMinutes: number | null;
  /** Nights the comparison week was standing on, for the caption. */
  priorNights: number;
};

/** How many scored nights the prior week needs before a delta means anything. */
export const MIN_NIGHTS_FOR_DELTA = 3;

/**
 * Compare this week with the one before it.
 *
 * Returns null unless BOTH weeks have enough scored nights. A "+9 points on last
 * week" built from one prior night is noise wearing the costume of a trend, and it
 * is exactly the kind of number a person would change their behaviour over.
 */
export function weekDeltas(
  current: WeekGeometry | null,
  prior: WeekGeometry | null,
): WeekDeltas | null {
  if (!current || !prior) return null;
  if (current.nights < MIN_NIGHTS_FOR_DELTA || prior.nights < MIN_NIGHTS_FOR_DELTA) return null;
  return {
    efficiencyPct: Math.round((current.meanEfficiencyPct - prior.meanEfficiencyPct) * 10) / 10,
    totalSleepMinutes: current.meanTotalSleepMinutes - prior.meanTotalSleepMinutes,
    timeInBedMinutes: current.meanTimeInBedMinutes - prior.meanTimeInBedMinutes,
    latencyMinutes: current.meanLatencyMinutes - prior.meanLatencyMinutes,
    wasoMinutes: current.meanWasoMinutes - prior.meanWasoMinutes,
    priorNights: prior.nights,
  };
}

/**
 * Plain-language band for an efficiency figure. Carries a word, never a colour
 * alone — the palette cannot be the only thing saying "this needs attention".
 */
export function efficiencyBand(pct: number): { tone: "steady" | "watch"; label: string } {
  return pct >= HEALTHY_EFFICIENCY_PCT
    ? { tone: "steady", label: `${Math.round(pct)}% — in the healthy range` }
    : { tone: "watch", label: `Below ${HEALTHY_EFFICIENCY_PCT}% — worth watching` };
}

/** The best and worst nights of a week, by efficiency. */
export type BestAndWorst = {
  best: ScoredNight[];
  worst: ScoredNight[];
};

/** How many scored nights before splitting a week into best and worst says anything. */
export const MIN_NIGHTS_FOR_SPLIT = 6;

/**
 * Split a week into its better and worse nights.
 *
 * Returns null below six scored nights. With five you would be calling two nights
 * "the worst" out of five, which reads as a verdict and is really a coin toss; the
 * comparison only earns its place when there is a middle to leave out.
 */
export function bestAndWorst(nights: ScoredNight[], take = 3): BestAndWorst | null {
  if (nights.length < MIN_NIGHTS_FOR_SPLIT) return null;
  const size = Math.min(take, Math.floor(nights.length / 2));
  // Sort a copy: callers pass the shared scoreNights() array.
  const ranked = [...nights].sort((a, b) => b.geometry.efficiencyPct - a.geometry.efficiencyPct);
  return { best: ranked.slice(0, size), worst: ranked.slice(-size).reverse() };
}

/**
 * How scattered the middles of the nights were.
 *
 * Circular: nights centred either side of midnight must not read as a 23-hour
 * spread. Measured as the smallest arc containing every midpoint, which is the
 * honest answer for a set of times on a clock face.
 */
export type MidpointSpread = {
  /** Mean midpoint, minutes from midnight. */
  centerMinutes: number;
  /** Smallest arc containing every night, in minutes. */
  spreadMinutes: number;
  /** Where the arc starts, minutes from midnight. */
  fromMinutes: number;
  nights: number;
};

export function midpointSpread(nights: ScoredNight[]): MidpointSpread | null {
  if (nights.length === 0) return null;
  const points = nights.map((n) => n.midpointMinutes).sort((a, b) => a - b);
  if (points.length === 1) {
    return { centerMinutes: points[0]!, spreadMinutes: 0, fromMinutes: points[0]!, nights: 1 };
  }

  // The largest gap between neighbours on the circle is the part NOT covered; the
  // arc is everything else. This is what keeps 23:50 and 00:10 twenty minutes apart
  // instead of twenty-three hours and forty minutes.
  let gapIndex = 0;
  let widest = MINUTES_PER_DAY - points[points.length - 1]! + points[0]!;
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i]! - points[i - 1]!;
    if (gap > widest) {
      widest = gap;
      gapIndex = i;
    }
  }
  const fromMinutes = points[gapIndex]!;
  const spreadMinutes = MINUTES_PER_DAY - widest;
  return {
    fromMinutes,
    spreadMinutes,
    centerMinutes: (fromMinutes + Math.round(spreadMinutes / 2)) % MINUTES_PER_DAY,
    nights: points.length,
  };
}

/**
 * Position of a night's midpoint along the spread's arc, 0 at the start.
 *
 * Plotting raw midpoints breaks for a week straddling midnight; this unwraps them
 * onto the arc `midpointSpread` found so the dots keep their true spacing.
 */
export function midpointOffset(midpointMinutes: number, spread: MidpointSpread): number {
  const raw = midpointMinutes - spread.fromMinutes;
  return raw < 0 ? raw + MINUTES_PER_DAY : raw;
}
