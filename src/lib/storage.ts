import { AUTH_ERRORS, LOCAL_FILE_KEY, contactFromLogin, displayName, identitiesFromVaultKeys, loginKeyCandidates, loginKeyFromInput, loginKeyFromProfile, splitDisplayName, type DiaryIdentity } from "@/lib/login";
import {
  CRYPTO_UNAVAILABLE,
  bytesToBase64,
  bytesFromBase64,
  decryptPayload,
  dropAllMasters,
  dropMaster,
  encryptPayload,
  getMaster,
  hasMaster,
  holdMaster,
  isVaultEnvelope,
  newPasswordLock,
  rewrapLock,
  passwordIssue,
  unlockMaster,
  attachRecoveryWrap,
  unlockWithRecovery,
  type PasswordLock,
} from "@/lib/password";
import { SESSION_HEADER } from "@/lib/session-token-shared";
import {
  phoneSecureDelete,
  phoneSecureGet,
  phoneSecureSet,
  phoneVaultActive,
  readPhoneVaultDetailed,
  writePhoneVault,
  type PhoneVaultRead,
} from "@/lib/phone-vault";
import { fetchPackedDiary, resetPackedDiaryCacheForTests } from "@/lib/packed-diary";
import { emptyDiskVault, mergeDiskVault, parseDiskVault, VAULT_DISK_VERSION, type DiskVault } from "@/lib/vault";
import { mergeDiaryStates, morningsAdded } from "@/lib/diary-fold";
import { retainMorningDraft } from "@/lib/backfill";
import { DEFAULT_HEIGHT_CM, DEFAULT_WEIGHT_KG, todayIsoDate } from "@/lib/time";
import { coerceScheduledDays, copyScheduledDays, DEFAULT_SCHEDULED_DAYS, isCivilDate } from "@/lib/schedule";
import { dedupeReportsByMorningDate } from "@/lib/morning-file";
import { coerceChat, coerceConsultHistory, parkLiveConsult } from "@/lib/consult-threads";
import {
  BASELINE_NIGHTS,
  EPISODE_STATES,
  type Episode,
  type EpisodeState,
  type TreatmentWindow,
} from "@/lib/episode";
import type {
  CircadiaState,
  IntakeDraft,
  IntakePhase,
  IntakeProblem,
  MorningDraft,
  MorningReport,
  Profile,
  SafetyFlag,
  StudyState,
  StudyStatus,
} from "@/lib/types";
import { isPackSafetyCategory, normalizeInviteCode, normalizeInviteCodeV2 } from "@/lib/invite";
import { isClock, normalizeClock } from "@/lib/windows";
import { isAcceptedLatencyMinutes, isAcceptedWakingMinutes } from "@/lib/pack-keys";

/** Legacy single-file blob. Migrated once into the vault. */
export const STORAGE_KEY = "circadia:v1";
export const VAULT_KEY = "circadia:v1:files";
/** Last-used login for the gate. Never means the diary is unlocked. */
export const SESSION_KEY = "circadia:v1:open";
export const LAST_LOGIN_KEY = "circadia:v1:last-login";
export const LOCKS_KEY = "circadia:v1:locks";
export const SESSION_UNLOCK_KEY = "circadia:v1:unlock";
const LEGACY_SESSION_KEY = "circadia:v1:session";
/** Packed Mac diary already folded into this device. Skip until the pack bytes change. */
export const FOLDED_PACK_KEY = "circadia:folded-pack";
/** USB/AirDrop inbox already folded. Skip until the drop-box bytes change. */
export const FOLDED_INBOX_KEY = "circadia:folded-inbox";

let openLogin: string | null = null;
let openedWithRecovery = false;
const plainByLogin = new Map<string, CircadiaState>();
const writeGen = new Map<string, number>();
let persistChain: Promise<void> = Promise.resolve();

/** WKWebView document loads can miss the first native plugin call. Tests set this to a no-op. */
let vaultPause: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const VAULT_RETRY_MS = [40, 120];

export function setVaultPauseForTests(fn: ((ms: number) => Promise<void>) | null): void {
  vaultPause = fn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

function bumpGen(login: string): number {
  const next = (writeGen.get(login) ?? 0) + 1;
  writeGen.set(login, next);
  return next;
}

let lastPersistError: string | null = null;
const persistErrorListeners = new Set<() => void>();

/** Null when the last write landed. A message when this device refused it. */
export function persistFailure(): string | null {
  return lastPersistError;
}

export function subscribePersistFailure(listener: () => void): () => void {
  persistErrorListeners.add(listener);
  return () => {
    persistErrorListeners.delete(listener);
  };
}

function enqueueVaultWrite(work: () => Promise<void>): Promise<void> {
  persistChain = persistChain
    .then(work)
    .then(() => {
      lastPersistError = null;
    })
    .catch((error: unknown) => {
      // A failed encrypt must not stall later writes — but it must not be invisible
      // either. Quota exhaustion used to mean every morning silently stopped saving.
      lastPersistError = error instanceof Error ? error.message : "Could not save to this device.";
      persistErrorListeners.forEach((listener) => listener());
    });
  return persistChain;
}

export async function flushVaultWrites(): Promise<void> {
  await persistChain;
}

/** Tests share this module. Wipe in-memory masters so one case cannot unlock the next. */
export function resetVaultMemoryForTests(): void {
  openLogin = null;
  openedWithRecovery = false;
  plainByLogin.clear();
  writeGen.clear();
  persistChain = Promise.resolve();
  dropAllMasters();
  resetPackedDiaryCacheForTests();
  setVaultPauseForTests(null);
}

export const emptyStudy = (): StudyState => ({
  asked: false,
  consented: false,
  participantId: null,
  lastSentAt: null,
  lastStatus: null,
  lastError: null,
  rosterSentAt: null,
  inviteNormalized: null,
  inviteVersion: null,
  packEtag: null,
  sendPending: false,
  withdrawnAt: null,
  lastSentPackHash: null,
  consentVersion: null,
  consentedAt: null,
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
  episode: null,
  morningDraft: null,
  intakeDraft: null,
  safetyFlags: [],
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
    scheduledDays: copyScheduledDays(DEFAULT_SCHEDULED_DAYS),
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
  // Deliberately not caught here: enqueueVaultWrite records the failure so the UI
  // can say the device is full instead of pretending the morning was saved.
  window.localStorage.setItem(VAULT_KEY, JSON.stringify(files));
}

export function getSessionLogin(): string | null {
  if (typeof window === "undefined") return null;
  migrateToVault();
  if (!openLogin || !hasMaster(openLogin)) return null;
  return openLogin;
}

function readLastLogin(): string | null {
  if (typeof window === "undefined") return null;
  for (const key of [LAST_LOGIN_KEY, SESSION_KEY]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { login?: unknown };
      if (typeof parsed.login === "string" && parsed.login.length > 0) return parsed.login;
    } catch {
      /* try the next key */
    }
  }
  return null;
}

function writeLastLogin(login: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
  window.localStorage.removeItem(SESSION_KEY);
  if (!login) {
    window.localStorage.removeItem(LAST_LOGIN_KEY);
    return;
  }
  window.localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ login }));
}

