import { afterEach, describe, expect, it } from "vitest";
import { mergeDiaryStates, morningsAdded } from "./diary-fold";
import { emptyState } from "./storage";
import type { CircadiaState, MorningReport } from "./types";

function night(morningDate: string, createdAt: string): MorningReport {
  return {
    id: `n-${morningDate}`,
    morningDate,
    wokeAt: "07:00",
    fellAsleepAt: "23:00",
    rating: 3,
    drank: false,
    screenOffMinutes: 60,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt,
  };
}

function diary(partial: Partial<CircadiaState>): CircadiaState {
  return { ...emptyState(), ...partial };
}

describe("fold two device diaries", () => {
  afterEach(() => {
    /* pure */
  });

  it("keeps mornings from both copies and prefers the later page on the same date", () => {
    const local = diary({
      reports: [night("2026-09-01", "2026-09-01T12:00:00.000Z")],
      researchNotes: "short",
    });
    const incoming = diary({
      reports: [
        night("2026-09-01", "2026-09-01T18:00:00.000Z"),
        night("2026-09-02", "2026-09-02T12:00:00.000Z"),
      ],
      researchNotes: "a longer note from the other Circadia",
    });
    const merged = mergeDiaryStates(local, incoming);
    expect(merged.reports.map((row) => row.morningDate)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(merged.reports[0]?.createdAt).toBe("2026-09-01T18:00:00.000Z");
    expect(merged.researchNotes).toContain("longer note");
    expect(morningsAdded(local, merged)).toBe(1);
  });

  it("does not take the live consult or the study switch from the incoming copy", () => {
    const local = diary({
      chat: [{ id: "c1", role: "you", text: "here", createdAt: "2026-09-01T12:00:00.000Z" }],
      activeConsultId: "live",
      study: {
        asked: true,
        consented: true,
        participantId: "aaaaaaaa",
        lastSentAt: null,
        lastStatus: null,
        lastError: null,
        rosterSentAt: null,
      },
    });
    const incoming = diary({
      chat: [{ id: "c2", role: "you", text: "there", createdAt: "2026-09-01T13:00:00.000Z" }],
      activeConsultId: "other",
      study: {
        asked: false,
        consented: false,
        participantId: null,
        lastSentAt: null,
        lastStatus: null,
        lastError: null,
        rosterSentAt: null,
      },
    });
    const merged = mergeDiaryStates(local, incoming);
    expect(merged.chat[0]?.text).toBe("here");
    expect(merged.activeConsultId).toBe("live");
    expect(merged.study.consented).toBe(true);
    expect(merged.study.participantId).toBe("aaaaaaaa");
  });
});
