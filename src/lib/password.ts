export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PBKDF2_ITERATIONS = 100_000;
export const CRYPTO_UNAVAILABLE = "WEB_CRYPTO_UNAVAILABLE";

export type PasswordLock = {
  algo: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  hash: string;
  /**
   * 2 = `hash` is SHA-256(master). 1 or omitted = `hash` is the master itself (0.6.19).
   * The lock file never stores the AES key — the verifier cannot decrypt the diary.
   * Stay-signed-in holds the master in the macOS Keychain until Log out.
   */
  kdf?: 1 | 2;
};

export type VaultEnvelope = {
  enc: true;
  v: 1;
  iv: string;
  ct: string;
};

const masters = new Map<string, Uint8Array>();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
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

/**
 * Stretch the password into a 256-bit master, then store SHA-256(master) as the verifier.
 * After unlock, the master is in RAM. Stay-signed-in also writes it to this origin's
 * WebKit data — not to Application Support vault.json.
 */
export async function newPasswordLock(password: string): Promise<{ lock: PasswordLock; master: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const master = await derive(password, salt, PBKDF2_ITERATIONS);
  const verifier = await sha256(master);
  return {
    lock: {
      algo: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(verifier),
      kdf: 2,
    },
    master,
  };
}

export async function hashPassword(password: string): Promise<PasswordLock> {
  const { lock } = await newPasswordLock(password);
  return lock;
}

export type UnlockedMaster = {
  master: Uint8Array;
  /** Present when a 0.6.19 lock was rewritten so the stored hash is no longer the AES key. */
  migratedLock: PasswordLock | null;
};

export async function unlockMaster(password: string, lock: PasswordLock): Promise<UnlockedMaster | null> {
  if (lock.algo !== "pbkdf2-sha256") return null;
  if (!lock.salt || !lock.hash) return null;
  const iterations = Number(lock.iterations);
  if (!Number.isFinite(iterations) || iterations < 10_000) return null;
  const salt = bytesFromBase64(lock.salt);
  const expected = bytesFromBase64(lock.hash);
  const master = await derive(password, salt, iterations);
  if (lock.kdf === 2) {
    const verifier = await sha256(master);
    if (!timingSafeEqual(verifier, expected)) return null;
    return { master, migratedLock: null };
  }
  if (!timingSafeEqual(master, expected)) return null;
  const verifier = await sha256(master);
  return {
    master,
    migratedLock: {
      algo: "pbkdf2-sha256",
      iterations,
      salt: lock.salt,
      hash: bytesToBase64(verifier),
      kdf: 2,
    },
  };
}

export async function verifyPassword(password: string, lock: PasswordLock): Promise<boolean> {
  return (await unlockMaster(password, lock)) !== null;
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<VaultEnvelope>;
  return o.enc === true && o.v === 1 && typeof o.iv === "string" && typeof o.ct === "string" && o.iv.length > 0 && o.ct.length > 0;
}

export async function encryptPayload(payload: unknown, master: Uint8Array): Promise<VaultEnvelope> {
  if (!hasWebCrypto()) throw cryptoUnavailable();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", asBufferSource(master), { name: "AES-GCM" }, false, ["encrypt"]);
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, pt);
  return { enc: true, v: 1, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
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
