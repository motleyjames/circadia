import { episodeNightOf, nightsElapsedSince } from "@/lib/episode";
import { flagsForPack, isPackSafetyCategory } from "@/lib/invite";
import { consultMessages } from "@/lib/consult-threads";
import { medicationClasses } from "@/lib/metrics";
import { dedupeReportsByMorningDate } from "@/lib/morning-file";
import { bmiKgM, DEFAULT_HEIGHT_CM, DEFAULT_WEIGHT_KG, overnightDuration } from "@/lib/time";
import type {
  AgeBand,
  AwakeningCount,
  BmiBand,
  CircadiaState,
  MedicationClass,
  NapMinutes,
  SafetyFlag,
  StudyNight,
  StudyPack,
} from "@/lib/types";
import { APP_VERSION } from "@/lib/version";
import { isClock as isWallClock, normalizeClock } from "@/lib/windows";
import {
  ACCEPTED_NIGHT_KEYS,
  ACCEPTED_TOP_KEYS,
  isAcceptedLatencyMinutes,
  isAcceptedWakingMinutes,
  LEGACY_CHAT_KEYS,
  LEGACY_SESSION_KEYS,
  SENT_FLAG_KEYS,
  SENT_PROFILE_KEYS,
} from "@/lib/pack-keys";

export const STUDY_SCHEMA = "circadia-study-v1" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGE_BANDS: AgeBand[] = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const BMI_BANDS: BmiBand[] = [
  "unconfirmed",
  "underweight",
  "healthy",
  "overweight",
  "obesity-1",
  "obesity-2",
];
const MED_CLASSES: MedicationClass[] = [
  "stimulant",
  "bupropion",
  "antidepressant",
  "steroid",
  "decongestant",
  "beta-blocker",
  "antihistamine",
  "other",
];

export function ageBand(age: number): AgeBand {
  if (age < 18) return "13-17";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  if (age < 65) return "55-64";
  return "65+";
}

function bandFromBmi(heightCm: number, weightKg: number): BmiBand {
  const bmi = bmiKgM(weightKg, heightCm);
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "overweight";
  if (bmi < 35) return "obesity-1";
  return "obesity-2";
}

export function bmiBand(heightCm: number, weightKg: number, bodyConfirmed?: boolean): BmiBand {
  if (bodyConfirmed === true) return bandFromBmi(heightCm, weightKg);
  if (bodyConfirmed === false) return "unconfirmed";
  if (heightCm === DEFAULT_HEIGHT_CM && weightKg === DEFAULT_WEIGHT_KG) return "unconfirmed";
  return bandFromBmi(heightCm, weightKg);
}

