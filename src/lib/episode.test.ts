import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { foldEpisode, mergeDiaryStates } from "./diary-fold";
import {
  BASELINE_NIGHTS,
  adherenceUnavailableReason,
  activeWindow,
  createEpisode,
  createTreatmentWindow,
  episodeProgress,
  nextState,
  windowAdherence,
  type Episode,
  type TreatmentWindow,
} from "./episode";
import { nightGeometry } from "./sleep-metrics";
import { emptyState, exportState, hydrateState } from "./storage";
import type { CircadiaState, MorningReport } from "./types";

function report(over: Partial<MorningReport> = {}): MorningReport {
  return {
    id: "n1",
    morningDate: "2026-09-10",
    wokeAt: "07:00",
    fellAsleepAt: "23:30",
    rating: 3,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt: "2026-09-10T12:00:00.000Z",
    inBedAt: "00:30",
    triedToSleepAt: "00:35",
    outOfBedAt: "07:05",
    ...over,
  };
}

function nightsFrom(startDate: string, count: number): MorningReport[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const morningDate = day.toISOString().slice(0, 10);
    return report({ id: `n-${morningDate}`, morningDate, createdAt: `${morningDate}T12:00:00.000Z` });
  });
}

function diary(partial: Partial<CircadiaState> = {}): CircadiaState {
  return { ...emptyState(), ...partial };
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

describe("no TreatmentWindow is constructed from diary-derived data", () => {
  it("prescribedInBed: is an object-literal key in exactly one non-test file, episode.ts", () => {
    const hits = sourceFiles("src").filter((path) => /prescribedInBed\s*:/.test(readFileSync(path, "utf8")));
    expect(hits).toEqual(["src/lib/episode.ts"]);
  });

  it("episode.ts does not import diary-derived modules; forwardMinutes is the one sleep-metrics import", () => {
    const src = readFileSync("src/lib/episode.ts", "utf8");
    expect(src).toContain('import { forwardMinutes } from "@/lib/sleep-metrics"');
    expect(src).not.toMatch(/nightGeometry|weekGeometry|scoreNights/);
    expect(src).not.toMatch(/week-sentence|week-review|morning-reading|advisor|recommendations/);
    expect(src).toContain('import type { MorningReport } from "@/lib/types"');
    expect(src).not.toMatch(/import \{[^}]*\} from ["']@\/lib\/types["']/);
  });
});

describe("windowAdherence returns null, never a number, when no window was active", () => {
  it("returns null for a scored night with no window", () => {
    const night = report();
    expect(nightGeometry(night)).not.toBeNull();
    expect(windowAdherence(night, null)).toBeNull();
    expect(adherenceUnavailableReason(night, null)).toBe("no-window");
    expect(typeof windowAdherence(night, null)).not.toBe("number");
  });
});

describe("adherenceUnavailableReason", () => {
  it("names missing clocks separately from no window, and never falls back to sleep onset", () => {
    const window = createTreatmentWindow({
      prescribedInBed: "00:30",
      prescribedOutOfBed: "07:00",
      setBy: "clin-1",
    });
    const noClocks = report({ inBedAt: undefined, outOfBedAt: undefined, fellAsleepAt: "23:00", wokeAt: "07:00" });
    expect(adherenceUnavailableReason(noClocks, window)).toBe("missing-clocks");
    expect(windowAdherence(noClocks, window)).toBeNull();
    const onlyIn = report({ inBedAt: "00:30", outOfBedAt: undefined });
    expect(windowAdherence(onlyIn, window)).toBeNull();
    const onlyOut = report({ inBedAt: undefined, outOfBedAt: "07:05", fellAsleepAt: "23:30" });
    expect(adherenceUnavailableReason(onlyOut, window)).toBe("missing-clocks");
    expect(windowAdherence(onlyOut, window)).toBeNull();
  });
});

describe("nextState never returns treatment without an active window", () => {
  it("refuses treatment when the window list is empty", () => {
    const episode: Episode = {
      ...createEpisode({ clinicianId: "clin-1", enrolledAt: "2026-09-01T12:00:00.000Z" }),
      state: "treatment",
      windows: [],
    };
    expect(activeWindow(episode)).toBeNull();
    expect(nextState(episode, [], new Date("2026-09-20T12:00:00.000Z"), true)).not.toBe("treatment");
  });
});

describe("nextState never advances past review on its own", () => {
  it("stays on review even when a window is already sitting on the episode", () => {
    const window = createTreatmentWindow({
      prescribedInBed: "00:30",
      prescribedOutOfBed: "07:00",
      setBy: "clin-1",
    });
    const episode: Episode = {
      ...createEpisode({ clinicianId: "clin-1", enrolledAt: "2026-09-01T12:00:00.000Z" }),
      state: "review",
      windows: [window],
    };
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(nextState(episode, nightsFrom("2026-09-01", 20), now, true)).toBe("review");
    expect(nextState(episode, nightsFrom("2026-09-01", 20), now, true)).not.toBe("treatment");
    expect(nextState({ ...episode, state: "maintenance" }, [], now, true)).toBe("maintenance");
    expect(nextState({ ...episode, state: "discharged", dischargedAt: now.toISOString() }, [], now, true)).toBe(
      "discharged",
    );
  });

  it("moves enrolled to baseline only on the intake boolean, never via onboardingComplete", () => {
    const episode = createEpisode({ clinicianId: "clin-1", enrolledAt: "2026-09-01T12:00:00.000Z" });
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(nextState(episode, [], now, false)).toBe("enrolled");
    expect(nextState(episode, [], now, true)).toBe("baseline");
  });

  it("moves baseline to review when the required nights are filed", () => {
    const episode: Episode = {
      ...createEpisode({ clinicianId: "clin-1", enrolledAt: "2026-09-01T00:00:00.000Z" }),
      state: "baseline",
      baselineNights: BASELINE_NIGHTS,
    };
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(episodeProgress(episode, nightsFrom("2026-09-01", 13))?.remaining).toBe(1);
    expect(nextState(episode, nightsFrom("2026-09-01", 13), now, true)).toBe("baseline");
    expect(episodeProgress(episode, nightsFrom("2026-09-01", 14))?.remaining).toBe(0);
    expect(nextState(episode, nightsFrom("2026-09-01", 14), now, true)).toBe("review");
    expect(episodeProgress({ ...episode, state: "review" }, nightsFrom("2026-09-01", 14))).toBeNull();
  });
});

describe("an Episode cannot be created without a clinicianId", () => {
  it("throws on an empty clinicianId and the factory type requires one", () => {
    expect(() => createEpisode({ clinicianId: "" })).toThrow(/clinician/);
    expect(() => createEpisode({ clinicianId: "   " })).toThrow(/clinician/);
    const opened = createEpisode({ clinicianId: "clin-1" });
    expect(opened.clinicianId).toBe("clin-1");
    expect(opened.state).toBe("enrolled");
    expect(opened.rev).toBe(0);
    expect(opened.windows).toEqual([]);
    const src = readFileSync("src/lib/episode.ts", "utf8");
    expect(src).toMatch(/export function createEpisode\(input: \{\s*clinicianId: ClinicianId;/);
    expect(src).not.toMatch(/createEpisode\(input: \{\s*clinicianId\?:/);
  });
});

describe("state with no episode hydrates and saves identically to before", () => {
  it("treats a missing episode key as solo mode without rewriting nights or study", () => {
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
      study: {
        asked: true,
        consented: true,
        participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
    };
    const state = hydrateState(payload);
    expect(state.episode).toBeNull();
    expect(state.researchNotes).toBe("kept");
    expect(state.demoWeek).toBe(true);
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]?.morningDate).toBe("2026-09-10");
    expect(state.study.consented).toBe(true);
    expect(state.study.participantId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");

    const roundTrip = hydrateState(JSON.parse(exportState(state)));
    expect(roundTrip).toEqual(state);

    const folded = mergeDiaryStates(state, hydrateState(payload));
    expect(folded.episode).toBeNull();
    expect(folded.reports[0]?.morningDate).toBe("2026-09-10");
    expect(folded.study.consented).toBe(true);
  });

  it("never synthesises an episode from study.consented or from existing nights", () => {
    const state = hydrateState({
      study: { asked: true, consented: true, participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      reports: nightsFrom("2026-09-01", 14),
    });
    expect(state.episode).toBeNull();
    expect(state.study.consented).toBe(true);
    expect(state.reports).toHaveLength(14);
  });
});

describe("fold preserves an episode in both directions", () => {
  const window: TreatmentWindow = createTreatmentWindow({
    prescribedInBed: "00:30",
    prescribedOutOfBed: "07:00",
    setBy: "clin-1",
  });
  const episode: Episode = {
    ...createEpisode({ clinicianId: "clin-1", enrolledAt: "2026-09-01T12:00:00.000Z" }),
    id: "ep-1",
    rev: 3,
    state: "treatment",
    windows: [window],
  };

  it("keeps local when incoming has none", () => {
    const merged = mergeDiaryStates(diary({ episode }), diary({ episode: null }));
    expect(merged.episode).toEqual(episode);
  });

  it("takes incoming when local has none — the case that failed under ...local", () => {
    const merged = mergeDiaryStates(diary({ episode: null }), diary({ episode }));
    expect(merged.episode).toEqual(episode);
    expect(foldEpisode(null, episode)).toEqual({ episode, conflict: null });
  });

  it("picks the higher rev for the same id, and local on a tie", () => {
    const newer = { ...episode, rev: 4, state: "maintenance" as const };
    expect(foldEpisode(episode, newer).episode?.rev).toBe(4);
    expect(foldEpisode(newer, episode).episode?.rev).toBe(4);
    const tied = { ...episode, state: "review" as const, rev: 3 };
    expect(foldEpisode(episode, tied).episode).toEqual(episode);
  });

  it("keeps local and names the conflict when the ids differ", () => {
    const other = { ...episode, id: "ep-2", rev: 99 };
    const folded = foldEpisode(episode, other);
    expect(folded.episode).toEqual(episode);
    expect(folded.conflict).toEqual({ localId: "ep-1", incomingId: "ep-2" });
    expect(mergeDiaryStates(diary({ episode }), diary({ episode: other })).episode?.id).toBe("ep-1");
  });
});

describe("midnight-crossing windows compute adherence through nightGeometry", () => {
  it("uses forwardMinutes, so 23:45 against a 00:30 window is 45 minutes early", () => {
    const window = createTreatmentWindow({
      prescribedInBed: "00:30",
      prescribedOutOfBed: "07:00",
      setBy: "clin-1",
    });
    const night = report({
      inBedAt: "23:45",
      triedToSleepAt: "23:50",
      wokeAt: "06:55",
      outOfBedAt: "07:10",
    });
    expect(nightGeometry(night)).not.toBeNull();
    const adherence = windowAdherence(night, window);
    expect(adherence).toEqual({ earlyInMinutes: 45, lateOutMinutes: 10, withinWindow: false });
  });

  it("is within the window when both clocks match, including same-minute out of bed", () => {
    const window = createTreatmentWindow({
      prescribedInBed: "23:30",
      prescribedOutOfBed: "07:00",
      setBy: "clin-1",
    });
    const night = report({
      inBedAt: "23:30",
      triedToSleepAt: "23:35",
      wokeAt: "06:50",
      outOfBedAt: "07:00",
    });
    expect(nightGeometry(night)).not.toBeNull();
    expect(windowAdherence(night, window)).toEqual({
      earlyInMinutes: 0,
      lateOutMinutes: 0,
      withinWindow: true,
    });
  });
});

describe("activeWindow", () => {
  it("is the newest window that a later one does not supersede, and only in treatment", () => {
    const first = createTreatmentWindow({
      prescribedInBed: "00:30",
      prescribedOutOfBed: "07:00",
      setBy: "clin-1",
    });
    const second = createTreatmentWindow({
      prescribedInBed: "00:45",
      prescribedOutOfBed: "07:00",
      setBy: "clin-1",
      supersedes: first.id,
    });
    const episode: Episode = {
      ...createEpisode({ clinicianId: "clin-1" }),
      state: "treatment",
      windows: [first, second],
    };
    expect(activeWindow(episode)?.id).toBe(second.id);
    expect(activeWindow({ ...episode, state: "review" })).toBeNull();
  });
});

describe("no episode field ever reaches a study pack", () => {
  it("keeps episode, clinicianId, rationale, and prescribedInBed off the pack allowlists", () => {
    const src = readFileSync("src/lib/study.ts", "utf8");
    for (const key of ["episode", "clinicianId", "rationale", "prescribedInBed"]) {
      expect(src, key).not.toMatch(new RegExp(`"${key}"`));
    }
  });
});
