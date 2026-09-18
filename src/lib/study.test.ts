import { describe, expect, it } from "vitest";
import { emptyState } from "./storage";
import { anonymityViolations, buildStudyPack, validateStudyPack } from "./study";
import { medicationClasses } from "./metrics";
import type { CircadiaState, MorningReport, Profile } from "./types";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";

const hostileProfile: Profile = {
  firstName: "James",
  lastName: "",
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
  email: "james@example.com",
  phone: "3035550100",
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
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
      rosterSentAt: null,
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

    expect(blob).not.toMatch(/james@example.com/i);
    expect(blob).not.toMatch(/3035550100/);
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

  it("counts filed consults in the pack without sending their text", () => {
    const state = hostileState();
    state.chat = [];
    state.consultHistory = [
      {
        id: "thread-unisom-hist",
        title: "What is Unisom?",
        createdAt: "2026-08-20T08:00:00.000Z",
        updatedAt: "2026-08-20T08:00:02.000Z",
        messages: [
          {
            id: "h1",
            role: "you",
            text: "What is Unisom? I bought the gels last night.",
            createdAt: "2026-08-20T08:00:00.000Z",
          },
          {
            id: "h2",
            role: "circadia",
            text: "Unisom is an antihistamine. It knocks you out; it is not a sleep system.",
            createdAt: "2026-08-20T08:00:02.000Z",
            citations: ["otc-antihistamines"],
          },
        ],
      },
    ];
    const pack = buildStudyPack(state);
    expect(pack.chat.turns).toBe(2);
    expect(pack.chat.topics).toEqual(["otc-antihistamines"]);
    expect(JSON.stringify(pack)).not.toMatch(/Unisom/i);
    expect(anonymityViolations(pack, state)).toEqual([]);
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

  it("does not send episode fields, and flags a rationale that leaked into a pack", () => {
    const state = hostileState();
    state.episode = {
      id: "ep-secret-fold-01",
      rev: 1,
      clinicianId: "clin-ada-west-01",
      state: "treatment",
      enrolledAt: "2026-09-01T12:00:00.000Z",
      baselineNights: 14,
      windows: [
        {
          id: "win-1",
          prescribedInBed: "00:30",
          prescribedOutOfBed: "07:00",
          setBy: "clin-ada-west-01",
          setAt: "2026-09-16T15:00:00.000Z",
          rationale: "Titrate fifteen minutes after the Wednesday commute.",
        },
      ],
    };
    const pack = buildStudyPack(state);
    const blob = JSON.stringify(pack);
    expect(blob).not.toMatch(/ep-secret-fold-01/);
    expect(blob).not.toMatch(/clin-ada-west-01/);
    expect(blob).not.toMatch(/Titrate fifteen/);
    expect(blob).not.toMatch(/prescribedInBed/);
    expect(blob).not.toMatch(/"episode"/);
    expect(anonymityViolations(pack, state)).toEqual([]);

    const sneaky = { ...pack, rationale: "Titrate fifteen minutes after the Wednesday commute." };
    expect(anonymityViolations(sneaky, state)).toContain("clinician-notes");
  });
});
