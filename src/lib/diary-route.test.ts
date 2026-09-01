import { describe, expect, it } from "vitest";
import { diaryPathname, normalizeDiaryPath, tabIsActive } from "./diary-route";

describe("diary in-shell paths", () => {
  it("treats Tonight as only the root tab", () => {
    expect(tabIsActive("/", "/")).toBe(true);
    expect(tabIsActive("/", "/check-in")).toBe(false);
    expect(tabIsActive("/", "/library#duration-age")).toBe(false);
    expect(tabIsActive("/check-in", "/check-in")).toBe(true);
    expect(tabIsActive("/library", "/library#duration-age")).toBe(true);
    expect(tabIsActive("/you", "/you")).toBe(true);
    expect(tabIsActive("/insights", "/check-in")).toBe(false);
  });

  it("strips query and hash when choosing which view to mount", () => {
    expect(diaryPathname("/library#duration-age")).toBe("/library");
    expect(diaryPathname("/you?x=1")).toBe("/you");
    expect(diaryPathname("")).toBe("/");
  });

  it("keeps hashes on library links without inventing a new origin", () => {
    expect(normalizeDiaryPath("/library#duration-age")).toBe("/library#duration-age");
    expect(normalizeDiaryPath("/insights")).toBe("/insights");
  });
});
