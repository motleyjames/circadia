import { enrollWithInvite, PACK_SAFETY_CATEGORIES } from "@/lib/invite";
import { CRISIS_LIFELINE_NUMBER } from "@/lib/safety-copy";
import { FLAG_KEYS, PROFILE_KEYS } from "@/lib/study";
import { SENT_NIGHT_KEYS, SENT_TOP_KEYS } from "@/lib/pack-keys";
import type { CircadiaState, StudyState } from "@/lib/types";

export const CONSENT_VERSION = 4;

export const CONSENT_EMAIL = "hello@somnadia.com";
export const CONSENT_LEAVE_PATH = "You → Leave the study";
export const CONSENT_LEAVE_UNINSTALL =
  "If you delete Somnadia without leaving first, email hello@somnadia.com and your nights will be deleted.";
export const AGE_REFUSAL =
  "Somnadia's test is for adults. You can still keep your diary for yourself.";
export const CONSENT_NOW_RECEIVES_LESS = "Somnadia now receives less";

export const DISCLOSURE_GROUP_HEADINGS = [
  "About you",
  "Each morning",
  "How the test runs",
  "Safety notes",
] as const;

export type DisclosureGroup = (typeof DISCLOSURE_GROUP_HEADINGS)[number];

/** Every sent pack key belongs to exactly one of these four groups. */
export const DISCLOSURE_GROUP_KEYS: Record<DisclosureGroup, readonly string[]> = {
  "About you": [
    "profile",
    "ageBand",
    "sex",
    "struggles",
    "activity",
    "bmiBand",
    "medicationClasses",
    "supplementCount",
    "targetSleep",
    "targetWake",
  ],
  "Each morning": [
    "nights",
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
    "caffeineAfter2pm",
    "latencyFloor",
    "wakingFloor",
  ],
  "How the test runs": [
    "schema",
    "participantId",
    "appVersion",
    "surface",
    "demoWeek",
    "nightsElapsed",
    "nightIndex",
    "episodeNight",
    "morningSeconds",
  ],
  "Safety notes": ["safetyFlags", "category", "witnessed-apnea", "drowsy-driving"],
};

export const DISCLOSURE_GROUP_SUMMARIES: Record<DisclosureGroup, string> = {
  "About you":
    "a few facts, mostly as groups — like your age group and the sex you chose — never your name or exact measurements.",
  "Each morning":
    "your times, how long things took, how you rated the night, and anything different the day before.",
  "How the test runs": "which night of the test it is, and how long each morning took.",
  "Safety notes": "two kinds, only if they come up.",
};

/** Legacy keys testers used to send. One line names them for anyone who accepted before the trim. */
export const STOPPED_SENDING_KEYS = [
  "hadDream",
  "spins",
  "screenOffMinutes",
  "windDownHelped",
  "sessions",
  "chat",
] as const;

/** Keys the visible list omitted through version 3. Anyone who accepted 3 must see these named. */
export const LISTED_ADDED_KEYS = ["schema", "participantId", "surface"] as const;

