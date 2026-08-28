import { AUTH_ERRORS, LOCAL_FILE_KEY, contactFromLogin, displayName, identitiesFromVaultKeys, loginKeyCandidates, loginKeyFromInput, loginKeyFromProfile, splitDisplayName, type DiaryIdentity } from "@/lib/login";
import { CRYPTO_UNAVAILABLE, hashPassword, passwordIssue, verifyPassword, type PasswordLock } from "@/lib/password";
import { emptyDiskVault, mergeDiskVault, parseDiskVault, VAULT_DISK_VERSION, type DiskVault } from "@/lib/vault";
import { DEFAULT_HEIGHT_CM, DEFAULT_WEIGHT_KG } from "@/lib/time";
import { coerceChat, coerceConsultHistory, parkLiveConsult } from "@/lib/consult-threads";
import type { CircadiaState, MorningReport, Profile, StudyState, StudyStatus } from "@/lib/types";
import { isClock, normalizeClock } from "@/lib/windows";

/** Legacy single-file blob. Migrated once into the vault. */
export const STORAGE_KEY = "circadia:v1";
export const VAULT_KEY = "circadia:v1:files";
/** Which file is open. Not the 0.6.0 auto-login key — that skipped the gate. */
export const SESSION_KEY = "circadia:v1:open";
export const LOCKS_KEY = "circadia:v1:locks";
const LEGACY_SESSION_KEY = "circadia:v1:session";

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
  activeConsultId: null,
  consultHistory: [],
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
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
    window.localStorage.removeItem(SESSION_KEY);
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
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
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
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
  if (!login) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ login }));
}

export function hasOrphanLocalFile(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(readRawVault()[LOCAL_FILE_KEY]);
}

function readLocks(): Record<string, PasswordLock> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(LOCKS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, PasswordLock>;
  } catch {
    return {};
  }
}

function writeLocks(locks: Record<string, PasswordLock>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

function captureDisk(): DiskVault {
  return {
    v: VAULT_DISK_VERSION,
    files: readRawVault(),
    locks: readLocks(),
    session: (() => {
      try {
        const raw = window.localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { login?: unknown };
        return typeof parsed.login === "string" && parsed.login.length > 0 ? parsed.login : null;
      } catch {
        return null;
      }
    })(),
  };
}

let persistTimer: number | null = null;

export function schedulePersistDisk() {
  if (typeof window === "undefined") return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void pushVaultToDisk();
  }, 250);
}

export async function pushVaultToDisk(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/vault", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(captureDisk()),
    });
  } catch {
    /* disk is a backup */
  }
}

export async function bootVaultFromDisk(): Promise<void> {
  if (typeof window === "undefined") return;
  migrateToVault();
  let disk = emptyDiskVault();
  try {
    const res = await fetch("/api/vault", { cache: "no-store" });
    if (res.ok) disk = parseDiskVault(await res.json());
  } catch {
    /* localStorage only until the API is up */
  }
  const local: DiskVault = captureDisk();
  const merged = mergeDiskVault(local, disk);
  writeRawVault(merged.files);
  writeLocks(merged.locks);
  writeSession(merged.session);
  await pushVaultToDisk();
}

export function listDiaryLogins(): DiaryIdentity[] {
  if (typeof window === "undefined") return [];
  return identitiesFromVaultKeys(Object.keys(readRawVault()));
}

function authCaught(err: unknown): { ok: false; error: string } {
  if (err instanceof Error && (err.name === CRYPTO_UNAVAILABLE || err.message === CRYPTO_UNAVAILABLE)) {
    return { ok: false, error: AUTH_ERRORS.crypto };
  }
  return { ok: false, error: AUTH_ERRORS.credentials };
}

function setLock(login: string, lock: PasswordLock): void {
  const locks = readLocks();
  locks[login] = lock;
  writeLocks(locks);
}

function deleteLock(login: string): void {
  const locks = readLocks();
  delete locks[login];
  writeLocks(locks);
}

