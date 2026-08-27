import { describe, expect, it } from "vitest";
import { hydrateState } from "./storage";

describe("hydrateState", () => {
  it("drops malformed reports and refuses a profile without a clock window", () => {
    const state = hydrateState({
      profile: { onboardingComplete: true, name: "x", age: 19 },
      reports: [{ morningDate: "nope" }, { morningDate: "2026-01-01", wokeAt: "07:30", fellAsleepAt: "23:30", rating: 4 }],
      researchNotes: 12,
    });
    expect(state.profile).toBeNull();
    expect(state.reports).toHaveLength(1);
    expect(state.researchNotes).toBe("");
    expect(state.demoWeek).toBe(false);
  });

  it("throws on garbage", () => {
    expect(() => hydrateState("nope")).toThrow(/Circadia/);
  });
});
