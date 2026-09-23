import { DURATION_FLOOR_MINUTES, SENT_DURATION_MINUTES } from "@/lib/pack-keys";
import type {
  AwakeningCount,
  LatencyBucket,
  MorningDraft,
  MorningReport,
  NapMinutes,
  NightWakingDuration,
  SleepRating,
  SupplementKind,
} from "@/lib/types";
import { addMinutesToClock } from "@/lib/time";
import type { NightClocks } from "@/lib/night-clocks";

export const LATENCY_QUESTION = "How long did it take to fall asleep?";
export const CLOCK_WATCHING_SENTENCE =
  "Your best guess is fine. Please don't check a clock tonight to get this right.";
export const AWAKENING_QUESTION = "After falling asleep, how many times did you wake up?";
export const WASO_QUESTION = "In total, how long were you awake?";
export const RATING_QUESTION = "How would you rate your sleep?";
export const CONTEXT_QUESTION = "Anything different yesterday?";
export const AFTER_FILE_MORNING = "Morning recorded.";
export const AFTER_FILE_HALFWAY = "Halfway through the test.";
export const AFTER_FILE_COMPLETE = "The test is complete. Thank you.";

export const DURATION_CHIPS: { value: (typeof SENT_DURATION_MINUTES)[number]; label: string }[] = [
  { value: 5, label: "Under 10 min" },
  { value: 10, label: "10 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 h" },
  { value: 90, label: "1½ h" },
  { value: 120, label: "2 h" },
  { value: 180, label: "3 h or more" },
];

export const AWAKENING_CHIPS: { value: AwakeningCount; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4 or more" },
];

export const RATING_CHIPS: { value: SleepRating; label: string }[] = [
  { value: 1, label: "Very poor" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Fair" },
  { value: 4, label: "Good" },
  { value: 5, label: "Very good" },
];

export const NAP_CHIPS: { value: NapMinutes; label: string }[] = [
  { value: 20, label: "About 20 min" },
  { value: 45, label: "About 45 min" },
  { value: 90, label: "An hour or more" },
];

export const DRINK_CHIPS: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4 or more" },
];

export const SLEEP_AID_CHIPS: { value: SupplementKind; label: string }[] = [
  { value: "melatonin", label: "Melatonin" },
  { value: "magnesium", label: "Magnesium" },
  { value: "both", label: "Both of those" },
  { value: "antihistamine", label: "Unisom-type" },
  { value: "other", label: "Something else" },
];

export type MorningContextChip = "nap" | "alcohol" | "caffeine" | "aid";

export type MorningContext = {
  napMinutes?: NapMinutes;
  drank: boolean;
  drinkCount?: 1 | 2 | 3 | 4;
  caffeineAfter2pm?: boolean;
  usedSupplement: boolean;
  supplementKind?: SupplementKind;
};

export function emptyMorningContext(): MorningContext {
  return { drank: false, usedSupplement: false };
}

/** Clocks auto-save on the first screen. They are not an answer. */
export function morningDraftHoldsAnswer(draft: MorningDraft | null | undefined): boolean {
  if (!draft) return false;
  if (draft.step > 0) return true;
  if (draft.sleepLatencyMinutes !== undefined) return true;
  if (draft.awakeningCount !== undefined) return true;
  if (draft.nightWakingMinutes !== undefined) return true;
  if (draft.rating !== undefined) return true;
  if (draft.napMinutes !== undefined) return true;
  if (draft.drank) return true;
  if (draft.drinkCount !== undefined) return true;
  if (draft.caffeineAfter2pm !== undefined) return true;
  if (draft.usedSupplement) return true;
  if (draft.supplementKind) return true;
  return false;
}

/** Fold hint: Mac/browser always; phone only with a locked copy; never a tester's phone. */
export function showOtherSomnadiaHint(input: {
  filedLate: boolean;
  phone: boolean;
  inTest: boolean;
  lockedCopyExists: boolean;
}): boolean {
  if (input.filedLate) return false;
  if (input.phone && input.inTest) return false;
  return input.lockedCopyExists || !input.phone;
}

export function durationIsFloor(minutes: number): boolean {
  return minutes === DURATION_FLOOR_MINUTES;
}

export function afterFileHeadline(episodeNight: number | null): string {
  if (episodeNight === null || episodeNight < 0 || episodeNight >= 14) return AFTER_FILE_MORNING;
  return `Night ${episodeNight + 1} of 14 recorded.`;
}

export function afterFileNote(episodeNight: number | null): string | null {
  if (episodeNight === 6) return AFTER_FILE_HALFWAY;
  if (episodeNight === 13) return AFTER_FILE_COMPLETE;
  return null;
}

/** True if the after-file copy contains a sleep figure. */
export function afterFileHasSleepNumber(text: string): boolean {
  return /\d+\s*%|\d+\s*(min|minutes|hour|hours|h)\b|\b\d+\.\d+\b/i.test(text);
}

export function fileMorningReport(input: {
  morningDate: string;
  clocks: NightClocks;
  sleepLatencyMinutes: LatencyBucket;
  awakeningCount: AwakeningCount;
  nightWakingMinutes?: NightWakingDuration;
  rating: SleepRating;
  context: MorningContext;
  filedLate?: boolean;
  morningSeconds: number;
}): Omit<MorningReport, "id" | "createdAt"> {
  const wokeInNight = input.awakeningCount > 0;
  const waking = wokeInNight ? (input.nightWakingMinutes ?? 0) : 0;
  return {
    morningDate: input.morningDate,
    wokeAt: input.clocks.wokeAt,
    fellAsleepAt: addMinutesToClock(input.clocks.triedToSleepAt, input.sleepLatencyMinutes),
    inBedAt: input.clocks.inBedAt,
    triedToSleepAt: input.clocks.triedToSleepAt,
    outOfBedAt: input.clocks.outOfBedAt,
    awakeningCount: input.awakeningCount,
    rating: input.rating,
    drank: input.context.drank,
    drinkCount: input.context.drinkCount,
    screenOffMinutes: 60,
    sleepLatencyMinutes: input.sleepLatencyMinutes,
    wokeInNight,
    nightWakingMinutes: waking,
    usedSupplement: input.context.usedSupplement,
    supplementKind: input.context.supplementKind,
    windDownHelped: "did_not_use",
    napMinutes: input.context.napMinutes,
    filedLate: input.filedLate || undefined,
    caffeineAfter2pm: input.context.caffeineAfter2pm,
    latencyFloor: durationIsFloor(input.sleepLatencyMinutes) || undefined,
    wakingFloor: (wokeInNight && durationIsFloor(waking)) || undefined,
    morningSeconds: Math.max(0, Math.round(input.morningSeconds)),
  };
}
