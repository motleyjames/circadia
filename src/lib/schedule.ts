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

/** Short label for a header — not the picker caption. */
export function compactScheduledDays(days: ScheduledDays): string {
  const count = obligatedMorningCount(days);
  if (count === 0) return "no obligated mornings";
  if (count === 7) return "every morning";
  const monFri = !days[0] && days[1] && days[2] && days[3] && days[4] && days[5] && !days[6];
  if (monFri) return "Mon–Fri";
  const monSat = !days[0] && days[1] && days[2] && days[3] && days[4] && days[5] && days[6];
  if (monSat) return "Mon–Sat";
  return WEEKDAY_SHORT.filter((_, i) => days[i]).join(" · ");
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar date only. Parsed as local Y-M-D so a morning is not shifted by timezone. */
export function formatMorningDate(iso: string): string {
  const [ys, ms, ds] = iso.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || !m || !d || m > 12) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

/** True only for a real YYYY-MM-DD civil date. `2026-13-40` is not one. */
export function isCivilDate(iso: string): boolean {
  return parseIsoDate(iso) !== null;
}

function formatUtcIso(utc: Date): string {
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calendar weekday of a morning YYYY-MM-DD.
 * Parsed as a date, not a timestamp — `new Date("2026-08-30")` is UTC midnight
 * and becomes the previous evening in US timezones.
 * Returns null if the stamp is not a real civil date.
 */
export function weekdayFromMorningDate(morningDate: string): number | null {
  const parsed = parseIsoDate(morningDate);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

/** Shift a civil YYYY-MM-DD. Null if the stamp is not a real date. */
export function shiftIsoDate(iso: string, deltaDays: number): string | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + deltaDays));
  return formatUtcIso(utc);
}

/** Classify a night by the morning it was logged. Null if the date is unusable. */
export function isScheduledMorning(morningDate: string, scheduledDays: ScheduledDays): boolean | null {
  const weekday = weekdayFromMorningDate(morningDate);
  if (weekday === null) return null;
  return scheduledDays[weekday];
}
