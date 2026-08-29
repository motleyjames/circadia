import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULED_DAYS } from "@/lib/schedule";
import {
  signedCircularDeltaMinutes,
  socialJetLagCopy,
  socialJetLagCopyFromReports,
  socialJetLagSleepNote,
} from "@/lib/social-jetlag-copy";
import type { SocialJetLag } from "@/lib/social-jetlag";
import { formatDuration } from "@/lib/time";
import type { MorningReport, ScheduledDays } from "@/lib/types";

const ENGINE_JARGON = /\b(MSFsc|MSF|MSW|chronotype)\b/i;
const SCHOOL_BREAK: ScheduledDays = [false, false, false, false, false, false, false];

function measured(gap: number, msw: number, msf: number): SocialJetLag {
  return {
    mswMinutes: msw,
    msfMinutes: msf,
    socialJetLagMinutes: gap,
    msfScMinutes: msw,
    scheduledCount: 5,
    freeCount: 2,
  };
}

function assertMouth(body: string) {
  expect(body).not.toMatch(ENGINE_JARGON);
}

function night(morningDate: string, fellAsleepAt: string, wokeAt: string): MorningReport {
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

describe("socialJetLagCopy — withhold (never a number, never a zero)", () => {
  it("school-break: the comparison is meaningless with no obligated mornings", () => {
    const copy = socialJetLagCopy(null, "school-break");
    expect(copy.withheld).toBe(true);
    expect(copy.body.toLowerCase()).toMatch(/school break|no obligated|meaningless/);
    expect(copy.body).not.toMatch(/\b0h\b|\b0m\b|sits about/i);
    expect(copy.sourceIds).toEqual(["social-jetlag"]);
    assertMouth(copy.body);
    assertMouth(copy.title);
  });

  it("few-scheduled: not enough school mornings in the last 4 weeks", () => {
    const copy = socialJetLagCopy(null, "few-scheduled");
    expect(copy.withheld).toBe(true);
    expect(copy.body).toBe("Not enough school mornings logged in the last 4 weeks yet.");
    expect(copy.body).not.toMatch(/\b0h\b|sits about/i);
    assertMouth(copy.body);
  });

  it("few-free: not enough free mornings in the last 4 weeks", () => {
    const copy = socialJetLagCopy(null, "few-free");
    expect(copy.withheld).toBe(true);
    expect(copy.body).toBe("Not enough free mornings logged in the last 4 weeks yet.");
    expect(copy.body).not.toMatch(/\b0h\b|sits about/i);
    assertMouth(copy.body);
  });
});

describe("socialJetLagCopy — measured bands (later on free mornings)", () => {
  it("< 60 min: aligned; leads with formatDuration", () => {
    const copy = socialJetLagCopy(measured(45, 195, 240), null);
    expect(copy.withheld).toBe(false);
    expect(copy.body).toContain(`about ${formatDuration(45)} later`);
    expect(copy.body).toMatch(/close to aligned/);
    expect(copy.body).not.toMatch(/notable|substantial|time zones/);
    expect(copy.sourceIds).toEqual(["social-jetlag"]);
    expect(copy.kind).toBe("steady");
    assertMouth(copy.body);
  });

  it("60–119 min: notable", () => {
    const copy = socialJetLagCopy(measured(90, 195, 285), null);
    expect(copy.body).toContain(`about ${formatDuration(90)} later`);
    expect(copy.body).toMatch(/notable/);
    expect(copy.body).not.toMatch(/close to aligned|substantial|couple of time zones/);
    expect(copy.kind).toBe("lever");
    assertMouth(copy.body);
  });

  it("exactly 60 min sits in notable, not aligned", () => {
    const copy = socialJetLagCopy(measured(60, 195, 255), null);
    expect(copy.body).toMatch(/notable/);
    expect(copy.body).not.toMatch(/close to aligned/);
    assertMouth(copy.body);
  });

  it("≥ 120 min: substantial; couple of time zones west", () => {
    const copy = socialJetLagCopy(measured(150, 195, 345), null);
    expect(copy.body).toContain(`about ${formatDuration(150)} later`);
    expect(copy.body).toBe(
      "On free mornings your sleep sits about 2h 30m later than on school mornings — a substantial shift, like living a couple of time zones west on weekends.",
    );
    expect(copy.body).not.toMatch(/close to aligned|notable shift/);
    assertMouth(copy.body);
  });

  it("exactly 120 min sits in substantial", () => {
    const copy = socialJetLagCopy(measured(120, 195, 315), null);
    expect(copy.body).toMatch(/substantial/);
    assertMouth(copy.body);
  });
});

describe("socialJetLagCopy — earlier on free mornings (inverse image)", () => {
  it("substantial earlier uses east, not west", () => {
    const copy = socialJetLagCopy(measured(150, 345, 195), null);
    expect(copy.body).toContain(`about ${formatDuration(150)} earlier`);
    expect(copy.body).toMatch(/couple of time zones east/);
    expect(copy.body).not.toMatch(/\bwest\b/);
    assertMouth(copy.body);
  });

  it("aligned earlier still says close to aligned", () => {
    const copy = socialJetLagCopy(measured(20, 240, 220), null);
    expect(copy.body).toContain("earlier");
    expect(copy.body).toMatch(/close to aligned/);
    assertMouth(copy.body);
  });

  it("midnight wrap of 90 min is later, not earlier (second path: signed arc)", () => {
    expect(signedCircularDeltaMinutes(1380, 30)).toBe(90);
    expect(Math.min(Math.abs(30 - 1380), 1440 - Math.abs(30 - 1380))).toBe(90);
    const copy = socialJetLagCopy(measured(90, 1380, 30), null);
    expect(copy.body).toContain("later");
    expect(copy.body).not.toContain("earlier");
    assertMouth(copy.body);
  });
});

describe("socialJetLagCopy — zero is a real measurement, not a withhold", () => {
  it("same mid-sleep on both kinds of morning", () => {
    const copy = socialJetLagCopy(measured(0, 195, 195), null);
    expect(copy.withheld).toBe(false);
    expect(copy.body).toMatch(/same time/);
    expect(copy.body).toMatch(/close to aligned/);
    expect(copy.body).not.toMatch(/sits about/);
    assertMouth(copy.body);
  });
});

describe("socialJetLagCopy — no engine jargon in any returned copy", () => {
  it("covers withhold reasons and each band, both directions", () => {
    const copies = [
      socialJetLagCopy(null, "school-break"),
      socialJetLagCopy(null, "few-scheduled"),
      socialJetLagCopy(null, "few-free"),
      socialJetLagCopy(measured(0, 200, 200), null),
      socialJetLagCopy(measured(45, 200, 245), null),
      socialJetLagCopy(measured(90, 200, 290), null),
      socialJetLagCopy(measured(150, 200, 350), null),
      socialJetLagCopy(measured(45, 245, 200), null),
      socialJetLagCopy(measured(90, 290, 200), null),
      socialJetLagCopy(measured(150, 350, 200), null),
    ];
    for (const copy of copies) {
      assertMouth(copy.title);
      assertMouth(copy.body);
    }
  });

  it("sleep note carries the library id for citations", () => {
    const note = socialJetLagSleepNote(socialJetLagCopy(measured(150, 195, 345), null));
    expect(note.id).toBe("social-jetlag");
    expect(note.sourceIds).toEqual(["social-jetlag"]);
    assertMouth(note.body);
  });
});

describe("socialJetLagCopyFromReports — integration with the engine", () => {
  const NOW = new Date(2026, 8, 6, 12, 0, 0);

  it("school-break withhold when no days are obligated", () => {
    const copy = socialJetLagCopyFromReports([], SCHOOL_BREAK, NOW);
    expect(copy.withheld).toBe(true);
    expect(copy.body.toLowerCase()).toMatch(/meaningless|school break/);
    assertMouth(copy.body);
  });

  it("few-scheduled when the diary is empty on a Mon–Fri calendar", () => {
    const copy = socialJetLagCopyFromReports([], DEFAULT_SCHEDULED_DAYS, NOW);
    expect(copy.body).toBe("Not enough school mornings logged in the last 4 weeks yet.");
  });

  it("measured 2h 30m later matches the existing SJL fixture", () => {
    // Same clocks as social-jetlag.test.ts vector 1: mid-sleep 03:15 vs 05:45 → 150 min.
    const scheduled = ["2026-08-31", "2026-09-01", "2026-09-02"].map((d) =>
      night(d, "23:30", "07:00"),
    );
    const free = ["2026-09-05", "2026-09-06"].map((d) => night(d, "01:30", "10:00"));
    const copy = socialJetLagCopyFromReports([...scheduled, ...free], DEFAULT_SCHEDULED_DAYS, NOW);
    expect(copy.withheld).toBe(false);
    expect(copy.body).toContain("about 2h 30m later");
    expect(copy.body).toMatch(/couple of time zones west/);
    assertMouth(copy.body);
  });
});
