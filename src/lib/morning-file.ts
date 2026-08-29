import type {
  LatencyBucket,
  MorningReport,
  NightWakingDuration,
  ScreenOffMinutes,
  SleepRating,
  SupplementKind,
  Units,
  WindDownHelp,
} from "@/lib/types";
import { isCivilDate, formatMorningDate } from "@/lib/schedule";
import {
  clockToMinutes,
  formatClock,
  formatDuration,
  overnightDuration,
  todayIsoDate,
} from "@/lib/time";

export type MorningPageStatus = "filed" | "unfiled-open" | "unfiled-late" | "quiet";

export type FiledFact = {
  label: string;
  value: string;
  warn?: boolean;
};

export type FiledNight = {
  dateLabel: string;
  durationLabel: string;
  asleepLabel: string;
  wakeLabel: string;
  rating: SleepRating;
  ratingWord: string;
  spanStartPercent: number;
  spanWidthPercent: number;
  facts: FiledFact[];
  dream?: string;
};

/** Open the morning prompt this many minutes before programmed wake. */
export const MORNING_OPEN_BEFORE_WAKE_MINUTES = 30;
/** First stretch after wake still reads as “this morning,” not a late catch-up. */
export const MORNING_OPEN_AFTER_WAKE_MINUTES = 6 * 60;

const RATING_WORD: Record<SleepRating, string> = {
  1: "wrecked",
  2: "rough",
  3: "mixed",
  4: "decent",
  5: "restored",
};

const SPAN_PAD_MINUTES = 90;

/**
 * The file for one civil morning. If a diary ever stacked two rows on the
 * same date, the later write wins — never the first, never a merge.
 */
export function reportForMorning(reports: MorningReport[], morningDate: string): MorningReport | null {
  let winner: MorningReport | null = null;
  let winnerIndex = -1;
  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    if (!report || report.morningDate !== morningDate) continue;
    if (
      !winner ||
      report.createdAt > winner.createdAt ||
      (report.createdAt === winner.createdAt && i > winnerIndex)
    ) {
      winner = report;
      winnerIndex = i;
    }
  }
  return winner;
}

/** One row per morningDate, sorted by that date. Later write wins on a clash. */
export function dedupeReportsByMorningDate(reports: MorningReport[]): MorningReport[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    if (!isCivilDate(report.morningDate)) continue;
    if (seen.has(report.morningDate)) continue;
    seen.add(report.morningDate);
    dates.push(report.morningDate);
  }
  dates.sort((a, b) => a.localeCompare(b));
  return dates.map((date) => reportForMorning(reports, date)!);
}

/**
 * Put this morning on the file. Same date replaces the page and keeps its id.
 * It does not append a second night.
 */
export function upsertMorningReport(reports: MorningReport[], incoming: MorningReport): MorningReport[] {
  const existing = reportForMorning(reports, incoming.morningDate);
  const next: MorningReport = existing
    ? { ...incoming, id: existing.id, createdAt: incoming.createdAt }
    : incoming;
  return dedupeReportsByMorningDate([...reports.filter((r) => r.morningDate !== next.morningDate), next]);
}

export function withdrawMorningReport(reports: MorningReport[], morningDate: string): MorningReport[] {
  return reports.filter((r) => r.morningDate !== morningDate);
}

/**
 * Tonight / nav timing. The Morning tab itself never locks — if you are
 * awake you can file. Prompts wait for the programmed wake, not 5am.
 */
export function morningPageStatus(
  reports: MorningReport[],
  now = new Date(),
  targetWake = "07:00",
): MorningPageStatus {
  const today = todayIsoDate(now);
  if (reportForMorning(reports, today)) return "filed";
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const wakeMinutes = clockToMinutes(targetWake);
  const openMinutes = Math.max(0, wakeMinutes - MORNING_OPEN_BEFORE_WAKE_MINUTES);
  if (nowMinutes < openMinutes) return "quiet";
  if (nowMinutes < wakeMinutes + MORNING_OPEN_AFTER_WAKE_MINUTES) return "unfiled-open";
  return "unfiled-late";
}

