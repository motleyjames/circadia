export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PBKDF2_ITERATIONS = 100_000;
export const CRYPTO_UNAVAILABLE = "WEB_CRYPTO_UNAVAILABLE";

export type PasswordLock = {
  algo: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  hash: string;
};

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(value: string): Uint8Array {
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

/**
 * NEW: PBKDF2 stretches a password with a random salt so the disk stores a hash, not the password.
 * This is a local lock, not a cloud account — XSS on this origin can still read localStorage.
 */
export async function hashPassword(password: string): Promise<PasswordLock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return {
    algo: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToB64(salt),
    hash: bytesToB64(hash),
  };
}

export async function verifyPassword(password: string, lock: PasswordLock): Promise<boolean> {
  if (lock.algo !== "pbkdf2-sha256") return false;
  if (!lock.salt || !lock.hash) return false;
  const iterations = Number(lock.iterations);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const salt = b64ToBytes(lock.salt);
  const expected = b64ToBytes(lock.hash);
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function hasWebCrypto(): boolean {
  const subtle = globalThis.crypto?.subtle;
  return typeof subtle?.importKey === "function" && typeof subtle.deriveBits === "function";
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!hasWebCrypto()) {
    const err = new Error(CRYPTO_UNAVAILABLE);
    err.name = CRYPTO_UNAVAILABLE;
    throw err;
  }
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
