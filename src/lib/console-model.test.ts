import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASELINE_NIGHTS,
  buildConsoleModel,
  buildInviteBook,
  dismissOrphan,
  invitePrivacySentence,
  inviteSendBody,
  mailtoHref,
  nameOrphan,
  restoreOrphan,
  smsHref,
  type ConsoleArrival,
} from "./console-model";
import type { OperatorInvite } from "./invite";
import { nightGeometry } from "./sleep-metrics";
import type { StudyNight, StudyPack } from "./types";

const NOW = new Date("2026-09-21T18:00:00.000Z");
const ALEX = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0011";
const BLAKE = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeee0022";
const CASEY = "cccccccc-bbbb-4ccc-8ddd-eeeeeeee0033";

function fileFor(id: string, stamp: string): string {
  return `study-${id.slice(0, 8)}-${stamp}.json`;
}

function scoredNight(episodeNight: number, overrides: Partial<StudyNight> = {}): StudyNight {
  return {
    nightIndex: episodeNight,
    episodeNight,
    fellAsleepAt: "00:15",
    wokeAt: "07:00",
    durationMinutes: 405,
    rating: 3,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    hadDream: false,
    inBedAt: "00:00",
    triedToSleepAt: "00:00",
    outOfBedAt: "07:30",
    ...overrides,
  };
}

function outlineNight(episodeNight: number): StudyNight {
  return scoredNight(episodeNight, {
    inBedAt: undefined,
    triedToSleepAt: undefined,
    outOfBedAt: undefined,
  });
}

function pack(id: string, extras: Partial<StudyPack> = {}): StudyPack {
  return {
    schema: "circadia-study-v1",
    appVersion: "0.14.0",
    surface: "desktop",
    demoWeek: false,
    profile: {
      ageBand: "18-24",
      sex: "female",
      struggles: ["falling"],
      activity: "light",
      bmiBand: "healthy",
      medicationClasses: [],
      supplementCount: 0,
      targetSleep: "00:00",
      targetWake: "07:30",
    },
    nights: extras.nights ?? [scoredNight(0)],
    sessions: { meditation: 0, soundscape: 0, completed: 0 },
    chat: { turns: 0, topics: [] },
    nightsElapsed: extras.nightsElapsed ?? 4,
    ...extras,
    participantId: id,
  };
}

function arrival(id: string, stamp: string, extras: Partial<StudyPack> = {}): ConsoleArrival {
  return { file: fileFor(id, stamp), pack: pack(id, extras) };
}

function bookEntry(id: string, name: string, cohort: NonNullable<OperatorInvite["cohort"]> = "friend"): OperatorInvite {
  return {
    code: "A10B-C3D4",
    participantId: id,
    name,
    cohort,
    createdAt: "2026-09-10T12:00:00.000Z",
    dismissed: false,
  };
}

function model(arrivals: ConsoleArrival[], book: OperatorInvite[] = [], rejects: { reason: string; arrivedAt: string }[] = []) {
  return buildConsoleModel({ arrivals, book, rejects, now: NOW });
}

function testerOf(arrivals: ConsoleArrival[], book: OperatorInvite[] = []) {
  const view = model(arrivals, book);
  expect(view.testers).toHaveLength(1);
  return view.testers[0]!;
}

