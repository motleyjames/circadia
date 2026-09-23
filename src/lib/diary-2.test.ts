import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, DISCLOSURE_LINES, hasCurrentConsent, packDisclosureKeys, receivesCoversEveryMappedKey, unmappedPackKeys, whatJamesReceives } from "./consent";
import { formatEfficiencyPct } from "./console-model";
import { emptyMorningContext, fileMorningReport, CLOCK_WATCHING_SENTENCE, afterFileHeadline, afterFileNote, afterFileHasSleepNumber } from "./morning-diary";
import { clocksInOrder, nudgeNightHandle, usualNightClocks, type NightClocks } from "./night-clocks";
import {
  ACCEPTED_NIGHT_KEYS,
  ACCEPTED_TOP_KEYS,
  LEGACY_CHAT_KEYS,
  LEGACY_NIGHT_KEYS,
  LEGACY_SESSION_KEYS,
  LEGACY_TOP_KEYS,
  SENT_NIGHT_KEYS,
  SENT_TOP_KEYS,
} from "./pack-keys";
import { nightGeometry } from "./sleep-metrics";
import { emptyState } from "./storage";
import { buildStudyPack, validateStudyPack } from "./study";
import type { CircadiaState, MorningReport, Profile } from "./types";
import { parseInboxPayload } from "./inbox-payload";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";

const { listen } = createRequire(import.meta.url)("../../electron/static-server.cjs") as {
  listen: (options: { root: string; inbox: string; port?: number }) => Promise<{
    server: { close: () => void };
    url: string;
  }>;
};

const REMOVED_KEYS = [
  "hadDream",
  "spins",
  "screenOffMinutes",
  "windDownHelped",
  "meditation",
  "soundscape",
  "completed",
  "turns",
  "topics",
] as const;

const profile: Profile = {
  firstName: "A",
  lastName: "",
  name: "A",
  age: 34,
  sex: "female",
  heightCm: 170,
  weightKg: 68,
  activity: "light",
  medications: [],
  supplements: [],
  struggles: ["falling"],
  targetSleep: "23:00",
  targetWake: "07:00",
  units: "metric",
  notificationsEnabled: false,
  onboardingComplete: true,
  email: "",
  phone: "",
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
};

function report(over: Partial<MorningReport> = {}): MorningReport {
  return {
    id: "n1",
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
    ...over,
  };
}

function stateWith(reports: MorningReport[]): CircadiaState {
  return {
    ...emptyState(),
    profile,
    reports,
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

function walkKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, into);
    return into;
  }
  for (const [key, child] of Object.entries(value)) {
    into.add(key);
    walkKeys(child, into);
  }
  return into;
}

const usual: NightClocks = {
  inBedAt: "23:00",
  triedToSleepAt: "23:00",
  wokeAt: "07:00",
  outOfBedAt: "07:00",
};

const clocks = usual;

function filed(over: Parameters<typeof fileMorningReport>[0] extends infer T ? Partial<T> : never) {
  return fileMorningReport({
    morningDate: "2026-08-25",
    clocks,
    sleepLatencyMinutes: 20,
    awakeningCount: 0,
    rating: 4,
    context: emptyMorningContext(),
    morningSeconds: 42,
    ...over,
  });
}

