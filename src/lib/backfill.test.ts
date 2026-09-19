import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyBackfill, BACKFILL_NIGHTS, backfillableDates, isFiledLate, retainMorningDraft } from "./backfill";
import { mergeDiaryStates } from "./diary-fold";
import { createEpisode } from "./episode";
import { emptyState, exportState, hydrateState, persistableState } from "./storage";
import { anonymityViolations, buildStudyPack } from "./study";
import type { CircadiaState, MorningReport, Profile } from "./types";
import { DEFAULT_SCHEDULED_DAYS, shiftIsoDate } from "./schedule";
import { todayIsoDate } from "./time";

function night(morningDate: string, extra: Partial<MorningReport> = {}): MorningReport {
  return {
    id: extra.id ?? `n-${morningDate}`,
    morningDate,
    wokeAt: extra.wokeAt ?? "07:30",
    fellAsleepAt: extra.fellAsleepAt ?? "23:30",
    rating: extra.rating ?? 4,
    drank: extra.drank ?? false,
    screenOffMinutes: extra.screenOffMinutes ?? 30,
    sleepLatencyMinutes: extra.sleepLatencyMinutes ?? 15,
    wokeInNight: extra.wokeInNight ?? false,
    nightWakingMinutes: extra.nightWakingMinutes ?? 0,
    usedSupplement: extra.usedSupplement ?? false,
    windDownHelped: extra.windDownHelped ?? "did_not_use",
    createdAt: extra.createdAt ?? `${morningDate}T12:00:00.000Z`,
    ...extra,
  };
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
      out.push(path);
    }
  }
  return out;
}

const TODAY = "2026-09-18";

describe("backfillableDates", () => {
  it("never returns today, never a date with an existing report, and never a date outside the window", () => {
    const reports = [night("2026-09-17")];
    const dates = backfillableDates(TODAY, reports, null);
    expect(dates).not.toContain(TODAY);
    expect(dates).not.toContain("2026-09-17");
    expect(dates).toEqual(["2026-09-16", "2026-09-15"]);
    expect(dates.every((date) => date < TODAY)).toBe(true);
    expect(BACKFILL_NIGHTS).toBe(3);
    expect(backfillableDates(TODAY, [], null)).toEqual(["2026-09-17", "2026-09-16", "2026-09-15"]);
    expect(backfillableDates(TODAY, [night("2026-09-17"), night("2026-09-16"), night("2026-09-15")], null)).toEqual([]);
  });

  it("keeps dates on or after enrolledAt and drops those before", () => {
    const episode = createEpisode({
      clinicianId: "clin-1",
      enrolledAt: "2026-09-16T08:00:00.000Z",
    });
    expect(backfillableDates(TODAY, [], episode)).toEqual(["2026-09-17", "2026-09-16"]);
  });
});

describe("a report filed for a past date always carries filedLate: true", () => {
  it("stores filedLate even when the incoming row omitted or denied it", () => {
    const incoming = night("2026-09-17", { filedLate: false, rating: 2 });
    const rows = applyBackfill([], incoming, TODAY, null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.filedLate).toBe(true);
    expect(isFiledLate(rows[0]!)).toBe(true);
    expect(isFiledLate(night("2026-09-18"))).toBe(false);
  });
});

