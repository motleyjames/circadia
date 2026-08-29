import { describe, expect, it } from "vitest";
import {
  dedupeReportsByMorningDate,
  filedMorningKicker,
  filedMorningRows,
  morningFileDue,
  morningPageStatus,
  reportForMorning,
  upsertMorningReport,
  withdrawMorningReport,
} from "./morning-file";
import type { MorningReport } from "./types";

function report(
  morningDate: string,
  extra: Partial<MorningReport> = {},
): MorningReport {
  return {
    id: extra.id ?? morningDate,
    morningDate,
    wokeAt: extra.wokeAt ?? "07:30",
    fellAsleepAt: extra.fellAsleepAt ?? "23:30",
    rating: extra.rating ?? 4,
    drank: extra.drank ?? false,
    drinkCount: extra.drinkCount,
    spins: extra.spins,
    screenOffMinutes: extra.screenOffMinutes ?? 30,
    sleepLatencyMinutes: extra.sleepLatencyMinutes ?? 15,
    wokeInNight: extra.wokeInNight ?? false,
    nightWakingMinutes: extra.nightWakingMinutes ?? 0,
    usedSupplement: extra.usedSupplement ?? false,
    supplementKind: extra.supplementKind,
    supplementNote: extra.supplementNote,
    windDownHelped: extra.windDownHelped ?? "did_not_use",
    dream: extra.dream,
    createdAt: extra.createdAt ?? `${morningDate}T12:00:00.000Z`,
  };
}

describe("one morning, one file", () => {
  it("keeps the later write when two rows share a morningDate", () => {
    const first = report("2026-08-29", { id: "a", rating: 2, createdAt: "2026-08-29T12:00:00.000Z" });
    const second = report("2026-08-29", { id: "b", rating: 5, createdAt: "2026-08-29T18:00:00.000Z" });
    // Later createdAt wins even if it sits first in the array.
    expect(reportForMorning([second, first], "2026-08-29")?.id).toBe("b");
    expect(reportForMorning([second, first], "2026-08-29")?.rating).toBe(5);
  });

  it("on a createdAt tie, keeps the later array slot (last write in the file)", () => {
    const first = report("2026-08-29", { id: "a", rating: 2, createdAt: "2026-08-29T12:00:00.000Z" });
    const second = report("2026-08-29", { id: "b", rating: 5, createdAt: "2026-08-29T12:00:00.000Z" });
    expect(reportForMorning([first, second], "2026-08-29")?.id).toBe("b");
  });

  it("dedupes to one row per civil date, sorted", () => {
    const rows = dedupeReportsByMorningDate([
      report("2026-08-30", { rating: 3 }),
      report("2026-08-29", { id: "old", rating: 1, createdAt: "2026-08-29T08:00:00.000Z" }),
      report("2026-08-29", { id: "new", rating: 5, createdAt: "2026-08-29T09:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.morningDate)).toEqual(["2026-08-29", "2026-08-30"]);
    expect(rows[0]?.id).toBe("new");
    expect(rows[0]?.rating).toBe(5);
  });

  it("upsert replaces the page and keeps the id — it does not append", () => {
    const original = report("2026-08-29", { id: "keep-me", rating: 2 });
    const other = report("2026-08-28", { id: "yesterday", rating: 3 });
    const next = report("2026-08-29", {
      id: "should-not-keep",
      rating: 5,
      createdAt: "2026-08-29T20:00:00.000Z",
    });
    const rows = upsertMorningReport([other, original], next);
    expect(rows).toHaveLength(2);
    const today = reportForMorning(rows, "2026-08-29");
    expect(today?.id).toBe("keep-me");
    expect(today?.rating).toBe(5);
    expect(today?.createdAt).toBe("2026-08-29T20:00:00.000Z");
    expect(reportForMorning(rows, "2026-08-28")?.id).toBe("yesterday");
  });

  it("withdraw drops every row for that morning and leaves the others", () => {
    const rows = withdrawMorningReport(
      [
        report("2026-08-28"),
        report("2026-08-29", { id: "x" }),
        report("2026-08-29", { id: "y" }),
      ],
      "2026-08-29",
    );
    expect(rows.map((r) => r.morningDate)).toEqual(["2026-08-28"]);
  });

  it("does not nag in the wee hours, and treats afternoon as a late file, not a second night", () => {
    const empty: MorningReport[] = [];
    const filed = [report("2026-08-29")];
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 3, 0, 0))).toBe("quiet");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 7, 30, 0))).toBe("unfiled-open");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 16, 0, 0))).toBe("unfiled-late");
    expect(morningPageStatus(filed, new Date(2026, 7, 29, 7, 30, 0))).toBe("filed");
    expect(morningPageStatus(filed, new Date(2026, 7, 29, 22, 0, 0))).toBe("filed");
    expect(morningFileDue(empty, new Date(2026, 7, 29, 3, 0, 0))).toBe(false);
    expect(morningFileDue(empty, new Date(2026, 7, 29, 7, 30, 0))).toBe(true);
    expect(morningFileDue(filed, new Date(2026, 7, 29, 7, 30, 0))).toBe(false);
  });

  it("writes the filed page in mouth register, not lab labels", () => {
    const page = report("2026-08-29", {
      wokeAt: "07:30",
      fellAsleepAt: "23:30",
      rating: 2,
      drank: true,
      drinkCount: 3,
      spins: true,
      screenOffMinutes: 0,
      sleepLatencyMinutes: 50,
      wokeInNight: true,
      nightWakingMinutes: 45,
      usedSupplement: true,
      supplementKind: "antihistamine",
      windDownHelped: "no",
      dream: { text: "A hallway that would not end.", wantMeaning: false },
    });
    const rows = filedMorningRows(page, "imperial");
    const text = rows.map((r) => `${r.kicker}: ${r.body}`).join("\n");
    expect(filedMorningKicker("2026-08-29")).toBe("One night. One page. Aug 29.");
    expect(text).toMatch(/11:30 pm/);
    expect(text).toMatch(/7:30 am/);
    expect(text).toMatch(/8h/);
    expect(text).toContain("2 — rough.");
    expect(text).toContain("Yes — 3 drinks. Spins.");
    expect(text).toContain("In bed with a screen.");
    expect(text).toContain("40 to 60 minutes.");
    expect(text).toContain("Woke and struggled.");
    expect(text).toContain("Unisom-type.");
    expect(text).not.toMatch(/MSF|AASM|CBT-I|latency bucket/i);
    expect(text).toContain("stored only.");
  });
});
