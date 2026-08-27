import type { CircadiaState, MorningReport, Profile, StudyState, StudyStatus } from "@/lib/types";
import { isClock, normalizeClock } from "@/lib/windows";

export const STORAGE_KEY = "circadia:v1";

export const emptyStudy = (): StudyState => ({
  asked: false,
  consented: false,
  participantId: null,
  lastSentAt: null,
  lastStatus: null,
  lastError: null,
});

export const emptyState = (): CircadiaState => ({
  profile: null,
  reports: [],
  sessions: [],
  chat: [],
  researchNotes: "",
  demoWeek: false,
  study: emptyStudy(),
});

export function loadState(): CircadiaState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return hydrateState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveState(state: CircadiaState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: CircadiaState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateJson(raw: string): CircadiaState {
  return hydrateState(JSON.parse(raw));
}

export function hydrateState(parsed: unknown): CircadiaState {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Not a Circadia file.");
  }
  const raw = parsed as Partial<CircadiaState>;
  return {
    ...emptyState(),
    profile: coerceProfile(raw.profile),
    reports: Array.isArray(raw.reports) ? raw.reports.map(coerceReport).filter((r): r is MorningReport => r !== null) : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    chat: Array.isArray(raw.chat) ? raw.chat : [],
    researchNotes: typeof raw.researchNotes === "string" ? raw.researchNotes : "",
    demoWeek: Boolean(raw.demoWeek),
    study: coerceStudy(raw.study),
  };
}

function coerceStudy(value: unknown): StudyState {
  if (!value || typeof value !== "object") return emptyStudy();
  const s = value as Partial<StudyState>;
  const lastStatus: StudyStatus | null =
    s.lastStatus === "sent" || s.lastStatus === "error" || s.lastStatus === "blocked" ? s.lastStatus : null;
  const participantId =
    typeof s.participantId === "string" && s.participantId.length >= 8 ? s.participantId : null;
  return {
    asked: Boolean(s.asked),
    consented: Boolean(s.consented) && Boolean(participantId),
    participantId,
    lastSentAt: typeof s.lastSentAt === "string" ? s.lastSentAt : null,
    lastStatus,
    lastError: typeof s.lastError === "string" ? s.lastError : null,
  };
}

function coerceProfile(value: CircadiaState["profile"] | unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<Profile>;
  if (!p.onboardingComplete) return null;
  if (!isClock(p.targetSleep) || !isClock(p.targetWake)) return null;
  const age = Number(p.age);
  const heightCm = Number(p.heightCm);
  const weightKg = Number(p.weightKg);
  if (!Number.isFinite(age) || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)) return null;
  return {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "you",
    age: Math.min(90, Math.max(13, age)),
    sex: p.sex === "female" || p.sex === "male" || p.sex === "other" ? p.sex : "unspecified",
    heightCm,
    weightKg,
    activity:
      p.activity === "sedentary" || p.activity === "moderate" || p.activity === "high" ? p.activity : "light",
    medications: Array.isArray(p.medications) ? p.medications.filter((x) => typeof x === "string") : [],
    supplements: Array.isArray(p.supplements) ? p.supplements.filter((x) => typeof x === "string") : [],
    struggles: Array.isArray(p.struggles)
      ? p.struggles.filter((s): s is Profile["struggles"][number] => s === "falling" || s === "staying")
      : ["falling"],
    targetSleep: normalizeClock(p.targetSleep),
    targetWake: normalizeClock(p.targetWake),
    units: p.units === "metric" ? "metric" : "imperial",
    notificationsEnabled: Boolean(p.notificationsEnabled),
    onboardingComplete: true,
  };
}

function coerceSupplementKind(value: unknown): MorningReport["supplementKind"] {
  if (
    value === "melatonin" ||
    value === "magnesium" ||
    value === "both" ||
    value === "antihistamine" ||
    value === "other"
  ) {
    return value;
  }
  return undefined;
}

function coerceReport(value: unknown): MorningReport | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<MorningReport>;
  if (typeof r.morningDate !== "string" || !isClock(r.wokeAt) || !isClock(r.fellAsleepAt)) return null;
  const rating = r.rating;
  if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4 && rating !== 5) return null;
  return {
    id: typeof r.id === "string" ? r.id : r.morningDate,
    morningDate: r.morningDate,
    wokeAt: normalizeClock(r.wokeAt),
    fellAsleepAt: normalizeClock(r.fellAsleepAt),
    rating,
    drank: Boolean(r.drank),
    drinkCount: typeof r.drinkCount === "number" ? r.drinkCount : undefined,
    spins: typeof r.spins === "boolean" ? r.spins : undefined,
    screenOffMinutes: (r.screenOffMinutes as MorningReport["screenOffMinutes"]) ?? 0,
    sleepLatencyMinutes: (r.sleepLatencyMinutes as MorningReport["sleepLatencyMinutes"]) ?? 15,
    wokeInNight: Boolean(r.wokeInNight),
    nightWakingMinutes: (r.nightWakingMinutes as MorningReport["nightWakingMinutes"]) ?? 0,
    usedSupplement: Boolean(r.usedSupplement),
    supplementKind: coerceSupplementKind(r.supplementKind),
    supplementNote:
      typeof r.supplementNote === "string" && r.supplementNote.trim()
        ? r.supplementNote.trim().slice(0, 80)
        : undefined,
    windDownHelped: r.windDownHelped ?? "did_not_use",
    dream:
      r.dream && typeof r.dream.text === "string"
        ? { text: r.dream.text, wantMeaning: Boolean(r.dream.wantMeaning) }
        : undefined,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
  };
}
