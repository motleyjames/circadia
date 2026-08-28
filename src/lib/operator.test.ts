import { describe, expect, it } from "vitest";
import { hasContact, isEmail, isPhone } from "./contact";
import { summarizeInbox } from "./moderator";
import { buildFault, buildRoster, validateFault, validateRoster } from "./operator";
import { emptyState } from "./storage";
import { anonymityViolations, buildStudyPack } from "./study";
import type { CircadiaState, Profile } from "./types";

const profile: Profile = {
  firstName: "James",
  lastName: "Motley",
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
  it("keeps names and login identifiers out of both packs", () => {
    const s = state();
    const roster = buildRoster(s);
    const pack = buildStudyPack(s);
    expect(validateRoster(roster).ok).toBe(true);
    expect(roster.name).toBeNull();
    expect(roster.email).toBeNull();
    expect(roster.phone).toBeNull();
    expect(JSON.stringify(roster)).not.toMatch(/James Motley/);
    expect(JSON.stringify(pack)).not.toMatch(/colorado\.edu/i);
    expect(JSON.stringify(pack)).not.toMatch(/303-555-0142/);
    expect(JSON.stringify(pack)).not.toMatch(/James Motley/);
    expect(anonymityViolations(pack, s)).toEqual([]);
  });

  it("still parses a legacy roster that carried a name", () => {
    const roster = { ...buildRoster(state()), name: "James Motley" };
    const parsed = validateRoster(roster);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.name).toBe("James Motley");
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
  it("counts unique people from roster, nights, and faults without exposing PII", () => {
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
    expect(snapshot.people).toHaveLength(2);
    expect(snapshot.people.some((p) => p.participantId.startsWith("aaaaaaaa"))).toBe(true);
    expect(snapshot.people.some((p) => p.participantId.startsWith("bbbbbbbb"))).toBe(true);
    const dumped = JSON.stringify(snapshot);
    expect(dumped).not.toMatch(/James Motley/);
    expect(dumped).not.toMatch(/Tester Two/);
    expect(dumped).not.toMatch(/two@example\.com/);
    expect(dumped).not.toMatch(/colorado\.edu/i);
    expect(dumped).not.toMatch(/"name"/);
    expect(dumped).not.toMatch(/"email"/);
    expect(dumped).not.toMatch(/"phone"/);
    expect(dumped).not.toMatch(/"heightCm"/);
    expect(dumped).not.toMatch(/"weightKg"/);
    expect(snapshot.people.every((p) => !("name" in p))).toBe(true);
  });
});
