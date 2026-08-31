import { describe, expect, it } from "vitest";
import {
  DIARY_PACK_ERRORS,
  LOCKED_DIARY_KIND,
  parseLockedDiary,
  readLockedDiaryFile,
  serializeLockedDiary,
} from "./diary-pack";
import { parseDiskVault } from "./vault";

const vault = parseDiskVault({
  v: 1,
  files: { "email:ada@example.com": { enc: true } },
  locks: { "email:ada@example.com": { v: 2, salt: "YQ==", hash: "Yg==" } },
  session: "email:ada@example.com",
});

describe("locked diary pack", () => {
  it("round-trips ciphertext and strips stay-signed-in", () => {
    const pack = serializeLockedDiary(vault);
    expect(pack.kind).toBe(LOCKED_DIARY_KIND);
    expect(pack.v).toBe(1);
    expect(pack.vault.session).toBeNull();
    expect(pack.vault.files["email:ada@example.com"]).toEqual({ enc: true });
    const parsed = parseLockedDiary(pack);
    expect(parsed?.session).toBeNull();
    expect(parsed?.files["email:ada@example.com"]).toEqual({ enc: true });
    expect(parsed?.locks["email:ada@example.com"]).toEqual(vault.locks["email:ada@example.com"]);
  });

  it("accepts a raw vault.json and still drops session", () => {
    const parsed = parseLockedDiary({
      v: 1,
      files: { "email:ada@example.com": { enc: true } },
      locks: {},
      session: "email:ada@example.com",
    });
    expect(parsed?.files["email:ada@example.com"]).toEqual({ enc: true });
    expect(parsed?.session).toBeNull();
  });

  it("fails closed on random JSON, empty files, and unknown kinds", () => {
    expect(parseLockedDiary(null)).toBeNull();
    expect(parseLockedDiary([])).toBeNull();
    expect(parseLockedDiary({ hello: "world" })).toBeNull();
    expect(parseLockedDiary({ v: 1, files: {} })).toBeNull();
    expect(parseLockedDiary({ kind: LOCKED_DIARY_KIND, v: 1, vault: { v: 1, files: {}, locks: {} } })).toBeNull();
    expect(parseLockedDiary({ kind: LOCKED_DIARY_KIND, v: 2, vault })).toBeNull();
    expect(parseLockedDiary({ kind: "circadia.nights", v: 1, vault })).toBeNull();
    expect(parseLockedDiary({ files: { "email:ada@example.com": 1 } })).toBeNull();
  });

  it("readLockedDiaryFile rejects a non-JSON blob", async () => {
    const file = new File(["not json"], "notes.txt", { type: "text/plain" });
    await expect(readLockedDiaryFile(file)).rejects.toThrow(DIARY_PACK_ERRORS.notDiary);
  });
});
