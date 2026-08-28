import { describe, expect, it } from "vitest";
import {
  bytesToBase64,
  decryptPayload,
  encryptPayload,
  hashPassword,
  newPasswordLock,
  passwordIssue,
  unlockMaster,
  verifyPassword,
} from "./password";

describe("password lock", () => {
  it("rejects short or mismatched passwords before hashing", () => {
    expect(passwordIssue("short")).toMatch(/8/);
    expect(passwordIssue("longenough", "different")).toMatch(/match/);
    expect(passwordIssue("longenough", "longenough")).toBeNull();
  });

  it("stores a verifier, not the AES key, then encrypts so the disk cannot be read", async () => {
    const { lock, master } = await newPasswordLock("correct-horse");
    expect(JSON.stringify(lock)).not.toMatch(/correct-horse/);
    expect(lock.kdf).toBe(2);
    expect(lock.hash).not.toBe(bytesToBase64(master));
    expect(await verifyPassword("correct-horse", lock)).toBe(true);
    expect(await verifyPassword("wrong-horse", lock)).toBe(false);

    const sealed = await encryptPayload({ researchNotes: "keep me" }, master);
    expect(JSON.stringify(sealed)).not.toMatch(/keep me/);
    expect(await decryptPayload(sealed, master)).toEqual({ researchNotes: "keep me" });
  });

  it("still verifies a 0.6.19 lock whose hash is the master, and rewrites it", async () => {
    const { lock, master } = await newPasswordLock("correct-horse");
    const legacy = {
      algo: "pbkdf2-sha256" as const,
      iterations: lock.iterations,
      salt: lock.salt,
      hash: bytesToBase64(master),
    };
    expect(await hashPassword("correct-horse")).toMatchObject({ kdf: 2, algo: "pbkdf2-sha256" });
    const unlocked = await unlockMaster("correct-horse", legacy);
    expect(unlocked?.migratedLock?.kdf).toBe(2);
    expect(unlocked?.migratedLock?.hash).not.toBe(legacy.hash);
    expect(await verifyPassword("wrong-horse", legacy)).toBe(false);
  });
});