export function buildStudyPack(state: CircadiaState, now = new Date()): StudyPack {
  const profile = state.profile;
  const participantId = state.study.participantId;
  if (!profile) throw new Error("No profile.");
  if (!participantId) throw new Error("No participant number.");

  const nights: StudyNight[] = dedupeReportsByMorningDate(state.reports).map((report, nightIndex) => {
      const night: StudyNight = {
        nightIndex,
        fellAsleepAt: report.fellAsleepAt,
        wokeAt: report.wokeAt,
        durationMinutes: overnightDuration(report.fellAsleepAt, report.wokeAt),
        rating: report.rating,
        drank: report.drank,
        sleepLatencyMinutes: report.sleepLatencyMinutes,
        wokeInNight: report.wokeInNight,
        nightWakingMinutes: report.nightWakingMinutes,
        usedSupplement: report.usedSupplement,
      };
      if (report.drank && typeof report.drinkCount === "number") night.drinkCount = report.drinkCount;
      if (report.usedSupplement && report.supplementKind) night.supplementKind = report.supplementKind;
      if (isWallClock(report.inBedAt)) night.inBedAt = normalizeClock(report.inBedAt);
      if (isWallClock(report.triedToSleepAt)) night.triedToSleepAt = normalizeClock(report.triedToSleepAt);
      if (isWallClock(report.outOfBedAt)) night.outOfBedAt = normalizeClock(report.outOfBedAt);
      if (isAwakeningCount(report.awakeningCount)) night.awakeningCount = report.awakeningCount;
      if (isNapMinutes(report.napMinutes)) night.napMinutes = report.napMinutes;
      if (typeof report.filedLate === "boolean") night.filedLate = report.filedLate;
      if (typeof report.caffeineAfter2pm === "boolean") night.caffeineAfter2pm = report.caffeineAfter2pm;
      if (report.latencyFloor === true) night.latencyFloor = true;
      if (report.wakingFloor === true) night.wakingFloor = true;
      if (
        typeof report.morningSeconds === "number" &&
        Number.isInteger(report.morningSeconds) &&
        report.morningSeconds >= 0
      ) {
        night.morningSeconds = report.morningSeconds;
      }
      if (state.episode) {
        const position = episodeNightOf(state.episode.enrolledAt, report.morningDate);
        if (position !== null) night.episodeNight = position;
      }
      return night;
    });

  const pack: StudyPack = {
    schema: STUDY_SCHEMA,
    participantId,
    appVersion: APP_VERSION,
    surface: "desktop",
    demoWeek: state.demoWeek,
    profile: {
      ageBand: ageBand(profile.age),
      sex: profile.sex,
      struggles: [...profile.struggles],
      activity: profile.activity,
      bmiBand: bmiBand(profile.heightCm, profile.weightKg, profile.bodyConfirmed),
      medicationClasses: medicationClasses(profile.medications),
      supplementCount: profile.supplements.filter((s) => s.trim()).length,
      targetSleep: profile.targetSleep,
      targetWake: profile.targetWake,
    },
    nights,
  };
  if (state.episode) {
    pack.nightsElapsed = nightsElapsedSince(state.episode.enrolledAt, now);
  }
  const safetyFlags = flagsForPack(state, now);
  if (safetyFlags.length) pack.safetyFlags = safetyFlags;
  return pack;
}

const DISTINCTIVE = 12;

function distinctiveSlices(text: string): string[] {
  const t = text.trim().toLowerCase();
  if (t.length < DISTINCTIVE) return t.length >= 5 ? [t] : [];
  const slices = [t.slice(0, DISTINCTIVE)];
  if (t.length > DISTINCTIVE * 2) slices.push(t.slice(Math.floor(t.length / 2), Math.floor(t.length / 2) + DISTINCTIVE));
  return slices;
}

/** Fail closed: if a pack still contains a local secret, do not send it. */
const CIVIL_DATE = /\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])/;
const ISO_STAMP =
  /\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2})?/i;

function schemaAllowsSendStamp(schema: unknown): boolean {
  return schema === "circadia-roster-v1" || schema === "circadia-roster-v2" || schema === "circadia-fault-v1";
}

/** Roster and fault are allowed one send stamp (`at`). Study packs have none. */
function flagDateStrings(
  payload: unknown,
  blob: string,
  reports: ReadonlyArray<{ morningDate: string }>,
  hits: string[],
): void {
  for (const report of reports) {
    if (report.morningDate.length >= 8 && blob.includes(report.morningDate.toLowerCase())) {
      hits.push("calendar-date");
    }
  }
  const skipTop =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    schemaAllowsSendStamp((payload as { schema?: unknown }).schema)
      ? new Set(["at"])
      : undefined;
  walkStringFields(
    payload,
    (text) => {
      if (ISO_STAMP.test(text)) hits.push("timestamp");
      if (CIVIL_DATE.test(text)) hits.push("calendar-date");
    },
    skipTop,
  );
}

function walkStringFields(
  value: unknown,
  visit: (text: string) => void,
  skipTop?: ReadonlySet<string>,
): void {
  const walk = (node: unknown, top: boolean): void => {
    if (typeof node === "string") {
      visit(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, false);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (top && skipTop?.has(key)) continue;
        walk(child, false);
      }
    }
  };
  walk(value, true);
}

/**
 * Words the pack is designed to contain. A profile entry that happens to equal one
 * of these is not evidence that a name leaked — the class label was always going.
 */
const PACK_VOCABULARY = new Set([
  "melatonin",
  "magnesium",
  "valerian",
  "antihistamine",
  "antihistamines",
  "bupropion",
  "stimulant",
  "stimulants",
  "steroid",
  "steroids",
  "decongestant",
  "decongestants",
  "beta blocker",
  "trazodone",
  "hypnotic",
  "hypnotics",
  "cannabis",
  "nicotine",
  "alcohol",
  "caffeine",
  "none",
  "other",
]);