describe("a back-filled write never replaces an existing report", () => {
  it("refuses a date that already has a page, even if the caller asks", () => {
    const original = night("2026-09-17", { id: "keep-me", rating: 5 });
    const incoming = night("2026-09-17", { id: "recall", rating: 1, filedLate: true });
    const rows = applyBackfill([original], incoming, TODAY, null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("keep-me");
    expect(rows[0]?.rating).toBe(5);
    expect(rows[0]?.filedLate).toBeUndefined();
  });
});

describe("no code path constructs a report for a past date except the back-fill flow", () => {
  it("applyBackfill is the only writer of filedLate: true, and it never writes today", () => {
    const hits = sourceFiles("src").filter((path) =>
      /filedLate:\s*true/.test(readFileSync(path, "utf8")),
    );
    expect(hits).toEqual(["src/lib/backfill.ts"]);
    expect(applyBackfill([], night(TODAY, { filedLate: true }), TODAY, null)).toEqual([]);
  });
});

describe("filedLate absent on an existing row reads as false; state with no drafts hydrates and saves identically to before", () => {
  it("treats a missing filedLate and missing draft keys as the previous file", () => {
    const payload = {
      researchNotes: "kept",
      demoWeek: true,
      reports: [
        {
          morningDate: "2026-09-10",
          wokeAt: "07:00",
          fellAsleepAt: "23:30",
          rating: 3,
        },
      ],
    };
    const state = hydrateState(payload);
    expect(state.morningDraft).toBeNull();
    expect(state.intakeDraft).toBeNull();
    expect(state.reports[0]?.filedLate).toBeUndefined();
    expect(isFiledLate(state.reports[0]!)).toBe(false);
    expect(JSON.parse(exportState(state))).not.toHaveProperty("morningDraft");
    expect(JSON.parse(exportState(state))).not.toHaveProperty("intakeDraft");

    const roundTrip = hydrateState(JSON.parse(exportState(state)));
    expect(roundTrip.morningDraft).toBeNull();
    expect(roundTrip.intakeDraft).toBeNull();
    expect(roundTrip.reports[0]?.morningDate).toBe("2026-09-10");
    expect(roundTrip.researchNotes).toBe("kept");
    expect(roundTrip).toEqual(state);
  });

  it("rejects a half-valid draft rather than restoring a state nobody authored", () => {
    expect(
      hydrateState({
        morningDraft: { morningDate: "2026-09-17", step: "nope" },
      }).morningDraft,
    ).toBeNull();
    expect(
      hydrateState({
        morningDraft: { morningDate: "2026-09-17", step: 1, id: "looks-like-a-report" },
      }).morningDraft,
    ).toBeNull();
    expect(
      hydrateState({
        intakeDraft: { step: 2, age: 19 },
      }).intakeDraft,
    ).toBeNull();
    const yesterday = shiftIsoDate(todayIsoDate(), -1);
    expect(
      hydrateState({
        morningDraft: { morningDate: yesterday, step: 2, rating: 4 },
      }).morningDraft,
    ).toEqual({ morningDate: yesterday, step: 2, rating: 4 });
  });
});

describe("discard a morning draft whose morningDate is no longer back-fillable", () => {
  it("drops a draft that is already filed, outside the window, or before enrollment, and never writes it back", () => {
    const today = "2026-09-18";
    const live = { morningDate: "2026-09-17", step: 2, rating: 3 as const };
    expect(retainMorningDraft(live, today, [], null)).toEqual(live);
    expect(retainMorningDraft({ morningDate: today, step: 1 }, today, [], null)).toEqual({
      morningDate: today,
      step: 1,
    });
    expect(retainMorningDraft(live, today, [night("2026-09-17")], null)).toBeNull();
    expect(retainMorningDraft({ morningDate: "2026-09-14", step: 1 }, today, [], null)).toBeNull();
    expect(
      retainMorningDraft(
        { morningDate: "2026-09-15", step: 1 },
        today,
        [],
        createEpisode({ clinicianId: "clin-1", enrolledAt: "2026-09-16T08:00:00.000Z" }),
      ),
    ).toBeNull();

    const stale = hydrateState({
      morningDraft: { morningDate: "2026-01-01", step: 3, dreamText: "left behind" },
    });
    expect(stale.morningDraft).toBeNull();
    expect(JSON.parse(exportState({ ...emptyState(), morningDraft: { morningDate: "2026-01-01", step: 3 } }))).not.toHaveProperty(
      "morningDraft",
    );
    expect(
      persistableState({ ...emptyState(), morningDraft: { morningDate: "2026-01-01", step: 3 } }),
    ).not.toHaveProperty("morningDraft");

    const yesterday = shiftIsoDate(todayIsoDate(), -1)!;
    const folded = mergeDiaryStates(
      { ...emptyState(), morningDraft: { morningDate: yesterday, step: 2 } },
      { ...emptyState(), reports: [night(yesterday)] },
    );
    expect(folded.reports[0]?.morningDate).toBe(yesterday);
    expect(folded.morningDraft).toBeNull();
  });
});

describe("a draft never appears in reports, the clinical record, or a study pack", () => {
  const profile: Profile = {
    firstName: "Ada",
    lastName: "",
    name: "Ada",
    age: 34,
    sex: "female",
    heightCm: 168,
    weightKg: 62,
    activity: "light",
    medications: [],
    supplements: [],
    struggles: ["falling"],
    targetSleep: "23:00",
    targetWake: "07:00",
    units: "imperial",
    notificationsEnabled: false,
    onboardingComplete: true,
    email: "",
    phone: "",
    scheduledDays: DEFAULT_SCHEDULED_DAYS,
  };

  it("keeps morningDraft and intakeDraft off TOP_KEYS, PROFILE_KEYS and NIGHT_KEYS", () => {
    const src = readFileSync("src/lib/study.ts", "utf8");
    for (const key of ["morningDraft", "intakeDraft"]) {
      expect(src, key).not.toMatch(new RegExp(`"${key}"`));
    }
  });

  it("does not copy a draft into reports or a study pack", () => {
    const state: CircadiaState = {
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
      morningDraft: {
        morningDate: "2026-09-17",
        step: 3,
        dreamText: "Secret hallway draft that must not leave this device.",
      },
      intakeDraft: { step: 1, age: "34", stimulant: "secret-intake-note" },
    };
    expect(state.reports).toEqual([]);
    const pack = buildStudyPack(state);
    const blob = JSON.stringify(pack);
    expect(blob).not.toMatch(/morningDraft/);
    expect(blob).not.toMatch(/intakeDraft/);
    expect(blob).not.toMatch(/Secret hallway draft/);
    expect(blob).not.toMatch(/secret-intake-note/);
    expect(anonymityViolations(pack, state)).toEqual([]);
  });
});
