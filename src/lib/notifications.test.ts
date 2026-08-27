import { describe, expect, it } from "vitest";
import { shouldBeOffScreens } from "./notifications";

describe("shouldBeOffScreens", () => {
  it("is true in the hour before a same-day bedtime", () => {
    const now = new Date(2026, 0, 1, 22, 45, 0);
    expect(shouldBeOffScreens("23:30", now)).toBe(true);
    expect(shouldBeOffScreens("23:30", new Date(2026, 0, 1, 21, 0, 0))).toBe(false);
  });

  it("wraps when bedtime is after midnight", () => {
    expect(shouldBeOffScreens("00:15", new Date(2026, 0, 1, 23, 30, 0))).toBe(true);
    expect(shouldBeOffScreens("00:15", new Date(2026, 0, 2, 0, 10, 0))).toBe(true);
    expect(shouldBeOffScreens("00:15", new Date(2026, 0, 2, 0, 20, 0))).toBe(false);
  });
});