export function loadState(): CircadiaState {
  if (typeof window === "undefined") return emptyState();
  const login = getSessionLogin();
  if (!login) return emptyState();
  const file = readRawVault()[login];
  if (!file) return emptyState();
  try {
    const state = hydrateState(file);
    const files = readRawVault();
    files[login] = state;
    writeRawVault(files);
    return state;
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
  schedulePersistDisk();
}

export async function createFile(input: {
  firstName: string;
  lastName: string;
  contact: string;
  password: string;
  confirm: string;
}): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  migrateToVault();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: AUTH_ERRORS.name };
  const login = loginKeyFromInput(input.contact);
  if (!login) return { ok: false, error: AUTH_ERRORS.contact };
  const pwd = passwordIssue(input.password, input.confirm);
  if (pwd) return { ok: false, error: pwd };
  const files = readRawVault();
  if (files[login]) return { ok: false, error: AUTH_ERRORS.exists };
  const { email, phone } = contactFromLogin(login);
  const orphan = files[LOCAL_FILE_KEY];
  let state: CircadiaState;
  if (orphan) {
    try {
      const existing = hydrateState(orphan);
      const profile = existing.profile
        ? {
            ...existing.profile,
            firstName,
            lastName,
            name: displayName(firstName, lastName),
            email,
            phone,
          }
        : draftProfile({ firstName, lastName, email, phone });
      state = { ...existing, profile };
    } catch {
      state = {
        ...emptyState(),
        profile: draftProfile({ firstName, lastName, email, phone }),
      };
    }
    delete files[LOCAL_FILE_KEY];
    deleteLock(LOCAL_FILE_KEY);
  } else {
    state = {
      ...emptyState(),
      profile: draftProfile({ firstName, lastName, email, phone }),
    };
  }
  files[login] = state;
  writeRawVault(files);
  try {
    setLock(login, await hashPassword(input.password));
  } catch (err) {
    delete files[login];
    writeRawVault(files);
    return authCaught(err);
  }
  writeSession(login);
  schedulePersistDisk();
  return { ok: true, login, state };
}

export async function openFile(
  contact: string,
  password: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  migrateToVault();
  const candidates = loginKeyCandidates(contact);
  if (!candidates.length) return { ok: false, error: AUTH_ERRORS.contact };
  const files = readRawVault();
  const login = candidates.find((key) => files[key]) ?? null;
  if (!login) {
    if (hasOrphanLocalFile()) return { ok: false, error: AUTH_ERRORS.orphan };
    return { ok: false, error: AUTH_ERRORS.missing };
  }
  const file = files[login];
  const lock = readLocks()[login];
  try {
    if (lock) {
      if (!(await verifyPassword(password, lock))) return { ok: false, error: AUTH_ERRORS.credentials };
    } else {
      const pwd = passwordIssue(password);
      if (pwd) return { ok: false, error: pwd };
      setLock(login, await hashPassword(password));
    }
    const state = hydrateState(file);
    const next = readRawVault();
    next[login] = state;
    writeRawVault(next);
    writeSession(login);
    schedulePersistDisk();
    return { ok: true, login, state };
  } catch (err) {
    if (err instanceof Error && err.message === "Not a Circadia file.") {
      return { ok: false, error: AUTH_ERRORS.credentials };
    }
    return authCaught(err);
  }
}

export function closeFile(): void {
  writeSession(null);
  schedulePersistDisk();
}

export function eraseCurrentFile(): void {
  const login = getSessionLogin();
  if (login) {
    const files = readRawVault();
    delete files[login];
    writeRawVault(files);
    deleteLock(login);
  }
  writeSession(null);
  schedulePersistDisk();
}

export async function attachLoginToCurrent(
  contact: string,
  password: string,
  confirm: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  const current = getSessionLogin();
  if (!current) return { ok: false, error: AUTH_ERRORS.missing };
  const nextKey = loginKeyFromInput(contact);
  if (!nextKey) return { ok: false, error: AUTH_ERRORS.contact };
  const pwd = passwordIssue(password, confirm);
  if (pwd) return { ok: false, error: pwd };
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
  deleteLock(current);
  setLock(nextKey, await hashPassword(password));
  writeSession(nextKey);
  schedulePersistDisk();
  return { ok: true, login: nextKey, state: nextState };
}

export async function changePassword(
  currentPassword: string,
  nextPassword: string,
  confirm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.credentials };
  const login = getSessionLogin();
  if (!login) return { ok: false, error: AUTH_ERRORS.missing };
  const pwd = passwordIssue(nextPassword, confirm);
  if (pwd) return { ok: false, error: pwd };
  const lock = readLocks()[login];
  if (lock && !(await verifyPassword(currentPassword, lock))) {
    return { ok: false, error: "Current password is wrong." };
  }
  setLock(login, await hashPassword(nextPassword));
  schedulePersistDisk();
  return { ok: true };
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
  const parked = parkLiveConsult({
    chat: coerceChat(raw.chat),
    consultHistory: coerceConsultHistory(raw.consultHistory),
    activeConsultId: typeof raw.activeConsultId === "string" ? raw.activeConsultId : null,
  });
  return {
    ...emptyState(),
    profile: coerceProfile(raw.profile),
    reports: Array.isArray(raw.reports) ? raw.reports.map(coerceReport).filter((r): r is MorningReport => r !== null) : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    chat: parked.chat,
    activeConsultId: parked.activeConsultId,
    consultHistory: parked.consultHistory,
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
