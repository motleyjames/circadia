import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CROCKFORD_ALPHABET,
  PASSWORD_MIN,
  signupPasswordHint,
  PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS_V3,
  RECOVERY_CODE_CHARS,
  attachRecoveryWrap,
  authKeyFor,
  bytesToBase64,
  decryptPayload,
  encryptPayload,
  generateRecoveryCode,
  hashPassword,
  newPasswordLock,
  normalizeRecoveryCode,
  passwordIssue,
  rewrapLock,
  unlockMaster,
  unlockWithRecovery,
  verifyPassword,
  type PasswordLock,
} from "./password";

const PW = "correct-horse-battery";

/**
 * Mint a lock exactly the way the app did before 0.12.0, so the migration tests
 * run against the real thing rather than a hand-written approximation of it.
 */
async function legacyLock(password: string, kdf: 1 | 2): Promise<{ lock: PasswordLock; master: Uint8Array }> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  const master = new Uint8Array(bits);
  const verifier = new Uint8Array(await crypto.subtle.digest("SHA-256", master));
  return {
    master,
    lock: {
      algo: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(kdf === 2 ? verifier : master),
      ...(kdf === 2 ? { kdf: 2 as const } : {}),
    },
  };
}

/** What a client older than 0.12.0 sees: the lock with the new field removed. */
function asOldClientSees(lock: PasswordLock): PasswordLock {
  const rest = { ...lock };
  delete rest.wrap;
  return rest;
}

describe("password rules", () => {
  it("asks for a longer password than it used to, and only when minting", () => {
    expect(PASSWORD_MIN).toBeGreaterThanOrEqual(10);
    expect(passwordIssue("short")).toMatch(String(PASSWORD_MIN));
    expect(passwordIssue("a".repeat(PASSWORD_MIN), "different")).toMatch(/match/);
    expect(passwordIssue("a".repeat(PASSWORD_MIN), "a".repeat(PASSWORD_MIN))).toBeNull();
    expect(signupPasswordHint()).toBe(
      `At least ${PASSWORD_MIN} characters. Somnadia will not email or text you.`,
    );
    expect(signupPasswordHint()).toContain(String(PASSWORD_MIN));
    expect(signupPasswordHint()).not.toMatch(/At least 8 /);
    expect(readFileSync("src/components/auth-gate.tsx", "utf8")).toContain("signupPasswordHint()");
  });
});

describe("a new lock wraps a random key", () => {
  it("never writes the password or the key to disk", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const onDisk = JSON.stringify(lock);
    expect(onDisk).not.toMatch(PW);
    expect(onDisk).not.toContain(bytesToBase64(master));
    expect(lock.kdf).toBe(3);
    expect(lock.wrap).toBeTruthy();
    // No verifier at all now — the GCM tag does that job.
    expect(lock.hash).toBeUndefined();
  });

  it("does not derive the key from the password, so the first password is not forever", async () => {
    // Two locks, same password: the wrapped keys must differ. If the key were
    // derived, the only difference would be the salt.
    const a = await newPasswordLock(PW);
    const b = await newPasswordLock(PW);
    expect(bytesToBase64(a.master)).not.toBe(bytesToBase64(b.master));
  });

  it("uses the raised work factor", async () => {
    const { lock } = await newPasswordLock(PW);
    expect(lock.wrap!.iterations).toBe(PBKDF2_ITERATIONS_V3);
    expect(PBKDF2_ITERATIONS_V3).toBeGreaterThanOrEqual(600_000);
  });

  it("opens with the right password and encrypts a real payload", async () => {
    const { lock, master } = await newPasswordLock(PW);
    expect(await verifyPassword(PW, lock)).toBe(true);
    expect(await verifyPassword("wrong-horse-battery", lock)).toBe(false);
    const sealed = await encryptPayload({ researchNotes: "keep me" }, master);
    expect(JSON.stringify(sealed)).not.toMatch(/keep me/);
    expect(await decryptPayload(sealed, master)).toEqual({ researchNotes: "keep me" });
  });

  it("refuses a tampered wrap instead of returning a wrong key", async () => {
    const { lock } = await newPasswordLock(PW);
    const flipped = bytesToBase64(
      (() => {
        const raw = Uint8Array.from(atob(lock.wrap!.ct), (c) => c.charCodeAt(0));
        raw[0] ^= 0xff;
        return raw;
      })(),
    );
    const tampered: PasswordLock = { ...lock, wrap: { ...lock.wrap!, ct: flipped } };
    expect(await unlockMaster(PW, tampered)).toBeNull();
  });

  it("treats a v3 lock with no wrap as unopenable, not weakly openable", async () => {
    const { lock } = await newPasswordLock(PW);
    expect(await unlockMaster(PW, { ...lock, wrap: undefined })).toBeNull();
  });

  it("mints through hashPassword the same way", async () => {
    expect(await hashPassword(PW)).toMatchObject({ kdf: 3, algo: "pbkdf2-sha256" });
  });
});

