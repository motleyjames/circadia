import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN,
  PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS_V3,
  authKeyFor,
  bytesToBase64,
  decryptPayload,
  encryptPayload,
  hashPassword,
  newPasswordLock,
  passwordIssue,
  rewrapLock,
  unlockMaster,
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
