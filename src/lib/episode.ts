import { forwardMinutes } from "@/lib/sleep-metrics";
import { newId, todayIsoDate } from "@/lib/time";
import type { MorningReport } from "@/lib/types";
import { isClock, normalizeClock } from "@/lib/windows";

export const BASELINE_NIGHTS = 14;

export const EPISODE_STATES = [
  "enrolled",
  "baseline",
  "review",
  "treatment",
  "maintenance",
  "discharged",
] as const;

export type EpisodeState = (typeof EPISODE_STATES)[number];

export type ClinicianId = string;
export type WindowId = string;

export type TreatmentWindow = {
  id: WindowId;
  prescribedInBed: string;
  prescribedOutOfBed: string;
  setBy: ClinicianId;
  setAt: string;
  rationale?: string;
  supersedes?: WindowId;
};

export type Episode = {
  id: string;
  /** Increments on every mutation of this episode. Whole-object fold key. */
  rev: number;
  /** Null is a solo shakedown episode. It can never reach treatment. */
  clinicianId: ClinicianId | null;
  state: EpisodeState;
  enrolledAt: string;
  baselineNights: number;
  windows: TreatmentWindow[];
  dischargedAt?: string;
};

export type WindowAdherence = {
  earlyInMinutes: number;
  lateOutMinutes: number;
  withinWindow: boolean;
};

export type AdherenceUnavailableReason = "no-window" | "missing-clocks";

/**
 * The only legal construction site for a TreatmentWindow.
 * Clocks come from a clinician. This function does not read a diary.
 */
export function createTreatmentWindow(input: {
  prescribedInBed: string;
  prescribedOutOfBed: string;
  setBy: ClinicianId | null;
  rationale?: string;
  supersedes?: WindowId;
}): TreatmentWindow {
  if (!isClock(input.prescribedInBed) || !isClock(input.prescribedOutOfBed)) {
    throw new Error("A treatment window needs prescribed clocks.");
  }
  if (input.setBy === null || typeof input.setBy !== "string" || input.setBy.trim() === "") {
    throw new Error("A treatment window needs a clinician.");
  }
  const window: TreatmentWindow = {
    id: newId(),
    prescribedInBed: normalizeClock(input.prescribedInBed),
    prescribedOutOfBed: normalizeClock(input.prescribedOutOfBed),
    setBy: input.setBy.trim(),
    setAt: new Date().toISOString(),
  };
  if (typeof input.rationale === "string" && input.rationale.trim()) {
    window.rationale = input.rationale.trim();
  }
  if (typeof input.supersedes === "string" && input.supersedes) {
    window.supersedes = input.supersedes;
  }
  return window;
}

/**
 * Open a course of care. `clinicianId: null` is a solo shakedown episode.
 * An empty string is not solo — it is a missing author, and it still throws.
 */
export function createEpisode(input: {
  clinicianId: ClinicianId | null;
  enrolledAt?: string;
  baselineNights?: number;
}): Episode {
  if (input.clinicianId !== null && (typeof input.clinicianId !== "string" || input.clinicianId.trim() === "")) {
    throw new Error("An episode needs a clinician or an explicit solo enrollment.");
  }
  const baselineNights =
    typeof input.baselineNights === "number" && Number.isInteger(input.baselineNights) && input.baselineNights > 0
      ? input.baselineNights
      : BASELINE_NIGHTS;
  return {
    id: newId(),
    rev: 0,
    clinicianId: input.clinicianId === null ? null : input.clinicianId.trim(),
    state: "enrolled",
    enrolledAt: input.enrolledAt ?? new Date().toISOString(),
    baselineNights,
    windows: [],
  };
}

/**
 * Whole civil nights from enrollment to `now`, local calendar, never negative.
 * The count leaves the device; `enrolledAt` does not.
 */