type PersistedUnlock = {
  v: 1;
  login: string;
  master: string;
};

function dropLegacyUnlock(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_UNLOCK_KEY);
}

function sessionHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (typeof window === "undefined") return headers;
  const token = window.circadiaDesktop?.token;
  if (typeof token === "string" && token.length > 0) headers.set(SESSION_HEADER, token);
  return headers;
}

function desktopTokenReady(): boolean {
  if (typeof window === "undefined") return false;
  const token = window.circadiaDesktop?.token;
  return typeof token === "string" && token.length > 0;
}

/** Dock injects the launch token at document start. Wait if JS won the race. */
async function waitForDesktopToken(): Promise<void> {
  if (typeof window === "undefined") return;
  if (phoneVaultActive()) return;
  if (!window.circadiaDesktop?.native) return;
  if (desktopTokenReady()) return;
  for (const ms of VAULT_RETRY_MS) {
    await vaultPause(ms);
    if (desktopTokenReady()) return;
  }
}

async function persistUnlockNative(login: string, payload: string): Promise<boolean> {
  const sk = window.circadiaDesktop?.sessionKey;
  if (!sk?.set) return false;
  try {
    return (await sk.set(login, payload)) === true;
  } catch {
    return false;
  }
}

async function fetchUnlockNative(login: string): Promise<{ login: string; master: Uint8Array } | null> {
  const sk = window.circadiaDesktop?.sessionKey;
  if (!sk?.get) return null;
  try {
    const raw = await sk.get(login);
    if (!raw) return null;
    const master = bytesFromBase64(raw);
    if (master.length !== 32) return null;
    return { login, master };
  } catch {
    return null;
  }
}

async function deleteUnlockNative(login: string): Promise<void> {
  const sk = window.circadiaDesktop?.sessionKey;
  if (!sk?.delete) return;
  try {
    await sk.delete(login);
  } catch {
    /* API delete still runs */
  }
}

async function persistUnlockViaApi(login: string, payload: string): Promise<boolean> {
  await waitForDesktopToken();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch("/api/session-key", {
        method: "POST",
        headers: sessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ login, master: payload }),
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    if (attempt < 2) await vaultPause(VAULT_RETRY_MS[Math.min(attempt, VAULT_RETRY_MS.length - 1)] ?? 120);
  }
  return false;
}

async function persistUnlockNow(login: string): Promise<void> {
  if (typeof window === "undefined") return;
  dropLegacyUnlock();
  const master = getMaster(login);
  if (!master) return;
  const payload = bytesToBase64(master);
  if (phoneVaultActive()) {
    await phoneSecureSet(login, payload);
    return;
  }
  // Somnadia.app Keychain first — Node `security` ACL breaks after a Node path change.
  await persistUnlockNative(login, payload);
  await persistUnlockViaApi(login, payload);
}

async function fetchSessionKeyOnce(login: string): Promise<{ login: string; master: Uint8Array } | null> {
  try {
    const res = await fetch(`/api/session-key?login=${encodeURIComponent(login)}`, {
      cache: "no-store",
      headers: sessionHeaders(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<PersistedUnlock> & { ok?: boolean };
    if (!body?.ok || typeof body.login !== "string" || typeof body.master !== "string") return null;
    const master = bytesFromBase64(body.master);
    if (master.length !== 32) return null;
    return { login: body.login, master };
  } catch {
    return null;
  }
}

async function fetchPersistedUnlock(login: string): Promise<{ login: string; master: Uint8Array } | null> {
  if (phoneVaultActive()) {
    let raw = await phoneSecureGet(login);
    for (const ms of VAULT_RETRY_MS) {
      if (raw) break;
      await vaultPause(ms);
      raw = await phoneSecureGet(login);
    }
    if (!raw) return null;
    const master = bytesFromBase64(raw);
    if (master.length !== 32) return null;
    return { login, master };
  }
  const fromApp = await fetchUnlockNative(login);
  if (fromApp) return fromApp;
  await waitForDesktopToken();
  let held = await fetchSessionKeyOnce(login);
  for (const ms of VAULT_RETRY_MS) {
    if (held) break;
    await vaultPause(ms);
    await waitForDesktopToken();
    held = await fetchSessionKeyOnce(login);
  }
  return held;
}

async function deletePersistedUnlock(login: string): Promise<void> {
  dropLegacyUnlock();
  if (phoneVaultActive()) {
    await phoneSecureDelete(login);
    return;
  }
  await deleteUnlockNative(login);
  await waitForDesktopToken();
  try {
    await fetch(`/api/session-key?login=${encodeURIComponent(login)}`, {
      method: "DELETE",
      headers: sessionHeaders(),
    });
  } catch {
    /* localStorage already dropped */
  }
}

function rememberOpen(login: string): void {
  openLogin = login;
  writeLastLogin(login);
}

async function restorePersistedSession(): Promise<void> {
  dropLegacyUnlock();
  const login = readLastLogin();
  if (!login) return;
  const held = await fetchPersistedUnlock(login);
  if (!held) return;
  const file = readRawVault()[held.login];
  if (!file) {
    // Disk/plugin may still be catching up after a WKWebView document load.
    // Erase already deletes the key when the diary is actually gone.
    held.master.fill(0);
    return;
  }
  try {
    const state = await readDiary(held.login, held.master);
    holdMaster(held.login, held.master);
    held.master.fill(0);
    plainByLogin.set(held.login, state);
    openLogin = held.login;
    writeLastLogin(held.login);
  } catch {
    held.master.fill(0);
    dropMaster(held.login);
    plainByLogin.delete(held.login);
    await deletePersistedUnlock(held.login);
  }
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
    session: readLastLogin(),
  };
}

/** Copy for a locked-diary pack. Stay-signed-in is still in this snapshot until serialize strips it. */
export function snapshotDisk(): DiskVault {
  return parseDiskVault(captureDisk());
}

export function isVaultEmpty(): boolean {
  if (typeof window === "undefined") return true;
  return Object.keys(readRawVault()).length === 0;
}

/**
 * Replace the diary on this device with a locked copy. Does not unlock it.
 * Stay-signed-in does not travel — the destination types the password again.
 */
export async function installLockedVault(
  incoming: DiskVault,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.crypto };
  const vault = parseDiskVault(incoming);
  if (Object.keys(vault.files).length === 0) {
    return { ok: false, error: "That file has no diary in it." };
  }
  const previous = Object.keys(readRawVault());
  openLogin = null;
  plainByLogin.clear();
  dropAllMasters();
  writeRawVault({ ...vault.files });
  writeLocks({ ...vault.locks });
  writeLastLogin(null);
  dropLegacyUnlock();
  forgetPeerFolds();
  for (const login of previous) {
    await deletePersistedUnlock(login);
  }
  await pushVaultToDisk();
  return { ok: true };
}

export const FOLD_ERRORS = {
  session: "Log in on this device first, then fold the locked copy in.",
  login: "That copy is a different login. Use the same email or phone as this diary.",
  password: "That copy was locked with a different password. Fold a copy saved from the Somnadia that has the night.",
} as const;

/**
 * Fold a locked copy into the open diary. Stay signed in. Same-date mornings
 * keep the later page. Does not send anything off this device.
 */
export async function foldLockedVaultIntoSession(
  incoming: DiskVault,
): Promise<
  | { ok: true; login: string; state: CircadiaState; added: number }
  | { ok: false; error: string }
> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.crypto };
  const login = getSessionLogin();
  const master = login ? getMaster(login) : null;
  if (!login || !master) return { ok: false, error: FOLD_ERRORS.session };
  const vault = parseDiskVault(incoming);
  const file = vault.files[login];
  if (!file) return { ok: false, error: FOLD_ERRORS.login };
  try {
    const incomingState = isVaultEnvelope(file)
      ? hydrateState(await decryptPayload(file, master))
      : hydrateState(file);
    const local = loadState();
    const merged = mergeDiaryStates(local, incomingState);
    const added = morningsAdded(local, merged);
    saveState(merged);
    await flushVaultWrites();
    await pushVaultToDisk();
    return { ok: true, login, state: merged, added };
  } catch {
    return { ok: false, error: FOLD_ERRORS.password };
  }
}