export function anonymityViolations(payload: unknown, state: CircadiaState): string[] {
  const blob = JSON.stringify(payload).toLowerCase();
  const hits: string[] = [];

  if (blob.includes('"name":')) hits.push("name");
  if (blob.includes('"email":')) hits.push("email");
  if (blob.includes('"phone":')) hits.push("phone");
  if (blob.includes('"heightcm":')) hits.push("height");
  if (blob.includes('"weightkg":')) hits.push("weight");
  if (blob.includes('"age":')) hits.push("age");

  const name = state.profile?.name?.trim() ?? "";
  if (name.length >= 3 && name.toLowerCase() !== "you" && blob.includes(name.toLowerCase())) {
    hits.push("name");
  }

  const email = state.profile?.email?.trim().toLowerCase() ?? "";
  if (email.length >= 6 && blob.includes(email)) hits.push("email");
  const phoneDigits = (state.profile?.phone ?? "").replace(/\D/g, "");
  if (phoneDigits.length >= 7 && blob.includes(phoneDigits)) hits.push("phone");

  // The pack legitimately carries class labels (`bupropion`, `melatonin`,
  // `magnesium`) that are also exactly what users type in You. Scanning the whole
  // blob for those words permanently blocked every participant on bupropion or
  // melatonin from ever sending a night. Only free text can leak a name.
  for (const med of state.profile?.medications ?? []) {
    const m = med.trim().toLowerCase();
    if (m.length >= 4 && !PACK_VOCABULARY.has(m) && blob.includes(m)) hits.push("medication");
  }
  for (const sup of state.profile?.supplements ?? []) {
    const s = sup.trim().toLowerCase();
    if (s.length >= 4 && !PACK_VOCABULARY.has(s) && blob.includes(s)) hits.push("supplement");
  }

  flagDateStrings(payload, blob, state.reports, hits);

  for (const report of state.reports) {
    if (report.id.length >= 8 && blob.includes(report.id.toLowerCase())) hits.push("report-id");
    if (report.createdAt && blob.includes(report.createdAt.toLowerCase())) hits.push("timestamp");
    for (const slice of distinctiveSlices(report.dream?.text ?? "")) {
      if (blob.includes(slice)) hits.push("dream");
    }
    for (const slice of distinctiveSlices(report.supplementNote ?? "")) {
      if (blob.includes(slice)) hits.push("supplement");
    }
  }

  for (const session of state.sessions) {
    if (session.id.length >= 8 && blob.includes(session.id.toLowerCase())) hits.push("session-id");
    if (session.startedAt && blob.includes(session.startedAt.toLowerCase())) hits.push("session-time");
  }

  for (const msg of consultMessages(state.chat, state.consultHistory)) {
    for (const slice of distinctiveSlices(msg.text)) {
      if (blob.includes(slice)) hits.push("chat-text");
    }
  }

  for (const slice of distinctiveSlices(state.researchNotes)) {
    if (blob.includes(slice)) hits.push("research-notes");
  }

  // Clinician free text is the same class of leak as a dream or a library paste.
  // Episode ids and clocks must not ride out on a night pack either.
  if (state.episode) {
    if (state.episode.id.length >= 8 && blob.includes(state.episode.id.toLowerCase())) {
      hits.push("episode-id");
    }
    if (
      state.episode.clinicianId &&
      state.episode.clinicianId.length >= 4 &&
      blob.includes(state.episode.clinicianId.toLowerCase())
    ) {
      hits.push("clinician");
    }
    for (const window of state.episode.windows) {
      for (const slice of distinctiveSlices(window.rationale ?? "")) {
        if (blob.includes(slice)) hits.push("clinician-notes");
      }
    }
  }

  return [...new Set(hits)];
}

/** Same scan for roster, night pack, and fault. Empty array means the payload may leave. */
export function assertSendable(payload: unknown, state: CircadiaState): string[] {
  return anonymityViolations(payload, state);
}

export type ValidateResult = { ok: true; value: StudyPack } | { ok: false; error: string };

