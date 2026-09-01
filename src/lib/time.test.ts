import { describe, expect, it } from "vitest";
import {
  circularMeanMinutes,
  circularMeanOfMinutes,
  clockToMinutes,
  formatCountdownHms,
  formatDuration,
  formatWallClock,
  minutesToClock,
  overnightDuration,
  screenOffClock,
  secondsUntilClock,
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

  it("string circularMeanMinutes delegates to circularMeanOfMinutes", () => {
    expect(circularMeanOfMinutes([])).toBe(0);
    expect(circularMeanMinutes(["07:00"])).toBeCloseTo(circularMeanOfMinutes([7 * 60]), 10);
    expect(circularMeanMinutes(["07:00", "07:10", "07:20"])).toBeCloseTo(
      circularMeanOfMinutes([7 * 60, 7 * 60 + 10, 7 * 60 + 20]),
      10,
    );
    expect(circularMeanOfMinutes([195.5, 195.5])).toBeCloseTo(195.5, 10);
    expect(minutesToClock(195.5)).toBe("03:16");
    expect(circularMeanMinutes([minutesToClock(195.5), minutesToClock(195.5)])).toBeCloseTo(196, 10);
  });

  it("counts live seconds to a clock and formats wall time", () => {
    const now = new Date(2026, 0, 1, 21, 0, 5);
    expect(secondsUntilClock("22:30", now)).toBe(1 * 3600 + 30 * 60 - 5);
    expect(formatCountdownHms(65)).toBe("1:05");
    expect(formatCountdownHms(3661)).toBe("1:01:01");
    expect(formatWallClock(now, "imperial")).toBe("9:00:05 pm");
    expect(formatWallClock(now, "metric")).toBe("21:00:05");
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