function peerVaultDigest(vault: DiskVault): string {
  try {
    const raw = JSON.stringify(vault);
    return `${raw.length}:${raw.slice(0, 48)}:${raw.slice(-24)}`;
  } catch {
    return "";
  }
}

function forgetPeerFolds(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FOLDED_PACK_KEY);
  window.localStorage.removeItem(FOLDED_INBOX_KEY);
}

function alreadyPeerFolded(key: string, digest: string): boolean {
  if (typeof window === "undefined" || !digest) return false;
  return window.localStorage.getItem(key) === digest;
}

function rememberPeerFold(key: string, digest: string): void {
  if (typeof window === "undefined" || !digest) return;
  window.localStorage.setItem(key, digest);
}

function diaryHasNights(state: CircadiaState): boolean {
  return state.reports.length > 0 || state.sessions.length > 0 || state.consultHistory.length > 0;
}

/**
 * Pull nights that already live on the other Somnadia into this open session.
 * Packed Mac diary on the phone, USB/AirDrop inbox on the Dock. Same-date
 * pages keep the later write. A failed fold does not sign the user out.
 */
export async function absorbPeerNights(): Promise<{ added: number; state: CircadiaState | null }> {
  if (typeof window === "undefined") return { added: 0, state: null };
  if (!getSessionLogin() || !getMaster(getSessionLogin()!)) return { added: 0, state: null };
  let added = 0;
  let state: CircadiaState | null = null;
  try {
    const packed = await fetchPackedDiary();
    if (packed) {
      const digest = peerVaultDigest(packed);
      if (!alreadyPeerFolded(FOLDED_PACK_KEY, digest)) {
        const folded = await foldLockedVaultIntoSession(packed);
        if (folded.ok) {
          added += folded.added;
          state = folded.state;
          rememberPeerFold(FOLDED_PACK_KEY, digest);
        }
      }
    }
  } catch {
    /* packed sidecar is optional */
  }
  if (phoneVaultActive()) return { added, state };
  try {
    const res = await fetch("/api/fold-inbox", { cache: "no-store", headers: sessionHeaders() });
    if (!res.ok) return { added, state };
    const body = (await res.json().catch(() => null)) as
      | { vault?: DiskVault | null; source?: string | null; digest?: string | null }
      | null;
    if (!body?.vault) return { added, state };
    const digest = typeof body.digest === "string" ? body.digest : "";
    const seen = `${body.source ?? ""}:${digest}`;
    if (alreadyPeerFolded(FOLDED_INBOX_KEY, seen)) return { added, state };
    const folded = await foldLockedVaultIntoSession(body.vault);
    if (!folded.ok) return { added, state };
    added += folded.added;
    state = folded.state;
    rememberPeerFold(FOLDED_INBOX_KEY, seen);
    if (body.source === "inbox") {
      await fetch("/api/fold-inbox", {
        method: "POST",
        headers: sessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ source: "inbox" }),
      }).catch(() => undefined);
    }
  } catch {
    /* no inbox on this origin */
  }
  return { added, state };
}

/** Phone pack only. If this device has no diary, install the locked copy baked into the iPhone build. */
export async function applyPackedDiaryIfEmpty(): Promise<boolean> {
  if (!phoneVaultActive() || !isVaultEmpty()) return false;
  // last-login means a diary already lived here — disk may not have answered yet.
  if (readLastLogin()) return false;
  const packed = await fetchPackedDiary();
  if (!packed) return false;
  const result = await installLockedVault(packed);
  return result.ok;
}

async function decryptPackedLogin(
  packed: DiskVault,
  login: string,
  password: string,
): Promise<{ master: Uint8Array; state: CircadiaState; migratedLock: PasswordLock | null } | null> {
  const file = packed.files[login];
  if (!file) return null;
  const lock = packed.locks[login];
  try {
    let master: Uint8Array;
    let migratedLock: PasswordLock | null = null;
    if (lock) {
      const unlocked = await unlockMaster(password, lock);
      if (!unlocked) return null;
      master = unlocked.master;
      migratedLock = unlocked.migratedLock;
    } else {
      const pwd = passwordIssue(password);
      if (pwd) return null;
      const minted = await newPasswordLock(password);
      master = minted.master;
      migratedLock = minted.lock;
    }
    const state = isVaultEnvelope(file)
      ? hydrateState(await decryptPayload(file, master))
      : hydrateState(file);
    return { master, state, migratedLock };
  } catch {
    return null;
  }
}

