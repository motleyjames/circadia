import type { ScheduledDays } from "@/lib/types";

/** Sun off, Mon–Fri on, Sat off. A default, not a fact about this person. */
export const DEFAULT_SCHEDULED_DAYS: ScheduledDays = [false, true, true, true, true, true, false];

export const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
export const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function copyScheduledDays(days: ScheduledDays): ScheduledDays {
  return [days[0], days[1], days[2], days[3], days[4], days[5], days[6]];
}

export function coerceScheduledDays(value: unknown): ScheduledDays {
  if (!Array.isArray(value) || value.length !== 7) return copyScheduledDays(DEFAULT_SCHEDULED_DAYS);
  if (!value.every((flag) => typeof flag === "boolean")) return copyScheduledDays(DEFAULT_SCHEDULED_DAYS);
  return [value[0], value[1], value[2], value[3], value[4], value[5], value[6]];
}

export function toggleScheduledDay(days: ScheduledDays, index: number): ScheduledDays {
  if (index < 0 || index > 6) return copyScheduledDays(days);
  const next = copyScheduledDays(days);
  next[index] = !next[index];
  return next;
}

export function obligatedMorningCount(days: ScheduledDays): number {
  return days.reduce((n, on) => n + (on ? 1 : 0), 0);
}

export function describeScheduledDays(days: ScheduledDays): string {
  const count = obligatedMorningCount(days);
  if (count === 0) return "No mornings are obligated.";
  if (count === 7) return "Every morning is obligated.";
  const names = WEEKDAY_FULL.filter((_, i) => days[i]);
  return names.join(" · ");
}

/**
 * Calendar weekday of a morning YYYY-MM-DD.
 * Parsed as a date, not a timestamp — `new Date("2026-08-30")` is UTC midnight
 * and becomes the previous evening in US timezones.
 * Returns null if the stamp is not a real civil date.
 */
export function weekdayFromMorningDate(morningDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(morningDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return utc.getUTCDay();
}

/** Classify a night by the morning it was logged. Null if the date is unusable. */
export function isScheduledMorning(morningDate: string, scheduledDays: ScheduledDays): boolean | null {
  const weekday = weekdayFromMorningDate(morningDate);
  if (weekday === null) return null;
  return scheduledDays[weekday];
}