describe("migrating a lock that already exists", () => {
  it("adopts the derived key rather than re-encrypting the diary", async () => {
    const { lock, master } = await legacyLock(PW, 2);
    // A night filed before the migration, encrypted under the old key.
    const before = await encryptPayload({ reports: ["a night"] }, master);

    const unlocked = (await unlockMaster(PW, lock))!;
    expect(unlocked.master).toEqual(master);
    expect(unlocked.migratedLock).toBeTruthy();

    // The same bytes still decrypt. Nothing was rewritten.
    const reopened = (await unlockMaster(PW, unlocked.migratedLock!))!;
    expect(reopened.master).toEqual(master);
    expect(await decryptPayload(before, reopened.master)).toEqual({ reports: ["a night"] });
  });

  it("keeps every legacy field, so the other device can still open the vault", async () => {
    const { lock } = await legacyLock(PW, 2);
    const migrated = (await unlockMaster(PW, lock))!.migratedLock!;
    // The marker deliberately stays at 2: bumping it would send old code down its
    // 0.6.19 branch, where the correct password reads as wrong.
    expect(migrated.kdf).toBe(2);
    expect(migrated.salt).toBe(lock.salt);
    expect(migrated.iterations).toBe(lock.iterations);
    expect(migrated.hash).toBe(lock.hash);
    expect(migrated.wrap).toBeTruthy();
  });

  it("still opens for a client that has never heard of the new field", async () => {
    const { lock, master } = await legacyLock(PW, 2);
    const migrated = (await unlockMaster(PW, lock))!.migratedLock!;
    const oldClient = (await unlockMaster(PW, asOldClientSees(migrated)))!;
    expect(oldClient.master).toEqual(master);
  });

  it("prefers the wrap once it exists", async () => {
    const { lock, master } = await legacyLock(PW, 2);
    const migrated = (await unlockMaster(PW, lock))!.migratedLock!;
    // Corrupt the legacy verifier. If the wrap is being used, this is irrelevant.
    const poisoned: PasswordLock = { ...migrated, hash: bytesToBase64(new Uint8Array(32)) };
    const opened = (await unlockMaster(PW, poisoned))!;
    expect(opened.master).toEqual(master);
  });

  it("migrates only once", async () => {
    const { lock } = await legacyLock(PW, 2);
    const migrated = (await unlockMaster(PW, lock))!.migratedLock!;
    expect((await unlockMaster(PW, migrated))!.migratedLock).toBeNull();
  });

  it("still handles the 0.6.19 lock whose hash was the key itself", async () => {
    const { lock, master } = await legacyLock(PW, 1);
    const unlocked = (await unlockMaster(PW, lock))!;
    expect(unlocked.master).toEqual(master);
    expect(unlocked.migratedLock!.hash).not.toBe(lock.hash);
    expect(unlocked.migratedLock!.wrap).toBeTruthy();
  });

  it("does not migrate on a wrong password", async () => {
    const { lock } = await legacyLock(PW, 2);
    expect(await unlockMaster("wrong-horse-battery", lock)).toBeNull();
  });
});

