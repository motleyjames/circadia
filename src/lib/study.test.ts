import { describe, expect, it } from "vitest";
import { emptyState } from "./storage";
import { anonymityViolations, buildStudyPack, validateStudyPack } from "./study";
import { medicationClasses } from "./metrics";
import type { CircadiaState, MorningReport, Profile } from "./types";

const hostileProfile: Profile = {
  name: "James",
  age: 19,
  sex: "male",
  heightCm: 180,
  weightKg: 75,
  activity: "light",
  medications: ["Adderall XR"],
  supplements: ["Nature Made melatonin gummies"],
  struggles: ["falling", "staying"],
  targetSleep: "23:30",
  targetWake: "07:30",
  units: "imperial",
  notificationsEnabled: false,
  onboardingComplete: true,
};

function hostileState(): CircadiaState {
  const report: MorningReport = {
    id: "rep-james-secret-999",
    morningDate: "2026-08-20",
    wokeAt: "07:28",
    fellAsleepAt: "01:10",
    rating: 2,
    drank: true,
    drinkCount: 4,
    spins: true,
    screenOffMinutes: 0,
    sleepLatencyMinutes: 50,
    wokeInNight: true,
    nightWakingMinutes: 45,
    usedSupplement: false,
    supplementNote: "Ashwagandha Night gummies James bought",
    windDownHelped: "did_not_use",
    dream: {
      text: "Late to an exam, then the hallway flooded. Couldn't find the room.",
      wantMeaning: true,
    },
    createdAt: "2026-08-20T12:04:11.000Z",
  };

  return {
    ...emptyState(),
    profile: hostileProfile,
    reports: [report],
    sessions: [
      {
        id: "sess-hidden-aaa",
        startedAt: "2026-08-19T22:10:00.000Z",
        kind: "soundscape",
        soundscapeId: "brown",
        durationSeconds: 600,
        completed: true,
      },
    ],
    chat: [
      {
        id: "c1",
        role: "you",
        text: "What is Unisom? I bought the gels last night.",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "c2",
        role: "circadia",
        text: "Unisom is an antihistamine. It knocks you out; it is not a sleep system.",
        createdAt: "2026-08-20T08:00:02.000Z",
        citations: ["otc-antihistamines"],
      },
    ],
    researchNotes: "Private abstract from a paper James pasted about orexin.",
    demoWeek: false,
    study: {
      asked: true,
      consented: true,
      participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      lastSentAt: null,
      lastStatus: null,
      lastError: null,
    },
  };
}

describe("medicationClasses", () => {
  it("emits class labels, never the typed name", () => {
    expect(medicationClasses(["Adderall XR", "ibuprofen"])).toEqual(["stimulant", "other"]);
  });
});

describe("buildStudyPack", () => {
  it("strips identity, dreams, chat, meds, and calendar dates", () => {
    const state = hostileState();
    const pack = buildStudyPack(state);
    const blob = JSON.stringify(pack);

    expect(pack.schema).toBe("circadia-study-v1");
    expect(pack.surface).toBe("desktop");
    expect(pack.profile.ageBand).toBe("18-24");
    expect(pack.profile.bmiBand).toBe("healthy");
    expect(pack.profile.medicationClasses).toEqual(["stimulant"]);
    expect(pack.profile.supplementCount).toBe(1);
    expect(pack.nights).toHaveLength(1);
    expect(pack.nights[0]?.nightIndex).toBe(0);
    expect(pack.nights[0]?.hadDream).toBe(true);
    expect(pack.nights[0]?.drinkCount).toBe(4);
    expect(pack.chat.turns).toBe(2);
    expect(pack.chat.topics).toEqual(["otc-antihistamines"]);
    expect(pack.sessions.completed).toBe(1);

    expect(blob).not.toMatch(/James/i);
    expect(blob).not.toMatch(/Adderall/i);
    expect(blob).not.toMatch(/Nature Made/i);
    expect(blob).not.toMatch(/Unisom/i);
    expect(blob).not.toMatch(/hallway flooded/i);
    expect(blob).not.toMatch(/orexin/i);
    expect(blob).not.toMatch(/2026-08-20/);
    expect(blob).not.toMatch(/rep-james/);
    expect(blob).not.toMatch(/sess-hidden/);
    expect(blob).not.toMatch(/Ashwagandha/i);
    expect(blob).not.toMatch(/gummies James/i);

    expect(anonymityViolations(pack, state)).toEqual([]);
    expect(validateStudyPack(pack).ok).toBe(true);
  });

  it("marks default body metrics as unconfirmed", () => {
    const state = hostileState();
    state.profile = { ...hostileProfile, heightCm: 175, weightKg: 70, name: "you", medications: [] };
    const pack = buildStudyPack(state);
    expect(pack.profile.bmiBand).toBe("unconfirmed");
  });

  it("rejects a pack that smuggles a name field", () => {
    const pack = buildStudyPack(hostileState());
    const sneaky = { ...pack, name: "James" };
    const result = validateStudyPack(sneaky);
    expect(result.ok).toBe(false);
  });
});
