import { describe, expect, it } from "vitest";
import {
  circularMeanMinutes,
  clockToMinutes,
  formatDuration,
  minutesToClock,
  overnightDuration,
  screenOffClock,
  sleepFromWake,
  sleepNeedHours,
  targetDurationMinutes,
} from "./time";

describe("time", () => {
  it("computes overnight duration across midnight", () => {
    expect(overnightDuration("23:30", "07:30")).toBe(8 * 60);
    expect(overnightDuration("01:00", "08:00")).toBe(7 * 60);
    expect(overnightDuration("22:00", "06:30")).toBe(8 * 60 + 30);
  });

  it("puts screen-off one hour before sleep", () => {
    expect(screenOffClock("23:30")).toBe("22:30");
    expect(screenOffClock("00:15")).toBe("23:15");
  });

  it("round-trips clocks", () => {
    expect(minutesToClock(clockToMinutes("07:05"))).toBe("07:05");
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("circular mean of similar wake times stays near them", () => {
    const mean = circularMeanMinutes(["07:00", "07:10", "07:20"]);
    expect(mean).toBeGreaterThan(7 * 60 - 5);
    expect(mean).toBeLessThan(7 * 60 + 25);
  });

  it("bands sleep need by age", () => {
    expect(sleepNeedHours(16).min).toBe(8);
    expect(sleepNeedHours(19).min).toBe(7);
    expect(sleepNeedHours(19).max).toBe(9);
  });

  it("computes asleep-by from a defended wake", () => {
    expect(targetDurationMinutes(19)).toBe(8 * 60);
    expect(targetDurationMinutes(16)).toBe(9 * 60);
    expect(sleepFromWake("07:00", 8 * 60)).toBe("23:00");
    expect(sleepFromWake("07:30", 8 * 60)).toBe("23:30");
    expect(sleepFromWake("06:00", 9 * 60)).toBe("21:00");
  });
});