export function nightsElapsedSince(enrolledAt: string, now = new Date()): number {
  const enrolled = new Date(enrolledAt);
  if (!Number.isFinite(enrolled.getTime())) return 0;
  const fromMs = Date.parse(`${todayIsoDate(enrolled)}T00:00:00.000Z`);
  const toMs = Date.parse(`${todayIsoDate(now)}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / 86_400_000));
}

/** Nights filed over nights elapsed. Zero elapsed is zero, not a divide. */
export function completionRate(filed: number, elapsed: number): number {
  if (!Number.isInteger(filed) || filed < 0 || !Number.isInteger(elapsed) || elapsed < 0) return 0;
  if (elapsed === 0) return 0;
  return filed / elapsed;
}

/**
 * The newest window that a later window does not supersede.
 * Null in every state except treatment, and null there if the chain is empty.
 */
export function activeWindow(episode: Episode): TreatmentWindow | null {
  if (episode.state !== "treatment") return null;
  if (episode.windows.length === 0) return null;
  const superseded = new Set<string>();
  for (const window of episode.windows) {
    if (window.supersedes) superseded.add(window.supersedes);
  }
  for (let i = episode.windows.length - 1; i >= 0; i -= 1) {
    const window = episode.windows[i]!;
    if (!superseded.has(window.id)) return window;
  }
  return null;
}

export function episodeProgress(
  episode: Episode,
  reports: MorningReport[],
): { filed: number; required: number; remaining: number } | null {
  if (episode.state !== "baseline") return null;
  const enrolledDay = episode.enrolledAt.slice(0, 10);
  const filed = reports.filter((report) => report.morningDate >= enrolledDay).length;
  const required = episode.baselineNights;
  return { filed, required, remaining: Math.max(0, required - filed) };
}

/**
 * Pure transition. Review → treatment only when a window arrives, which this
 * function does not do. Treatment → maintenance and any → discharged never
 * happen here.
 */
export function nextState(
  episode: Episode,
  reports: MorningReport[],
  now: Date,
  intakeComplete: boolean,
): EpisodeState {
  void now;
  const next = advanceEpisode(episode, reports, intakeComplete);
  if (episode.clinicianId === null && next === "treatment") return "review";
  return next;
}

function advanceEpisode(
  episode: Episode,
  reports: MorningReport[],
  intakeComplete: boolean,
): EpisodeState {
  if (episode.state === "discharged") return "discharged";
  if (episode.state === "maintenance") return "maintenance";

  if (episode.state === "enrolled") {
    return intakeComplete ? "baseline" : "enrolled";
  }

  if (episode.state === "baseline") {
    const progress = episodeProgress(episode, reports);
    if (progress && progress.remaining === 0) return "review";
    return "baseline";
  }

  if (episode.state === "review") return "review";

  if (episode.state === "treatment") {
    return activeWindow(episode) ? "treatment" : "review";
  }

  return episode.state;
}

export function adherenceUnavailableReason(
  report: MorningReport,
  window: TreatmentWindow | null,
): AdherenceUnavailableReason | null {
  if (!window) return "no-window";
  if (!isClock(report.inBedAt) || !isClock(report.outOfBedAt)) return "missing-clocks";
  return null;
}

/**
 * Minutes in bed outside the prescribed window. Null when no window was active
 * for that night, or when the diary did not record time in bed.
 *
 * Never falls back to fellAsleepAt / wokeAt — those are sleep, not time in bed.
 */
export function windowAdherence(
  report: MorningReport,
  window: TreatmentWindow | null,
): WindowAdherence | null {
  if (adherenceUnavailableReason(report, window) !== null) return null;
  const actualInBed = report.inBedAt!;
  const actualOutOfBed = report.outOfBedAt!;
  const earlyInMinutes = minutesBefore(window!.prescribedInBed, actualInBed);
  const lateOutMinutes = minutesAfter(window!.prescribedOutOfBed, actualOutOfBed);
  return {
    earlyInMinutes,
    lateOutMinutes,
    withinWindow: earlyInMinutes === 0 && lateOutMinutes === 0,
  };
}

/** How much earlier `actual` sits than `reference` on the night line, else 0. */
function minutesBefore(reference: string, actual: string): number {
  const actualToRef = forwardMinutes(actual, reference);
  const refToActual = forwardMinutes(reference, actual);
  if (actualToRef === 0) return 0;
  return actualToRef < refToActual ? actualToRef : 0;
}

/** How much later `actual` sits than `reference` on the night line, else 0. */
function minutesAfter(reference: string, actual: string): number {
  const refToActual = forwardMinutes(reference, actual);
  const actualToRef = forwardMinutes(actual, reference);
  if (refToActual === 0) return 0;
  return refToActual < actualToRef ? refToActual : 0;
}
