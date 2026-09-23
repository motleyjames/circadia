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
  ratioPercent,
  restoreOrphan,
  smsHref,
  type ConsoleArrival,
  type ConsoleReject,
} from "./console-model";
import type { OperatorInvite } from "./invite";
import { nightGeometry } from "./sleep-metrics";
import { createEpisode } from "./episode";
import { emptyState } from "./storage";
import { buildStudyPack } from "./study";
import { DEFAULT_SCHEDULED_DAYS } from "./schedule";
import type { CircadiaState, MorningReport, Profile, StudyNight, StudyPack } from "./types";

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
    code: "A10B-C3D4-E5F6-G7H8",
    participantId: id,
    name,
    cohort,
    createdAt: "2026-09-10T12:00:00.000Z",
    dismissed: false,
  };
}

function model(arrivals: ConsoleArrival[], book: OperatorInvite[] = [], rejects: ConsoleReject[] = []) {
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
    // A pack is a complete snapshot. Filed nights come from the newest pack only.
    expect(row.nightsFiled).toBe(3);
  });

  it("a night present in two packs appears once, from the newer", () => {
    // Older rule merged by episodeNight across every pack. A night whose slot
    // was later corrected then appeared twice. Nights now come from the newest
    // pack only — older packs stay on disk and are never merged in.
    // Newest elapsed 5 with slots 0 and 1; older also has slot 3. Slot 3 is
    // reached, so a merge would draw it. Newest-only leaves it missed.
    const olderThree = scoredNight(3, { rating: 1, inBedAt: "00:00", outOfBedAt: "08:00", wokeAt: "07:00" });
    const newerOne = scoredNight(1, { rating: 5, inBedAt: "00:00", outOfBedAt: "07:00", wokeAt: "06:30" });
    const olderSe = nightGeometry({
      inBedAt: olderThree.inBedAt,
      outOfBedAt: olderThree.outOfBedAt,
      wokeAt: olderThree.wokeAt,
      triedToSleepAt: olderThree.triedToSleepAt,
      sleepLatencyMinutes: olderThree.sleepLatencyMinutes,
      wokeInNight: olderThree.wokeInNight,
      nightWakingMinutes: olderThree.nightWakingMinutes,
    })!.efficiencyPct;
    const newerSe = nightGeometry({
      inBedAt: newerOne.inBedAt,
      outOfBedAt: newerOne.outOfBedAt,
      wokeAt: newerOne.wokeAt,
      triedToSleepAt: newerOne.triedToSleepAt,
      sleepLatencyMinutes: newerOne.sleepLatencyMinutes,
      wokeInNight: newerOne.wokeInNight,
      nightWakingMinutes: newerOne.nightWakingMinutes,
    })!.efficiencyPct;
    expect(newerSe).not.toBe(olderSe);
    const row = testerOf([
      arrival(ALEX, "2026-09-20T10-00-00-000Z", {
        nightsElapsed: 5,
        nights: [scoredNight(0), scoredNight(1), olderThree],
      }),
      arrival(ALEX, "2026-09-21T10-00-00-000Z", {
        nightsElapsed: 5,
        nights: [scoredNight(0), newerOne],
      }),
    ]);
    expect(row.nightsFiled).toBe(2);
    expect(row.slots[1]?.kind).toBe("bar");
    expect(row.slots[1]?.efficiencyPct).toBe(newerSe);
    expect(row.slots[1]?.efficiencyPct).not.toBe(olderSe);
    expect(row.slots[3]?.kind).toBe("dashed");
    expect(row.slots[3]?.kind).not.toBe("bar");
  });

  it("James's case: slot 1 in an older pack, slot 0 in the newer, is one bar in slot 0, 1 filed, 100%", () => {
    const view = model(
      [
        arrival(ALEX, "2026-09-20T10-00-00-000Z", { nightsElapsed: 1, nights: [scoredNight(1)] }),
        arrival(ALEX, "2026-09-21T10-00-00-000Z", { nightsElapsed: 1, nights: [scoredNight(0)] }),
      ],
      [bookEntry(ALEX, "James")],
    );
    const row = view.testers[0]!;
    expect(row.nightsFiled).toBe(1);
    expect(row.slots[0]?.kind).toBe("bar");
    expect(row.slots.filter((slot) => slot.kind === "bar")).toHaveLength(1);
    expect(row.slots[1]?.kind).not.toBe("bar");
    expect(row.completion).toBe(1);
    expect(view.completion?.percentLabel).toBe("100%");
  });

  it("a newest pack with fewer nights than the one before is used, and data health names it; the next pack that does not shrink clears the notice", () => {
    const shrink = model(
      [
        arrival(ALEX, "2026-09-19T10-00-00-000Z", {
          nightsElapsed: 3,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2)],
        }),
        arrival(ALEX, "2026-09-21T10-00-00-000Z", { nightsElapsed: 1, nights: [scoredNight(0)] }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(shrink.testers[0]?.nightsFiled).toBe(1);
    expect(shrink.health?.some((item) => item.kind === "shrunk" && item.message.includes("Alex Q."))).toBe(true);

    const cleared = model(
      [
        arrival(ALEX, "2026-09-19T10-00-00-000Z", {
          nightsElapsed: 3,
          nights: [scoredNight(0), scoredNight(1), scoredNight(2)],
        }),
        arrival(ALEX, "2026-09-20T10-00-00-000Z", { nightsElapsed: 1, nights: [scoredNight(0)] }),
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 2,
          nights: [scoredNight(0), scoredNight(1)],
        }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(cleared.testers[0]?.nightsFiled).toBe(2);
    expect(cleared.health?.some((item) => item.kind === "shrunk")).toBeFalsy();
  });

  it("a night in an unreached slot is not counted and is reported", () => {
    const view = model(
      [
        arrival(ALEX, "2026-09-21T10-00-00-000Z", {
          nightsElapsed: 1,
          nights: [scoredNight(0), scoredNight(2)],
        }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    const row = view.testers[0]!;
    expect(row.nightsFiled).toBe(1);
    expect(row.slots[0]?.kind).toBe("bar");
    expect(row.slots[2]?.kind).not.toBe("bar");
    expect(view.health?.some((item) => item.kind === "unreached" && item.message.includes("Alex Q."))).toBe(
      true,
    );
  });

  it("completion never exceeds 100%", () => {
    expect(ratioPercent(2, 1)).toBe(100);
    expect(ratioPercent(5, 2)).toBe(100);
    const view = model(
      [
        arrival(ALEX, "2026-09-20T10-00-00-000Z", { nightsElapsed: 1, nights: [scoredNight(1)] }),
        arrival(ALEX, "2026-09-21T10-00-00-000Z", { nightsElapsed: 1, nights: [scoredNight(0)] }),
      ],
      [bookEntry(ALEX, "Alex Q.")],
    );
    expect(view.testers[0]?.completion).toBeLessThanOrEqual(1);
    expect(Number.parseInt(view.completion?.percentLabel ?? "0", 10)).toBeLessThanOrEqual(100);
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
    expect(view.health?.some((item) => item.message.includes("couldn't be read: invalid JSON."))).toBe(true);
    const book = buildInviteBook(
      [bookEntry(ALEX, "Alex Q.")],
      [arrival(ALEX, "2026-09-15T08-00-00-000Z")],
      NOW,
    );
    expect(book[0]?.joined).toBe(true);
    expect(book[0]?.status).toMatch(/^Joined /);
    expect(book[0]?.code).toBe("A10B-C3D4-E5F6-G7H8");
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

  it("a pack that parses is absent from data health", () => {
    const row = arrival(ALEX, "2026-08-28T14-17-56-582Z", {
      nights: [outlineNight(0), outlineNight(1)],
    });
    const view = model(
      [row],
      [bookEntry(ALEX, "Alex Q.")],
      [{ reason: "Invalid night clocks.", arrivedAt: row.file, file: row.file }],
    );
    expect(view.health).toBeNull();
  });

  it("rejects sharing a reason render as one line with a count and date range", () => {
    const view = model(
      [],
      [],
      [
        { reason: "Invalid night clocks.", arrivedAt: fileFor(ALEX, "2026-08-28T14-17-56-582Z") },
        { reason: "Invalid night clocks.", arrivedAt: fileFor(BLAKE, "2026-09-13T12-00-00-000Z") },
      ],
    );
    expect(view.health).toHaveLength(1);
    expect(view.health?.[0]?.kind).toBe("unreadable");
    expect(view.health?.[0]?.message).toBe(
      "2 packs from Aug 28 to Sep 13 couldn't be read: invalid night clocks.",
    );
    expect(view.health?.[0]?.files).toEqual([
      fileFor(ALEX, "2026-08-28T14-17-56-582Z"),
      fileFor(BLAKE, "2026-09-13T12-00-00-000Z"),
    ]);
  });

  it("a withdrawal deletes that tester's packs and only theirs", () => {
    // James decided leaving deletes. The old console test encoded delete-nothing
    // while that was open. After a withdrawal fetch, arrivals are gone; the book
    // row stays, withdrawn, with no nights.
    const blake = arrival(BLAKE, "2026-09-21T11-00-00-000Z");
    const view = buildConsoleModel({
      arrivals: [blake],
      book: [bookEntry(ALEX, "Alex Q."), bookEntry(BLAKE, "Blake Q.")],
      rejects: [],
      now: NOW,
      withdrawn: [ALEX],
    });
    expect(view.weekTesters.map((row) => row.participantId)).toEqual([BLAKE]);
    const left = view.allTesters.find((row) => row.participantId === ALEX);
    expect(left?.state).toBe("Withdrawn");
    expect(left?.nightCount).toBe(0);
    const stayed = view.allTesters.find((row) => row.participantId === BLAKE);
    expect(stayed?.state).not.toBe("Withdrawn");
    expect(stayed?.nightCount).toBeGreaterThan(0);
  });

  it("an unreachable Worker changes nothing already stored", () => {
    const row = arrival(ALEX, "2026-09-21T10-00-00-000Z");
    const view = buildConsoleModel({
      arrivals: [row],
      book: [bookEntry(ALEX, "Alex Q.")],
      rejects: [],
      now: NOW,
      workerUnreachable: true,
    });
    expect(view.weekTesters).toHaveLength(1);
    expect(view.health?.some((item) => item.kind === "unreachable")).toBe(true);
    expect(view.health?.some((item) => item.message.includes("Nothing stored was changed"))).toBe(true);
  });

  it("every invite's code is present in the rendered book", () => {
    const minted = bookEntry(ALEX, "Alex Q.");
    const book = buildInviteBook([minted], [], NOW);
    expect(book[0]?.code).toBe("A10B-C3D4-E5F6-G7H8");
    const page = readFileSync("src/app/mod/invite/page.tsx", "utf8");
    expect(page).toContain("{row.code ?? \"—\"}");
    expect(page).toContain("Copy");
    expect(page).toContain("SendInviteCode");
    expect(inviteSendBody("A10B-C3D4")).toBe(
      "Your Somnadia code is A10B-C3D4. Enter it when the app asks for one. It is yours alone — please don't share it.",
    );
    expect(smsHref("+1 (555) 010-0101", inviteSendBody("A10B-C3D4"))).toContain("sms:+15550100101?body=");
    expect(mailtoHref("ada@example.com", inviteSendBody("A10B-C3D4"))).toContain("mailto:ada@example.com?body=");
  });

  it("James's case through the console model: slot 0 filled, slots 1–13 empty, section In baseline", () => {
    const enrolledAt = new Date(2026, 8, 21, 22, 0, 0, 0).toISOString();
    const profile: Profile = {
      firstName: "J",
      lastName: "",
      name: "J",
      age: 40,
      sex: "male",
      heightCm: 178,
      weightKg: 75,
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
    const report: MorningReport = {
      id: "r-2026-09-22",
      morningDate: "2026-09-22",
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
      createdAt: "2026-09-22T13:00:00.000Z",
    };
    const state: CircadiaState = {
      ...emptyState(),
      profile,
      reports: [report],
      episode: createEpisode({ clinicianId: null, enrolledAt }),
      study: {
        ...emptyState().study,
        asked: true,
        consented: true,
        participantId: ALEX,
      },
    };
    const built = buildStudyPack(state, new Date(2026, 8, 22, 18, 0, 0, 0));
    expect(built.nights[0]?.episodeNight).toBe(0);
    expect(built.nightsElapsed).toBe(1);
    const tester = testerOf(
      [{ file: fileFor(ALEX, "2026-09-22T18-00-00-000Z"), pack: built }],
      [bookEntry(ALEX, "James")],
    );
    expect(tester.section).toBe("in-baseline");
    expect(tester.slots).toHaveLength(BASELINE_NIGHTS);
    expect(tester.slots[0]?.kind).not.toBe("dashed");
    expect(tester.slots[0]?.kind).not.toBe("empty");
    expect(tester.slots.slice(1).every((slot) => slot.kind === "empty")).toBe(true);
  });
});
