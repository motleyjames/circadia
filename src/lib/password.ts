/**
 * Raised from 8 in 0.12.0, when the vault stopped being a file only someone
 * holding this Mac could attack. Only checked when minting a lock — signup and
 * change-password — never on login, so an existing shorter password keeps working.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Legacy work factor. Still read, never written. */
export const PBKDF2_ITERATIONS = 100_000;

/**
 * Work factor for wrapping keys, at the OWASP figure for PBKDF2-SHA256.
 *
 * 100k was sized for an attacker who must first steal the machine. Once ciphertext
 * can sit anywhere but this Mac, one breach hands an attacker every vault at once
 * to grind offline in parallel, and the old floor does not hold up against that.
 *
 * Argon2id would be better still, but it needs a WASM build behaving identically in
 * Node, Electron and a WKWebView under a custom scheme. PBKDF2 is native in all
 * three, so this buys most of the margin with none of that risk.
 */
export const PBKDF2_ITERATIONS_V3 = 600_000;

export const CRYPTO_UNAVAILABLE = "WEB_CRYPTO_UNAVAILABLE";

/** HKDF labels. Two keys from one password so the server never sees the other. */
const WRAP_INFO = "circadia/wrap/v1";
const AUTH_INFO = "circadia/auth/v1";

/** The wrapped data key. Present means this lock has moved to the v3 scheme. */
export type KeyWrap = {
  /** Salt for the wrapping key. Separate from the legacy verifier salt. */
  salt: string;
  iterations: number;
  iv: string;
  /** AES-GCM(wrapKey, dataKey). The tag is what proves the password. */
  ct: string;
};

export type PasswordLock = {
  algo: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  /** Legacy verifier. Absent on locks minted at v3. */
  hash?: string;
  /**
   * 2 = `hash` is SHA-256(master). 1 or omitted = `hash` is the master itself (0.6.19).
   * 3 = there is no legacy verifier; `wrap` is the only way in.
   *
   * A lock MIGRATED to v3 deliberately stays at kdf 2 and keeps its `hash`, because
   * a Mac and a phone fold into each other and one of them updates later than the
   * other. Old code reads the legacy fields and unlocks exactly as before; new code
   * sees `wrap` and prefers it. Bumping the marker instead would send old code down
   * its 0.6.19 branch and make the correct password look wrong.
   */
  kdf?: 1 | 2 | 3;
  /**
   * The data key, encrypted under a key derived from the password.
   *
   * Before this, the key WAS the password stretched — so changing a password meant
   * re-encrypting the whole diary, and a second password (a recovery code) could
   * never open the same data. Wrapping separates the two: the data key is now just
   * a key, and a password is only a way to reach it.
   */
  wrap?: KeyWrap;
};

export type VaultEnvelope = {
  enc: true;
  v: 1;
  iv: string;
  ct: string;
  /**
   * Monotonic write counter. Lets `mergeDiskVault` order two copies of the same
   * file instead of guessing from ciphertext length, which ties whenever an edit
   * does not change the plaintext byte count. Absent on files written before this.
   */
  rev?: number;
};

const masters = new Map<string, Uint8Array>();

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: the previous per-byte concat ran over the entire ciphertext on every
  // save, which is every keystroke in the Library notes field.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function bytesFromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function passwordIssue(password: string, confirm?: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `Use ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`;
  }
  if (confirm !== undefined && password !== confirm) {
    return "Those passwords do not match.";
  }
  return null;
}

export function hasWebCrypto(): boolean {
  const subtle = globalThis.crypto?.subtle;
  return (
    typeof subtle?.importKey === "function" &&
    typeof subtle.deriveBits === "function" &&
    typeof subtle.encrypt === "function" &&
    typeof subtle.decrypt === "function" &&
    typeof subtle.digest === "function"
  );
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function cryptoUnavailable(): Error {
  const err = new Error(CRYPTO_UNAVAILABLE);
  err.name = CRYPTO_UNAVAILABLE;
  return err;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!hasWebCrypto()) throw cryptoUnavailable();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(salt), iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (!hasWebCrypto()) throw cryptoUnavailable();
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(bytes));
  return new Uint8Array(digest);
}

