import {
  AUTH_ERRORS,
  LOCAL_FILE_KEY,
  contactFromLogin,
  displayName,
  loginKeyFromInput,
  loginKeyFromProfile,
  splitDisplayName,
} from "@/lib/login";
import { DEFAULT_HEIGHT_CM, DEFAULT_WEIGHT_KG } from "@/lib/time";
import type { CircadiaState, MorningReport, Profile, StudyState, StudyStatus } from "@/lib/types";
import { isClock, normalizeClock } from "@/lib/windows";

/** Legacy single-file blob. Migrated once into the vault. */
export const STORAGE_KEY = "circadia:v1";
export const VAULT_KEY = "circadia:v1:files";
export const SESSION_KEY = "circadia:v1:session";

export const emptyStudy = (): StudyState => ({
  asked: false,
  consented: false,
  participantId: null,
  lastSentAt: null,
  lastStatus: null,
  lastError: null,
  rosterSentAt: null,
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

export function draftProfile(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Profile {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  return {
    firstName,
    lastName,
    name: displayName(firstName, lastName),
    age: 19,
    sex: "unspecified",
    heightCm: DEFAULT_HEIGHT_CM,
    weightKg: DEFAULT_WEIGHT_KG,
    activity: "light",
    email: input.email,
    phone: input.phone,
    medications: [],
    supplements: [],
    struggles: ["falling"],
    targetSleep: "23:00",
    targetWake: "07:00",
    units: "imperial",
    notificationsEnabled: false,
    onboardingComplete: false,
  };
}

export function migrateToVault(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(VAULT_KEY) !== null) return;
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    window.localStorage.setItem(VAULT_KEY, "{}");
    return;
  }
  try {
    const hydrated = hydrateState(JSON.parse(existing));
    const key = loginKeyFromProfile(hydrated.profile) ?? LOCAL_FILE_KEY;
    if (key === LOCAL_FILE_KEY && !hydrated.profile) {
      window.localStorage.setItem(VAULT_KEY, "{}");
      return;
    }
    window.localStorage.setItem(VAULT_KEY, JSON.stringify({ [key]: hydrated }));
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ login: key }));
  } catch {
    window.localStorage.setItem(VAULT_KEY, "{}");
  }
}

function readRawVault(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  migrateToVault();
  const raw = window.localStorage.getItem(VAULT_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeRawVault(files: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VAULT_KEY, JSON.stringify(files));
}

export function getSessionLogin(): string | null {
  if (typeof window === "undefined") return null;
  migrateToVault();
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { login?: unknown };
    return typeof parsed.login === "string" && parsed.login.length > 0 ? parsed.login : null;
  } catch {
    return null;
  }
}

export function writeSession(login: string | null): void {
  if (typeof window === "undefined") return;
  if (!login) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ login }));
}

export function loadState(): CircadiaState {
  if (typeof window === "undefined") return emptyState();
  const login = getSessionLogin();
  if (!login) return emptyState();
  const file = readRawVault()[login];
  if (!file) return emptyState();
  try {
    return hydrateState(file);
  } catch {
    return emptyState();
  }
}

export function saveState(state: CircadiaState) {
  if (typeof window === "undefined") return;
  const login = getSessionLogin();
  if (!login) return;
  const files = readRawVault();
  files[login] = state;
  writeRawVault(files);
}

export function createFile(input: {
  firstName: string;
  lastName: string;
  contact: string;
}): { ok: true; login: string; state: CircadiaState } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  migrateToVault();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: AUTH_ERRORS.name };
  const login = loginKeyFromInput(input.contact);
  if (!login) return { ok: false, error: AUTH_ERRORS.contact };
  const files = readRawVault();
  if (files[login]) return { ok: false, error: AUTH_ERRORS.exists };
  const { email, phone } = contactFromLogin(login);
  const state: CircadiaState = {
    ...emptyState(),
    profile: draftProfile({ firstName, lastName, email, phone }),
  };
  files[login] = state;
  writeRawVault(files);
  writeSession(login);
  return { ok: true, login, state };
}

export function openFile(
  contact: string,
): { ok: true; login: string; state: CircadiaState } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  migrateToVault();
  const login = loginKeyFromInput(contact);
  if (!login) return { ok: false, error: AUTH_ERRORS.contact };
  const file = readRawVault()[login];
  if (!file) return { ok: false, error: AUTH_ERRORS.missing };
  try {
    const state = hydrateState(file);
    writeSession(login);
    return { ok: true, login, state };
  } catch {
    return { ok: false, error: AUTH_ERRORS.missing };
  }
}

