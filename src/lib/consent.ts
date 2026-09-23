import { enrollWithInvite, PACK_SAFETY_CATEGORIES } from "@/lib/invite";
import { CRISIS_LIFELINE_NUMBER } from "@/lib/safety-copy";
import {
  CHAT_KEYS,
  FLAG_KEYS,
  NIGHT_KEYS,
  PROFILE_KEYS,
  SESSION_KEYS,
  TOP_KEYS,
} from "@/lib/study";
import type { CircadiaState, StudyState } from "@/lib/types";

export const CONSENT_VERSION = 2;

export const CONSENT_EMAIL = "hello@somnadia.com";
export const CONSENT_LEAVE_PATH = "You → Leave the study";
export const CONSENT_LEAVE_UNINSTALL =
  "If you delete Somnadia without leaving first, email hello@somnadia.com and your nights will be deleted.";
export const AGE_REFUSAL =
  "Somnadia's test is for adults. You can still keep your diary for yourself.";

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
  meditation: "how many times you used a meditation",
  soundscape: "how many times you used a soundscape",
  completed: "how many wind-downs you finished",
  turns: "how many times you talked with Somnadia",
  topics: "which library topics came up — not the words you typed",
  category: "a short safety note — never the words you typed",
  "witnessed-apnea": "that someone saw you stop breathing in the night",
  "drowsy-driving": "that you said you drive while drowsy",
};

const HIDDEN_FROM_LIST = new Set([
  "schema",
  "participantId",
  "surface",
  "profile",
  "nights",
  "sessions",
  "chat",
  "safetyFlags",
  "category",
]);

export function packDisclosureKeys(): string[] {
  return [
    ...TOP_KEYS,
    ...PROFILE_KEYS,
    ...NIGHT_KEYS,
    ...SESSION_KEYS,
    ...CHAT_KEYS,
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

/** Sentences a tester reads under "What Somnadia receives." */
export function whatJamesReceives(): string[] {
  return [
    `${cap(DISCLOSURE_LINES.ageBand)}, ${DISCLOSURE_LINES.sex}, ${DISCLOSURE_LINES.struggles}, ${DISCLOSURE_LINES.activity}, and ${DISCLOSURE_LINES.bmiBand}.`,
    `${cap(DISCLOSURE_LINES.medicationClasses)}, ${DISCLOSURE_LINES.supplementCount}, ${DISCLOSURE_LINES.targetSleep}, and ${DISCLOSURE_LINES.targetWake}.`,
    `Each morning: ${DISCLOSURE_LINES.inBedAt}, ${DISCLOSURE_LINES.triedToSleepAt}, ${DISCLOSURE_LINES.fellAsleepAt}, ${DISCLOSURE_LINES.wokeAt}, and ${DISCLOSURE_LINES.outOfBedAt}; ${DISCLOSURE_LINES.durationMinutes}; ${DISCLOSURE_LINES.rating}; and ${DISCLOSURE_LINES.filedLate}.`,
    `${cap(DISCLOSURE_LINES.drank)}, and ${DISCLOSURE_LINES.drinkCount}; ${DISCLOSURE_LINES.spins}; ${DISCLOSURE_LINES.screenOffMinutes}; and ${DISCLOSURE_LINES.sleepLatencyMinutes}.`,
    `${cap(DISCLOSURE_LINES.wokeInNight)}, ${DISCLOSURE_LINES.awakeningCount}, and ${DISCLOSURE_LINES.nightWakingMinutes}; and ${DISCLOSURE_LINES.napMinutes}.`,
    `${cap(DISCLOSURE_LINES.usedSupplement)}, and ${DISCLOSURE_LINES.supplementKind}; ${DISCLOSURE_LINES.windDownHelped}; and ${DISCLOSURE_LINES.hadDream}.`,
    `${cap(DISCLOSURE_LINES.nightIndex)}, and ${DISCLOSURE_LINES.episodeNight}.`,
    `${cap(DISCLOSURE_LINES.meditation)}, ${DISCLOSURE_LINES.soundscape}, and ${DISCLOSURE_LINES.completed}.`,
    `${cap(DISCLOSURE_LINES.turns)}, and ${DISCLOSURE_LINES.topics}.`,
    `${cap(DISCLOSURE_LINES.appVersion)}, ${DISCLOSURE_LINES.nightsElapsed}, and ${DISCLOSURE_LINES.demoWeek}.`,
    `If it comes up: ${DISCLOSURE_LINES["witnessed-apnea"]}, or ${DISCLOSURE_LINES["drowsy-driving"]}.`,
  ];
}

function cap(line: string): string {
  return line.charAt(0).toUpperCase() + line.slice(1);
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