async function adoptPackedDiary(
  packed: DiskVault,
  login: string,
  password: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | null> {
  const unlocked = await decryptPackedLogin(packed, login, password);
  if (!unlocked) return null;
  const installed = await installLockedVault(packed);
  if (!installed.ok) {
    unlocked.master.fill(0);
    return null;
  }
  if (unlocked.migratedLock) setLock(login, unlocked.migratedLock);
  holdMaster(login, unlocked.master);
  unlocked.master.fill(0);
  plainByLogin.set(login, unlocked.state);
  rememberOpen(login);
  const gen = bumpGen(login);
  await persistEncrypted(login, cloneState(unlocked.state), gen);
  await persistUnlockNow(login);
  schedulePersistDisk();
  return { ok: true, login, state: unlocked.state };
}

/**
 * Log in with Mac credentials even if this phone already has a leftover signup.
 * Password is checked against the packed ciphertext first — a typo does not replace the diary here.
 */
async function openPackedDiaryIfPresent(
  contact: string,
  password: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | null> {
  const packed = await fetchPackedDiary();
  if (!packed) return null;
  const candidates = loginKeyCandidates(contact);
  const hinted = candidates.find((key) => packed.files[key]) ?? null;
  if (hinted) return adoptPackedDiary(packed, hinted, password);
  const keys = Object.keys(packed.files).filter((key) => key !== LOCAL_FILE_KEY);
  if (keys.length === 1) return adoptPackedDiary(packed, keys[0]!, password);
  return null;
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
  const disk = captureDisk();
  if (phoneVaultActive()) {
    await writePhoneVault(disk);
    return;
  }
  try {
    await fetch("/api/vault", {
      method: "PUT",
      headers: sessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(disk),
    });
  } catch {
    /* disk is a backup; localStorage already has the ciphertext */
  }
}

async function readPhoneSourceWithRetry(): Promise<PhoneVaultRead> {
  let last = await readPhoneVaultDetailed();
  if (last.status === "ok" && Object.keys(last.vault.files).length > 0) return last;
  for (const ms of VAULT_RETRY_MS) {
    await vaultPause(ms);
    last = await readPhoneVaultDetailed();
    if (last.status === "ok" && Object.keys(last.vault.files).length > 0) return last;
  }
  return last;
}

async function readMacVault(): Promise<{ status: "ok" | "unavailable"; vault: DiskVault }> {
  try {
    const res = await fetch("/api/vault", { cache: "no-store", headers: sessionHeaders() });
    if (!res.ok) return { status: "unavailable", vault: emptyDiskVault() };
    return { status: "ok", vault: parseDiskVault(await res.json()) };
  } catch {
    return { status: "unavailable", vault: emptyDiskVault() };
  }
}

async function readMacVaultWithRetry(): Promise<{ status: "ok" | "unavailable"; vault: DiskVault }> {
  await waitForDesktopToken();
  let last = await readMacVault();
  if (last.status === "ok") return last;
  for (const ms of VAULT_RETRY_MS) {
    await vaultPause(ms);
    await waitForDesktopToken();
    last = await readMacVault();
    if (last.status === "ok") return last;
  }
  return last;
}

export async function bootVaultFromDisk(): Promise<void> {
  if (typeof window === "undefined") return;
  dropLegacyUnlock();
  migrateToVault();
  let disk = emptyDiskVault();
  let diskStatus: "ok" | "missing" | "unavailable" = "ok";
  if (phoneVaultActive()) {
    const read = await readPhoneSourceWithRetry();
    disk = read.vault;
    diskStatus = read.status;
  } else {
    const read = await readMacVaultWithRetry();
    disk = read.vault;
    diskStatus = read.status;
  }
  const local: DiskVault = captureDisk();
  const priorLogin = readLastLogin();
  const merged = mergeDiskVault(local, disk);
  writeRawVault(merged.files);
  writeLocks(merged.locks);
  writeLastLogin(merged.session ?? priorLogin);
  if (getSessionLogin()) {
    if (!(diskStatus === "unavailable" && Object.keys(merged.files).length === 0)) {
      await pushVaultToDisk();
    }
    return;
  }
  await restorePersistedSession();
  if (!getSessionLogin() && diskStatus !== "unavailable") {
    if (await applyPackedDiaryIfEmpty()) {
      await restorePersistedSession();
    }
  }
  const mergedEmpty = Object.keys(readRawVault()).length === 0;
  if (!(diskStatus === "unavailable" && mergedEmpty)) {
    await pushVaultToDisk();
  }
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

async function persistEncrypted(login: string, state: CircadiaState, gen: number): Promise<void> {
  if (writeGen.get(login) !== gen) return;
  const master = getMaster(login);
  if (!master) return;
  const envelope = await encryptPayload(persistableState(state), master, gen);
  if (writeGen.get(login) !== gen) return;
  const files = readRawVault();
  files[login] = envelope;
  writeRawVault(files);
}

async function readDiary(login: string, master: Uint8Array): Promise<CircadiaState> {
  const file = readRawVault()[login];
  if (!file) throw new Error("Not a Somnadia file.");
  if (isVaultEnvelope(file)) {
    return hydrateState(await decryptPayload(file, master));
  }
  return hydrateState(file);
}

function cloneState(state: CircadiaState): CircadiaState {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as CircadiaState;
}

export function loadState(): CircadiaState {
  if (typeof window === "undefined") return emptyState();
  const login = getSessionLogin();
  if (!login) return emptyState();
  return plainByLogin.get(login) ?? emptyState();
}

export function saveState(state: CircadiaState) {
  if (typeof window === "undefined") return;
  const login = getSessionLogin();
  if (!login) return;
  plainByLogin.set(login, state);
  const snapshot = cloneState(state);
  const gen = bumpGen(login);
  void enqueueVaultWrite(() => persistEncrypted(login, snapshot, gen));
  // persistEncrypted only writes localStorage. Without this, a filed morning never
  // reached vault.json until the next login — and WebKit evicts local storage under
  // pressure, so weeks of nights could vanish behind a stale disk copy. Debounced.
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
    if (isVaultEnvelope(orphan)) return { ok: false, error: AUTH_ERRORS.orphan };
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
    writeRawVault(files);
  } else {
    state = {
      ...emptyState(),
      profile: draftProfile({ firstName, lastName, email, phone }),
    };
  }
  try {
    const minted = await newPasswordLock(input.password);
    holdMaster(login, minted.master);
    setLock(login, minted.lock);
    plainByLogin.set(login, state);
    rememberOpen(login);
    const gen = bumpGen(login);
    await persistEncrypted(login, cloneState(state), gen);
    await persistUnlockNow(login);
    schedulePersistDisk();
    return { ok: true, login, state };
  } catch (err) {
    dropMaster(login);
    if (openLogin === login) openLogin = null;
    plainByLogin.delete(login);
    const next = readRawVault();
    delete next[login];
    writeRawVault(next);
    deleteLock(login);
    return authCaught(err);
  }
}

export async function openFile(
  contact: string,
  password: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  migrateToVault();
  openedWithRecovery = false;
  const candidates = loginKeyCandidates(contact);
  if (!candidates.length) return { ok: false, error: AUTH_ERRORS.contact };
  const local = await unlockLocalDiary(candidates, password);
  if (local.ok) {
    try {
      await absorbPeerNights();
    } catch {
      /* leftover nights stay; a failed fold must not sign out */
    }
    const live = loadState();
    if (!diaryHasNights(live)) {
      const packedHit = await openPackedDiaryIfPresent(contact, password);
      if (packedHit) return packedHit;
    }
    return { ok: true, login: local.login, state: loadState() };
  }
  const packedHit = await openPackedDiaryIfPresent(contact, password);
  if (packedHit) return packedHit;
  return local;
}

async function unlockLocalDiary(
  candidates: string[],
  password: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  const files = readRawVault();
  const login = candidates.find((key) => files[key]) ?? null;
  if (!login) {
    if (hasOrphanLocalFile()) return { ok: false, error: AUTH_ERRORS.orphan };
    if (Object.keys(files).length === 0) return { ok: false, error: AUTH_ERRORS.emptyDevice };
    return { ok: false, error: AUTH_ERRORS.missing };
  }
  const lock = readLocks()[login];
  try {
    if (lock) {
      const unlocked = await unlockMaster(password, lock);
      if (!unlocked) return { ok: false, error: AUTH_ERRORS.credentials };
      if (unlocked.migratedLock) setLock(login, unlocked.migratedLock);
      holdMaster(login, unlocked.master);
    } else {
      const pwd = passwordIssue(password);
      if (pwd) return { ok: false, error: pwd };
      const minted = await newPasswordLock(password);
      setLock(login, minted.lock);
      holdMaster(login, minted.master);
    }
    const master = getMaster(login);
    if (!master) return { ok: false, error: AUTH_ERRORS.crypto };
    const state = await readDiary(login, master);
    plainByLogin.set(login, state);
    rememberOpen(login);
    const gen = bumpGen(login);
    await persistEncrypted(login, cloneState(state), gen);
    await persistUnlockNow(login);
    schedulePersistDisk();
    return { ok: true, login, state };
  } catch (err) {
    dropMaster(login);
    if (openLogin === login) openLogin = null;
    plainByLogin.delete(login);
    if (err instanceof Error && err.message === "Not a Somnadia file.") {
      return { ok: false, error: AUTH_ERRORS.credentials };
    }
    return authCaught(err);
  }
}

export async function closeFile(): Promise<void> {
  const login = openLogin;
  openLogin = null;
  openedWithRecovery = false;
  await flushVaultWrites();
  if (login) {
    dropMaster(login);
    plainByLogin.delete(login);
    writeLastLogin(login);
    await deletePersistedUnlock(login);
  } else if (typeof window !== "undefined") {
    dropLegacyUnlock();
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
  }
  schedulePersistDisk();
}

export function eraseCurrentFile(): void {
  const login = getSessionLogin() ?? openLogin;
  openLogin = null;
  if (login) {
    bumpGen(login);
    dropMaster(login);
    plainByLogin.delete(login);
    const files = readRawVault();
    delete files[login];
    writeRawVault(files);
    deleteLock(login);
    void deletePersistedUnlock(login);
  } else {
    dropLegacyUnlock();
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
    forgetPeerFolds();
  }
  writeLastLogin(null);
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
  const live = plainByLogin.get(current);
  if (!live) return { ok: false, error: AUTH_ERRORS.missing };
  const { email, phone } = contactFromLogin(nextKey);
  const profile = live.profile
    ? { ...live.profile, email, phone }
    : draftProfile({ firstName: "", lastName: "", email, phone });
  const nextState: CircadiaState = { ...live, profile };
  try {
    const minted = await newPasswordLock(password);
    bumpGen(current);
    dropMaster(current);
    plainByLogin.delete(current);
    delete files[current];
    deleteLock(current);
    writeRawVault(files);
    holdMaster(nextKey, minted.master);
    setLock(nextKey, minted.lock);
    plainByLogin.set(nextKey, nextState);
    rememberOpen(nextKey);
    const gen = bumpGen(nextKey);
    await persistEncrypted(nextKey, cloneState(nextState), gen);
    if (current !== nextKey) await deletePersistedUnlock(current);
    await persistUnlockNow(nextKey);
    schedulePersistDisk();
    return { ok: true, login: nextKey, state: nextState };
  } catch (err) {
    return authCaught(err);
  }
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
  const live = plainByLogin.get(login);
  if (!live) return { ok: false, error: AUTH_ERRORS.missing };
  const lock = readLocks()[login];
  try {
    // Re-wrap the SAME data key under the new password rather than minting a new
    // one. The diary is not re-keyed, so a password change is thirty bytes of work
    // instead of every night on file, and it cannot half-fail partway through a
    // rewrite. rewrapLock drops the legacy verifier, which is what actually retires
    // the old password — leaving it in place would keep it opening the vault.
    let master: Uint8Array;
    let nextLock: PasswordLock;
    if (lock) {
      const unlocked = await unlockMaster(currentPassword, lock);
      if (!unlocked) return { ok: false, error: "Current password is wrong." };
      master = unlocked.master;
      nextLock = await rewrapLock(nextPassword, master, lock);
    } else {
      const minted = await newPasswordLock(nextPassword);
      master = minted.master;
      nextLock = minted.lock;
    }
    holdMaster(login, master);
    setLock(login, nextLock);
    await persistUnlockNow(login);
    const gen = bumpGen(login);
    await persistEncrypted(login, cloneState(live), gen);
    schedulePersistDisk();
    return { ok: true };
  } catch (err) {
    return authCaught(err);
  }
}

export function sessionHasRecoveryWrap(): boolean {
  const login = getSessionLogin();
  if (!login) return false;
  return Boolean(readLocks()[login]?.recovery);
}

export function sessionOpenedWithRecovery(): boolean {
  return openedWithRecovery && getSessionLogin() !== null;
}

/**
 * Attach a recovery wrap to the open diary. The wrap is proven to open in
 * memory before it is written; a mismatch never reaches disk.
 */
export async function enableRecovery(
  code: string,
  confirm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.credentials };
  const login = getSessionLogin();
  if (!login) return { ok: false, error: AUTH_ERRORS.missing };
  const lock = readLocks()[login];
  const master = getMaster(login);
  if (!lock || !master) return { ok: false, error: AUTH_ERRORS.missing };
  const next = await attachRecoveryWrap(lock, master, code, confirm);
  if (!next) return { ok: false, error: "Those codes do not match." };
  setLock(login, next);
  schedulePersistDisk();
  return { ok: true };
}

export async function recoverFile(
  contact: string,
  code: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: AUTH_ERRORS.contact };
  migrateToVault();
  openedWithRecovery = false;
  const candidates = loginKeyCandidates(contact);
  if (!candidates.length) return { ok: false, error: AUTH_ERRORS.contact };
  const local = await unlockLocalDiaryWithRecovery(candidates, code);
  if (local.ok) {
    try {
      await absorbPeerNights();
    } catch {
      /* leftover nights stay; a failed fold must not sign out */
    }
    const live = loadState();
    if (!diaryHasNights(live)) {
      const packedHit = await openPackedDiaryIfPresentWithRecovery(contact, code);
      if (packedHit) return packedHit;
    }
    return { ok: true, login: local.login, state: loadState() };
  }
  const packedHit = await openPackedDiaryIfPresentWithRecovery(contact, code);
  if (packedHit) return packedHit;
  return local;
}

