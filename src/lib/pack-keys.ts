/** Minutes a pack built today may carry. "Under 10" stores 5. "3 h or more" stores 180. */
export const SENT_DURATION_MINUTES = [5, 10, 20, 30, 45, 60, 90, 120, 180] as const;

/** Bucketed values nights filed before 0.17.0 still carry. */
export const LEGACY_LATENCY_MINUTES = [5, 15, 30, 50, 75] as const;
export const LEGACY_WAKING_MINUTES = [0, 10, 25, 45, 70] as const;

const sentDuration = new Set<number>(SENT_DURATION_MINUTES);
const acceptedLatency = new Set<number>([...LEGACY_LATENCY_MINUTES, ...SENT_DURATION_MINUTES]);
const acceptedWaking = new Set<number>([...LEGACY_WAKING_MINUTES, ...SENT_DURATION_MINUTES]);

export type SentDurationMinutes = (typeof SENT_DURATION_MINUTES)[number];
export type AcceptedLatencyMinutes = 5 | 10 | 15 | 20 | 30 | 45 | 50 | 60 | 75 | 90 | 120 | 180;
export type AcceptedWakingMinutes = 0 | 5 | 10 | 15 | 20 | 25 | 30 | 45 | 50 | 60 | 70 | 75 | 90 | 120 | 180;

export function isSentDurationMinutes(value: unknown): value is SentDurationMinutes {
  return typeof value === "number" && sentDuration.has(value);
}

export function isAcceptedLatencyMinutes(value: unknown): value is AcceptedLatencyMinutes {
  return typeof value === "number" && acceptedLatency.has(value);
}

export function isAcceptedWakingMinutes(value: unknown): value is AcceptedWakingMinutes {
  return typeof value === "number" && acceptedWaking.has(value);
}

export const DURATION_FLOOR_MINUTES = 180;

export const SENT_TOP_KEYS = new Set([
  "schema",
  "participantId",
  "appVersion",
  "surface",
  "demoWeek",
  "profile",
  "nights",
  "nightsElapsed",
  "safetyFlags",
]);

export const LEGACY_TOP_KEYS = new Set(["sessions", "chat"]);

export const ACCEPTED_TOP_KEYS = new Set([...SENT_TOP_KEYS, ...LEGACY_TOP_KEYS]);

export const SENT_PROFILE_KEYS = new Set([
  "ageBand",
  "sex",
  "struggles",
  "activity",
  "bmiBand",
  "medicationClasses",
  "supplementCount",
  "targetSleep",
  "targetWake",
]);

export const SENT_NIGHT_KEYS = new Set([
  "nightIndex",
  "fellAsleepAt",
  "wokeAt",
  "durationMinutes",
  "rating",
  "drank",
  "drinkCount",
  "sleepLatencyMinutes",
  "wokeInNight",
  "nightWakingMinutes",
  "usedSupplement",
  "supplementKind",
  "inBedAt",
  "triedToSleepAt",
  "outOfBedAt",
  "awakeningCount",
  "napMinutes",
  "filedLate",
  "episodeNight",
  "caffeineAfter2pm",
  "latencyFloor",
  "wakingFloor",
  "morningSeconds",
]);

export const LEGACY_NIGHT_KEYS = new Set(["spins", "screenOffMinutes", "windDownHelped", "hadDream"]);

export const ACCEPTED_NIGHT_KEYS = new Set([...SENT_NIGHT_KEYS, ...LEGACY_NIGHT_KEYS]);

export const LEGACY_SESSION_KEYS = new Set(["meditation", "soundscape", "completed"]);
export const LEGACY_CHAT_KEYS = new Set(["turns", "topics"]);

export const SENT_FLAG_KEYS = new Set(["category", "episodeNight"]);