describe("diary 2.0 invariants", () => {
  it("sent and accepted are separate", () => {
    expect(SENT_TOP_KEYS).not.toBe(ACCEPTED_TOP_KEYS);
    expect(SENT_NIGHT_KEYS).not.toBe(ACCEPTED_NIGHT_KEYS);
    for (const key of SENT_TOP_KEYS) expect(ACCEPTED_TOP_KEYS.has(key)).toBe(true);
    for (const key of SENT_NIGHT_KEYS) {
      expect(ACCEPTED_NIGHT_KEYS.has(key)).toBe(true);
      expect(DISCLOSURE_LINES[key]).toBeTruthy();
    }
    const receives = whatJamesReceives().join("\n");
    for (const key of REMOVED_KEYS) {
      expect(packDisclosureKeys()).not.toContain(key);
      expect(receives).not.toContain(DISCLOSURE_LINES[key]!);
    }
    expect(unmappedPackKeys()).toEqual([]);
    expect(receivesCoversEveryMappedKey()).toEqual([]);
    expect(ACCEPTED_TOP_KEYS.has("sessions")).toBe(true);
    expect(SENT_TOP_KEYS.has("sessions")).toBe(false);
    expect([...LEGACY_TOP_KEYS]).toEqual(["sessions", "chat"]);
    expect(LEGACY_NIGHT_KEYS.has("hadDream")).toBe(true);
    expect(LEGACY_SESSION_KEYS.has("meditation")).toBe(true);
    expect(LEGACY_CHAT_KEYS.has("topics")).toBe(true);
  });

  it("no removed key is ever sent", () => {
    const fresh = buildStudyPack(
      stateWith([
        report({
          caffeineAfter2pm: true,
          latencyFloor: true,
          sleepLatencyMinutes: 180,
          morningSeconds: 38,
          filedLate: true,
        }),
      ]),
    );
    const late = buildStudyPack(stateWith([report({ filedLate: true, dream: { text: "flooded hallway exam", wantMeaning: true } })]));
    for (const pack of [fresh, late]) {
      const keys = walkKeys(pack);
      for (const key of REMOVED_KEYS) expect(keys.has(key)).toBe(false);
      expect(pack.sessions).toBeUndefined();
      expect(pack.chat).toBeUndefined();
    }
  });

  it("both receivers accept a new pack and an old pack carrying every removed key", async () => {
    const neu = buildStudyPack(
      stateWith([
        report({
          caffeineAfter2pm: true,
          latencyFloor: true,
          wakingFloor: true,
          sleepLatencyMinutes: 180,
          nightWakingMinutes: 180,
          morningSeconds: 51,
        }),
      ]),
    );
    const old = {
      ...neu,
      sessions: { meditation: 2, soundscape: 1, completed: 2 },
      chat: { turns: 4, topics: ["otc-antihistamines"] },
      nights: [
        {
          ...neu.nights[0]!,
          sleepLatencyMinutes: 75,
          nightWakingMinutes: 70,
          hadDream: true,
          spins: true,
          screenOffMinutes: 30,
          windDownHelped: "did_not_use" as const,
          caffeineAfter2pm: undefined,
          latencyFloor: undefined,
          wakingFloor: undefined,
          morningSeconds: undefined,
        },
      ],
    };
    expect(validateStudyPack(neu).ok).toBe(true);
    expect(validateStudyPack(old).ok).toBe(true);
    expect(parseInboxPayload(neu).ok).toBe(true);
    expect(parseInboxPayload(old).ok).toBe(true);

    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-diary2-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Somnadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      for (const pack of [neu, old]) {
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

  it("a duration outside the accepted values is rejected", async () => {
    const pack = buildStudyPack(stateWith([report()]));
    const badLatency = { ...pack, nights: [{ ...pack.nights[0]!, sleepLatencyMinutes: 17 }] };
    const badWaso = { ...pack, nights: [{ ...pack.nights[0]!, nightWakingMinutes: 17 }] };
    expect(validateStudyPack(badLatency).ok).toBe(false);
    expect(validateStudyPack(badWaso).ok).toBe(false);
    expect(parseInboxPayload(badLatency).ok).toBe(false);

    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "circadia-dur-"));
    writeFileSync(join(tmp, "index.html"), "<h1>Somnadia</h1>");
    const inbox = join(tmp, "inbox");
    const started = await listen({ root: tmp, inbox, port: 0 });
    try {
      const res = await fetch(`${started.url}/api/study`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(badLatency),
      });
      expect(res.status).toBe(400);
    } finally {
      started.server.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("a three-hour latency produces a lower efficiency than a 75-minute one", () => {
    const base = {
      inBedAt: "23:10",
      triedToSleepAt: "23:25",
      wokeAt: "06:50",
      outOfBedAt: "07:05",
      wokeInNight: true,
      nightWakingMinutes: 25 as const,
    };
    const long = nightGeometry({ ...base, sleepLatencyMinutes: 180 })!;
    const capped = nightGeometry({ ...base, sleepLatencyMinutes: 75 })!;
    expect(long.efficiencyPct).toBeLessThan(capped.efficiencyPct);
    expect(long.efficiencyPct).toBe(50.5);
    expect(capped.efficiencyPct).toBe(72.6);
  });

  it("3 h or more sets the floor flag and the console renders an upper bound", () => {
    const night = filed({
      sleepLatencyMinutes: 180,
      awakeningCount: 1,
      nightWakingMinutes: 180,
    });
    expect(night.latencyFloor).toBe(true);
    expect(night.wakingFloor).toBe(true);
    const geometry = nightGeometry(night)!;
    expect(geometry.efficiencyIsUpperBound).toBe(true);
    expect(formatEfficiencyPct(geometry.efficiencyPct, geometry.efficiencyIsUpperBound)).toMatch(/^≤ \d+%$/);
    expect(formatEfficiencyPct(62.4, true)).toBe("≤ 62%");
    expect(formatEfficiencyPct(62.4, false)).toBe("62%");
    const old = nightGeometry(report())!;
    expect(old.efficiencyIsUpperBound).toBe(false);
  });

  it("old bucketed nights compute the same efficiencies", () => {
    expect(nightGeometry(report())!.efficiencyPct).toBe(82.1);
    expect(
      nightGeometry(
        report({
          inBedAt: "21:30",
          triedToSleepAt: "21:30",
          wokeAt: "07:30",
          outOfBedAt: "07:30",
          sleepLatencyMinutes: 75,
          nightWakingMinutes: 45,
        }),
      )!.efficiencyPct,
    ).toBe(80);
    expect(
      nightGeometry(
        report({
          inBedAt: "23:45",
          triedToSleepAt: "23:45",
          wokeAt: "06:15",
          outOfBedAt: "06:15",
          sleepLatencyMinutes: 15,
          wokeInNight: false,
          nightWakingMinutes: 0,
        }),
      )!.efficiencyPct,
    ).toBe(96.2);
  });

  it("Nothing files immediately with no context fields set", () => {
    const nothing = filed({ context: emptyMorningContext() });
    expect(nothing.napMinutes).toBeUndefined();
    expect(nothing.drank).toBe(false);
    expect(nothing.drinkCount).toBeUndefined();
    expect(nothing.caffeineAfter2pm).toBeUndefined();
    expect(nothing.usedSupplement).toBe(false);
    expect(nothing.supplementKind).toBeUndefined();

    const nap = filed({ context: { ...emptyMorningContext(), napMinutes: 20 } });
    expect(nap.napMinutes).toBe(20);
    expect(nap.drank).toBe(false);
    expect(nap.caffeineAfter2pm).toBeUndefined();
    expect(nap.usedSupplement).toBe(false);

    const drinks = filed({ context: { drank: true, drinkCount: 3, usedSupplement: false } });
    expect(drinks.drank).toBe(true);
    expect(drinks.drinkCount).toBe(3);
    expect(drinks.napMinutes).toBeUndefined();

    const caffeine = filed({ context: { ...emptyMorningContext(), caffeineAfter2pm: true } });
    expect(caffeine.caffeineAfter2pm).toBe(true);
    expect(caffeine.drank).toBe(false);

    const aid = filed({ context: { drank: false, usedSupplement: true, supplementKind: "melatonin" } });
    expect(aid.usedSupplement).toBe(true);
    expect(aid.supplementKind).toBe("melatonin");
    expect(aid.napMinutes).toBeUndefined();
  });

  it("the night bar never produces clocks out of order", () => {
    let next = usualNightClocks("23:00", "07:00");
    expect(clocksInOrder(next)).toBe(true);
    for (let i = 0; i < 40; i++) next = nudgeNightHandle(next, "triedToSleepAt", -15);
    expect(clocksInOrder(next)).toBe(true);
    expect(next.triedToSleepAt).toBe(next.inBedAt);
    for (let i = 0; i < 40; i++) next = nudgeNightHandle(next, "wokeAt", 15);
    expect(clocksInOrder(next)).toBe(true);
    for (let i = 0; i < 40; i++) next = nudgeNightHandle(next, "outOfBedAt", -15);
    expect(clocksInOrder(next)).toBe(true);
    expect(next.outOfBedAt).toBe(next.wokeAt);
    for (let i = 0; i < 40; i++) next = nudgeNightHandle(next, "inBedAt", 15);
    expect(clocksInOrder(next)).toBe(true);
  });

  it("the clock sentence appears verbatim on the latency screen", () => {
    expect(CLOCK_WATCHING_SENTENCE).toBe(
      "Your best guess is fine. Please don't check a clock tonight to get this right.",
    );
    const src = readFileSync("src/components/check-in-flow.tsx", "utf8");
    expect(src).toContain("CLOCK_WATCHING_SENTENCE");
    expect(src).toContain("LATENCY_QUESTION");
  });

  it("the after-filing screen shows no sleep number", () => {
    const copy = [
      afterFileHeadline(0),
      afterFileHeadline(6),
      afterFileHeadline(13),
      afterFileHeadline(null),
      afterFileNote(6),
      afterFileNote(13),
    ]
      .filter(Boolean)
      .join("\n");
    expect(afterFileHasSleepNumber(copy)).toBe(false);
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/minutes|hours|efficiency/i);
    const src = readFileSync("src/components/check-in-flow.tsx", "utf8");
    const after = src.slice(src.indexOf("function AfterFile"), src.indexOf("function MissedMornings"));
    expect(after).not.toMatch(/efficiency|%|minutes|hours/i);
    expect(after).not.toMatch(/nightGeometry|formatDuration/);
  });

  it("CONSENT_VERSION is 3 and a person who accepted 2 sees the screen again", () => {
    expect(CONSENT_VERSION).toBe(3);
    expect(hasCurrentConsent({ consentVersion: 2 })).toBe(false);
    expect(hasCurrentConsent({ consentVersion: 3 })).toBe(true);
  });
});
