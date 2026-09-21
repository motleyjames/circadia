import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emptyState } from "./storage";
import { anonymityViolations, buildStudyPack, validateStudyPack } from "./study";
import { nightGeometry } from "./sleep-metrics";
import { medicationClasses } from "./metrics";
import type { CircadiaState, MorningReport, Profile } from "./types";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import { parseInboxPayload } from "./inbox-payload";

const { listen } = createRequire(import.meta.url)("../../electron/static-server.cjs") as {
  listen: (options: { root: string; inbox: string; port?: number }) => Promise<{
    server: { close: () => void };
    url: string;
  }>;
};

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

function fullGeometryReport(): MorningReport {
  return {
    id: "rep-geometry-001",
    morningDate: "2026-08-25",
    wokeAt: "06:50",
    fellAsleepAt: "00:00",
    rating: 3,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 30,
    wokeInNight: true,
    nightWakingMinutes: 25,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: "2026-08-25T07:00:00.000Z",
    inBedAt: "23:10",
    triedToSleepAt: "23:25",
    outOfBedAt: "07:05",
    awakeningCount: 1,
    napMinutes: 20,
    filedLate: true,
  };
}

function stateWithReport(report: MorningReport): CircadiaState {
  const state = hostileState();
  state.reports = [report];
  return state;
}

describe("study pack night geometry", () => {
  it("a pack built from a night with full CSD geometry carries all five fields and filedLate", () => {
    const pack = buildStudyPack(stateWithReport(fullGeometryReport()));
    const night = pack.nights[0];
    expect(night?.inBedAt).toBe("23:10");
    expect(night?.triedToSleepAt).toBe("23:25");
    expect(night?.outOfBedAt).toBe("07:05");
    expect(night?.awakeningCount).toBe(1);
    expect(night?.napMinutes).toBe(20);
    expect(night?.filedLate).toBe(true);
  });

  it("a night with none of the new fields still validates", () => {
    const pack = buildStudyPack(hostileState());
    expect(pack.nights[0]?.inBedAt).toBeUndefined();
    expect(pack.nights[0]?.filedLate).toBeUndefined();
    expect(validateStudyPack(pack).ok).toBe(true);
    expect(parseInboxPayload(pack).ok).toBe(true);
  });

  it("sleep efficiency survives the pack round trip", () => {
    const report = fullGeometryReport();
    const fromReport = nightGeometry(report);
    expect(fromReport).toBeTruthy();
    const pack = buildStudyPack(stateWithReport(report));
    const night = pack.nights[0];
    expect(night).toBeTruthy();
    if (!night) return;
    const fromPack = nightGeometry(night);
    expect(fromPack).toBeTruthy();
    expect(fromPack?.efficiencyPct).toBe(fromReport!.efficiencyPct);
    expect(fromPack?.timeInBedMinutes).toBe(fromReport!.timeInBedMinutes);
    expect(fromPack?.totalSleepMinutes).toBe(fromReport!.totalSleepMinutes);
  });

  it("a calendar date placed in inBedAt is rejected", () => {
    const state = stateWithReport(fullGeometryReport());
    const pack = buildStudyPack(state);
    const sneaky = { ...pack, nights: [{ ...pack.nights[0], inBedAt: "2026-09-14" }] };
    expect(validateStudyPack(sneaky).ok).toBe(false);
    expect(parseInboxPayload(sneaky).ok).toBe(false);
  });

  it("an out-of-union awakeningCount or napMinutes is rejected", () => {
    const pack = buildStudyPack(stateWithReport(fullGeometryReport()));
    expect(validateStudyPack({ ...pack, nights: [{ ...pack.nights[0], awakeningCount: 5 }] }).ok).toBe(false);
    expect(validateStudyPack({ ...pack, nights: [{ ...pack.nights[0], napMinutes: 30 }] }).ok).toBe(false);
  });

  it("both receivers accept a new-format pack, and both accept an old-format pack", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-geom-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Circadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      const neu = buildStudyPack(stateWithReport(fullGeometryReport()));
      const old = buildStudyPack(hostileState());
      expect(validateStudyPack(neu).ok).toBe(true);
      expect(validateStudyPack(old).ok).toBe(true);
      expect(parseInboxPayload(neu).ok).toBe(true);
      expect(parseInboxPayload(old).ok).toBe(true);
      for (const pack of [neu, old]) {
        const res = await fetch(`${started.url}/api/study`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pack),
        });
        expect(res.status, pack.nights[0]?.inBedAt ?? "old").toBe(200);
        expect((await res.json()).ok).toBe(true);
      }
    } finally {
      started.server.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("no free text reaches a pack", () => {
    const state = stateWithReport({
      ...fullGeometryReport(),
      dream: { text: "Late to an exam, then the hallway flooded.", wantMeaning: true },
      supplementNote: "Ashwagandha Night gummies James bought",
    });
    state.researchNotes = "Private abstract from a paper James pasted about orexin.";
    const pack = buildStudyPack(state);
    const blob = JSON.stringify(pack);
    expect(blob).not.toMatch(/hallway flooded/);
    expect(blob).not.toMatch(/Ashwagandha/);
    expect(blob).not.toMatch(/orexin/);
    expect(blob).not.toMatch(/supplementNote/);
    expect(blob).not.toMatch(/researchNotes/);
    expect(pack.nights[0]?.hadDream).toBe(true);
  });

  it("the anonymity scan is not weakened", () => {
    const state = hostileState();
    const pack = buildStudyPack(state);
    expect(anonymityViolations({ ...pack, name: "James" }, state)).toContain("name");
    expect(anonymityViolations({ ...pack, email: "james@example.com" }, state)).toContain("email");
    expect(anonymityViolations({ ...pack, phone: "3035550100" }, state)).toContain("phone");
    expect(anonymityViolations({ ...pack, morningDate: "2026-08-20" }, state)).toContain("calendar-date");
    expect(anonymityViolations({ ...pack, dream: "Late to an exam, then the hallway flooded." }, state)).toContain(
      "dream",
    );
    expect(anonymityViolations({ ...pack, researchNotes: state.researchNotes }, state)).toContain("research-notes");
    expect(anonymityViolations(pack, state)).toEqual([]);
  });

  it("a date in any string field is rejected", () => {
    const state = hostileState();
    const pack = buildStudyPack(state);
    const night = pack.nights[0];
    expect(night).toBeTruthy();
    expect(anonymityViolations({ ...pack, nights: [{ ...night, inBedAt: "2026-09-14" }] }, state)).toContain(
      "calendar-date",
    );
    expect(
      anonymityViolations({ ...pack, nights: [{ ...night, triedToSleepAt: "2026-09-01T07:15:00.000Z" }] }, state),
    ).toContain("timestamp");
    expect(anonymityViolations({ ...pack, appVersion: "shipped-2026-12-25" }, state)).toContain("calendar-date");
    expect(
      anonymityViolations({ ...pack, chat: { ...pack.chat, topics: [...pack.chat.topics, "note 2025-03-09"] } }, state),
    ).toContain("calendar-date");
    expect(anonymityViolations(pack, state)).toEqual([]);
  });
});
