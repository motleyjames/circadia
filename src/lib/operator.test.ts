import { describe, expect, it } from "vitest";
import { hasContact, isEmail, isPhone } from "./contact";
import { summarizeInbox } from "./moderator";
import { buildFault, buildRoster, validateFault, validateRoster } from "./operator";
import { emptyState } from "./storage";
import { anonymityViolations, buildStudyPack } from "./study";
import type { CircadiaState, Profile } from "./types";

const profile: Profile = {
  name: "James Motley",
  age: 19,
  sex: "male",
  heightCm: 178,
  weightKg: 66,
  activity: "light",
  email: "james@colorado.edu",
  phone: "303-555-0142",
  medications: ["Adderall"],
  supplements: [],
  struggles: ["falling"],
  targetSleep: "00:30",
  targetWake: "08:30",
  units: "imperial",
  notificationsEnabled: false,
  onboardingComplete: true,
};

function state(): CircadiaState {
  return {
    ...emptyState(),
    profile,
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

describe("contact", () => {
  it("accepts email or phone, not an empty file", () => {
    expect(isEmail("james@colorado.edu")).toBe(true);
    expect(isPhone("303-555-0142")).toBe(true);
    expect(hasContact("", "")).toBe(false);
    expect(hasContact("james@colorado.edu", "")).toBe(true);
    expect(hasContact("", "3035550142")).toBe(true);
  });
});

describe("roster vs night pack", () => {
  it("puts contact on the roster and keeps it out of the night pack", () => {
    const s = state();
    const roster = buildRoster(s);
    const pack = buildStudyPack(s);
    expect(validateRoster(roster).ok).toBe(true);
    expect(roster.email).toBe("james@colorado.edu");
    expect(roster.phone).toBe("303-555-0142");
    expect(roster.name).toBe("James Motley");
    expect(JSON.stringify(pack)).not.toMatch(/colorado\.edu/i);
    expect(JSON.stringify(pack)).not.toMatch(/303-555-0142/);
    expect(JSON.stringify(pack)).not.toMatch(/James Motley/);
    expect(anonymityViolations(pack, s)).toEqual([]);
  });

  it("rejects a roster that smuggles dream text", () => {
    const roster = buildRoster(state());
    const sneaky = { ...roster, dream: "hallway" };
    expect(validateRoster(sneaky).ok).toBe(false);
  });

  it("validates a fault without diary fields", () => {
    const fault = buildFault(state(), "Consult rail threw", { stack: "Error: boom", href: "/you" });
    expect(validateFault(fault).ok).toBe(true);
    expect(fault.message).toBe("Consult rail threw");
    expect(JSON.stringify(fault)).not.toMatch(/colorado\.edu/i);
  });
});

describe("moderator snapshot", () => {
  it("counts unique people from roster, nights, and faults", () => {
    const s = state();
    const snapshot = summarizeInbox([
      { file: "roster-aaaa.json", payload: buildRoster(s) },
      { file: "study-aaaa.json", payload: buildStudyPack(s) },
      { file: "fault-aaaa.json", payload: buildFault(s, "next overlay ate a click") },
      {
        file: "roster-bbbb.json",
        payload: {
          ...buildRoster(s),
          participantId: "bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff",
          name: "Tester Two",
          email: "two@example.com",
          phone: null,
        },
      },
    ]);
    expect(snapshot.userCount).toBe(2);
    expect(snapshot.faultCount).toBe(1);
    expect(snapshot.people[0]?.name).toBe("James Motley");
    expect(snapshot.people.find((p) => p.name === "Tester Two")?.email).toBe("two@example.com");
  });
});