async function unlockLocalDiaryWithRecovery(
  candidates: string[],
  code: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | { ok: false; error: string }> {
  const files = readRawVault();
  const login = candidates.find((key) => files[key]) ?? null;
  if (!login) {
    if (hasOrphanLocalFile()) return { ok: false, error: AUTH_ERRORS.orphan };
    if (Object.keys(files).length === 0) return { ok: false, error: AUTH_ERRORS.emptyDevice };
    return { ok: false, error: AUTH_ERRORS.missing };
  }
  const lock = readLocks()[login];
  try {
    if (!lock) return { ok: false, error: AUTH_ERRORS.recovery };
    const master = await unlockWithRecovery(code, lock);
    if (!master) return { ok: false, error: AUTH_ERRORS.recovery };
    holdMaster(login, master);
    const held = getMaster(login);
    if (!held) return { ok: false, error: AUTH_ERRORS.crypto };
    const state = await readDiary(login, held);
    plainByLogin.set(login, state);
    rememberOpen(login);
    openedWithRecovery = true;
    const gen = bumpGen(login);
    await persistEncrypted(login, cloneState(state), gen);
    await persistUnlockNow(login);
    schedulePersistDisk();
    return { ok: true, login, state };
  } catch (err) {
    openedWithRecovery = false;
    dropMaster(login);
    if (openLogin === login) openLogin = null;
    plainByLogin.delete(login);
    if (err instanceof Error && err.message === "Not a Somnadia file.") {
      return { ok: false, error: AUTH_ERRORS.recovery };
    }
    const caught = authCaught(err);
    return caught.error === AUTH_ERRORS.credentials ? { ok: false, error: AUTH_ERRORS.recovery } : caught;
  }
}

async function decryptPackedLoginWithRecovery(
  packed: DiskVault,
  login: string,
  code: string,
): Promise<{ master: Uint8Array; state: CircadiaState } | null> {
  const file = packed.files[login];
  if (!file) return null;
  const lock = packed.locks[login];
  if (!lock) return null;
  try {
    const master = await unlockWithRecovery(code, lock);
    if (!master) return null;
    const state = isVaultEnvelope(file)
      ? hydrateState(await decryptPayload(file, master))
      : hydrateState(file);
    return { master, state };
  } catch {
    return null;
  }
}

async function adoptPackedDiaryWithRecovery(
  packed: DiskVault,
  login: string,
  code: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | null> {
  const unlocked = await decryptPackedLoginWithRecovery(packed, login, code);
  if (!unlocked) return null;
  const installed = await installLockedVault(packed);
  if (!installed.ok) {
    unlocked.master.fill(0);
    return null;
  }
  holdMaster(login, unlocked.master);
  unlocked.master.fill(0);
  plainByLogin.set(login, unlocked.state);
  rememberOpen(login);
  openedWithRecovery = true;
  const gen = bumpGen(login);
  await persistEncrypted(login, cloneState(unlocked.state), gen);
  await persistUnlockNow(login);
  schedulePersistDisk();
  return { ok: true, login, state: unlocked.state };
}

async function openPackedDiaryIfPresentWithRecovery(
  contact: string,
  code: string,
): Promise<{ ok: true; login: string; state: CircadiaState } | null> {
  const packed = await fetchPackedDiary();
  if (!packed) return null;
  const candidates = loginKeyCandidates(contact);
  const hinted = candidates.find((key) => packed.files[key]) ?? null;
  if (hinted) return adoptPackedDiaryWithRecovery(packed, hinted, code);
  const keys = Object.keys(packed.files).filter((key) => key !== LOCAL_FILE_KEY);
  if (keys.length === 1) return adoptPackedDiaryWithRecovery(packed, keys[0]!, code);
  return null;
}

/** Null drafts are omitted so a diary with none serialises as it did before. */
export function persistableState(state: CircadiaState): Record<string, unknown> {
  const { morningDraft, intakeDraft, ...rest } = state;
  const kept = retainMorningDraft(morningDraft, todayIsoDate(), state.reports, state.episode);
  return {
    ...rest,
    ...(kept ? { morningDraft: kept } : {}),
    ...(intakeDraft ? { intakeDraft } : {}),
  };
}

export function exportState(state: CircadiaState): string {
  return JSON.stringify(persistableState(state), null, 2);
}

export function importStateJson(raw: string): CircadiaState {
  return hydrateState(JSON.parse(raw));
}

export function hydrateState(parsed: unknown): CircadiaState {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Not a Somnadia file.");
  }
  const raw = parsed as Partial<CircadiaState>;
  const parked = parkLiveConsult({
    chat: coerceChat(raw.chat),
    consultHistory: coerceConsultHistory(raw.consultHistory),
    activeConsultId: typeof raw.activeConsultId === "string" ? raw.activeConsultId : null,
  });
  const reports = dedupeReportsByMorningDate(
    Array.isArray(raw.reports) ? raw.reports.map(coerceReport).filter((r): r is MorningReport => r !== null) : [],
  );
  const episode = coerceEpisode(raw.episode);
  return {
    ...emptyState(),
    profile: coerceProfile(raw.profile),
    reports,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    chat: parked.chat,
    activeConsultId: parked.activeConsultId,
    consultHistory: parked.consultHistory,
    researchNotes: typeof raw.researchNotes === "string" ? raw.researchNotes : "",
    demoWeek: Boolean(raw.demoWeek),
    study: coerceStudy(raw.study),
    episode,
    morningDraft: retainMorningDraft(coerceMorningDraft(raw.morningDraft), todayIsoDate(), reports, episode),
    intakeDraft: coerceIntakeDraft(raw.intakeDraft),
    safetyFlags: coerceSafetyFlags(raw.safetyFlags),
  };
}

function coerceStudy(value: unknown): StudyState {
  if (!value || typeof value !== "object") return emptyStudy();
  const s = value as Partial<StudyState>;
  const lastStatus: StudyStatus | null =
    s.lastStatus === "sent" ||
    s.lastStatus === "error" ||
    s.lastStatus === "blocked" ||
    s.lastStatus === "held"
      ? s.lastStatus
      : null;
  const participantId =
    typeof s.participantId === "string" && s.participantId.length >= 8 ? s.participantId : null;
  let inviteNormalized: string | null = null;
  let inviteVersion: 1 | 2 | null = null;
  if (typeof s.inviteNormalized === "string") {
    const v2 = normalizeInviteCodeV2(s.inviteNormalized);
    const v1 = normalizeInviteCode(s.inviteNormalized);
    if (v2) {
      inviteNormalized = v2;
      inviteVersion = 2;
    } else if (v1) {
      inviteNormalized = v1;
      inviteVersion = 1;
    }
  }
  return {
    asked: Boolean(s.asked),
    consented: Boolean(s.consented) && Boolean(participantId),
    participantId,
    lastSentAt: typeof s.lastSentAt === "string" ? s.lastSentAt : null,
    lastStatus,
    lastError: typeof s.lastError === "string" ? s.lastError : null,
    rosterSentAt: typeof s.rosterSentAt === "string" ? s.rosterSentAt : null,
    inviteNormalized,
    inviteVersion,
    packEtag: typeof s.packEtag === "string" && s.packEtag ? s.packEtag : null,
    sendPending: s.sendPending === true,
    withdrawnAt: typeof s.withdrawnAt === "string" && s.withdrawnAt ? s.withdrawnAt : null,
    lastSentPackHash: typeof s.lastSentPackHash === "string" && s.lastSentPackHash ? s.lastSentPackHash : null,
    consentVersion: typeof s.consentVersion === "number" && Number.isInteger(s.consentVersion) ? s.consentVersion : null,
    consentedAt: typeof s.consentedAt === "string" && s.consentedAt ? s.consentedAt : null,
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
    scheduledDays: coerceScheduledDays(p.scheduledDays),
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

function coerceAwakeningCount(value: unknown): MorningReport["awakeningCount"] {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;
}

function coerceNapMinutes(value: unknown): MorningReport["napMinutes"] {
  return value === 0 || value === 20 || value === 45 || value === 90 ? value : undefined;
}

function coerceReport(value: unknown): MorningReport | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<MorningReport>;
  if (typeof r.morningDate !== "string" || !isCivilDate(r.morningDate) || !isClock(r.wokeAt) || !isClock(r.fellAsleepAt)) {
    return null;
  }
  const rating = r.rating;
  if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4 && rating !== 5) return null;
  const report: MorningReport = {
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
    // Consensus-diary fields. Absent on every night filed before 0.10, and left
    // absent on purpose — a back-filled guess would poison sleep efficiency.
    inBedAt: isClock(r.inBedAt) ? normalizeClock(r.inBedAt) : undefined,
    triedToSleepAt: isClock(r.triedToSleepAt) ? normalizeClock(r.triedToSleepAt) : undefined,
    outOfBedAt: isClock(r.outOfBedAt) ? normalizeClock(r.outOfBedAt) : undefined,
    awakeningCount: coerceAwakeningCount(r.awakeningCount),
    napMinutes: coerceNapMinutes(r.napMinutes),
  };
  if (r.filedLate === true) report.filedLate = true;
  if (typeof r.caffeineAfter2pm === "boolean") report.caffeineAfter2pm = r.caffeineAfter2pm;
  if (r.latencyFloor === true) report.latencyFloor = true;
  if (r.wakingFloor === true) report.wakingFloor = true;
  if (
    typeof r.morningSeconds === "number" &&
    Number.isInteger(r.morningSeconds) &&
    r.morningSeconds >= 0 &&
    r.morningSeconds <= 86400
  ) {
    report.morningSeconds = r.morningSeconds;
  }
  if (isAcceptedLatencyMinutes(r.sleepLatencyMinutes)) {
    report.sleepLatencyMinutes = r.sleepLatencyMinutes;
  }
  if (isAcceptedWakingMinutes(r.nightWakingMinutes)) {
    report.nightWakingMinutes = r.nightWakingMinutes;
  }
  return report;
}

function coerceMorningDraft(value: unknown): MorningDraft | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if ("id" in d || "createdAt" in d) return null;
  if (typeof d.morningDate !== "string" || !isCivilDate(d.morningDate)) return null;
  if (typeof d.step !== "number" || !Number.isInteger(d.step) || d.step < 0) return null;
  const draft: MorningDraft = { morningDate: d.morningDate, step: d.step };
  if (d.wokeAt !== undefined) {
    if (!isClock(d.wokeAt)) return null;
    draft.wokeAt = normalizeClock(d.wokeAt);
  }
  if (d.outOfBedAt !== undefined) {
    if (!isClock(d.outOfBedAt)) return null;
    draft.outOfBedAt = normalizeClock(d.outOfBedAt);
  }
  if (d.inBedAt !== undefined) {
    if (!isClock(d.inBedAt)) return null;
    draft.inBedAt = normalizeClock(d.inBedAt);
  }
  if (d.triedToSleepAt !== undefined) {
    if (!isClock(d.triedToSleepAt)) return null;
    draft.triedToSleepAt = normalizeClock(d.triedToSleepAt);
  }
  if (d.lightsOutSame !== undefined) {
    if (typeof d.lightsOutSame !== "boolean") return null;
    draft.lightsOutSame = d.lightsOutSame;
  }
  if (d.getUpDelay !== undefined) {
    if (typeof d.getUpDelay !== "number" || !Number.isInteger(d.getUpDelay) || d.getUpDelay < 0) return null;
    draft.getUpDelay = d.getUpDelay;
  }
  if (d.awakeningCount !== undefined) {
    const count = coerceAwakeningCount(d.awakeningCount);
    if (count === undefined) return null;
    draft.awakeningCount = count;
  }
  if (d.napMinutes !== undefined) {
    const nap = coerceNapMinutes(d.napMinutes);
    if (nap === undefined) return null;
    draft.napMinutes = nap;
  }
  if (d.rating !== undefined) {
    if (d.rating !== 1 && d.rating !== 2 && d.rating !== 3 && d.rating !== 4 && d.rating !== 5) return null;
    draft.rating = d.rating;
  }
  if (d.drank !== undefined) {
    if (typeof d.drank !== "boolean") return null;
    draft.drank = d.drank;
  }
  if (d.drinkCount !== undefined) {
    if (typeof d.drinkCount !== "number") return null;
    draft.drinkCount = d.drinkCount;
  }
  if (d.spins !== undefined) {
    if (typeof d.spins !== "boolean") return null;
    draft.spins = d.spins;
  }
  if (d.screenOffMinutes !== undefined) {
    if (
      d.screenOffMinutes !== 0 &&
      d.screenOffMinutes !== 15 &&
      d.screenOffMinutes !== 30 &&
      d.screenOffMinutes !== 45 &&
      d.screenOffMinutes !== 60
    ) {
      return null;
    }
    draft.screenOffMinutes = d.screenOffMinutes;
  }
  if (d.sleepLatencyMinutes !== undefined) {
    if (!isAcceptedLatencyMinutes(d.sleepLatencyMinutes)) return null;
    draft.sleepLatencyMinutes = d.sleepLatencyMinutes;
  }
  if (d.wokeInNight !== undefined) {
    if (typeof d.wokeInNight !== "boolean") return null;
    draft.wokeInNight = d.wokeInNight;
  }
  if (d.nightWakingMinutes !== undefined) {
    if (!isAcceptedWakingMinutes(d.nightWakingMinutes)) return null;
    draft.nightWakingMinutes = d.nightWakingMinutes;
  }
  if (d.usedSupplement !== undefined) {
    if (typeof d.usedSupplement !== "boolean") return null;
    draft.usedSupplement = d.usedSupplement;
  }
  if (d.supplementKind !== undefined) {
    const kind = coerceSupplementKind(d.supplementKind);
    if (!kind) return null;
    draft.supplementKind = kind;
  }
  if (d.supplementNote !== undefined) {
    if (typeof d.supplementNote !== "string") return null;
    draft.supplementNote = d.supplementNote;
  }
  if (d.windDownHelped !== undefined) {
    if (
      d.windDownHelped !== "yes" &&
      d.windDownHelped !== "a_bit" &&
      d.windDownHelped !== "no" &&
      d.windDownHelped !== "did_not_use"
    ) {
      return null;
    }
    draft.windDownHelped = d.windDownHelped;
  }
  if (d.includeDream !== undefined) {
    if (typeof d.includeDream !== "boolean") return null;
    draft.includeDream = d.includeDream;
  }
  if (d.dreamText !== undefined) {
    if (typeof d.dreamText !== "string") return null;
    draft.dreamText = d.dreamText;
  }
  if (d.wantMeaning !== undefined) {
    if (typeof d.wantMeaning !== "boolean") return null;
    draft.wantMeaning = d.wantMeaning;
  }
  if (d.caffeineAfter2pm !== undefined) {
    if (typeof d.caffeineAfter2pm !== "boolean") return null;
    draft.caffeineAfter2pm = d.caffeineAfter2pm;
  }
  if (d.latencyFloor !== undefined) {
    if (typeof d.latencyFloor !== "boolean") return null;
    draft.latencyFloor = d.latencyFloor;
  }
  if (d.wakingFloor !== undefined) {
    if (typeof d.wakingFloor !== "boolean") return null;
    draft.wakingFloor = d.wakingFloor;
  }
  if (d.morningStartedAt !== undefined) {
    if (typeof d.morningStartedAt !== "number" || !Number.isFinite(d.morningStartedAt)) return null;
    draft.morningStartedAt = d.morningStartedAt;
  }
  return draft;
}

