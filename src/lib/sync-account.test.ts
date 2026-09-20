import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptPayload, generateRecoveryCode, hkdf, sha256 } from "@/lib/password";
import {
  bytesToHex,
  deriveLookup,
  mintAccountRecord,
  normalizeEmailForKdf,
  OBJECT_ID,
  openAccountRecord,
  openAccountRecordWithRecovery,
  type MintedAccountRecord,
} from "@/lib/sync-account";

const EMAIL = "Ada+Tag@Example.COM";
const PW = "test-password-for-sync";
const OTHER_EMAIL = "other.person@example.com";
const OTHER_PW = "different-password-here";

let code: string;
let minted: MintedAccountRecord;

beforeAll(async () => {
  code = generateRecoveryCode();
  const built = await mintAccountRecord(EMAIL, PW, code, code);
  if (!built) throw new Error("mintAccountRecord returned null in setup");
  minted = built;
}, 60_000);

describe("sync account derivation and record", () => {
  it("lookupId is reproducible from email and password alone", async () => {
    const once = await deriveLookup(EMAIL, PW);
    const twice = await deriveLookup(EMAIL, PW);
    expect(once.lookupId).toBe(twice.lookupId);
    expect(once.lookupId).toBe(minted.lookupId);
    once.lookupKey.fill(0);
    twice.lookupKey.fill(0);
  });

  it("a different email or password yields a different lookupId", async () => {
    const base = await deriveLookup(EMAIL, PW);
    const otherEmail = await deriveLookup(OTHER_EMAIL, PW);
    const otherPassword = await deriveLookup(EMAIL, OTHER_PW);
    expect(otherEmail.lookupId).not.toBe(base.lookupId);
    expect(otherPassword.lookupId).not.toBe(base.lookupId);
    base.lookupKey.fill(0);
    otherEmail.lookupKey.fill(0);
    otherPassword.lookupKey.fill(0);
  });

  it("accountId, vaultSalt and authKey are random across two mints", async () => {
    const again = await mintAccountRecord(EMAIL, PW, code, code);
    expect(again).toBeTruthy();
    expect(again!.plain.accountId).not.toBe(minted.plain.accountId);
    expect(again!.plain.vaultSalt).not.toBe(minted.plain.vaultSalt);
    expect(again!.plain.authKey).not.toBe(minted.plain.authKey);
    expect(again!.lookupId).toBe(minted.lookupId);
  });

  it("email normalization is frozen at v1", () => {
    expect(normalizeEmailForKdf("James@Colorado.EDU")).toBe("james@colorado.edu");
    expect(normalizeEmailForKdf("  ada@example.com  ")).toBe("ada@example.com");
    expect(normalizeEmailForKdf("ada.lovelace@example.com")).toBe("ada.lovelace@example.com");
    expect(normalizeEmailForKdf("ada+sync@example.com")).toBe("ada+sync@example.com");
    expect(normalizeEmailForKdf("ada.lovelace@example.com")).not.toBe(normalizeEmailForKdf("adalovelace@example.com"));
    expect(normalizeEmailForKdf("ada+sync@example.com")).not.toBe(normalizeEmailForKdf("ada@example.com"));
    const src = readFileSync(new URL("./sync-account.ts", import.meta.url), "utf8");
    const start = src.indexOf("export function normalizeEmailForKdf");
    const end = src.indexOf("export function bytesToHex");
    const fn = src.slice(start, end);
    expect(fn).toContain("return raw.trim().toLowerCase();");
    expect(fn).not.toMatch(/replace|slice|split|\+/);
  });

  it("the email never appears in the record, lookupId, or stored derivatives", () => {
    const stored = JSON.stringify({
      lookupId: minted.lookupId,
      sealed: minted.sealed,
      plain: minted.plain,
    });
    const email = normalizeEmailForKdf(EMAIL);
    expect(stored.toLowerCase()).not.toContain(email);
    expect(stored.toLowerCase()).not.toContain("ada+tag");
    expect(stored.toLowerCase()).not.toContain("example.com");
    expect(minted.lookupId).not.toContain("@");
    expect(minted.plain.accountId).not.toContain("@");
  });

  it("the record opens under the recovery code as well as under lookupKey", async () => {
    const hop = await deriveLookup(EMAIL, PW);
    const viaLookup = await openAccountRecord(minted.sealed, hop.lookupKey);
    const viaRecovery = await openAccountRecordWithRecovery(minted.sealed, code);
    hop.lookupKey.fill(0);
    expect(viaLookup).toEqual(minted.plain);
    expect(viaRecovery).toEqual(minted.plain);
    expect(await openAccountRecordWithRecovery(minted.sealed, generateRecoveryCode())).toBeNull();
  });

  it("a record is proven to open before it is returned", async () => {
    const src = readFileSync(new URL("./sync-account.ts", import.meta.url), "utf8");
    const start = src.indexOf("export async function mintAccountRecord");
    const fn = src.slice(start);
    expect(fn).toContain("const viaLookup = await openAccountRecord(sealed, lookupKey)");
    expect(fn).toContain("const viaRecovery = await openAccountRecordWithRecovery(sealed, recoveryCode)");
    expect(fn.indexOf("openAccountRecordWithRecovery(sealed, recoveryCode)")).toBeLessThan(
      fn.indexOf("return { lookupId, lookupAuth, sealed, plain }"),
    );
    expect(await mintAccountRecord(EMAIL, PW, code, "not-the-code")).toBeNull();
  });

  it("lookupId matches the Worker alphabet and is not a UUID", async () => {
    expect(OBJECT_ID.test(minted.lookupId)).toBe(true);
    expect(OBJECT_ID.test(minted.plain.accountId)).toBe(true);
    expect(OBJECT_ID.test("2f1a0c8e-4b3d-4a91-9c2e-7d6b5a4c3e21")).toBe(false);
    expect(minted.lookupId).toHaveLength(64);
    expect(minted.lookupAuth).toHaveLength(32);
    const hop = await deriveLookup("  JAMES@COLORADO.EDU  ", PW);
    expect(OBJECT_ID.test(hop.lookupId)).toBe(true);
    hop.lookupKey.fill(0);
  });

  it("lookupAuth cannot decrypt the record", async () => {
    const envelope = { enc: true as const, v: 1 as const, iv: minted.sealed.iv, ct: minted.sealed.ct };
    await expect(decryptPayload(envelope, minted.lookupAuth)).rejects.toThrow();
    const hop = await deriveLookup(EMAIL, PW);
    expect(await openAccountRecord(minted.sealed, minted.lookupAuth)).toBeNull();
    expect(await openAccountRecord(minted.sealed, hop.lookupKey)).toEqual(minted.plain);
    hop.lookupKey.fill(0);
  });

  it("neither lookupId nor lookupAuth can be derived from the other", async () => {
    expect(minted.lookupId).not.toBe(bytesToHex(minted.lookupAuth));
    const hashedAuth = bytesToHex(await sha256(minted.lookupAuth));
    expect(minted.lookupId).not.toBe(hashedAuth);
    const crossed = bytesToHex(await sha256(await hkdf(minted.lookupAuth, "circadia/lookup-id/v1")));
    expect(crossed).not.toBe(minted.lookupId);
    const src = readFileSync(new URL("./sync-account.ts", import.meta.url), "utf8");
    expect(src).toContain('const LOOKUP_ID_INFO = "circadia/lookup-id/v1"');
    expect(src).toContain('const LOOKUP_AUTH_INFO = "circadia/lookup-auth/v1"');
    expect(LOOKUP_ID_INFO_FROM_SRC(src)).not.toBe(LOOKUP_AUTH_INFO_FROM_SRC(src));
  });
});

function LOOKUP_ID_INFO_FROM_SRC(src: string): string {
  return /const LOOKUP_ID_INFO = "([^"]+)"/.exec(src)?.[1] ?? "";
}

function LOOKUP_AUTH_INFO_FROM_SRC(src: string): string {
  return /const LOOKUP_AUTH_INFO = "([^"]+)"/.exec(src)?.[1] ?? "";
}
