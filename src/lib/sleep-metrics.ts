import { overnightDuration } from "@/lib/time";
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

function isClock(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

/**
 * Score one night, or return null.
 *
 * Null happens for two different reasons and both are correct: the night predates
 * these questions, or the answers cannot describe a real night (asleep longer than
 * in bed, negative time awake). Rendering "0% efficiency" for either would be worse
 * than rendering nothing.
 */
export function nightGeometry(report: MorningReport): NightGeometry | null {
  const { inBedAt, outOfBedAt, wokeAt } = report;
  const triedToSleepAt = report.triedToSleepAt ?? inBedAt;
  if (!isClock(inBedAt) || !isClock(outOfBedAt) || !isClock(triedToSleepAt) || !isClock(wokeAt)) {
    return null;
  }

  const timeInBedMinutes = overnightDuration(inBedAt, outOfBedAt);
  if (timeInBedMinutes <= 0 || timeInBedMinutes > MAX_PLAUSIBLE_TIB_MINUTES) return null;

  const latencyMinutes = Math.max(0, report.sleepLatencyMinutes ?? 0);
  const wasoMinutes = Math.max(0, report.wokeInNight ? (report.nightWakingMinutes ?? 0) : 0);

  // The window between trying to sleep and waking for the last time.
  const sleepPeriodMinutes = overnightDuration(triedToSleepAt, wokeAt);
  const terminalMinutes = overnightDuration(wokeAt, outOfBedAt);
  const totalSleepMinutes = sleepPeriodMinutes - latencyMinutes - wasoMinutes;

  // Contradictory answers: more sleep than there was night, or than there was bed.
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
  const [h, m] = start.split(":").map(Number);
  const total = (h! * 60 + m! + Math.max(0, report.sleepLatencyMinutes ?? 0)) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type WeekGeometry = {
  /** How many of the week's nights could be scored at all. */
  nights: number;
  meanTimeInBedMinutes: number;
  meanTotalSleepMinutes: number;
  meanEfficiencyPct: number;
  meanLatencyMinutes: number;
  meanWasoMinutes: number;
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
    nightsAtHealthyEfficiency: scored.filter((g) => g.efficiencyPct >= HEALTHY_EFFICIENCY_PCT).length,
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