function coerceSafetyFlags(value: unknown): SafetyFlag[] {
  if (!Array.isArray(value)) return [];
  const out: SafetyFlag[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as { category?: unknown; episodeNight?: unknown };
    if (!isPackSafetyCategory(r.category)) continue;
    if (typeof r.episodeNight !== "number" || !Number.isInteger(r.episodeNight) || r.episodeNight < 0) continue;
    out.push({ category: r.category, episodeNight: r.episodeNight });
  }
  return out;
}

function coerceIntakeDraft(value: unknown): IntakeDraft | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if ("id" in d || "createdAt" in d) return null;
  if (typeof d.step !== "number" || !Number.isInteger(d.step) || d.step < 0) return null;
  const draft: IntakeDraft = { step: d.step };
  if (d.age !== undefined) {
    if (typeof d.age !== "string") return null;
    draft.age = d.age;
  }
  if (d.feet !== undefined) {
    if (typeof d.feet !== "string") return null;
    draft.feet = d.feet;
  }
  if (d.inches !== undefined) {
    if (typeof d.inches !== "string") return null;
    draft.inches = d.inches;
  }
  if (d.pounds !== undefined) {
    if (typeof d.pounds !== "string") return null;
    draft.pounds = d.pounds;
  }
  if (d.problem !== undefined) {
    if (d.problem !== "falling" && d.problem !== "staying" && d.problem !== "both") return null;
    draft.problem = d.problem as IntakeProblem;
  }
  if (d.phase !== undefined) {
    if (d.phase !== "earlier" && d.phase !== "neither" && d.phase !== "later") return null;
    draft.phase = d.phase as IntakePhase;
  }
  if (d.wakeTime !== undefined) {
    if (!isClock(d.wakeTime)) return null;
    draft.wakeTime = normalizeClock(d.wakeTime);
  }
  if (d.stimulant !== undefined) {
    if (typeof d.stimulant !== "string") return null;
    draft.stimulant = d.stimulant;
  }
  if (d.scheduledDays !== undefined) {
    if (!Array.isArray(d.scheduledDays) || d.scheduledDays.length !== 7) return null;
    if (!d.scheduledDays.every((flag) => typeof flag === "boolean")) return null;
    draft.scheduledDays = [
      d.scheduledDays[0],
      d.scheduledDays[1],
      d.scheduledDays[2],
      d.scheduledDays[3],
      d.scheduledDays[4],
      d.scheduledDays[5],
      d.scheduledDays[6],
    ];
  }
  return draft;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.includes("T") || value.length < 16) return false;
  return Number.isFinite(Date.parse(value));
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function coerceEpisodeState(value: unknown): EpisodeState | null {
  return typeof value === "string" && (EPISODE_STATES as readonly string[]).includes(value)
    ? (value as EpisodeState)
    : null;
}