describe("changing a password", () => {
  it("keeps the key, so nothing on disk has to be rewritten", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const sealed = await encryptPayload({ reports: ["a night"] }, master);

    const next = await rewrapLock("second-password-here", master);
    const opened = (await unlockMaster("second-password-here", next))!;
    expect(opened.master).toEqual(master);
    expect(await decryptPayload(sealed, opened.master)).toEqual({ reports: ["a night"] });
    expect(next.kdf).toBe(3);
    void lock;
  });

  it("retires the old password", async () => {
    const { master } = await newPasswordLock(PW);
    const next = await rewrapLock("second-password-here", master);
    expect(await unlockMaster(PW, next)).toBeNull();
  });

  it("drops the legacy verifier, or the old password would keep working forever", async () => {
    const { lock, master } = await legacyLock(PW, 2);
    const migrated = (await unlockMaster(PW, lock))!.migratedLock!;
    expect(migrated.hash).toBeTruthy();

    const next = await rewrapLock("second-password-here", master);
    expect(next.hash).toBeUndefined();
    // The old password can no longer reach the key by either route.
    expect(await unlockMaster(PW, next)).toBeNull();
    expect(await unlockMaster(PW, asOldClientSees(next))).toBeNull();
  });
});

describe("the auth key, for the server that does not exist yet", () => {
  it("is derived from the same password but cannot unwrap the vault", async () => {
    const { lock } = await newPasswordLock(PW);
    const authKey = (await authKeyFor(PW, lock))!;
    expect(authKey).toHaveLength(32);
    // It is not the wrapped key, and it is not the wrapping key.
    expect(bytesToBase64(authKey)).not.toBe(lock.wrap!.ct);
    const asKey: PasswordLock = { ...lock, wrap: { ...lock.wrap!, ct: bytesToBase64(authKey) } };
    expect(await unlockMaster(PW, asKey)).toBeNull();
  });

  it("is stable for the same password and lock, and different for another password", async () => {
    const { lock } = await newPasswordLock(PW);
    const once = (await authKeyFor(PW, lock))!;
    const twice = (await authKeyFor(PW, lock))!;
    expect(once).toEqual(twice);
    const other = (await authKeyFor("second-password-here", lock))!;
    expect(other).not.toEqual(once);
  });

  it("has nothing to offer a lock that has not migrated", async () => {
    const { lock } = await legacyLock(PW, 2);
    expect(await authKeyFor(PW, lock)).toBeNull();
  });
});

/** What a client that has never heard of recovery sees: the lock with that field removed. */
function asClientWithoutRecovery(lock: PasswordLock): PasswordLock {
  const rest = { ...lock };
  delete rest.recovery;
  return rest;
}

