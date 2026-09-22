import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emptyState } from "./storage";
import { completionRate, createEpisode, episodeNightOf, nightsElapsedSince } from "./episode";
import {
  enrollWithInvite,
  flagsForPack,
  generateInvite,
  recordAllowlistedFlag,
  recordDisclosureFlags,
} from "./invite";
import { allowlistedSafetyKinds, isCrisisDisclosure, safetyKind } from "./safety-triage";
import { anonymityViolations, buildStudyPack, validateStudyPack } from "./study";
import { nightGeometry } from "./sleep-metrics";
import { medicationClasses } from "./metrics";
import type { CircadiaState, MorningReport, Profile, SafetyFlag } from "./types";
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

function quietReport(morningDate: string): MorningReport {
  return {
    id: `r-${morningDate}`,
    morningDate,
    wokeAt: "07:00",
    fellAsleepAt: "23:30",
    rating: 3,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 30,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: `${morningDate}T12:00:00.000Z`,
  };
}

function enrolledOn(enrolledAt: string, reports: MorningReport[] = hostileState().reports): CircadiaState {
  const base = hostileState();
  return {
    ...base,
    reports,
    episode: createEpisode({ clinicianId: null, enrolledAt }),
  };
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

  it("a pack with ordinary night clocks and no in-bed fields validates", async () => {
    const pack = buildStudyPack(hostileState());
    const seed = pack.nights[0];
    expect(seed).toBeTruthy();
    const nights = [
      { ...seed, nightIndex: 0, fellAsleepAt: "22:30", wokeAt: "08:30", inBedAt: undefined, triedToSleepAt: undefined, outOfBedAt: undefined },
      { ...seed, nightIndex: 1, fellAsleepAt: "00:30", wokeAt: "08:00", inBedAt: undefined, triedToSleepAt: undefined, outOfBedAt: undefined },
    ];
    const shaped = { ...pack, nights };
    expect(validateStudyPack(shaped).ok).toBe(true);
    expect(parseInboxPayload(shaped).ok).toBe(true);

    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-clocks-ok-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Circadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      const res = await fetch(`${started.url}/api/study`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(shaped),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    } finally {
      started.server.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("a clock that is not HH:MM within the day is rejected", async () => {
    const pack = buildStudyPack(hostileState());
    const seed = pack.nights[0];
    expect(seed).toBeTruthy();
    const bad = { ...pack, nights: [{ ...seed, fellAsleepAt: "25:00" }] };
    const parsed = validateStudyPack(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("Invalid night clocks.");
    expect(parseInboxPayload(bad).ok).toBe(false);

    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-clocks-bad-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Circadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      const res = await fetch(`${started.url}/api/study`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bad),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid night clocks.");
    } finally {
      started.server.close();
      rmSync(tmp, { recursive: true, force: true });
    }
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

describe("solo enrollment packs", () => {
  it("a name or cohort never enters a pack", async () => {
    const invite = await generateInvite("Zelda Nightingale", "lab");
    const enrolled = await enrollWithInvite(hostileState(), invite.code, new Date("2026-09-08T12:00:00"));
    expect(enrolled).toBeTruthy();
    const pack = buildStudyPack(enrolled!, new Date("2026-09-15T12:00:00"));
    const blob = JSON.stringify(pack);
    expect(invite.name).toBe("Zelda Nightingale");
    expect(invite.cohort).toBe("lab");
    expect(blob).not.toMatch(/Zelda/i);
    expect(blob).not.toMatch(/Nightingale/i);
    expect(blob).not.toMatch(/"lab"/);
    expect(blob).not.toMatch(/"cohort"/);
    expect(anonymityViolations(pack, enrolled!)).toEqual([]);
  });

  it("enrolledAt never enters a pack; nightsElapsed does, as a non-negative integer", () => {
    const enrolledAt = "2026-09-01T12:00:00.000Z";
    const state = enrolledOn(enrolledAt);
    expect(state.episode?.enrolledAt).toBe(enrolledAt);
    const pack = buildStudyPack(state, new Date("2026-09-08T18:00:00.000Z"));
    expect(pack.nightsElapsed).toBe(nightsElapsedSince(enrolledAt, new Date("2026-09-08T18:00:00.000Z")));
    expect(Number.isInteger(pack.nightsElapsed)).toBe(true);
    expect(pack.nightsElapsed).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(pack)).not.toMatch(/2026-09-01T12:00:00/);
    expect(JSON.stringify(pack)).not.toMatch(/"enrolledAt"/);
    expect(validateStudyPack(pack).ok).toBe(true);
  });

  it("both receivers accept a pack with nightsElapsed, and both accept one without it", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-elapsed-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Circadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      const withElapsed = buildStudyPack(
        enrolledOn("2026-09-01T12:00:00.000Z"),
        new Date("2026-09-08T12:00:00Z"),
      );
      const without = buildStudyPack(hostileState());
      expect(withElapsed.nightsElapsed).toBeDefined();
      expect(without.nightsElapsed).toBeUndefined();
      expect(validateStudyPack(withElapsed).ok).toBe(true);
      expect(validateStudyPack(without).ok).toBe(true);
      expect(parseInboxPayload(withElapsed).ok).toBe(true);
      expect(parseInboxPayload(without).ok).toBe(true);
      for (const pack of [withElapsed, without]) {
        const res = await fetch(`${started.url}/api/study`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pack),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
      }
    } finally {
      started.server.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("completion is computable from a pack alone", () => {
    const empty = enrolledOn("2026-09-01T12:00:00.000Z", []);
    const none = buildStudyPack(empty, new Date("2026-09-15T12:00:00Z"));
    expect(none.nights.length).toBe(0);
    expect(none.nightsElapsed).toBe(nightsElapsedSince("2026-09-01T12:00:00.000Z", new Date("2026-09-15T12:00:00Z")));
    expect(completionRate(none.nights.length, none.nightsElapsed!)).toBe(0);

    const filed = buildStudyPack(enrolledOn("2026-09-01T12:00:00.000Z"), new Date("2026-09-15T12:00:00Z"));
    expect(filed.nights.length).toBe(1);
    expect(completionRate(filed.nights.length, filed.nightsElapsed!)).toBe(1 / filed.nightsElapsed!);
  });

  it("no episode means no change", () => {
    const state = hostileState();
    expect(state.episode).toBeNull();
    const pack = buildStudyPack(state);
    expect(pack.nightsElapsed).toBeUndefined();
    expect(Object.keys(pack).sort()).toEqual(
      ["appVersion", "chat", "demoWeek", "nights", "participantId", "profile", "schema", "sessions", "surface"].sort(),
    );
    const again = buildStudyPack(state);
    expect(again).toEqual(pack);
    expect(validateStudyPack(pack).ok).toBe(true);
  });
});

describe("episodeNight and safety flags", () => {
  it("enrolled Sep 21, morning Sep 22: episodeNight 0", () => {
    const enrolledAt = new Date(2026, 8, 21, 12, 0, 0, 0).toISOString();
    const state = enrolledOn(enrolledAt, [quietReport("2026-09-22")]);
    const pack = buildStudyPack(state, new Date(2026, 8, 22, 18, 0, 0, 0));
    expect(pack.nights[0]?.episodeNight).toBe(0);
  });

  it("a morning dated the day of enrollment carries no episodeNight, and none is ever negative", () => {
    const enrolledAt = new Date(2026, 8, 21, 12, 0, 0, 0).toISOString();
    const state = enrolledOn(enrolledAt, [quietReport("2026-09-21"), quietReport("2026-09-20")]);
    const pack = buildStudyPack(state, new Date(2026, 8, 21, 18, 0, 0, 0));
    expect(pack.nights[0]?.episodeNight).toBeUndefined();
    expect(pack.nights[1]?.episodeNight).toBeUndefined();
    expect(episodeNightOf(enrolledAt, "2026-09-21")).toBeNull();
    expect(episodeNightOf(enrolledAt, "2026-09-20")).toBeNull();
    for (const night of pack.nights) {
      if (night.episodeNight === undefined) continue;
      expect(night.episodeNight).toBeGreaterThanOrEqual(0);
    }
  });

  it("nightsElapsed on Sep 22 is still 1", () => {
    const enrolledAt = new Date(2026, 8, 21, 12, 0, 0, 0).toISOString();
    const state = enrolledOn(enrolledAt, [quietReport("2026-09-22")]);
    const pack = buildStudyPack(state, new Date(2026, 8, 22, 18, 0, 0, 0));
    expect(pack.nightsElapsed).toBe(1);
    expect(nightsElapsedSince(enrolledAt, new Date(2026, 8, 22, 18, 0, 0, 0))).toBe(1);
  });

  it("enrolled at 22:00 local in a UTC-6 zone, morning filed the next local day: episodeNight 0", () => {
    // 22:00 on 21 Sep in UTC-6 is 04:00 UTC on the 22nd. A UTC day-count
    // would treat enrollment as the 22nd and drop the first night as -1.
    const enrolled = new Date(2026, 8, 21, 22, 0, 0, 0);
    expect(episodeNightOf(enrolled.toISOString(), "2026-09-22")).toBe(0);
    const src = readFileSync("src/lib/episode.ts", "utf8");
    const fn = src.slice(src.indexOf("export function episodeNightOf"), src.indexOf("export function nightsElapsedSince"));
    expect(fn).toContain("todayIsoDate");
    expect(fn).toContain("elapsed - 1");
    expect(fn).not.toMatch(/getUTCDate|getUTCFullYear|getUTCMonth|toISOString\(\)\.slice/);
  });

  it("episodeNight places a missed night: filed 0, 1 and 3 leave slot 2 identifiable", () => {
    const enrolledAt = "2026-09-01T12:00:00.000Z";
    // A morning closes the night before it. The enrollment-day morning is not
    // slot 0 — that slot is the next morning — so these dates are one day later
    // than the old numbering that treated enrollment morning as night 0.
    const state = enrolledOn(enrolledAt, [
      quietReport("2026-09-02"),
      quietReport("2026-09-03"),
      quietReport("2026-09-05"),
    ]);
    const pack = buildStudyPack(state, new Date("2026-09-06T18:00:00.000Z"));
    expect(pack.nights.map((n) => n.nightIndex)).toEqual([0, 1, 2]);
    expect(pack.nights.map((n) => n.episodeNight)).toEqual([0, 1, 3]);
    const occupied = new Set(pack.nights.map((n) => n.episodeNight));
    expect(occupied.has(2)).toBe(false);
    expect(pack.nightsElapsed).toBeGreaterThanOrEqual(3);
  });

  it("episodeNight is never negative and never exceeds nightsElapsed", () => {
    const enrolledAt = "2026-09-01T12:00:00.000Z";
    // Enrollment-day morning predates the first episode night (was slot 0).
    const state = enrolledOn(enrolledAt, [quietReport("2026-08-20"), quietReport("2026-09-01"), quietReport("2026-09-04")]);
    const pack = buildStudyPack(state, new Date("2026-09-04T18:00:00.000Z"));
    expect(pack.nights[0]?.episodeNight).toBeUndefined();
    expect(pack.nights[1]?.episodeNight).toBeUndefined();
    for (const night of pack.nights) {
      if (night.episodeNight === undefined) continue;
      expect(night.episodeNight).toBeGreaterThanOrEqual(0);
      expect(night.episodeNight).toBeLessThanOrEqual(pack.nightsElapsed!);
    }
    expect(validateStudyPack({ ...pack, nights: [{ ...pack.nights[1], episodeNight: -1 }] }).ok).toBe(false);
    expect(validateStudyPack({ ...pack, nights: [{ ...pack.nights[1], episodeNight: pack.nightsElapsed! + 1 }] }).ok).toBe(
      false,
    );
  });

  it("a crisis-and-drowsy disclosure produces no safety flag", () => {
    const words = "I want to kill myself I keep falling asleep at the wheel";
    const lower = words.toLowerCase();
    expect(isCrisisDisclosure(lower)).toBe(true);
    expect(allowlistedSafetyKinds(lower)).toContain("drowsy-driving");
    const profile = hostileState().profile;
    const flags = recordDisclosureFlags([], words, profile, 0);
    expect(flags).toEqual([]);
    const state = {
      ...enrolledOn("2026-09-01T12:00:00.000Z", [quietReport("2026-09-01")]),
      chat: [{ id: "c1", role: "you" as const, text: words, createdAt: "2026-09-01T08:00:00.000Z" }],
      safetyFlags: flags,
    };
    expect(state.safetyFlags).toEqual([]);
    const pack = buildStudyPack(state, new Date("2026-09-01T18:00:00.000Z"));
    expect(pack.safetyFlags).toBeUndefined();
    expect(JSON.stringify(pack)).not.toMatch(/safetyFlags|drowsy-driving|crisis/i);
  });

  it("a crisis disclosure produces no flag, no count and no field of any kind in the pack", () => {
    const words = "I want to kill myself I haven't slept in days";
    const kind = safetyKind(words.toLowerCase(), hostileState().profile);
    expect(kind).toBe("crisis");
    const flags = recordAllowlistedFlag([], kind!, 0);
    expect(flags).toEqual([]);
    const state = {
      ...enrolledOn("2026-09-01T12:00:00.000Z", [quietReport("2026-09-01")]),
      chat: [{ id: "c1", role: "you" as const, text: words, createdAt: "2026-09-01T08:00:00.000Z" }],
      safetyFlags: flags,
    };
    const pack = buildStudyPack(state, new Date("2026-09-01T18:00:00.000Z"));
    const blob = JSON.stringify(pack);
    expect(pack.safetyFlags).toBeUndefined();
    expect(blob).not.toMatch(/safetyFlags|crisis|suicid|kill myself|lifeline/i);
    expect(flagsForPack({ ...state, safetyFlags: [{ category: "crisis", episodeNight: 0 }] as unknown as SafetyFlag[] })).toEqual(
      [],
    );
  });

  it("a mania disclosure produces nothing in the pack", () => {
    const words = "I think I am manic and bipolar this week";
    const kind = safetyKind(words.toLowerCase(), hostileState().profile);
    expect(kind).toBe("mania");
    const flags = recordAllowlistedFlag([], kind!, 1);
    expect(flags).toEqual([]);
    const state = {
      ...enrolledOn("2026-09-01T12:00:00.000Z", [quietReport("2026-09-01")]),
      chat: [{ id: "c1", role: "you" as const, text: words, createdAt: "2026-09-02T08:00:00.000Z" }],
      safetyFlags: flags,
    };
    const pack = buildStudyPack(state, new Date("2026-09-02T18:00:00.000Z"));
    const blob = JSON.stringify(pack);
    expect(pack.safetyFlags).toBeUndefined();
    expect(blob).not.toMatch(/safetyFlags|mania|manic|bipolar/i);
  });

  it("a flag carries a category and an episodeNight only — no text survives", () => {
    const words = "I stop breathing and my wife screamed James bought gummies";
    const state = {
      ...enrolledOn("2026-09-01T12:00:00.000Z", [quietReport("2026-09-02")]),
      safetyFlags: [
        {
          category: "witnessed-apnea",
          episodeNight: 1,
          text: words,
          quote: words,
          note: words,
        } as unknown as SafetyFlag,
      ],
      chat: [{ id: "c1", role: "you" as const, text: words, createdAt: "2026-09-02T08:00:00.000Z" }],
    };
    const pack = buildStudyPack(state, new Date("2026-09-02T18:00:00.000Z"));
    expect(pack.safetyFlags).toEqual([{ category: "witnessed-apnea", episodeNight: 1 }]);
    expect(Object.keys(pack.safetyFlags![0]!).sort()).toEqual(["category", "episodeNight"]);
    const blob = JSON.stringify(pack);
    expect(blob).not.toContain("screamed");
    expect(blob).not.toContain("stop breathing");
    expect(blob).not.toContain("James");
    expect(blob).not.toContain(words);
    expect(validateStudyPack({ ...pack, safetyFlags: [{ category: "witnessed-apnea", episodeNight: 1, text: words }] }).ok).toBe(
      false,
    );
  });

  it("only the two allowlisted categories can ever appear", () => {
    const state = enrolledOn("2026-09-01T12:00:00.000Z", [quietReport("2026-09-01")]);
    expect(recordAllowlistedFlag([], "crisis", 0)).toEqual([]);
    expect(recordAllowlistedFlag([], "mania", 0)).toEqual([]);
    expect(recordAllowlistedFlag([], "no-sleep-for-days", 0)).toEqual([]);
    expect(recordAllowlistedFlag([], "alcohol-dependence", 0)).toEqual([]);
    expect(recordAllowlistedFlag([], "child-dosing", 0)).toEqual([]);
    expect(recordAllowlistedFlag([], "minor-dosing", 0)).toEqual([]);
    expect(recordAllowlistedFlag([], "witnessed-apnea", 0)).toEqual([{ category: "witnessed-apnea", episodeNight: 0 }]);
    expect(recordAllowlistedFlag([], "drowsy-driving", 1)).toEqual([{ category: "drowsy-driving", episodeNight: 1 }]);
    const pack = buildStudyPack(
      { ...state, safetyFlags: recordAllowlistedFlag(recordAllowlistedFlag([], "witnessed-apnea", 0), "drowsy-driving", 0) },
      new Date("2026-09-01T18:00:00.000Z"),
    );
    expect(pack.safetyFlags?.map((f) => f.category).sort()).toEqual(["drowsy-driving", "witnessed-apnea"]);
    expect(validateStudyPack({ ...pack, safetyFlags: [{ category: "crisis", episodeNight: 0 }] }).ok).toBe(false);
    expect(validateStudyPack({ ...pack, safetyFlags: [{ category: "mania", episodeNight: 0 }] }).ok).toBe(false);
  });

  it("both receivers accept a pack with both new fields, and one with neither", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-flags-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Circadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      const withBoth = buildStudyPack(
        {
          ...enrolledOn("2026-09-01T12:00:00.000Z", [quietReport("2026-09-01"), quietReport("2026-09-03")]),
          safetyFlags: [{ category: "witnessed-apnea", episodeNight: 0 }],
        },
        new Date("2026-09-04T12:00:00Z"),
      );
      const without = buildStudyPack(hostileState());
      expect(withBoth.nights.some((n) => n.episodeNight !== undefined)).toBe(true);
      expect(withBoth.safetyFlags).toEqual([{ category: "witnessed-apnea", episodeNight: 0 }]);
      expect(without.nights[0]?.episodeNight).toBeUndefined();
      expect(without.safetyFlags).toBeUndefined();
      expect(validateStudyPack(withBoth).ok).toBe(true);
      expect(validateStudyPack(without).ok).toBe(true);
      expect(parseInboxPayload(withBoth).ok).toBe(true);
      expect(parseInboxPayload(without).ok).toBe(true);
      for (const pack of [withBoth, without]) {
        const res = await fetch(`${started.url}/api/study`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pack),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
      }
    } finally {
      started.server.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

