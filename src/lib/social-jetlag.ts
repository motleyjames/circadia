import type { MorningReport, ScheduledDays } from "@/lib/types";
import { isScheduledMorning, obligatedMorningCount, shiftIsoDate } from "@/lib/schedule";
import {
  circularMeanMinutes,
  mean,
  midpointMinutes,
  minutesToClock,
  overnightDuration,
  todayIsoDate,
} from "@/lib/time";

/** Inclusive civil-day window for SJL. */
export const SJL_WINDOW_DAYS = 28;
export const SJL_MIN_SCHEDULED_NIGHTS = 3;
export const SJL_MIN_FREE_NIGHTS = 2;
export const MINUTES_PER_DAY = 24 * 60;

export type SjlWithhold = "school-break" | "few-scheduled" | "few-free";

export type SocialJetLag = {
  mswMinutes: number;
  msfMinutes: number;
  socialJetLagMinutes: number;
  msfScMinutes: number;
  scheduledCount: number;
  freeCount: number;
};

export function midSleepMinutes(report: MorningReport): number {
  return midpointMinutes(report.fellAsleepAt, report.wokeAt);
}

export function sleepDurationMinutes(report: MorningReport): number {
  return overnightDuration(report.fellAsleepAt, report.wokeAt);
}

/**
 * Shortest distance on a 24h clock, in minutes.
 * Linear |a − b| across midnight is the bug — 23:00 vs 00:30 is 90 min, not 1350.
 */
export function circularDistanceMinutes(aMinutes: number, bMinutes: number): number {
  const a = ((aMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const b = ((bMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const raw = Math.abs(a - b);
  return Math.min(raw, MINUTES_PER_DAY - raw);
}

function windowStartIso(now: Date): string | null {
  const today = todayIsoDate(now);
  return shiftIsoDate(today, -(SJL_WINDOW_DAYS - 1));
}

function inTrailingWindow(morningDate: string, now: Date): boolean {
  const today = todayIsoDate(now);
  const start = windowStartIso(now);
  if (!start) return false;
  return morningDate >= start && morningDate <= today;
}

type Partition = {
  scheduled: MorningReport[];
  free: MorningReport[];
};

function partitionWindow(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now: Date,
): Partition {
  const scheduled: MorningReport[] = [];
  const free: MorningReport[] = [];
  for (const report of reports) {
    if (!inTrailingWindow(report.morningDate, now)) continue;
    const obligated = isScheduledMorning(report.morningDate, scheduledDays);
    if (obligated === null) continue;
    if (obligated) scheduled.push(report);
    else free.push(report);
  }
  return { scheduled, free };
}

export function sjlWithhold(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now = new Date(),
): SjlWithhold | null {
  if (obligatedMorningCount(scheduledDays) === 0) return "school-break";
  const { scheduled, free } = partitionWindow(reports, scheduledDays, now);
  if (scheduled.length < SJL_MIN_SCHEDULED_NIGHTS) return "few-scheduled";
  if (free.length < SJL_MIN_FREE_NIGHTS) return "few-free";
  return null;
}

function circularMeanMidSleepMinutes(nights: MorningReport[]): number | null {
  if (nights.length === 0) return null;
  const clocks = nights.map((night) => minutesToClock(midSleepMinutes(night)));
  return circularMeanMinutes(clocks);
}

export function msw(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now = new Date(),
): number | null {
  if (sjlWithhold(reports, scheduledDays, now)) return null;
  const { scheduled } = partitionWindow(reports, scheduledDays, now);
  return circularMeanMidSleepMinutes(scheduled);
}

export function msf(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now = new Date(),
): number | null {
  if (sjlWithhold(reports, scheduledDays, now)) return null;
  const { free } = partitionWindow(reports, scheduledDays, now);
  return circularMeanMidSleepMinutes(free);
}

export function socialJetLagMinutes(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now = new Date(),
): number | null {
  const work = msw(reports, scheduledDays, now);
  const rest = msf(reports, scheduledDays, now);
  if (work === null || rest === null) return null;
  return circularDistanceMinutes(rest, work);
}

export function msfSc(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now = new Date(),
): number | null {
  if (sjlWithhold(reports, scheduledDays, now)) return null;
  const { scheduled, free } = partitionWindow(reports, scheduledDays, now);
  const msfMinutes = circularMeanMidSleepMinutes(free);
  if (msfMinutes === null) return null;
  const sdFreeMinutes = mean(free.map(sleepDurationMinutes));
  const sdWeekMinutes = mean([...scheduled, ...free].map(sleepDurationMinutes));
  return msfMinutes - 0.5 * (sdFreeMinutes - sdWeekMinutes);
}

export function computeSocialJetLag(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now = new Date(),
): SocialJetLag | null {
  const mswMinutes = msw(reports, scheduledDays, now);
  const msfMinutes = msf(reports, scheduledDays, now);
  const lagMinutes = socialJetLagMinutes(reports, scheduledDays, now);
  const msfScMinutes = msfSc(reports, scheduledDays, now);
  if (mswMinutes === null || msfMinutes === null || lagMinutes === null || msfScMinutes === null) {
    return null;
  }
  const { scheduled, free } = partitionWindow(reports, scheduledDays, now);
  return {
    mswMinutes,
    msfMinutes,
    socialJetLagMinutes: lagMinutes,
    msfScMinutes,
    scheduledCount: scheduled.length,
    freeCount: free.length,
  };
}