/** HKDF-SHA256. Splits one stretched password into keys that cannot derive each other. */
async function hkdf(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  if (!hasWebCrypto()) throw cryptoUnavailable();
  const key = await crypto.subtle.importKey("raw", asBufferSource(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Stretch the password, then split it into the wrapping key and the auth key. */
async function stretch(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<{ wrapKey: Uint8Array; authKey: Uint8Array }> {
  const kek = await derive(password, salt, iterations);
  const [wrapKey, authKey] = await Promise.all([hkdf(kek, WRAP_INFO), hkdf(kek, AUTH_INFO)]);
  kek.fill(0);
  return { wrapKey, authKey };
}

async function wrapDataKey(
  password: string,
  dataKey: Uint8Array,
  iterations = PBKDF2_ITERATIONS_V3,
): Promise<KeyWrap> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { wrapKey, authKey } = await stretch(password, salt, iterations);
  authKey.fill(0);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", asBufferSource(wrapKey), { name: "AES-GCM" }, false, ["encrypt"]);
  wrapKey.fill(0);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, asBufferSource(dataKey));
  return {
    salt: bytesToBase64(salt),
    iterations,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
}

async function unwrapDataKey(password: string, wrap: KeyWrap): Promise<Uint8Array | null> {
  const iterations = Number(wrap.iterations);
  if (!Number.isFinite(iterations) || iterations < 10_000) return null;
  if (!wrap.salt || !wrap.iv || !wrap.ct) return null;
  const { wrapKey, authKey } = await stretch(password, bytesFromBase64(wrap.salt), iterations);
  authKey.fill(0);
  const key = await crypto.subtle.importKey("raw", asBufferSource(wrapKey), { name: "AES-GCM" }, false, ["decrypt"]);
  wrapKey.fill(0);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBufferSource(bytesFromBase64(wrap.iv)) },
      key,
      asBufferSource(bytesFromBase64(wrap.ct)),
    );
    // The GCM tag is the verifier now. A wrong password fails to authenticate, so
    // there is nothing on disk that confirms a password without also opening it.
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

/**
 * Mint a lock for a brand-new account.
 *
 * The data key is random, not derived, so no password — including this first one —
 * can ever reproduce it. Change the password later and the old one is genuinely
 * dead rather than still able to re-derive the key.
 *
 * These locks carry no legacy verifier, so a client older than 0.12.0 cannot open
 * an account created here. That is the one direction of the compatibility window
 * left open, and it only affects accounts made after the update.
 */
export async function newPasswordLock(password: string): Promise<{ lock: PasswordLock; master: Uint8Array }> {
  const master = crypto.getRandomValues(new Uint8Array(32));
  const wrap = await wrapDataKey(password, master);
  return {
    lock: {
      algo: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS_V3,
      salt: wrap.salt,
      kdf: 3,
      wrap,
    },
    master,
  };
}

/**
 * Re-wrap an existing data key under a new password.
 *
 * This is what a password change is now: about thirty bytes re-encrypted, instead
 * of every night in the diary. It drops the legacy fields on purpose — changing a
 * password is exactly the moment the old one must stop opening the vault, and a
 * kept verifier would leave it working forever.
 */
export async function rewrapLock(password: string, dataKey: Uint8Array): Promise<PasswordLock> {
  const wrap = await wrapDataKey(password, dataKey);
  return {
    algo: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS_V3,
    salt: wrap.salt,
    kdf: 3,
    wrap,
  };
}

/**
 * The half of the stretched password a server may hold, once one exists.
 *
 * Unused today, and deliberately shipped early: it has to exist before the
 * migration or every vault would have to be migrated twice.
 */
export async function authKeyFor(password: string, lock: PasswordLock): Promise<Uint8Array | null> {
  if (!lock.wrap) return null;
  const { wrapKey, authKey } = await stretch(
    password,
    bytesFromBase64(lock.wrap.salt),
    Number(lock.wrap.iterations),
  );
  wrapKey.fill(0);
  return authKey;
}

export async function hashPassword(password: string): Promise<PasswordLock> {
  const { lock } = await newPasswordLock(password);
  return lock;
}

export type UnlockedMaster = {
  master: Uint8Array;
  /** Set when the lock on disk should be replaced with the one returned here. */
  migratedLock: PasswordLock | null;
};

/**
 * Open a lock, whatever generation it is.
 *
 * v3 first, because a migrated lock still carries the legacy fields and the whole
 * point is to stop using them. The fallback path adopts the derived key AS the data
 * key and wraps it — the existing envelopes are never touched, so migrating costs
 * one extra derivation on one login and nothing else.
 */
export async function unlockMaster(password: string, lock: PasswordLock): Promise<UnlockedMaster | null> {
  if (lock.algo !== "pbkdf2-sha256") return null;

  if (lock.wrap) {
    const master = await unwrapDataKey(password, lock.wrap);
    return master ? { master, migratedLock: null } : null;
  }
  // A v3 lock with no wrap is unopenable rather than weakly openable.
  if (lock.kdf === 3) return null;

  if (!lock.salt || !lock.hash) return null;
  const iterations = Number(lock.iterations);
  if (!Number.isFinite(iterations) || iterations < 10_000) return null;
  const salt = bytesFromBase64(lock.salt);
  const expected = bytesFromBase64(lock.hash);
  const master = await derive(password, salt, iterations);

  const verifier = await sha256(master);
  const ok = lock.kdf === 2 ? timingSafeEqual(verifier, expected) : timingSafeEqual(master, expected);
  if (!ok) return null;

  // Keep every legacy field exactly as it was. Old code on the other device reads
  // those and unlocks; new code takes the wrap. Dropping them is a later release,
  // once both surfaces are known to be updated.
  const wrap = await wrapDataKey(password, master);

  // Prove the new wrap opens, in memory, before anything is written. A migration
  // that produces an unopenable lock would take the diary with it, and there is no
  // reset to recover from — so the wrap has to earn its place before it replaces
  // anything. On any doubt, unlock still succeeds and migration simply waits.
  const proof = await unwrapDataKey(password, wrap);
  if (!proof || !timingSafeEqual(proof, master)) {
    proof?.fill(0);
    return { master, migratedLock: null };
  }
  proof.fill(0);

  return { master, migratedLock: { ...lock, hash: bytesToBase64(verifier), kdf: 2, wrap } };
}

export async function verifyPassword(password: string, lock: PasswordLock): Promise<boolean> {
  return (await unlockMaster(password, lock)) !== null;
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<VaultEnvelope>;
  return o.enc === true && o.v === 1 && typeof o.iv === "string" && typeof o.ct === "string" && o.iv.length > 0 && o.ct.length > 0;
}

export async function encryptPayload(
  payload: unknown,
  master: Uint8Array,
  rev?: number,
): Promise<VaultEnvelope> {
  if (!hasWebCrypto()) throw cryptoUnavailable();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", asBufferSource(master), { name: "AES-GCM" }, false, ["encrypt"]);
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, pt);
  const envelope: VaultEnvelope = { enc: true, v: 1, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
  if (typeof rev === "number" && Number.isFinite(rev)) envelope.rev = rev;
  return envelope;
}

export async function decryptPayload(envelope: VaultEnvelope, master: Uint8Array): Promise<unknown> {
  if (!hasWebCrypto()) throw cryptoUnavailable();
  const iv = bytesFromBase64(envelope.iv);
  const ct = bytesFromBase64(envelope.ct);
  const key = await crypto.subtle.importKey("raw", asBufferSource(master), { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, asBufferSource(ct));
  return JSON.parse(new TextDecoder().decode(pt)) as unknown;
}

export function holdMaster(login: string, master: Uint8Array): void {
  dropMaster(login);
  masters.set(login, new Uint8Array(master));
}

export function getMaster(login: string): Uint8Array | null {
  return masters.get(login) ?? null;
}

export function hasMaster(login: string): boolean {
  return masters.has(login);
}

export function dropMaster(login: string): void {
  const held = masters.get(login);
  if (held) held.fill(0);
  masters.delete(login);
}

export function dropAllMasters(): void {
  for (const login of [...masters.keys()]) dropMaster(login);
}
