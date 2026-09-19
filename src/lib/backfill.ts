import type { Episode } from "@/lib/episode";
import { reportForMorning, upsertMorningReport } from "@/lib/morning-file";
import { isCivilDate, shiftIsoDate } from "@/lib/schedule";
import type { MorningDraft, MorningReport } from "@/lib/types";

export const BACKFILL_NIGHTS = 3;

/**
 * Civil dates a user may file late, newest first. Never today, never a date
 * that already has a report, never before enrollment, never outside the window.
 */
export function backfillableDates(
  today: string,
  reports: MorningReport[],
  episode: Episode | null,
): string[] {
  if (!isCivilDate(today)) return [];
  const enrolledDay = episode ? episode.enrolledAt.slice(0, 10) : null;
  const dates: string[] = [];
  for (let i = 1; i <= BACKFILL_NIGHTS; i += 1) {
    const date = shiftIsoDate(today, -i);
    if (!date) continue;
    if (date >= today) continue;
    if (reportForMorning(reports, date)) continue;
    if (enrolledDay && date < enrolledDay) continue;
    dates.push(date);
  }
  return dates;
}

export function isFiledLate(report: Pick<MorningReport, "filedLate">): boolean {
  return report.filedLate === true;
}

/**
 * Keep a same-day interview, or a late filing still on offer.
 * Anything else — already filed, outside the window, before enrollment —
 * is discarded so an abandoned draft cannot sit in the vault forever.
 */
export function retainMorningDraft(
  draft: MorningDraft | null,
  today: string,
  reports: MorningReport[],
  episode: Episode | null,
): MorningDraft | null {
  if (!draft) return null;
  if (draft.morningDate === today) return draft;
  if (backfillableDates(today, reports, episode).includes(draft.morningDate)) return draft;
  return null;
}

/**
 * The only write path that may attach a night to a past date.
 * Refuses today, a date outside the window, a date before enrollment,
 * and — independently of backfillableDates — a date that already has a report.
 * The stored row always carries the late marker, even if the caller omitted it.
 */
export function applyBackfill(
  reports: MorningReport[],
  incoming: MorningReport,
  today: string,
  episode: Episode | null,
): MorningReport[] {
  if (!isCivilDate(incoming.morningDate) || !isCivilDate(today)) return reports;
  if (incoming.morningDate >= today) return reports;
  const oldest = shiftIsoDate(today, -BACKFILL_NIGHTS);
  if (!oldest || incoming.morningDate < oldest) return reports;
  if (episode && incoming.morningDate < episode.enrolledAt.slice(0, 10)) return reports;
  if (reportForMorning(reports, incoming.morningDate)) return reports;
  return upsertMorningReport(reports, { ...incoming, filedLate: true });
}
