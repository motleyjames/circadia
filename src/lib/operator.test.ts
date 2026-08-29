import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasContact, isEmail, isPhone } from "./contact";
import { parseInboxPayload } from "./inbox-payload";
import { summarizeInbox } from "./moderator";
import { buildFault, buildRoster, validateFault, validateRoster, validateRosterV2 } from "./operator";
import { emptyState } from "./storage";
import { anonymityViolations, assertSendable, buildStudyPack } from "./study";
import type { CircadiaState, Profile, RosterEvent } from "./types";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";

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
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
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

/** Hand-built v1. Used so captured inbox files and this fixture share one parser. */
function legacyRosterV1(overrides: Partial<RosterEvent> = {}): RosterEvent {
  return {
    schema: "circadia-roster-v1",
    at: "2026-08-27T20:29:08.793Z",
    participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    appVersion: "0.5.0",
    name: null,
    email: null,
    phone: null,
    age: 19,
    heightCm: 175,
    weightKg: 70,
    activity: "light",
    struggles: ["falling"],
    targetSleep: "00:30",
    targetWake: "08:30",
    ...overrides,
  };
}

const IDENTIFYING_ROSTER_FIELDS = ["name", "email", "phone", "age", "heightCm", "weightKg"] as const;

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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps names and login identifiers out of both packs", () => {
    const s = state();
    const roster = buildRoster(s);
    const pack = buildStudyPack(s);
    expect(roster.schema).toBe("circadia-roster-v2");
    expect(validateRosterV2(roster).ok).toBe(true);
    for (const field of IDENTIFYING_ROSTER_FIELDS) {
      expect(roster).not.toHaveProperty(field);
    }
    expect(JSON.stringify(roster)).not.toMatch(/James Motley/);
    expect(JSON.stringify(pack)).not.toMatch(/colorado\.edu/i);
    expect(JSON.stringify(pack)).not.toMatch(/303-555-0142/);
    expect(JSON.stringify(pack)).not.toMatch(/James Motley/);
    expect(anonymityViolations(pack, s)).toEqual([]);
    expect(assertSendable(roster, s)).toEqual([]);
  });

  it("omits all six identifying fields from a v2 roster", () => {
    const distinctive: Profile = {
      ...profile,
      firstName: "Zelda",
      lastName: "Nightingale",
      name: "Zelda Nightingale",
      age: 47,
      heightCm: 191,
      weightKg: 88,
      email: "zelda.nightingale@colorado.edu",
      phone: "7205550188",
    };
    const s = { ...state(), profile: distinctive };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"));
    const roster = buildRoster(s);
    const json = JSON.stringify(roster);
    expect(roster.schema).toBe("circadia-roster-v2");
    expect(validateRosterV2(roster).ok).toBe(true);
    expect(roster.ageBand).toBe("45-54");
    expect(roster.bmiBand).toBe("healthy");
    for (const field of IDENTIFYING_ROSTER_FIELDS) {
      expect(roster).not.toHaveProperty(field);
      expect(json).not.toMatch(new RegExp(`"${field}"`));
    }
    expect(json).not.toMatch(/Zelda/i);
    expect(json).not.toMatch(/Nightingale/i);
    expect(json).not.toMatch(/zelda\.nightingale@colorado\.edu/i);
    expect(json).not.toMatch(/7205550188/);
    expect(json).not.toMatch(/191/);
    expect(json).not.toMatch(/88/);
    expect(json).not.toMatch(/47/);
    expect(assertSendable(roster, s)).toEqual([]);
  });

  it("still parses a legacy roster that carried a name", () => {
    const roster = legacyRosterV1({ name: "James Motley" });
    const parsed = validateRoster(roster);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.name).toBe("James Motley");
    const inbox = parseInboxPayload(roster);
    expect(inbox.ok).toBe(true);
    if (inbox.ok) {
      expect(inbox.kind).toBe("roster");
      expect(inbox.value.schema).toBe("circadia-roster-v1");
    }
  });

  it("rejects a roster that smuggles dream text", () => {
    const roster = buildRoster(state());
    const sneaky = { ...roster, dream: "hallway" };
    expect(validateRosterV2(sneaky).ok).toBe(false);
    expect(validateRoster({ ...legacyRosterV1(), dream: "hallway" }).ok).toBe(false);
  });

  it("blocks a fault whose message embeds the user's email", () => {
    const s = state();
    const fault = buildFault(s, `Unhandled: mailbox ${profile.email} bounced`);
    expect(validateFault(fault).ok).toBe(true);
    expect(assertSendable(fault, s)).toContain("email");
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
        payload: legacyRosterV1({
          participantId: "bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff",
          name: "Tester Two",
          email: "two@example.com",
          phone: null,
          age: 47,
        }),
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
    expect(snapshot.people.find((p) => p.participantId.startsWith("aaaaaaaa"))?.ageBand).toBe("18-24");
    expect(snapshot.people.find((p) => p.participantId.startsWith("bbbbbbbb"))?.ageBand).toBe("45-54");
  });
});

describe("captured inbox files", () => {
  it("still parses every pack in data/study-inbox and shows them in Operator", () => {
    const dir = "data/study-inbox";
    const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    const rows = files.map((file) => ({
      file,
      payload: JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as unknown,
    }));
    for (const row of rows) {
      expect(parseInboxPayload(row.payload).ok, row.file).toBe(true);
    }
    const snapshot = summarizeInbox(rows);
    expect(snapshot.userCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.people.some((person) => person.participantId.startsWith("51b85413"))).toBe(true);
    expect(snapshot.faultCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.nightPackCount).toBeGreaterThanOrEqual(1);
    const dumped = JSON.stringify(snapshot);
    expect(dumped).not.toMatch(/"heightCm"/);
    expect(dumped).not.toMatch(/"weightKg"/);
  });
});

describe("outbound gate", () => {
  it("routes roster, study, and fault through assertSendable", () => {
    const src = readFileSync("src/context/circadia-store.tsx", "utf8");
    const rosterFn = src.slice(
      src.indexOf("async function transmitRoster"),
      src.indexOf("async function transmitStudy"),
    );
    const studyFn = src.slice(
      src.indexOf("async function transmitStudy"),
      src.indexOf("async function transmitFault"),
    );
    const faultFn = src.slice(
      src.indexOf("async function transmitFault"),
      src.indexOf("type CircadiaContextValue"),
    );
    expect(rosterFn).toContain("assertSendable");
    expect(studyFn).toContain("assertSendable");
    expect(faultFn).toContain("assertSendable");
  });
});
