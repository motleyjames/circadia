import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasContact, isEmail, isPhone } from "./contact";
import { parseInboxPayload } from "./inbox-payload";
import {
  formatInboxReceived,
  groupFaultsByParticipant,
  groupNightsByParticipant,
  inboxStampKey,
  summarizeInbox,
} from "./moderator";
import { buildFault, buildRoster, validateFault, validateRoster, validateRosterV2 } from "./operator";
import { emptyState } from "./storage";
import { anonymityViolations, assertSendable, buildStudyPack } from "./study";
import type { CircadiaState, MorningReport, Profile, RosterEvent } from "./types";
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

function nightReport(n: number): MorningReport {
  return {
    id: `r${n}`,
    morningDate: `2026-08-${String(n).padStart(2, "0")}`,
    wokeAt: "08:00",
    fellAsleepAt: "00:00",
    rating: n === 1 ? 2 : 3,
    drank: n === 1,
    screenOffMinutes: 0,
    sleepLatencyMinutes: 50,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: `2026-08-${String(n).padStart(2, "0")}T12:00:00.000Z`,
  };
}

function stateWithNights(count: number, participantId: string): CircadiaState {
  const base = state();
  return {
    ...base,
    study: { ...base.study, participantId },
    reports: Array.from({ length: count }, (_, i) => nightReport(i + 1)),
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

  it("groups three packs for one person into one row, newest first", () => {
    const a = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const b = "bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff";
    const snapshot = summarizeInbox([
      {
        file: "study-aaaa-2026-08-01T10-00-00-000Z.json",
        payload: { ...buildStudyPack(stateWithNights(1, a)), appVersion: "0.6.5" },
      },
      {
        file: "study-bbbb-2026-08-20T10-00-00-000Z.json",
        payload: { ...buildStudyPack(stateWithNights(2, b)), appVersion: "0.6.25" },
      },
      {
        file: "study-aaaa-2026-08-15T10-00-00-000Z.json",
        payload: { ...buildStudyPack(stateWithNights(3, a)), appVersion: "0.6.24" },
      },
      {
        file: "study-aaaa-2026-08-30T10-00-00-000Z.json",
        payload: { ...buildStudyPack(stateWithNights(4, a)), appVersion: "0.6.25" },
      },
    ]);
    expect(snapshot.nightPackCount).toBe(4);
    const grouped = groupNightsByParticipant(snapshot.nights);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.participantId).toBe(a);
    expect(grouped[0]?.packs).toHaveLength(3);
    expect(grouped[0]?.packs.map((p) => p.appVersion)).toEqual(["0.6.25", "0.6.24", "0.6.5"]);
    expect(grouped[0]?.packs[0]?.nightCount).toBe(4);
    expect(grouped[1]?.participantId).toBe(b);
    expect(grouped[1]?.packs).toHaveLength(1);
    expect(snapshot.nights[0]?.participantId).toBe(a);
    expect(JSON.stringify(grouped)).not.toMatch(/James Motley/);
  });

  it("sorts inbox files by the ISO stamp, not the participant id in the filename", () => {
    expect(inboxStampKey("study-bbbbbbbb-2026-08-01T10-00-00-000Z.json")).toBe("2026-08-01T10-00-00-000Z");
    expect(formatInboxReceived("study-0ed78a9a-2026-08-30T21-36-00-000Z.json")).toBe("2026-08-30 21:36");
    expect(formatInboxReceived("study-aaaa.json")).toBe("—");
  });

  it("groups faults under the person, not as a flat stack", () => {
    const s = state();
    const grouped = groupFaultsByParticipant([
      {
        participantId: s.study.participantId!,
        at: "2026-08-30T12:00:00.000Z",
        message: "later",
        href: "/you",
        appVersion: "0.6.25",
      },
      {
        participantId: s.study.participantId!,
        at: "2026-08-29T12:00:00.000Z",
        message: "earlier",
        href: null,
        appVersion: "0.6.24",
      },
      {
        participantId: "bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff",
        at: "2026-08-28T12:00:00.000Z",
        message: "other",
        href: null,
        appVersion: "0.6.25",
      },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.faults.map((f) => f.message)).toEqual(["later", "earlier"]);
    expect(grouped[1]?.participantId.startsWith("bbbbbbbb")).toBe(true);
  });
});

describe("operator inbox surface", () => {
  it("opens a per-person night ledger instead of one card per pack", () => {
    const src = readFileSync("src/app/mod/page.tsx", "utf8");
    expect(src).toContain("groupNightsByParticipant");
    expect(src).toContain("aria-expanded");
    expect(src).toContain("NightLedger");
    expect(src).not.toContain("<details");
    expect(src).not.toMatch(/snapshot\.nights\.map/);
    expect(src).not.toMatch(/nights in pack/);
    expect(src).not.toMatch(/Participant \{/);
    expect(src).not.toContain("rounded-3xl");
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
    // Derive the expected people from the captured files rather than pinning one
    // participant id. The old version named a participant who has since been
    // re-captured out of the folder, so this test failed on the state of a
    // directory instead of on the summarizer it exists to cover.
    const idsOnDisk = new Set(
      rows
        .map((row) => (row.payload as { participantId?: unknown }).participantId)
        .filter((id): id is string => typeof id === "string"),
    );
    expect(idsOnDisk.size).toBeGreaterThanOrEqual(1);
    expect(snapshot.people.length).toBe(idsOnDisk.size);
    for (const person of snapshot.people) {
      expect(idsOnDisk.has(person.participantId), person.participantId).toBe(true);
    }
    // A fault is a crash report the app posted, not a parse failure — a healthy
    // corpus has none. What must hold is that the count matches what is on disk.
    const faultsOnDisk = rows.filter((row) => {
      const parsed = parseInboxPayload(row.payload);
      return parsed.ok && parsed.kind === "fault";
    }).length;
    expect(snapshot.faultCount).toBe(faultsOnDisk);
    expect(snapshot.nightPackCount).toBeGreaterThanOrEqual(1);
    const grouped = groupNightsByParticipant(snapshot.nights);
    expect(grouped.reduce((n, person) => n + person.packs.length, 0)).toBe(snapshot.nights.length);
    expect(grouped.length).toBeLessThanOrEqual(snapshot.nights.length);
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