function coerceTreatmentWindow(value: unknown): TreatmentWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const w = value as Partial<TreatmentWindow>;
  if (typeof w.id !== "string" || w.id.length === 0) return null;
  if (typeof w.setBy !== "string" || w.setBy.length === 0) return null;
  if (!isClock(w.prescribedInBed) || !isClock(w.prescribedOutOfBed)) return null;
  if (!isIsoTimestamp(w.setAt)) return null;
  if (w.rationale !== undefined && typeof w.rationale !== "string") return null;
  if (w.supersedes !== undefined && typeof w.supersedes !== "string") return null;
  const prescribedInBed = normalizeClock(w.prescribedInBed);
  const prescribedOutOfBed = normalizeClock(w.prescribedOutOfBed);
  const window: TreatmentWindow = {
    id: w.id,
    prescribedInBed,
    prescribedOutOfBed,
    setBy: w.setBy,
    setAt: w.setAt,
  };
  if (typeof w.rationale === "string" && w.rationale.trim()) window.rationale = w.rationale.trim();
  if (typeof w.supersedes === "string" && w.supersedes) window.supersedes = w.supersedes;
  return window;
}

/**
 * A half-valid episode would put a patient in a clinical state nobody authored.
 * Malformed input becomes solo mode, not a repaired course of care.
 */
