import { describe, expect, it } from "vitest";
import { hashPassword, passwordIssue, verifyPassword } from "./password";

describe("password lock", () => {
  it("rejects short or mismatched passwords before hashing", () => {
    expect(passwordIssue("short")).toMatch(/8/);
    expect(passwordIssue("longenough", "different")).toMatch(/match/);
    expect(passwordIssue("longenough", "longenough")).toBeNull();
  });

  it("hashes so the password is not stored, then verifies", async () => {
    const lock = await hashPassword("correct-horse");
    expect(JSON.stringify(lock)).not.toMatch(/correct-horse/);
    expect(lock.salt).not.toBe(lock.hash);
    expect(await verifyPassword("correct-horse", lock)).toBe(true);
    expect(await verifyPassword("wrong-horse", lock)).toBe(false);
  });
});
