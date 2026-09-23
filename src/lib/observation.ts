import { episodeNightOf, nightsElapsedSince, type Episode } from "@/lib/episode";
import { todayIsoDate } from "@/lib/time";
import type { MorningReport } from "@/lib/types";

export function isObserving(
  episode: Episode | null | undefined,
  reports: MorningReport[],
  now: Date,
): boolean {
  if (!episode) return false;
  if (episode.state !== "enrolled" && episode.state !== "baseline") return false;
  const lastSlot = episode.baselineNights - 1;
  for (const report of reports) {
    if (episodeNightOf(episode.enrolledAt, report.morningDate) === lastSlot) return false;
  }
  if (nightsElapsedSince(episode.enrolledAt, now) > episode.baselineNights) return false;
  return true;
}

export function tonightNight(
  episode: Episode | null | undefined,
  reports: MorningReport[],
  now: Date,
): number | null {
  if (!episode) return null;
  if (episode.state !== "enrolled" && episode.state !== "baseline") return null;
  const elapsed = nightsElapsedSince(episode.enrolledAt, now);
  const morningDate = todayIsoDate(now);
  let morningFiled = false;
  for (const report of reports) {
    if (report.morningDate === morningDate) {
      morningFiled = true;
      break;
    }
  }
  if (now.getHours() < 12 && !morningFiled) return Math.max(1, elapsed);
  return elapsed + 1;
}

export function nightDayInBaseline(episode: Episode, day: Date): boolean {
  const enrolled = new Date(episode.enrolledAt);
  if (!Number.isFinite(enrolled.getTime())) return false;
  if (todayIsoDate(day) < todayIsoDate(enrolled)) return false;
  const night = nightsElapsedSince(episode.enrolledAt, day) + 1;
  return night >= 1 && night <= episode.baselineNights;
}

export function morningInBaseline(episode: Episode, day: Date): boolean {
  const slot = episodeNightOf(episode.enrolledAt, todayIsoDate(day));
  return slot !== null && slot < episode.baselineNights;
}

export function hasSleepFigure(text: string): boolean {
  if (/\d+\s*%/.test(text)) return true;
  if (/\d+(?:\.\d+)?\s*(?:min|minutes|h|hour|hours)\b/i.test(text)) return true;
  if (/\d+:\d{2}:\d{2}/.test(text)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(text)) return true;
  if (/\d+\.\d+/.test(text)) return true;
  return false;
}