export function closeFile(): void {
  writeSession(null);
}

export function eraseCurrentFile(): void {
  const login = getSessionLogin();
  if (login) {
    const files = readRawVault();
    delete files[login];
    writeRawVault(files);
  }
  writeSession(null);
}

export function attachLoginToCurrent(
  contact: string,
): { ok: true; login: string; state: CircadiaState } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  const current = getSessionLogin();
  if (!current) return { ok: false, error: AUTH_ERRORS.missing };
  const nextKey = loginKeyFromInput(contact);
  if (!nextKey) return { ok: false, error: AUTH_ERRORS.contact };
  const files = readRawVault();
  if (files[nextKey] && nextKey !== current) return { ok: false, error: AUTH_ERRORS.exists };
  const raw = files[current];
  if (!raw) return { ok: false, error: AUTH_ERRORS.missing };
  let state: CircadiaState;
  try {
    state = hydrateState(raw);
  } catch {
    return { ok: false, error: AUTH_ERRORS.missing };
  }
  const { email, phone } = contactFromLogin(nextKey);
  const profile = state.profile
    ? { ...state.profile, email, phone }
    : draftProfile({ firstName: "", lastName: "", email, phone });
  const nextState: CircadiaState = { ...state, profile };
  delete files[current];
  files[nextKey] = nextState;
  writeRawVault(files);
  writeSession(nextKey);
  return { ok: true, login: nextKey, state: nextState };
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
    rosterSentAt: typeof s.rosterSentAt === "string" ? s.rosterSentAt : null,
  };
}

function coerceNames(p: Partial<Profile>): { firstName: string; lastName: string; name: string } {
  let firstName = typeof p.firstName === "string" ? p.firstName.trim() : "";
  let lastName = typeof p.lastName === "string" ? p.lastName.trim() : "";
  let name = typeof p.name === "string" ? p.name.trim() : "";
  if (!firstName && !lastName && name) {
    const split = splitDisplayName(name);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  if (!name) name = displayName(firstName, lastName);
  return { firstName, lastName, name: name || "you" };
}

function coerceProfile(value: CircadiaState["profile"] | unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<Profile>;
  const names = coerceNames(p);
  const complete = Boolean(p.onboardingComplete);
  if (complete) {
    if (!isClock(p.targetSleep) || !isClock(p.targetWake)) return null;
    const age = Number(p.age);
    const heightCm = Number(p.heightCm);
    const weightKg = Number(p.weightKg);
    if (!Number.isFinite(age) || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)) return null;
  }
  const age = Number(p.age);
  const heightCm = Number(p.heightCm);
  const weightKg = Number(p.weightKg);
  return {
    ...names,
    age: Number.isFinite(age) ? Math.min(90, Math.max(13, age)) : 19,
    sex: p.sex === "female" || p.sex === "male" || p.sex === "other" ? p.sex : "unspecified",
    heightCm: Number.isFinite(heightCm) && heightCm >= 100 ? heightCm : DEFAULT_HEIGHT_CM,
    weightKg: Number.isFinite(weightKg) && weightKg >= 30 ? weightKg : DEFAULT_WEIGHT_KG,
    email: typeof p.email === "string" ? p.email.trim().slice(0, 120) : "",
    phone: typeof p.phone === "string" ? p.phone.trim().slice(0, 24) : "",
    activity:
      p.activity === "sedentary" || p.activity === "moderate" || p.activity === "high" ? p.activity : "light",
    medications: Array.isArray(p.medications) ? p.medications.filter((x) => typeof x === "string") : [],
    supplements: Array.isArray(p.supplements) ? p.supplements.filter((x) => typeof x === "string") : [],
    struggles: Array.isArray(p.struggles)
      ? p.struggles.filter((s): s is Profile["struggles"][number] => s === "falling" || s === "staying")
      : ["falling"],
    targetSleep: isClock(p.targetSleep) ? normalizeClock(p.targetSleep) : "23:00",
    targetWake: isClock(p.targetWake) ? normalizeClock(p.targetWake) : "07:00",
    units: p.units === "metric" ? "metric" : "imperial",
    notificationsEnabled: Boolean(p.notificationsEnabled),
    onboardingComplete: complete,
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