describe("console-model", () => {
  it("a tester appears in exactly one section, following the precedence order", () => {
    const view = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 4,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2), scoredNight(3)],
        }),
        arrival(BLAKE, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 5,
          nights: [scoredNight(0)],
          safetyFlags: [{ category: "witnessed-apnea", episodeNight: 0 }],
        }),
        arrival(CASEY, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 14,
          nights: Array.from({ length: 14 }, (_, i) => scoredNight(i)),
        }),
      ],
      [bookEntry(ALEX, "Alex Q."), bookEntry(BLAKE, "Blake R."), bookEntry(CASEY, "Casey S.")],
    );
    const ids = view.sections.flatMap((section) => section.testers.map((row) => row.participantId));
    expect(ids).toEqual([BLAKE, ALEX, CASEY]);
    expect(new Set(ids).size).toBe(3);
    expect(view.testers.map((row) => row.section).sort()).toEqual(["baseline-complete", "in-baseline", "safety"]);
  });

  it("safety outranks everything: a flagged tester who is also not filing appears only under Safety", () => {
    const view = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 6,
          nights: [scoredNight(0)],
          safetyFlags: [{ category: "drowsy-driving", episodeNight: 1 }],
        }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(view.sections.map((section) => section.id)).toEqual(["safety"]);
    expect(view.sections[0]?.testers).toHaveLength(1);
    expect(view.testers[0]?.section).toBe("safety");
    expect(view.testers[0]?.nightsFiled / (view.testers[0]?.nightsElapsed ?? 1)).toBeLessThan(0.8);
  });

  it("completion is unknown — never a number — when nightsElapsed is absent", () => {
    const row = testerOf([
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nights: [scoredNight(0), scoredNight(1)],
        nightsElapsed: undefined,
      }),
    ]);
    expect(row.nightsElapsed).toBeNull();
    expect(row.completion).toBeNull();
    expect(row.section).toBe("not-enrolled");
  });

  it("a missed night never lowers sleep efficiency", () => {
    const filled = scoredNight(0);
    const expected = nightGeometry({
      inBedAt: filled.inBedAt,
      outOfBedAt: filled.outOfBedAt,
      wokeAt: filled.wokeAt,
      triedToSleepAt: filled.triedToSleepAt,
      sleepLatencyMinutes: filled.sleepLatencyMinutes,
      wokeInNight: filled.wokeInNight,
      nightWakingMinutes: filled.nightWakingMinutes,
    })!.efficiencyPct;
    const row = testerOf([
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 3,
        nights: [scoredNight(0), scoredNight(2)],
      }),
    ]);
    expect(row.nightsFiled).toBe(2);
    expect(row.sleepEfficiencyPct).toBe(Math.round(expected));
    expect(row.sleepEfficiencyPct).not.toBe(Math.round((expected + expected + 0) / 3));
  });

  it("filed nights 0, 1 and 3 with nightsElapsed 5 yield slots: bar, bar, dashed, bar, dashed, then empty", () => {
    const row = testerOf([
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 5,
        nights: [scoredNight(0), scoredNight(1), scoredNight(3)],
      }),
    ]);
    expect(row.slots).toHaveLength(BASELINE_NIGHTS);
    expect(row.slots.map((slot) => slot.kind)).toEqual([
      "bar",
      "bar",
      "dashed",
      "bar",
      "dashed",
      ...Array.from({ length: 9 }, () => "empty"),
    ]);
  });

  it("pre-enrollment nights are never drawn", () => {
    const pre = { episodeNight: undefined, wokeAt: "03:15" };
    const row = testerOf([
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 5,
        nights: [
          scoredNight(0),
          scoredNight(1),
          scoredNight(2),
          scoredNight(4),
          scoredNight(0, pre),
          scoredNight(1, pre),
          scoredNight(2, pre),
        ],
      }),
    ]);
    expect(row.section).toBe("in-baseline");
    expect(row.slots).toHaveLength(BASELINE_NIGHTS);
    expect(row.nightsFiled).toBe(4);
    expect(row.slots.map((slot) => slot.kind)).toEqual([
      "bar",
      "bar",
      "bar",
      "dashed",
      "bar",
      ...Array.from({ length: 9 }, () => "empty"),
    ]);
    expect(row.slots.map((slot) => slot.efficiencyPct)).toEqual([
      90,
      90,
      90,
      null,
      90,
      ...Array.from({ length: 9 }, () => null),
    ]);
  });

  it("the completion sentence excludes orphans and unknowns, and reports how many testers it covers", () => {
    const view = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 4,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2), scoredNight(3)],
        }),
        arrival(BLAKE, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 4,
          nights: [scoredNight(0), scoredNight(1)],
        }),
        arrival(CASEY, "2026-09-21T10-00-00-000Z", {
          nights: [scoredNight(0)],
          nightsElapsed: undefined,
        }),
      ],
      [bookEntry(ALEX, "Alex Q.", "friend"), bookEntry(CASEY, "Casey S.", "stranger")],
    );
    expect(view.completion?.covered).toBe(1);
    expect(view.completion?.sentence).toContain("1 named tester");
    expect(view.completion?.sentence).toContain("friends 100%");
    expect(view.completion?.sentence).not.toContain("strangers");
    expect(view.testers.some((row) => !row.inBook)).toBe(true);
  });

  it("data health is absent when there is nothing to report", () => {
    const view = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 3,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2)],
        }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(view.health).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/0 faults/i);
  });

  it("a name appears only when the book supplies it", () => {
    const named = testerOf(
      [arrival(ALEX, "2026-09-21T10-00-00-000Z")],
      [bookEntry(ALEX, "Alex Q.", "lab")],
    );
    const orphan = testerOf([arrival(BLAKE, "2026-09-21T10-00-00-000Z")]);
    expect(named.name).toBe("Alex Q.");
    expect(named.inBook).toBe(true);
    expect(named.cohortLabel).toBe("Sleep lab");
    expect(orphan.name).toBeNull();
    expect(orphan.inBook).toBe(false);
    expect(orphan.cohortLabel).toBe("Not in your book");
  });

  it("a category outside the two allowlisted never renders, even if a malformed pack carried one", () => {
    const row = testerOf([
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 3,
        nights: [scoredNight(0), scoredNight(1), scoredNight(2)],
        safetyFlags: [
          { category: "crisis", episodeNight: 0 },
          { category: "mania", episodeNight: 1 },
          { category: "witnessed-apnea", episodeNight: 2 },
        ] as StudyPack["safetyFlags"],
      }),
    ]);
    expect(row.flags).toEqual(["witnessed-apnea"]);
    expect(row.reason.toLowerCase()).not.toContain("crisis");
    expect(row.reason.toLowerCase()).not.toContain("mania");
  });

  it("a safety flag in a tester's newest pack is shown even when an older pack carries more nights", () => {
    const row = testerOf([
      arrival(ALEX, "2026-09-20T10-00-00-000Z", {
        nightsElapsed: 8,
        nights: Array.from({ length: 8 }, (_, i) => scoredNight(i)),
        safetyFlags: [],
      }),
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 3,
        nights: [scoredNight(0), scoredNight(1), scoredNight(2)],
        safetyFlags: [{ category: "drowsy-driving", episodeNight: 2 }],
      }),
    ]);
    expect(row.nightsElapsed).toBe(3);
    expect(row.flags).toEqual(["drowsy-driving"]);
    expect(row.section).toBe("safety");
    expect(row.nightsFiled).toBe(8);
  });

  it("a night present in two packs appears once, from the newer", () => {
    const older = scoredNight(1, { rating: 1, inBedAt: "00:00", outOfBedAt: "08:00", wokeAt: "07:00" });
    const newer = scoredNight(1, { rating: 5, inBedAt: "00:00", outOfBedAt: "07:00", wokeAt: "06:30" });
    const olderSe = nightGeometry({
      inBedAt: older.inBedAt,
      outOfBedAt: older.outOfBedAt,
      wokeAt: older.wokeAt,
      triedToSleepAt: older.triedToSleepAt,
      sleepLatencyMinutes: older.sleepLatencyMinutes,
      wokeInNight: older.wokeInNight,
      nightWakingMinutes: older.nightWakingMinutes,
    })!.efficiencyPct;
    const newerSe = nightGeometry({
      inBedAt: newer.inBedAt,
      outOfBedAt: newer.outOfBedAt,
      wokeAt: newer.wokeAt,
      triedToSleepAt: newer.triedToSleepAt,
      sleepLatencyMinutes: newer.sleepLatencyMinutes,
      wokeInNight: newer.wokeInNight,
      nightWakingMinutes: newer.nightWakingMinutes,
    })!.efficiencyPct;
    expect(newerSe).not.toBe(olderSe);
    const row = testerOf([
      arrival(ALEX, "2026-09-20T10-00-00-000Z", { nightsElapsed: 2, nights: [scoredNight(0), older] }),
      arrival(ALEX, "2026-09-21T10-00-00-000Z", { nightsElapsed: 2, nights: [scoredNight(0), newer] }),
    ]);
    expect(row.slots[1]?.kind).toBe("bar");
    expect(row.slots[1]?.efficiencyPct).toBe(newerSe);
    expect(row.slots[1]?.efficiencyPct).not.toBe(olderSe);
  });

  it("no design data ships", () => {
    const forbidden = [
      ["Rosa", " M."],
      ["Theo", " B."],
      ["Ana", " P."],
      ["Jordan", " K."],
      ["Sam", " L."],
      ["Chris", " D."],
      ["Priya", " N."],
      ["K7M2", "-9QXP"],
      ["a91c", "04e2"],
      ["Sample", " testers"],
      ["[YOUR", " NAME]"],
    ].map((parts) => parts.join(""));
    const hits: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        const text = readFileSync(path, "utf8");
        for (const needle of forbidden) {
          if (text.includes(needle)) hits.push(`${path}: ${needle}`);
        }
      }
    }
    walk("src");
    expect(hits).toEqual([]);
  });

  it("an old-format night is an outline, and data health reports a reject and an orphan", () => {
    const row = testerOf([
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 1,
        nights: [outlineNight(0)],
      }),
    ]);
    expect(row.slots[0]).toEqual({ kind: "outline", efficiencyPct: null });
    expect(invitePrivacySentence("Alex Q.")).toBe(
      "Send this to Alex. It belongs to them alone: if two people use one code, their nights merge into a single record.",
    );
    const view = model(
      [arrival(BLAKE, "2026-09-21T10-00-00-000Z")],
      [],
      [{ reason: "Invalid JSON.", arrivedAt: "study-x-2026-09-20T08-00-00-000Z.json" }],
    );
    expect(view.health?.map((item) => item.kind).sort()).toEqual(["orphan", "unreadable"]);
    expect(view.health?.some((item) => item.detail === "Invalid JSON.")).toBe(true);
    const book = buildInviteBook(
      [bookEntry(ALEX, "Alex Q.")],
      [arrival(ALEX, "2026-09-15T08-00-00-000Z")],
      NOW,
    );
    expect(book[0]?.joined).toBe(true);
    expect(book[0]?.status).toMatch(/^Joined /);
    expect(book[0]?.code).toBe("A10B-C3D4");
  });

  it("a tester whose newest pack has no nightsElapsed lands in Not enrolled, never In baseline", () => {
    const nights = Array.from({ length: 14 }, (_, i) => scoredNight(i, { episodeNight: undefined }));
    const view = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", { nightsElapsed: 4, nights: [scoredNight(0), scoredNight(1), scoredNight(2), scoredNight(3)] }),
        arrival(BLAKE, "2026-09-21T10-00-00-000Z", { nights, nightsElapsed: undefined }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    const legacy = view.testers.find((row) => row.participantId === BLAKE);
    expect(legacy?.section).toBe("not-enrolled");
    expect(legacy?.section).not.toBe("in-baseline");
    expect(view.sections.map((section) => section.id)).toEqual(["in-baseline", "not-enrolled"]);
    const flagged = testerOf([
      arrival(CASEY, "2026-09-21T10-00-00-000Z", {
        nights,
        nightsElapsed: undefined,
        safetyFlags: [{ category: "witnessed-apnea", episodeNight: 0 }],
      }),
    ]);
    expect(flagged.section).toBe("safety");
  });

  it("a not-enrolled row shows the nights its pack carries — never 0 filed — and no 14-slot strip", () => {
    const nights = Array.from({ length: 14 }, (_, i) => scoredNight(i, { episodeNight: undefined }));
    const row = testerOf([arrival(ALEX, "2026-09-21T10-00-00-000Z", { nights, nightsElapsed: undefined })]);
    expect(row.nightsFiled).toBe(14);
    expect(row.packNightCount).toBe(14);
    expect(row.filedLabel).toBe("14 nights, outside any baseline");
    expect(row.filedLabel).not.toMatch(/0 filed/);
    expect(row.slots).toEqual([]);
    expect(row.progressLabel).toBe("Not enrolled");
    expect(row.sleepEfficiencyPct).not.toBeNull();
  });

  it("a not-enrolled tester never enters the completion sentence", () => {
    const nights = Array.from({ length: 14 }, (_, i) => scoredNight(i, { episodeNight: undefined }));
    const onlyLegacy = model(
      [arrival(ALEX, "2026-09-21T10-00-00-000Z", { nights, nightsElapsed: undefined })],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(onlyLegacy.completion).toBeNull();
    const mixed = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", { nights, nightsElapsed: undefined }),
        arrival(BLAKE, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 4,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2), scoredNight(3)],
        }),
      ],
      [bookEntry(ALEX, "Alex Q."), bookEntry(BLAKE, "Blake R.")],
    );
    expect(mixed.completion?.covered).toBe(1);
    expect(mixed.completion?.sentence).toContain("1 named tester");
    expect(mixed.completion?.sentence).not.toContain("Alex Q.");
  });

  it("a tester with nightsElapsed still lands in In baseline", () => {
    const row = testerOf(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 4,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2), scoredNight(3)],
        }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(row.section).toBe("in-baseline");
    expect(row.slots).toHaveLength(BASELINE_NIGHTS);
  });

  it("naming an orphan creates a book entry with no code, and the tester then shows that name", () => {
    const named = nameOrphan([], ALEX, "Alex Q.", "friend");
    expect(named).toHaveLength(1);
    expect(named[0]?.code).toBeNull();
    expect(named[0]?.participantId).toBe(ALEX);
    expect(named[0]?.name).toBe("Alex Q.");
    const row = testerOf([arrival(ALEX, "2026-09-21T10-00-00-000Z")], named);
    expect(row.name).toBe("Alex Q.");
    expect(row.inBook).toBe(true);
  });

  it("a dismissed orphan is absent from data health and This week, and present in All testers", () => {
    const dismissed = dismissOrphan([], BLAKE);
    const view = model([arrival(BLAKE, "2026-09-21T10-00-00-000Z")], dismissed);
    expect(view.weekTesters).toEqual([]);
    expect(view.health).toBeNull();
    expect(view.sections).toEqual([]);
    expect(view.allTesters).toHaveLength(1);
    expect(view.allTesters[0]?.dismissed).toBe(true);
    expect(view.allTesters[0]?.participantId).toBe(BLAKE);
    expect(view.allTesters[0]?.state).toBe("Dismissed");
    const restored = model([arrival(BLAKE, "2026-09-21T10-00-00-000Z")], restoreOrphan(dismissed, BLAKE));
    expect(restored.weekTesters).toHaveLength(1);
    expect(restored.health?.some((item) => item.kind === "orphan" && item.participantId === BLAKE)).toBe(true);
  });

  it("every invite's code is present in the rendered book", () => {
    const minted = bookEntry(ALEX, "Alex Q.");
    const book = buildInviteBook([minted], [], NOW);
    expect(book[0]?.code).toBe("A10B-C3D4");
    const page = readFileSync("src/app/mod/invite/page.tsx", "utf8");
    expect(page).toContain("{row.code ?? \"—\"}");
    expect(page).toContain("Copy");
    expect(page).toContain("SendInviteCode");
    expect(inviteSendBody("A10B-C3D4")).toBe(
      "Your Circadia code is A10B-C3D4. Enter it when the app asks for one. It is yours alone — please don't share it.",
    );
    expect(smsHref("+1 (555) 010-0101", inviteSendBody("A10B-C3D4"))).toContain("sms:+15550100101?body=");
    expect(mailtoHref("ada@example.com", inviteSendBody("A10B-C3D4"))).toContain("mailto:ada@example.com?body=");
  });
});