export function morningFileDue(
  reports: MorningReport[],
  now = new Date(),
  targetWake = "07:00",
): boolean {
  const status = morningPageStatus(reports, now, targetWake);
  return status === "unfiled-open" || status === "unfiled-late";
}

export function ratingWord(rating: SleepRating): string {
  return RATING_WORD[rating];
}

export function filedNight(report: MorningReport, units: Units): FiledNight {
  const durationMinutes = overnightDuration(report.fellAsleepAt, report.wokeAt);
  const span = sleepSpanPercents(durationMinutes);
  const facts: FiledFact[] = [
    { label: "Felt", value: RATING_WORD[report.rating], warn: report.rating <= 2 },
    { label: "Alcohol", value: alcoholValue(report), warn: report.drank },
    { label: "Screens", value: screenValue(report.screenOffMinutes), warn: report.screenOffMinutes <= 15 },
    { label: "To sleep", value: latencyValue(report.sleepLatencyMinutes), warn: report.sleepLatencyMinutes >= 30 },
    { label: "Night", value: wakingValue(report), warn: report.wokeInNight },
    { label: "Aid", value: aidValue(report) },
    { label: "Wind-down", value: windValue(report.windDownHelped) },
  ];
  const dream = report.dream?.text.trim();
  return {
    dateLabel: formatMorningDate(report.morningDate),
    durationLabel: formatDuration(durationMinutes),
    asleepLabel: formatClock(report.fellAsleepAt, units),
    wakeLabel: formatClock(report.wokeAt, units),
    rating: report.rating,
    ratingWord: RATING_WORD[report.rating],
    spanStartPercent: span.startPercent,
    spanWidthPercent: span.widthPercent,
    facts,
    dream: dream || undefined,
  };
}

/**
 * Sleep block on a padded overnight track.
 * Shoulders are SPAN_PAD_MINUTES on each side, so the fill is duration / (duration + 2×pad).
 */
export function sleepSpanPercents(durationMinutes: number): { startPercent: number; widthPercent: number } {
  const duration = Math.max(1, durationMinutes);
  const windowMinutes = duration + SPAN_PAD_MINUTES * 2;
  return {
    startPercent: (SPAN_PAD_MINUTES / windowMinutes) * 100,
    widthPercent: (duration / windowMinutes) * 100,
  };
}

function alcoholValue(report: MorningReport): string {
  if (!report.drank) return "None";
  const n = report.drinkCount;
  const drinks = n === undefined ? "Yes" : n >= 5 ? "5+" : String(n);
  if (report.spins === true) return `${drinks} · spins`;
  return drinks;
}

function screenValue(value: ScreenOffMinutes): string {
  switch (value) {
    case 0:
      return "In bed";
    case 15:
      return "15m off";
    case 30:
      return "30m off";
    case 45:
      return "45m off";
    case 60:
      return "1h off";
  }
}

function latencyValue(value: LatencyBucket): string {
  switch (value) {
    case 5:
      return "<10m";
    case 15:
      return "10–20m";
    case 30:
      return "20–40m";
    case 50:
      return "40–60m";
    case 75:
      return "1h+";
  }
}

function wakingValue(report: MorningReport): string {
  if (!report.wokeInNight) return "Through";
  return wakingDuration(report.nightWakingMinutes);
}

function wakingDuration(value: NightWakingDuration): string {
  switch (value) {
    case 0:
      return "Woke";
    case 10:
      return "~10m up";
    case 25:
      return "~25m up";
    case 45:
      return "~45m up";
    case 70:
      return "1h+ up";
  }
}

function aidValue(report: MorningReport): string {
  if (!report.usedSupplement) return "None";
  if (report.supplementKind === "other" && report.supplementNote?.trim()) {
    return report.supplementNote.trim();
  }
  switch (report.supplementKind) {
    case "melatonin":
      return "Melatonin";
    case "magnesium":
      return "Magnesium";
    case "both":
      return "Both";
    case "antihistamine":
      return "Unisom-type";
    case "other":
      return "Other";
    default:
      return "Yes";
  }
}

function windValue(value: WindDownHelp): string {
  switch (value) {
    case "yes":
      return "Helped";
    case "a_bit":
      return "A bit";
    case "no":
      return "No";
    case "did_not_use":
      return "Skipped";
  }
}