export const TOP_KEYS = ACCEPTED_TOP_KEYS;
export const PROFILE_KEYS = SENT_PROFILE_KEYS;
export const NIGHT_KEYS = ACCEPTED_NIGHT_KEYS;
export const SESSION_KEYS = LEGACY_SESSION_KEYS;
export const CHAT_KEYS = LEGACY_CHAT_KEYS;
export const FLAG_KEYS = SENT_FLAG_KEYS;

const AWAKENING_COUNTS = new Set<AwakeningCount>([0, 1, 2, 3, 4]);
const NAP_MINUTES = new Set<NapMinutes>([0, 20, 45, 90]);

function isAwakeningCount(value: unknown): value is AwakeningCount {
  return typeof value === "number" && AWAKENING_COUNTS.has(value as AwakeningCount);
}

function isNapMinutes(value: unknown): value is NapMinutes {
  return typeof value === "number" && NAP_MINUTES.has(value as NapMinutes);
}

function isClock(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function extraKeys(obj: object, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

export function validateStudyPack(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Pack must be an object." };
  }
  const extra = extraKeys(raw, TOP_KEYS);
  if (extra.length) return { ok: false, error: `Unknown pack field: ${extra[0]}` };

  const p = raw as Record<string, unknown>;
  if (p.schema !== STUDY_SCHEMA) return { ok: false, error: "Unknown schema." };
  if (typeof p.participantId !== "string" || !UUID_RE.test(p.participantId)) {
    return { ok: false, error: "Invalid participant number." };
  }
  if (typeof p.appVersion !== "string" || p.appVersion.length > 32) {
    return { ok: false, error: "Invalid app version." };
  }
  if (p.surface !== "desktop") return { ok: false, error: "Unknown surface." };
  if (typeof p.demoWeek !== "boolean") return { ok: false, error: "demoWeek must be boolean." };
  if (p.nightsElapsed !== undefined) {
    if (typeof p.nightsElapsed !== "number" || !Number.isInteger(p.nightsElapsed) || p.nightsElapsed < 0 || p.nightsElapsed > 4000) {
      return { ok: false, error: "Invalid nightsElapsed." };
    }
  }

  if (!p.profile || typeof p.profile !== "object" || Array.isArray(p.profile)) {
    return { ok: false, error: "Missing profile band." };
  }
  const profileExtra = extraKeys(p.profile, PROFILE_KEYS);
  if (profileExtra.length) return { ok: false, error: `Unknown profile field: ${profileExtra[0]}` };

  const profile = p.profile as Record<string, unknown>;
  if (!AGE_BANDS.includes(profile.ageBand as AgeBand)) return { ok: false, error: "Invalid age band." };
  if (
    profile.sex !== "female" &&
    profile.sex !== "male" &&
    profile.sex !== "other" &&
    profile.sex !== "unspecified"
  ) {
    return { ok: false, error: "Invalid sex." };
  }
  if (!Array.isArray(profile.struggles) || profile.struggles.some((s) => s !== "falling" && s !== "staying")) {
    return { ok: false, error: "Invalid struggles." };
  }
  if (
    profile.activity !== "sedentary" &&
    profile.activity !== "light" &&
    profile.activity !== "moderate" &&
    profile.activity !== "high"
  ) {
    return { ok: false, error: "Invalid activity." };
  }
  if (!BMI_BANDS.includes(profile.bmiBand as BmiBand)) return { ok: false, error: "Invalid BMI band." };
  if (
    !Array.isArray(profile.medicationClasses) ||
    profile.medicationClasses.some((c) => !MED_CLASSES.includes(c as MedicationClass))
  ) {
    return { ok: false, error: "Invalid medication classes." };
  }
  if (typeof profile.supplementCount !== "number" || profile.supplementCount < 0 || profile.supplementCount > 40) {
    return { ok: false, error: "Invalid supplement count." };
  }
  if (!isClock(profile.targetSleep) || !isClock(profile.targetWake)) {
    return { ok: false, error: "Invalid target clocks." };
  }

  if (!Array.isArray(p.nights) || p.nights.length > 400) return { ok: false, error: "Invalid nights." };
  const nights: StudyNight[] = [];
  for (const row of p.nights) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, error: "Invalid night." };
    const nightExtra = extraKeys(row, NIGHT_KEYS);
    if (nightExtra.length) return { ok: false, error: `Unknown night field: ${nightExtra[0]}` };
    const n = row as Record<string, unknown>;
    if (typeof n.nightIndex !== "number") {
      return { ok: false, error: "Invalid night clocks." };
    }
    if (!isWallClock(n.fellAsleepAt) || !isWallClock(n.wokeAt)) {
      return { ok: false, error: "Invalid night clocks." };
    }
    n.fellAsleepAt = normalizeClock(n.fellAsleepAt);
    n.wokeAt = normalizeClock(n.wokeAt);
    if (typeof n.durationMinutes !== "number" || n.durationMinutes < 0 || n.durationMinutes > 24 * 60) {
      return { ok: false, error: "Invalid duration." };
    }
    if (n.rating !== 1 && n.rating !== 2 && n.rating !== 3 && n.rating !== 4 && n.rating !== 5) {
      return { ok: false, error: "Invalid rating." };
    }
    if (typeof n.drank !== "boolean" || typeof n.wokeInNight !== "boolean" || typeof n.usedSupplement !== "boolean") {
      return { ok: false, error: "Invalid night flags." };
    }
    if (n.hadDream !== undefined && typeof n.hadDream !== "boolean") {
      return { ok: false, error: "Invalid dream flag." };
    }
    if (!isAcceptedLatencyMinutes(n.sleepLatencyMinutes)) {
      return { ok: false, error: "Invalid duration." };
    }
    if (!isAcceptedWakingMinutes(n.nightWakingMinutes)) {
      return { ok: false, error: "Invalid duration." };
    }
    if (n.drinkCount !== undefined) {
      if (typeof n.drinkCount !== "number" || n.drinkCount < 1 || n.drinkCount > 5 || !Number.isInteger(n.drinkCount)) {
        return { ok: false, error: "Invalid drink count." };
      }
    }
    if (n.caffeineAfter2pm !== undefined && typeof n.caffeineAfter2pm !== "boolean") {
      return { ok: false, error: "Invalid caffeineAfter2pm." };
    }
    if (n.latencyFloor !== undefined && typeof n.latencyFloor !== "boolean") {
      return { ok: false, error: "Invalid latencyFloor." };
    }
    if (n.wakingFloor !== undefined && typeof n.wakingFloor !== "boolean") {
      return { ok: false, error: "Invalid wakingFloor." };
    }
    if (n.morningSeconds !== undefined) {
      if (typeof n.morningSeconds !== "number" || !Number.isInteger(n.morningSeconds) || n.morningSeconds < 0 || n.morningSeconds > 86400) {
        return { ok: false, error: "Invalid morningSeconds." };
      }
    }
    if (n.inBedAt !== undefined) {
      if (!isWallClock(n.inBedAt)) return { ok: false, error: "Invalid night clocks." };
      n.inBedAt = normalizeClock(n.inBedAt);
    }
    if (n.triedToSleepAt !== undefined) {
      if (!isWallClock(n.triedToSleepAt)) return { ok: false, error: "Invalid night clocks." };
      n.triedToSleepAt = normalizeClock(n.triedToSleepAt);
    }
    if (n.outOfBedAt !== undefined) {
      if (!isWallClock(n.outOfBedAt)) return { ok: false, error: "Invalid night clocks." };
      n.outOfBedAt = normalizeClock(n.outOfBedAt);
    }
    if (n.awakeningCount !== undefined && !isAwakeningCount(n.awakeningCount)) {
      return { ok: false, error: "Invalid awakening count." };
    }
    if (n.napMinutes !== undefined && !isNapMinutes(n.napMinutes)) {
      return { ok: false, error: "Invalid nap minutes." };
    }
    if (n.filedLate !== undefined && typeof n.filedLate !== "boolean") {
      return { ok: false, error: "Invalid filedLate." };
    }
    if (n.episodeNight !== undefined) {
      if (typeof n.episodeNight !== "number" || !Number.isInteger(n.episodeNight) || n.episodeNight < 0) {
        return { ok: false, error: "Invalid episodeNight." };
      }
      if (typeof p.nightsElapsed === "number" && n.episodeNight > p.nightsElapsed) {
        return { ok: false, error: "Invalid episodeNight." };
      }
    }
    nights.push(n as unknown as StudyNight);
  }

  let sessions: StudyPack["sessions"];
  if (p.sessions !== undefined) {
    if (!p.sessions || typeof p.sessions !== "object" || Array.isArray(p.sessions)) {
      return { ok: false, error: "Invalid sessions." };
    }
    const rawSessions = p.sessions as Record<string, unknown>;
    if (extraKeys(rawSessions, SESSION_KEYS).length) {
      return { ok: false, error: "Unknown sessions field." };
    }
    if (
      typeof rawSessions.meditation !== "number" ||
      typeof rawSessions.soundscape !== "number" ||
      typeof rawSessions.completed !== "number"
    ) {
      return { ok: false, error: "Invalid session counts." };
    }
    sessions = {
      meditation: rawSessions.meditation,
      soundscape: rawSessions.soundscape,
      completed: rawSessions.completed,
    };
  }

  let chat: StudyPack["chat"];
  if (p.chat !== undefined) {
    if (!p.chat || typeof p.chat !== "object" || Array.isArray(p.chat)) {
      return { ok: false, error: "Invalid chat summary." };
    }
    const rawChat = p.chat as Record<string, unknown>;
    if (extraKeys(rawChat, CHAT_KEYS).length) return { ok: false, error: "Unknown chat field." };
    if (typeof rawChat.turns !== "number" || rawChat.turns < 0 || rawChat.turns > 500) {
      return { ok: false, error: "Invalid chat turns." };
    }
    if (!Array.isArray(rawChat.topics) || rawChat.topics.some((t) => typeof t !== "string" || t.length > 64)) {
      return { ok: false, error: "Invalid chat topics." };
    }
    chat = { turns: rawChat.turns, topics: rawChat.topics as string[] };
  }

  let safetyFlags: SafetyFlag[] | undefined;
  if (p.safetyFlags !== undefined) {
    if (!Array.isArray(p.safetyFlags)) return { ok: false, error: "Invalid safetyFlags." };
    safetyFlags = [];
    for (const row of p.safetyFlags) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return { ok: false, error: "Invalid safetyFlags." };
      }
      const flagExtra = extraKeys(row, FLAG_KEYS);
      if (flagExtra.length) return { ok: false, error: `Unknown safety flag field: ${flagExtra[0]}` };
      const f = row as Record<string, unknown>;
      if (!isPackSafetyCategory(f.category)) return { ok: false, error: "Invalid safetyFlags." };
      if (typeof f.episodeNight !== "number" || !Number.isInteger(f.episodeNight) || f.episodeNight < 0) {
        return { ok: false, error: "Invalid safetyFlags." };
      }
      if (typeof p.nightsElapsed === "number" && f.episodeNight > p.nightsElapsed) {
        return { ok: false, error: "Invalid safetyFlags." };
      }
      safetyFlags.push({ category: f.category, episodeNight: f.episodeNight });
    }
  }

  return {
    ok: true,
    value: {
      schema: STUDY_SCHEMA,
      participantId: p.participantId,
      appVersion: p.appVersion,
      surface: "desktop",
      demoWeek: p.demoWeek,
      profile: {
        ageBand: profile.ageBand as AgeBand,
        sex: profile.sex as StudyPack["profile"]["sex"],
        struggles: profile.struggles as StudyPack["profile"]["struggles"],
        activity: profile.activity as StudyPack["profile"]["activity"],
        bmiBand: profile.bmiBand as BmiBand,
        medicationClasses: profile.medicationClasses as MedicationClass[],
        supplementCount: profile.supplementCount as number,
        targetSleep: profile.targetSleep as string,
        targetWake: profile.targetWake as string,
      },
      nights,
      ...(sessions ? { sessions } : {}),
      ...(chat ? { chat } : {}),
      ...(typeof p.nightsElapsed === "number" ? { nightsElapsed: p.nightsElapsed } : {}),
      ...(safetyFlags ? { safetyFlags } : {}),
    },
  };
}
