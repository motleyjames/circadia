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
import { isCivilDate } from "@/lib/schedule";
import { formatClock, formatDuration, overnightDuration, todayIsoDate } from "@/lib/time";
import { formatMorningDate } from "@/lib/schedule";

export type FiledRow = {
  kicker: string;
  body: string;
};

/**
 * How Tonight and the Morning tab should treat today.
 * `quiet` is 00:00–04:59 — not a morning yet; do not nag a second page.
 */
export type MorningPageStatus = "filed" | "unfiled-open" | "unfiled-late" | "quiet";

const RATING_WORD: Record<SleepRating, string> = {
  1: "wrecked",
  2: "rough",
  3: "mixed",
  4: "decent",
  5: "restored",
};

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

export function morningPageStatus(reports: MorningReport[], now = new Date()): MorningPageStatus {
  const today = todayIsoDate(now);
  if (reportForMorning(reports, today)) return "filed";
  const hour = now.getHours();
  if (hour < 5) return "quiet";
  if (hour < 13) return "unfiled-open";
  return "unfiled-late";
}

export function morningFileDue(reports: MorningReport[], now = new Date()): boolean {
  const status = morningPageStatus(reports, now);
  return status === "unfiled-open" || status === "unfiled-late";
}

export function filedMorningRows(report: MorningReport, units: Units): FiledRow[] {
  const duration = formatDuration(overnightDuration(report.fellAsleepAt, report.wokeAt));
  const rows: FiledRow[] = [
    {
      kicker: "Clock",
      body: `Asleep around ${formatClock(report.fellAsleepAt, units)}. Up at ${formatClock(report.wokeAt, units)}. About ${duration}.`,
    },
    {
      kicker: "How it felt",
      body: `${report.rating} — ${RATING_WORD[report.rating]}.`,
    },
    {
      kicker: "Alcohol",
      body: alcoholLine(report),
    },
    {
      kicker: "Screens",
      body: screenLine(report.screenOffMinutes),
    },
    {
      kicker: "Time to sleep",
      body: latencyLine(report.sleepLatencyMinutes),
    },
    {
      kicker: "Staying asleep",
      body: wakingLine(report),
    },
    {
      kicker: "Sleep aid",
      body: aidLine(report),
    },
    {
      kicker: "Wind-down",
      body: windLine(report.windDownHelped),
    },
  ];
  if (report.dream?.text.trim()) {
    rows.push({
      kicker: "Dream",
      body: report.dream.wantMeaning
        ? `${report.dream.text.trim()} · Circadia may look.`
        : `${report.dream.text.trim()} · stored only.`,
    });
  }
  return rows;
}

export function filedMorningKicker(morningDate: string): string {
  return `One night. One page. ${formatMorningDate(morningDate)}.`;
}

function alcoholLine(report: MorningReport): string {
  if (!report.drank) return "No alcohol.";
  const n = report.drinkCount;
  const drinks =
    n === undefined ? "Yes." : n >= 5 ? "Yes — 5 or more drinks." : `Yes — ${n} ${n === 1 ? "drink" : "drinks"}.`;
  if (report.spins === true) return `${drinks} Spins.`;
  if (report.spins === false) return `${drinks} No spins.`;
  return drinks;
}

function screenLine(value: ScreenOffMinutes): string {
  switch (value) {
    case 0:
      return "In bed with a screen.";
    case 15:
      return "About 15 minutes off.";
    case 30:
      return "About 30 minutes off.";
    case 45:
      return "About 45 minutes off.";
    case 60:
      return "An hour or more off.";
  }
}

function latencyLine(value: LatencyBucket): string {
  switch (value) {
    case 5:
      return "Under 10 minutes.";
    case 15:
      return "10 to 20 minutes.";
    case 30:
      return "20 to 40 minutes.";
    case 50:
      return "40 to 60 minutes.";
    case 75:
      return "An hour or more.";
  }
}

function wakingLine(report: MorningReport): string {
  if (!report.wokeInNight) return "Slept through, or got back easily.";
  return `Woke and struggled. About ${wakingDuration(report.nightWakingMinutes)} up.`;
}

function wakingDuration(value: NightWakingDuration): string {
  switch (value) {
    case 0:
      return "a short while";
    case 10:
      return "10 minutes";
    case 25:
      return "25 minutes";
    case 45:
      return "45 minutes";
    case 70:
      return "an hour or more";
  }
}

function aidLine(report: MorningReport): string {
  if (!report.usedSupplement) return "None.";
  const kind = aidKind(report.supplementKind);
  if (report.supplementKind === "other" && report.supplementNote?.trim()) {
    return report.supplementNote.trim();
  }
  return kind;
}

function aidKind(kind: SupplementKind | undefined): string {
  switch (kind) {
    case "melatonin":
      return "Melatonin.";
    case "magnesium":
      return "Magnesium.";
    case "both":
      return "Melatonin and magnesium.";
    case "antihistamine":
      return "Unisom-type.";
    case "other":
      return "Something else.";
    default:
      return "Yes.";
  }
}

function windLine(value: WindDownHelp): string {
  switch (value) {
    case "yes":
      return "Helped.";
    case "a_bit":
      return "Helped a bit.";
    case "no":
      return "Did not help.";
    case "did_not_use":
      return "Didn’t use one.";
  }
}