/** One line per pack key. Adding a pack field without a line fails the suite. */
export const DISCLOSURE_LINES: Record<string, string> = {
  schema: "that this is a study pack",
  participantId: "which invite code you joined with.",
  appVersion: "which version of Somnadia you used",
  surface: "that you used this app",
  demoWeek: "whether this was a practice week",
  profile: "answers about you, listed below",
  nights: "answers about each morning, listed below",
  sessions: "how many wind-downs you used",
  chat: "how often you talked with Somnadia, not the words you typed",
  nightsElapsed: "how many nights have passed since you joined",
  safetyFlags: "a short safety note, never the words you typed",
  ageBand: "your age group, not your exact age",
  sex: "the sex you chose",
  struggles: "whether falling asleep, staying asleep, or both is the problem",
  activity: "how active you said you are",
  bmiBand: "a body-size group, not your height or weight",
  medicationClasses: "the kinds of medication you listed, not the names",
  supplementCount: "how many supplements you listed",
  targetSleep: "the time you aim to go to sleep",
  targetWake: "the time you aim to wake",
  nightIndex: "which morning this was, counted from the first one you filed",
  fellAsleepAt: "the time you fell asleep",
  wokeAt: "the time you woke",
  durationMinutes: "how long you slept",
  rating: "how you rated the night",
  drank: "whether you drank alcohol",
  drinkCount: "how many drinks",
  spins: "whether the room spun",
  screenOffMinutes: "how long screens were off before sleep",
  sleepLatencyMinutes: "how long it took to fall asleep",
  wokeInNight: "whether you woke in the night",
  nightWakingMinutes: "how long you were awake in the night",
  usedSupplement: "whether you used a sleep supplement",
  supplementKind: "which class of supplement, not a name you typed",
  windDownHelped: "whether a wind-down helped",
  hadDream: "whether you remembered a dream — not what it was",
  inBedAt: "the time you went to bed",
  triedToSleepAt: "the time you tried to sleep",
  outOfBedAt: "the time you got out of bed",
  awakeningCount: "how many times you woke",
  napMinutes: "whether you napped, and for how long",
  filedLate: "whether you filed the morning late",
  episodeNight: "which night of the test this belonged to",
  caffeineAfter2pm: "whether you had caffeine after 2 pm",
  latencyFloor: "whether falling asleep took at least three hours",
  wakingFloor: "whether you were awake in the night at least three hours",
  morningSeconds: "how many seconds the morning took to file",
  meditation: "how many times you used a meditation",
  soundscape: "how many times you used a soundscape",
  completed: "how many wind-downs you finished",
  turns: "how many times you talked with Somnadia",
  topics: "which library topics came up — not the words you typed",
  category: "a short safety note — never the words you typed",
  "witnessed-apnea": "that someone saw you stop breathing in the night",
  "drowsy-driving": "that you said you drive while drowsy",
};

/**
 * Sent keys omitted from the visible list. A key may stay here only when
 * HIDDEN_COVERED_BY names a visible line that already tells the tester
 * that information is sent.
 */
export const HIDDEN_FROM_LIST = new Set(["profile", "nights", "safetyFlags", "category"]);

/** Hidden sent key → visible DISCLOSURE_LINES key whose line covers it. */
export const HIDDEN_COVERED_BY: Record<string, string> = {
  profile: "ageBand",
  nights: "fellAsleepAt",
  safetyFlags: "witnessed-apnea",
  category: "drowsy-driving",
};

export function packDisclosureKeys(): string[] {
  return [
    ...SENT_TOP_KEYS,
    ...PROFILE_KEYS,
    ...SENT_NIGHT_KEYS,
    ...FLAG_KEYS,
    ...PACK_SAFETY_CATEGORIES,
  ];
}

export function unmappedPackKeys(): string[] {
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const key of packDisclosureKeys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (!DISCLOSURE_LINES[key]) missing.push(key);
  }
  return missing;
}

export function ungroupedDisclosureKeys(): string[] {
  const assigned = new Set(Object.values(DISCLOSURE_GROUP_KEYS).flat());
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const key of packDisclosureKeys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (!assigned.has(key)) missing.push(key);
  }
  return missing;
}

export function keysInMultipleGroups(): string[] {
  const counts = new Map<string, number>();
  for (const keys of Object.values(DISCLOSURE_GROUP_KEYS)) {
    for (const key of keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, n]) => n > 1).map(([key]) => key);
}

export function groupsMissingSummary(): string[] {
  return DISCLOSURE_GROUP_HEADINGS.filter((heading) => !DISCLOSURE_GROUP_SUMMARIES[heading]?.trim());
}

export function disclosureGroupItems(heading: DisclosureGroup): { key: string; line: string }[] {
  return DISCLOSURE_GROUP_KEYS[heading]
    .filter((key) => !HIDDEN_FROM_LIST.has(key) && DISCLOSURE_LINES[key])
    .map((key) => ({ key, line: DISCLOSURE_LINES[key]! }));
}

/** One line per visible mapped key, in group order. The full list testers can open. */
export function whatJamesReceives(): string[] {
  return DISCLOSURE_GROUP_HEADINGS.flatMap((heading) =>
    disclosureGroupItems(heading).map((item) => item.line),
  );
}

function joinDisclosureLines(keys: readonly string[], lead: string, lastWord: "and" | "or"): string {
  const lines = keys
    .map((key) => DISCLOSURE_LINES[key]?.replace(/\.+$/, ""))
    .filter((line): line is string => Boolean(line));
  if (lines.length === 0) return "";
  if (lines.length === 1) return `${lead} ${lines[0]}.`;
  return `${lead} ${lines.slice(0, -1).join(", ")}, ${lastWord} ${lines[lines.length - 1]}.`;
}

export function stoppedSendingLine(): string {
  return joinDisclosureLines(STOPPED_SENDING_KEYS, "It no longer receives", "or");
}

