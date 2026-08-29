import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULED_DAYS,
  coerceScheduledDays,
  describeScheduledDays,
  isScheduledMorning,
  obligatedMorningCount,
  toggleScheduledDay,
  weekdayFromMorningDate,
} from "./schedule";

describe("scheduled days", () => {
  it("defaults to Mon–Fri obligated, weekend free", () => {
    expect(DEFAULT_SCHEDULED_DAYS).toEqual([false, true, true, true, true, true, false]);
    expect(DEFAULT_SCHEDULED_DAYS).toHaveLength(7);
    expect(obligatedMorningCount(DEFAULT_SCHEDULED_DAYS)).toBe(5);
  });

  it("coerces missing or malformed values to the default, and keeps a real all-off week", () => {
    expect(coerceScheduledDays(undefined)).toEqual(DEFAULT_SCHEDULED_DAYS);
    expect(coerceScheduledDays([true, false])).toEqual(DEFAULT_SCHEDULED_DAYS);
    expect(coerceScheduledDays([1, 1, 1, 1, 1, 1, 1])).toEqual(DEFAULT_SCHEDULED_DAYS);
    const breakWeek = [false, false, false, false, false, false, false] as const;
    expect(coerceScheduledDays([...breakWeek])).toEqual([...breakWeek]);
  });

  it("toggles one civil day without mutating the original", () => {
    const before = coerceScheduledDays(DEFAULT_SCHEDULED_DAYS);
    const after = toggleScheduledDay(before, 5);
    expect(before[5]).toBe(true);
    expect(after[5]).toBe(false);
    expect(after[1]).toBe(true);
    expect(toggleScheduledDay(before, 99)).toEqual(before);
  });

  it("reads weekday from the calendar date, not from Date.parse", () => {
    // 2026-08-29 is Saturday (session clock). Independent path: Date.UTC y/m/d → getUTCDay.
    expect(weekdayFromMorningDate("2026-08-29")).toBe(6);
    expect(new Date(Date.UTC(2026, 7, 29)).getUTCDay()).toBe(6);
    expect(weekdayFromMorningDate("2026-08-30")).toBe(0);
    expect(new Date(Date.UTC(2026, 7, 30)).getUTCDay()).toBe(0);
    expect(weekdayFromMorningDate("2026-08-31")).toBe(1);
    expect(weekdayFromMorningDate("2024-02-29")).toBe(4);
    expect(weekdayFromMorningDate("2024-02-30")).toBeNull();
    expect(weekdayFromMorningDate("August 30")).toBeNull();
  });

  it("classifies a night by morningDate against the person's schedule", () => {
    const days = DEFAULT_SCHEDULED_DAYS;
    expect(isScheduledMorning("2026-08-30", days)).toBe(false); // Sunday
    expect(isScheduledMorning("2026-08-31", days)).toBe(true); // Monday
    expect(isScheduledMorning("2026-08-29", days)).toBe(false); // Saturday
    expect(isScheduledMorning("nope", days)).toBeNull();
    const sundayShift = toggleScheduledDay(days, 0);
    expect(isScheduledMorning("2026-08-30", sundayShift)).toBe(true);
  });

  it("describes obligated mornings without calling them weekdays", () => {
    expect(describeScheduledDays(DEFAULT_SCHEDULED_DAYS)).toBe(
      "Monday · Tuesday · Wednesday · Thursday · Friday",
    );
    expect(describeScheduledDays([false, false, false, false, false, false, false])).toBe(
      "No mornings are obligated.",
    );
    expect(describeScheduledDays([true, true, true, true, true, true, true])).toBe(
      "Every morning is obligated.",
    );
  });
});
