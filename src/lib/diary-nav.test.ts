import { describe, expect, it } from "vitest";
import { diaryPathToPush } from "./diary-nav";

const ORIGIN = "https://localhost";

describe("diary in-app paths", () => {
  it("keeps the five diary tabs on this origin", () => {
    expect(diaryPathToPush("/", ORIGIN)).toBe("/");
    expect(diaryPathToPush("/check-in", ORIGIN)).toBe("/check-in");
    expect(diaryPathToPush("/insights", ORIGIN)).toBe("/insights");
    expect(diaryPathToPush("/library#duration-age", ORIGIN)).toBe("/library#duration-age");
    expect(diaryPathToPush("/you", ORIGIN)).toBe("/you");
  });

  it("does not capture operator, APIs, or other origins", () => {
    expect(diaryPathToPush("/api/vault", ORIGIN)).toBeNull();
    expect(diaryPathToPush("/mod", ORIGIN)).toBeNull();
    expect(diaryPathToPush("/mod/inbox", ORIGIN)).toBeNull();
    expect(diaryPathToPush("https://example.com/you", ORIGIN)).toBeNull();
    expect(diaryPathToPush("mailto:ada@example.com", ORIGIN)).toBeNull();
    expect(diaryPathToPush("#already-hash", ORIGIN)).toBeNull();
  });
});