export function addedToListLine(): string {
  return joinDisclosureLines(LISTED_ADDED_KEYS, "The list now also names", "and");
}

export function isReturningConsentReader(study: Pick<StudyState, "consentVersion">): boolean {
  return (
    typeof study.consentVersion === "number" &&
    Number.isFinite(study.consentVersion) &&
    study.consentVersion < CONSENT_VERSION
  );
}

/** Lines a returning reader sees before the rest. Version 3 names what was added, not only what stopped. */
export function returningConsentLines(study: Pick<StudyState, "consentVersion">): string[] {
  if (!isReturningConsentReader(study)) return [];
  const version = study.consentVersion as number;
  const lines: string[] = [];
  if (version < 3) {
    const stopped = stoppedSendingLine();
    if (stopped) lines.push(stopped);
  }
  const added = addedToListLine();
  if (added) lines.push(added);
  return lines;
}

export function capDisclosureLine(line: string): string {
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export function hiddenKeysMissingCover(): string[] {
  const visible = new Set(whatJamesReceives());
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const key of packDisclosureKeys()) {
    if (seen.has(key) || !HIDDEN_FROM_LIST.has(key)) continue;
    seen.add(key);
    const cover = HIDDEN_COVERED_BY[key];
    const line = cover ? DISCLOSURE_LINES[cover] : undefined;
    if (!cover || HIDDEN_FROM_LIST.has(cover) || !line || !visible.has(line)) missing.push(key);
  }
  for (const key of HIDDEN_FROM_LIST) {
    if (!seen.has(key) && !missing.includes(key)) missing.push(key);
  }
  for (const key of Object.keys(HIDDEN_COVERED_BY)) {
    if (!HIDDEN_FROM_LIST.has(key) && !missing.includes(key)) missing.push(key);
  }
  return missing;
}

export function receivesCoversEveryMappedKey(): string[] {
  const blob = whatJamesReceives().join(" ");
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const key of packDisclosureKeys()) {
    if (seen.has(key) || HIDDEN_FROM_LIST.has(key)) continue;
    seen.add(key);
    const line = DISCLOSURE_LINES[key];
    if (!line || !blob.toLowerCase().includes(line.toLowerCase())) uncovered.push(key);
  }
  return uncovered;
}

export function hasCurrentConsent(study: Pick<StudyState, "consentVersion">): boolean {
  return study.consentVersion === CONSENT_VERSION;
}

export function recordStudyConsent(study: StudyState, now = new Date()): StudyState {
  return {
    ...study,
    asked: true,
    consented: true,
    consentVersion: CONSENT_VERSION,
    consentedAt: now.toISOString(),
    withdrawnAt: null,
  };
}

export function intakeAgeBlocksJoin(age: number | null | undefined): boolean {
  return typeof age === "number" && Number.isFinite(age) && age < 18;
}

export type JoinConsentFail = "box" | "age" | "invite";

/** The 18+ box and intake age, before any enroll. The button's disabled state is not this gate. */
export function joinConsentGate(
  eighteen: boolean,
  age: number | null | undefined,
): JoinConsentFail | null {
  if (!eighteen) return "box";
  if (intakeAgeBlocksJoin(age)) return "age";
  return null;
}

export async function joinWithConsent(
  state: CircadiaState,
  code: string,
  eighteen: boolean,
  now = new Date(),
): Promise<{ ok: true; state: CircadiaState } | { ok: false; reason: JoinConsentFail }> {
  const blocked = joinConsentGate(eighteen, state.profile?.age);
  if (blocked) return { ok: false, reason: blocked };
  const enrolled = await enrollWithInvite(state, code, now);
  if (!enrolled) return { ok: false, reason: "invite" };
  return { ok: true, state: { ...enrolled, study: recordStudyConsent(enrolled.study, now) } };
}

export function acceptExistingConsent(
  state: CircadiaState,
  eighteen: boolean,
  now = new Date(),
): { ok: true; state: CircadiaState } | { ok: false; reason: JoinConsentFail } {
  const blocked = joinConsentGate(eighteen, state.profile?.age);
  if (blocked) return { ok: false, reason: blocked };
  if (!state.study.participantId) return { ok: false, reason: "invite" };
  return { ok: true, state: { ...state, study: recordStudyConsent(state.study, now) } };
}

export const CONSENT_CRISIS_HREF = `tel:${CRISIS_LIFELINE_NUMBER}`;
