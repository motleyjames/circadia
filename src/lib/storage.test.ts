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

  it("files a leftover live chat into history and leaves the desk empty", () => {
    const state = hydrateState({
      chat: [
        {
          id: "c1",
          role: "you",
          text: "Should I take melatonin?",
          createdAt: "2026-08-27T22:00:00.000Z",
        },
        {
          id: "c2",
          role: "circadia",
          text: "Melatonin is a clock signal, not a sleeping pill.",
          createdAt: "2026-08-27T22:00:01.000Z",
          citations: ["melatonin"],
        },
      ],
      activeConsultId: "should-not-reopen",
    });
    expect(state.chat).toEqual([]);
    expect(state.activeConsultId).toBeNull();
    expect(state.consultHistory).toHaveLength(1);
    expect(state.consultHistory[0]?.title).toMatch(/melatonin/i);
    expect(state.consultHistory[0]?.messages).toHaveLength(2);
  });

  it("does not duplicate a thread that was already in history", () => {
    const messages = [
      {
        id: "c1",
        role: "you" as const,
        text: "What is Quviviq?",
        createdAt: "2026-08-28T16:00:00.000Z",
      },
    ];
    const state = hydrateState({
      chat: messages,
      activeConsultId: "thread-quviviq-01",
      consultHistory: [
        {
          id: "thread-quviviq-01",
          title: "What is Quviviq?",
          createdAt: "2026-08-28T16:00:00.000Z",
          updatedAt: "2026-08-28T16:00:00.000Z",
          messages,
        },
      ],
    });
    expect(state.consultHistory).toHaveLength(1);
    expect(state.chat).toEqual([]);
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

  it("defaults scheduledDays to Mon–Fri and keeps a custom week, including all-off", () => {
    const legacy = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "x",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
      },
    });
    expect(legacy.profile?.scheduledDays).toEqual([false, true, true, true, true, true, false]);

    const sundayShift = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "x",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
        scheduledDays: [true, true, true, true, true, false, false],
      },
    });
    expect(sundayShift.profile?.scheduledDays).toEqual([true, true, true, true, true, false, false]);

    const schoolBreak = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "x",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
        scheduledDays: [false, false, false, false, false, false, false],
      },
    });
    expect(schoolBreak.profile?.scheduledDays).toEqual([false, false, false, false, false, false, false]);
  });

  it("throws on garbage", () => {
    expect(() => hydrateState("nope")).toThrow(/Circadia/);
  });

  it("collapses two reports on the same morningDate and drops a fake date", () => {
    const state = hydrateState({
      reports: [
        {
          id: "old",
          morningDate: "2026-08-29",
          wokeAt: "07:00",
          fellAsleepAt: "23:30",
          rating: 2,
          createdAt: "2026-08-29T12:00:00.000Z",
        },
        {
          id: "new",
          morningDate: "2026-08-29",
          wokeAt: "08:00",
          fellAsleepAt: "01:00",
          rating: 5,
          createdAt: "2026-08-29T18:00:00.000Z",
        },
        {
          morningDate: "2026-13-40",
          wokeAt: "07:30",
          fellAsleepAt: "23:30",
          rating: 3,
        },
      ],
    });
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]?.id).toBe("new");
    expect(state.reports[0]?.rating).toBe(5);
    expect(state.reports[0]?.wokeAt).toBe("08:00");
  });
});