function coerceEpisode(value: unknown): Episode | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const e = value as Partial<Episode>;
  if (typeof e.id !== "string" || e.id.length === 0) return null;
  const clinicianId =
    e.clinicianId === null
      ? null
      : typeof e.clinicianId === "string" && e.clinicianId.trim()
        ? e.clinicianId.trim()
        : undefined;
  if (clinicianId === undefined) return null;
  if (!isNonNegativeInt(e.rev)) return null;
  const state = coerceEpisodeState(e.state);
  if (!state) return null;
  if (!isIsoTimestamp(e.enrolledAt)) return null;
  if (!Array.isArray(e.windows)) return null;
  const windows: TreatmentWindow[] = [];
  for (const row of e.windows) {
    const window = coerceTreatmentWindow(row);
    if (!window) return null;
    windows.push(window);
  }
  if (e.dischargedAt !== undefined && !isIsoTimestamp(e.dischargedAt)) return null;
  const baselineNights =
    e.baselineNights === undefined
      ? BASELINE_NIGHTS
      : typeof e.baselineNights === "number" && Number.isInteger(e.baselineNights) && e.baselineNights > 0
        ? e.baselineNights
        : null;
  if (baselineNights === null) return null;
  const episode: Episode = {
    id: e.id,
    rev: e.rev,
    clinicianId,
    state,
    enrolledAt: e.enrolledAt,
    baselineNights,
    windows,
  };
  if (e.dischargedAt) episode.dischargedAt = e.dischargedAt;
  return episode;
}
