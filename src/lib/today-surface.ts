import { episodeNightOf } from "@/lib/episode";
import { inTheTest } from "@/lib/in-the-test";
import { morningPageStatus } from "@/lib/morning-file";
import { isObserving, tonightNight } from "@/lib/observation";
import { WEEKDAY_FULL } from "@/lib/schedule";
import { todayIsoDate } from "@/lib/time";
import type { CircadiaState, MorningReport } from "@/lib/types";

export type TodayCopy = {
  heading: string;
  line: string;
  actionHref: "/check-in" | null;
  actionLabel: string | null;
};

export function weekdayOfMorning(iso: string): string {
  const [ys, ms, ds] = iso.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || !m || !d) return iso;
  return WEEKDAY_FULL[new Date(y, m - 1, d).getDay()]!;
}

export function lastFiledLine(reports: MorningReport[]): string {
  if (reports.length === 0) return "No mornings yet";
  const latest = reports.reduce((a, b) => (a.morningDate >= b.morningDate ? a : b));
  return `Last filed: ${weekdayOfMorning(latest.morningDate)}`;
}

export function isTestComplete(state: CircadiaState, now: Date): boolean {
  if (!inTheTest(state) || !state.episode) return false;
  return !isObserving(state.episode, state.reports, now);
}

export function todayCopy(state: CircadiaState, now: Date): TodayCopy {
  const episode = state.episode;
  const reports = state.reports;
  const today = todayIsoDate(now);
  const page = morningPageStatus(reports, now, state.profile?.targetWake);
  const observing = isObserving(episode, reports, now);
  const night = tonightNight(episode, reports, now);
  const baselineNights = episode?.baselineNights ?? 14;
  const solo = episode?.clinicianId === null;
  const slot = episode ? episodeNightOf(episode.enrolledAt, today) : null;
  const filedToday = page === "filed";

  if (episode && !observing) {
    return {
      heading: "Your diary is complete",
      line: solo
        ? "Thank you for testing Somnadia."
        : "Thank you. Your clinician will go through it with you.",
      actionHref: null,
      actionLabel: null,
    };
  }

  if (!episode || slot === null) {
    return {
      heading: `Night 1 of ${baselineNights}`,
      line: "Your first morning is tomorrow.",
      actionHref: null,
      actionLabel: null,
    };
  }

  const almostDone = night !== null && night > baselineNights;
  if (almostDone) {
    return {
      heading: "Your baseline is almost done",
      line: "One morning left to file.",
      actionHref: filedToday ? null : "/check-in",
      actionLabel: filedToday ? null : "Fill in this morning's diary",
    };
  }

  if (!filedToday) {
    return {
      heading: `Night ${night ?? 1} of ${baselineNights}`,
      line: "Your diary for last night is ready.",
      actionHref: "/check-in",
      actionLabel: "Fill in this morning's diary",
    };
  }

  return {
    heading: `Night ${night ?? 1} of ${baselineNights}`,
    line: "Nothing to change tonight. Sleep the way you usually do.",
    actionHref: null,
    actionLabel: null,
  };
}

/** Morning date that closes episode slot `slot` (0-based). */
export function morningDateForSlot(enrolledAt: string, slot: number): string {
  const enrolledDay = todayIsoDate(new Date(enrolledAt));
  const [ys, ms, ds] = enrolledDay.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  return todayIsoDate(new Date(y, m - 1, d + slot + 1));
}
