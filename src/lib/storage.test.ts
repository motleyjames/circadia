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
    expect(state.study.asked).toBe(false);
    expect(state.study.consented).toBe(false);
  });

  it("keeps a study participant number across hydrate", () => {
    const state = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "x",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
      },
      study: {
        asked: true,
        consented: true,
        participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
    });
    expect(state.study.consented).toBe(true);
    expect(state.study.participantId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(state.study.rosterSentAt).toBeNull();
  });

  it("keeps email and phone on the local file and splits a display name", () => {
    const state = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "James Motley",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
        email: "james@colorado.edu",
        phone: "3035550142",
      },
    });
    expect(state.profile?.email).toBe("james@colorado.edu");
    expect(state.profile?.phone).toBe("3035550142");
    expect(state.profile?.firstName).toBe("James");
    expect(state.profile?.lastName).toBe("Motley");
  });

  it("keeps an incomplete identity profile so sleep intake can finish after signup", () => {
    const state = hydrateState({
      profile: {
        onboardingComplete: false,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
      },
    });
    expect(state.profile?.onboardingComplete).toBe(false);
    expect(state.profile?.firstName).toBe("Ada");
    expect(state.profile?.email).toBe("ada@example.com");
    expect(state.profile?.name).toBe("Ada Lovelace");
  });

  it("keeps a local supplement note and does not require melatonin-only kinds", () => {
    const state = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "x",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
      },
      reports: [
        {
          morningDate: "2026-08-27",
          wokeAt: "07:30",
          fellAsleepAt: "23:30",
          rating: 3,
          usedSupplement: true,
          supplementKind: "antihistamine",
          supplementNote: "should not need this for unisom-type",
        },
      ],
    });
    expect(state.reports[0]?.supplementKind).toBe("antihistamine");
    expect(state.reports[0]?.supplementNote).toBe("should not need this for unisom-type");
  });

  it("throws on garbage", () => {
    expect(() => hydrateState("nope")).toThrow(/Circadia/);
  });
});
