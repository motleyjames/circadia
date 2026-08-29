import { describe, expect, it } from "vitest";
import {
  dedupeReportsByMorningDate,
  filedNight,
  morningFileDue,
  morningPageStatus,
  reportForMorning,
  sleepSpanPercents,
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

  it("opens from programmed wake, not a generic 5am window", () => {
    const empty: MorningReport[] = [];
    const filed = [report("2026-08-29")];
    const wake7 = "07:00";
    const wake10 = "10:00";

    expect(morningPageStatus(empty, new Date(2026, 7, 29, 3, 0, 0), wake7)).toBe("quiet");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 6, 29, 0), wake7)).toBe("quiet");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 6, 30, 0), wake7)).toBe("unfiled-open");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 7, 5, 0), wake7)).toBe("unfiled-open");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 16, 0, 0), wake7)).toBe("unfiled-late");

    // 10am wake: 7am is still night for this person.
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 7, 0, 0), wake10)).toBe("quiet");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 9, 30, 0), wake10)).toBe("unfiled-open");
    expect(morningPageStatus(empty, new Date(2026, 7, 29, 10, 0, 0), wake10)).toBe("unfiled-open");

    expect(morningPageStatus(filed, new Date(2026, 7, 29, 7, 30, 0), wake7)).toBe("filed");
    expect(morningFileDue(empty, new Date(2026, 7, 29, 3, 0, 0), wake7)).toBe(false);
    expect(morningFileDue(empty, new Date(2026, 7, 29, 7, 30, 0), wake7)).toBe(true);
    expect(morningFileDue(empty, new Date(2026, 7, 29, 16, 0, 0), wake7)).toBe(true);
    expect(morningFileDue(filed, new Date(2026, 7, 29, 7, 30, 0), wake7)).toBe(false);
  });

  it("places the sleep fill on a padded track (hand vector)", () => {
    // 8h = 480m. Window = 480 + 90 + 90 = 660. Fill starts at 90/660, width 480/660.
    expect(480 + 90 + 90).toBe(660);
    expect((90 / 660) * 100).toBeCloseTo(13.636363, 5);
    expect((480 / 660) * 100).toBeCloseTo(72.727272, 5);
    const span = sleepSpanPercents(480);
    expect(span.startPercent).toBeCloseTo(90 / 660 * 100, 10);
    expect(span.widthPercent).toBeCloseTo(480 / 660 * 100, 10);
    expect(span.startPercent + span.widthPercent).toBeCloseTo(((90 + 480) / 660) * 100, 10);
  });

  it("composes a night as duration + facts, not lab labels", () => {
    const page = report("2026-08-29", {
      wokeAt: "09:00",
      fellAsleepAt: "23:30",
      rating: 3,
      drank: true,
      drinkCount: 3,
      spins: true,
      screenOffMinutes: 0,
      sleepLatencyMinutes: 30,
      wokeInNight: false,
      usedSupplement: true,
      supplementKind: "antihistamine",
      windDownHelped: "did_not_use",
      dream: { text: "A hallway that would not end.", wantMeaning: false },
    });
    const night = filedNight(page, "imperial");
    expect(night.dateLabel).toBe("Aug 29");
    expect(night.durationLabel).toBe("9h 30m");
    expect(overnightCheck()).toBe(570);
    expect(night.asleepLabel).toBe("11:30 pm");
    expect(night.wakeLabel).toBe("9 am");
    expect(night.ratingWord).toBe("mixed");
    const byLabel = Object.fromEntries(night.facts.map((f) => [f.label, f]));
    expect(byLabel.Alcohol?.value).toBe("3 · spins");
    expect(byLabel.Alcohol?.warn).toBe(true);
    expect(byLabel.Screens?.value).toBe("In bed");
    expect(byLabel.Aid?.value).toBe("Unisom-type");
    expect(byLabel.Night?.value).toBe("Through");
    expect(night.dream).toBe("A hallway that would not end.");
    expect(JSON.stringify(night)).not.toMatch(/MSF|AASM|CBT-I|latency bucket/i);
  });
});

function overnightCheck(): number {
  // 23:30 = 1410. 09:00 next day = 1410 + 570 = 1980. Independent of overnightDuration.
  return 24 * 60 - 1410 + 9 * 60;
}
