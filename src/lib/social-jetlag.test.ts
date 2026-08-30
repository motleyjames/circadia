import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import {
  circularDistanceMinutes,
  computeSocialJetLag,
  midSleepMinutes,
  msf,
  msfSc,
  msw,
  sleepDurationMinutes,
  sjlWithhold,
  socialJetLagMinutes,
} from "./social-jetlag";
import type { MorningReport, ScheduledDays } from "./types";
import { circularMeanMinutes, minutesToClock, overnightDuration } from "./time";

const NOW = new Date(2026, 8, 6, 12, 0, 0); // Sunday 6 Sep 2026 local

const SCHOOL_BREAK: ScheduledDays = [false, false, false, false, false, false, false];

function night(
  morningDate: string,
  fellAsleepAt: string,
  wokeAt: string,
): MorningReport {
  return {
    id: morningDate,
    morningDate,
    fellAsleepAt,
    wokeAt,
    rating: 3,
    drank: false,
    screenOffMinutes: 60,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: `${morningDate}T12:00:00.000Z`,
  };
}

describe("social jet lag", () => {
  it("test 1 — basic SJL (hand vector + circular-mean second path)", () => {
    // Scheduled: 23:30 → 07:00
    //   23:30 = 1410 min; 07:00 next day = 1860 min; duration = 450 min
    //   midpoint = 1410 + 225 = 1635 → mod 1440 = 195 min = 03:15
    // Free: 01:30 → 10:00
    //   01:30 = 90 min; 10:00 = 600 min; duration = 510 min
    //   midpoint = 90 + 255 = 345 min = 05:45
    const scheduled = ["2026-08-31", "2026-09-01", "2026-09-02"].map((d) =>
      night(d, "23:30", "07:00"),
    );
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:00"));
    const reports = [...scheduled, ...free];

    expect(sleepDurationMinutes(scheduled[0]!)).toBe(450);
    expect(overnightDuration("23:30", "07:00")).toBe(450);
    expect(midSleepMinutes(scheduled[0]!)).toBe(195);
    expect(midSleepMinutes(free[0]!)).toBe(345);

    const work = msw(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    const rest = msf(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    expect(work).toBeCloseTo(195, 10);
    expect(rest).toBeCloseTo(345, 10);
    expect(circularMeanMinutes(["03:15", "03:15", "03:15"])).toBeCloseTo(195, 10);
    expect(circularMeanMinutes(["05:45", "05:45"])).toBeCloseTo(345, 10);

    const lag = socialJetLagMinutes(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    expect(lag).toBe(150);
    expect(Math.min(Math.abs(345 - 195), 1440 - Math.abs(345 - 195))).toBe(150);
  });

  it("test 2 — midnight wrap (linear subtraction is the bug)", () => {
    // MSW = 23:00 = 1380 min; MSF = 00:30 = 30 min
    // Linear |30 − 1380| = 1350 min = 22.5 h  ← WRONG
    // Circular min(1350, 1440 − 1350) = 90 min
    expect(circularDistanceMinutes(1380, 30)).toBe(90);
    expect(Math.abs(30 - 1380)).toBe(1350);
    expect(circularDistanceMinutes(1380, 30)).toBeLessThan(12 * 60);

    // 19:00 → 03:00: duration 480; mid = 19:00 + 4h = 23:00 = 1380
    // 20:30 → 04:30: duration 480; mid = 20:30 + 4h = 00:30 = 30
    const reports = [
      night("2026-08-31", "19:00", "03:00"),
      night("2026-09-01", "19:00", "03:00"),
      night("2026-09-02", "19:00", "03:00"),
      night("2026-09-05", "20:30", "04:30"),
      night("2026-09-06", "20:30", "04:30"),
    ];
    expect(midSleepMinutes(reports[0]!)).toBe(1380);
    expect(midSleepMinutes(reports[3]!)).toBe(30);
    expect(socialJetLagMinutes(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBe(90);
  });

  it("test 3 — MSFsc (hand vector + fraction second path)", () => {
    // 5 scheduled @ 450 min (23:30–07:00), 2 free @ 510 min (01:30–10:00)
    // SD_week = (5×450 + 2×510) / 7 = 3270 / 7 = 467.142857 min
    // MSF = 345; MSFsc = 345 − 0.5 × (510 − 467.142857) = 345 − 150/7 = 2265/7
    const scheduled = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map(
      (d) => night(d, "23:30", "07:00"),
    );
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:00"));
    const reports = [...scheduled, ...free];

    const sdWeek = (5 * 450 + 2 * 510) / 7;
    expect(sdWeek).toBeCloseTo(467.142857, 6);
    const independent = 2265 / 7;
    expect(independent).toBeCloseTo(323.571429, 6);

    const got = msfSc(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    expect(got).not.toBeNull();
    expect(got!).toBeCloseTo(323.57, 2);
    expect(got!).toBeCloseTo(independent, 10);
  });

  it("test 4 — withholding: 6 scheduled and 1 free is null, not a number", () => {
    const reports = [
      night("2026-08-24", "23:30", "07:00"), // Mon
      night("2026-08-25", "23:30", "07:00"),
      night("2026-08-26", "23:30", "07:00"),
      night("2026-08-27", "23:30", "07:00"),
      night("2026-08-28", "23:30", "07:00"),
      night("2026-08-31", "23:30", "07:00"), // Mon
      night("2026-09-05", "01:30", "10:00"), // Sat — only free night
    ];
    expect(sjlWithhold(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBe("few-free");
    expect(msw(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
    expect(msf(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
    expect(socialJetLagMinutes(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
    expect(msfSc(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
    expect(computeSocialJetLag(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
  });

  it("withholds on school break even when many nights exist", () => {
    const reports = [
      night("2026-08-31", "23:30", "07:00"),
      night("2026-09-01", "23:30", "07:00"),
      night("2026-09-02", "23:30", "07:00"),
      night("2026-09-05", "01:30", "10:00"),
      night("2026-09-06", "01:30", "10:00"),
    ];
    expect(sjlWithhold(reports, SCHOOL_BREAK, NOW)).toBe("school-break");
    expect(socialJetLagMinutes(reports, SCHOOL_BREAK, NOW)).toBeNull();
  });

  it("drops mornings outside the trailing 28 civil days", () => {
    const reports = [
      night("2026-08-31", "23:30", "07:00"),
      night("2026-09-01", "23:30", "07:00"),
      night("2026-09-02", "23:30", "07:00"),
      night("2026-09-05", "01:30", "10:00"),
      night("2026-07-04", "01:30", "10:00"), // free, but outside the window
    ];
    expect(sjlWithhold(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBe("few-free");
    expect(socialJetLagMinutes(reports, DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
  });

  it("never returns 0 to mean unknown", () => {
    expect(socialJetLagMinutes([], DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
    expect(msw([], DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
    expect(minutesToClock(195)).toBe("03:15");
  });

  it("does not count a duplicated morningDate as extra scheduled nights", () => {
    const copies = [1, 2, 3].map((n) => ({
      ...night("2026-08-31", "23:30", "07:00"),
      id: `dup-${n}`,
      createdAt: `2026-08-31T1${n}:00:00.000Z`,
    }));
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:00"));
    expect(sjlWithhold([...copies, ...free], DEFAULT_SCHEDULED_DAYS, NOW)).toBe("few-scheduled");
    expect(computeSocialJetLag([...copies, ...free], DEFAULT_SCHEDULED_DAYS, NOW)).toBeNull();
  });
});

describe("MSFsc week-weighted SD (Finding A3)", () => {
  it("test 3 vector A is still 323.57 when logged nights match the calendar week", () => {
    const scheduled = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map(
      (d) => night(d, "23:30", "07:00"),
    );
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:00"));
    expect(msfSc([...scheduled, ...free], DEFAULT_SCHEDULED_DAYS, NOW)).toBeCloseTo(323.57, 2);
  });

  it("vector B uses obligatedMorningCount, not logged-night mean — 302.14, not 295.0", () => {
    // Mon–Thu obligated (WD=4, FD=3). Four work nights @ 360 min, two free @ 510.
    // SDweek = (4×360 + 3×510) / 7 = 2970/7
    // MSF = 345; MSFsc = 345 − 0.5 × (510 − 2970/7) = 2115/7
    // Logged-mean trap: (4×360 + 2×510) / 6 = 410 → 345 − 50 = 295.0
    const monThu: ScheduledDays = [false, true, true, true, true, false, false];
    const scheduled = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"].map((d) =>
      night(d, "00:00", "06:00"),
    );
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:00"));
    const reports = [...scheduled, ...free];

    expect(sleepDurationMinutes(scheduled[0]!)).toBe(360);
    expect(sleepDurationMinutes(free[0]!)).toBe(510);
    expect(midSleepMinutes(free[0]!)).toBe(345);

    const sdWeek = (4 * 360 + 3 * 510) / 7;
    expect(sdWeek).toBeCloseTo(2970 / 7, 10);
    const independent = 2115 / 7;
    expect(independent).toBeCloseTo(302.14, 2);

    const loggedMeanTrap = 345 - 0.5 * (510 - (4 * 360 + 2 * 510) / 6);
    expect(loggedMeanTrap).toBe(295);

    const got = msfSc(reports, monThu, NOW);
    expect(got).not.toBeNull();
    expect(got!).toBeCloseTo(302.14, 2);
    expect(got!).toBeCloseTo(independent, 10);
    expect(got!).not.toBeCloseTo(295.0, 1);
  });
});

describe("circular mean keeps fractional minutes", () => {
  it("does not round mid-sleep through HH:MM before averaging", () => {
    // 23:30 → 07:01: duration 451; mid = 1410 + 225.5 = 195.5
    // minutesToClock(195.5) is 03:16 — the string path would land on 196.
    const scheduled = ["2026-08-31", "2026-09-01", "2026-09-02"].map((d) =>
      night(d, "23:30", "07:01"),
    );
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:01"));
    const reports = [...scheduled, ...free];

    expect(midSleepMinutes(scheduled[0]!)).toBe(195.5);
    expect(minutesToClock(195.5)).toBe("03:16");
    expect(midSleepMinutes(free[0]!)).toBe(345.5);

    const work = msw(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    const rest = msf(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    expect(work).toBeCloseTo(195.5, 10);
    expect(rest).toBeCloseTo(345.5, 10);
    expect(work).not.toBeCloseTo(196, 5);

    const bundled = computeSocialJetLag(reports, DEFAULT_SCHEDULED_DAYS, NOW);
    expect(bundled).not.toBeNull();
    expect(bundled!.mswMinutes).toBeCloseTo(195.5, 10);
    expect(bundled!.msfMinutes).toBeCloseTo(345.5, 10);
  });
});

describe("computeSocialJetLag partitions once", () => {
  it("does not re-enter msw/msf/msfSc from the bundle path", () => {
    const src = readFileSync("src/lib/social-jetlag.ts", "utf8");
    const start = src.indexOf("export function computeSocialJetLag");
    const body = src.slice(start);
    expect(body.match(/partitionWindow\(/g)?.length).toBe(1);
    expect(body).not.toMatch(/\bmsw\(/);
    expect(body).not.toMatch(/\bmsf\(/);
    expect(body).not.toMatch(/\bmsfSc\(/);
    expect(body).not.toMatch(/\bsocialJetLagMinutes\(/);
    expect(body).not.toMatch(/\bsjlWithhold\(/);
    expect(src).toContain("obligatedMorningCount(scheduledDays)");
    expect(src).toContain("circularMeanOfMinutes");
    expect(src).not.toContain("circularMeanMinutes(");
    expect(src).not.toContain("minutesToClock");
  });
});