describe("recovery codes wrap the same data key", () => {
  it("the recovery wrap yields the same data key as the password wrap", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const before = await encryptPayload({ reports: ["a night"] }, master);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    expect(withRecovery.recovery!.iterations).toBe(PBKDF2_ITERATIONS_V3);
    expect(withRecovery.recovery!.iterations).toBe(lock.wrap!.iterations);
    const fromRecovery = (await unlockWithRecovery(code, withRecovery))!;
    expect(fromRecovery).toEqual(master);
    expect(await decryptPayload(before, fromRecovery)).toEqual({ reports: ["a night"] });
  });

  it("never writes the recovery code to disk, the vault, a log, or an error", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    const onDisk = JSON.stringify(withRecovery);
    const secret = normalizeRecoveryCode(code);
    expect(onDisk).not.toContain(code);
    expect(onDisk).not.toContain(secret);
    expect(await unlockWithRecovery(code, withRecovery)).toEqual(master);
    const failed = await unlockWithRecovery("WWWWW-WWWWW-WWWWW-WWWWW-WWWWW", withRecovery);
    expect(failed).toBeNull();
    const src = readFileSync(new URL("./password.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/recovery:\s*(secret|code|confirm)/);
    expect(src).not.toMatch(/Error\([^)]*(secret|code)/);
  });

  it("a lock with recovery still opens with the password", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    expect(withRecovery.kdf).toBe(lock.kdf);
    const opened = (await unlockMaster(PW, withRecovery))!;
    expect(opened.master).toEqual(master);
    expect(opened.migratedLock).toBeNull();
  });

  it("a client unaware of recovery still opens the lock", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    const unaware = (await unlockMaster(PW, asClientWithoutRecovery(withRecovery)))!;
    expect(unaware.master).toEqual(master);
  });

  it("proves the recovery wrap opens before returning a lock to persist", async () => {
    const src = readFileSync(new URL("./password.ts", import.meta.url), "utf8");
    const start = src.indexOf("export async function attachRecoveryWrap");
    const end = src.indexOf("export async function unlockWithRecovery");
    const fn = src.slice(start, end);
    expect(fn).toContain("const recoveryWrap = await wrapDataKey(secret, dataKey)");
    expect(fn).toContain("const recoveryProof = await unwrapDataKey(secret, recoveryWrap)");
    expect(fn).toContain("timingSafeEqual(recoveryProof, dataKey)");
    expect(fn.indexOf("unwrapDataKey(secret, recoveryWrap)")).toBeGreaterThan(-1);
    expect(fn.indexOf("unwrapDataKey(secret, recoveryWrap)")).toBeLessThan(fn.indexOf("return { ...lock, recovery: recoveryWrap }"));
    const { lock, master } = await newPasswordLock(PW);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    expect(await unlockWithRecovery(code, withRecovery)).toEqual(master);
  });

  it("a wrong recovery code fails cleanly", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    const before = JSON.stringify(withRecovery);
    expect(await unlockWithRecovery("WWWWW-WWWWW-WWWWW-WWWWW-WWWWW", withRecovery)).toBeNull();
    expect(await unlockWithRecovery("not-a-recovery-code", withRecovery)).toBeNull();
    expect(JSON.stringify(withRecovery)).toBe(before);
    expect((await unlockMaster(PW, withRecovery))!.master).toEqual(master);
    expect(await unlockWithRecovery(code, withRecovery)).toEqual(master);
  });

  it("generating a recovery code does not re-key the vault or modify wrap", async () => {
    const { lock, master } = await newPasswordLock(PW);
    const wrapBefore = { ...lock.wrap! };
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    expect(withRecovery.wrap).toEqual(wrapBefore);
    expect(withRecovery.kdf).toBe(lock.kdf);
    expect(withRecovery.salt).toBe(lock.salt);
    expect(withRecovery.iterations).toBe(lock.iterations);
    expect(withRecovery.hash).toBe(lock.hash);
    expect(withRecovery.algo).toBe(lock.algo);
    const rotated = await rewrapLock("second-password-here", master, withRecovery);
    expect(rotated.recovery).toEqual(withRecovery.recovery);
    expect(rotated.wrap).not.toEqual(wrapBefore);
    expect(await unlockWithRecovery(code, rotated)).toEqual(master);
    expect(await unlockMaster(PW, rotated)).toBeNull();
  });

  it("rewrapLock without previous drops recovery — that is the old client, still on the phone", async () => {
    // Document, do not change the two-argument call. Circadia on a phone that has
    // not updated still rebuilds the lock from known fields only. JSON round-trip
    // of the parsed object keeps `recovery`; this reconstruct does not. Release
    // two is both surfaces carrying previous through changePassword.
    const { lock, master } = await newPasswordLock(PW);
    const code = generateRecoveryCode();
    const withRecovery = (await attachRecoveryWrap(lock, master, code, code))!;
    expect(withRecovery.recovery).toBeTruthy();
    const oldClient = await rewrapLock("second-password-here", master);
    expect(oldClient.recovery).toBeUndefined();
    expect(JSON.stringify(oldClient)).not.toContain("recovery");
    expect(await unlockWithRecovery(code, oldClient)).toBeNull();
    expect((await unlockMaster("second-password-here", oldClient))!.master).toEqual(master);
  });

  it("generates the recovery code from crypto.getRandomValues, never Math.random", () => {
    const src = readFileSync(new URL("./password.ts", import.meta.url), "utf8");
    const start = src.indexOf("export function generateRecoveryCode");
    const end = src.indexOf("export async function attachRecoveryWrap");
    const fn = src.slice(start, end);
    expect(fn).toContain("crypto.getRandomValues");
    expect(fn).not.toContain("Math.random");
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(a).not.toBe(b);
    expect(normalizeRecoveryCode(a)).toHaveLength(RECOVERY_CODE_CHARS);
    expect(a).toMatch(new RegExp(`^[${CROCKFORD_ALPHABET}]{5}(-[${CROCKFORD_ALPHABET}]{5}){4}$`));
    expect(a).not.toMatch(/[ILOU]/);
  });
});
