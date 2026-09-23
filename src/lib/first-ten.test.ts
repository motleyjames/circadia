import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const FROZEN_MS = vi.hoisted(() => {
  const now = new Date(2026, 8, 26, 16, 0, 0);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  return now.getTime();
});

import { CheckInFlow } from "@/components/check-in-flow";
import { HelpView } from "@/components/help-view";
import { LibraryView } from "@/components/library-view";
import { OperatorGate } from "@/components/operator-gate";
import { YouView } from "@/components/you-view";
import { CircadiaPreviewTree } from "@/context/circadia-store";
import { HELP_AFTER_CLINIC, HELP_AFTER_SOLO, baselineAfterReply } from "@/lib/consult-baseline";
import { createEpisode } from "@/lib/episode";
import { DURATION_CHIPS, morningDraftHoldsAnswer, showOtherSomnadiaHint } from "@/lib/morning-diary";
import { remindersUnavailableHint } from "@/lib/notify-device";
import { signupPasswordHint } from "@/lib/password";
import { DEFAULT_SCHEDULED_DAYS } from "@/lib/schedule";
import { emptyState } from "@/lib/storage";
import { lastFiledLine, lastFiledWhen } from "@/lib/today-surface";
import type { CircadiaState, MorningReport, Profile } from "@/lib/types";

const FROZEN = new Date(FROZEN_MS);

const profile: Profile = {
  firstName: "Ada",
  lastName: "West",
  name: "Ada West",
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
  notificationsEnabled: true,
  onboardingComplete: true,
  email: "",
  phone: "",
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
};

function night(morningDate: string): MorningReport {
  return {
    id: `n-${morningDate}`,
    morningDate,
    wokeAt: "07:00",
    fellAsleepAt: "23:15",
    rating: 4,
    drank: false,
    screenOffMinutes: 30,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "yes",
    createdAt: `${morningDate}T07:30:00.000Z`,
    inBedAt: "23:00",
    triedToSleepAt: "23:00",
    outOfBedAt: "07:10",
    awakeningCount: 0,
  };
}

function diary(over: Partial<CircadiaState> = {}): CircadiaState {
  return { ...emptyState(), profile, ...over };
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function render(state: CircadiaState, view: ReturnType<typeof createElement>): string {
  return renderToString(createElement(CircadiaPreviewTree, { state }, view));
}

describe("B1 sign-up hint", () => {
  it("derives the visible hint from PASSWORD_MIN", () => {
    expect(signupPasswordHint()).toBe("At least 10 characters. Somnadia will not email or text you.");
    expect(readFileSync("src/components/auth-gate.tsx", "utf8")).toContain("signupPasswordHint()");
    expect(readFileSync("src/components/auth-gate.tsx", "utf8")).not.toContain("At least 8 characters");
  });
});

describe("B3 picking up", () => {
  it("shows once on the first resumed screen, and only when the draft holds an answer", () => {
    const clocksOnly = diary({
      morningDraft: {
        morningDate: "2026-09-26",
        step: 0,
        inBedAt: "23:00",
        triedToSleepAt: "23:00",
        wokeAt: "07:00",
        outOfBedAt: "07:10",
      },
    });
    expect(morningDraftHoldsAnswer(clocksOnly.morningDraft)).toBe(false);
    expect(visibleText(render(clocksOnly, createElement(CheckInFlow)))).not.toContain(
      "Picking up where you left off.",
    );

    const resumed = diary({
      morningDraft: {
        morningDate: "2026-09-26",
        step: 1,
        inBedAt: "23:00",
        triedToSleepAt: "23:00",
        wokeAt: "07:00",
        outOfBedAt: "07:10",
        sleepLatencyMinutes: 20,
      },
    });
    expect(morningDraftHoldsAnswer(resumed.morningDraft)).toBe(true);
    const text = visibleText(render(resumed, createElement(CheckInFlow)));
    expect(text).toContain("Picking up where you left off.");
    expect(text).toContain("How long did it take to fall asleep?");
  });
});

describe("B4 morning clutter", () => {
  it("keeps one Your night header and one duration-chip style", () => {
    expect(DURATION_CHIPS.map((chip) => chip.label)).toEqual([
      "Under 10 min",
      "10 min",
      "20 min",
      "30 min",
      "45 min",
      "1 h",
      "1½ h",
      "2 h",
      "3 h or more",
    ]);
    expect(DURATION_CHIPS.map((chip) => chip.value)).toEqual([5, 10, 20, 30, 45, 60, 90, 120, 180]);
    const html = render(diary(), createElement(CheckInFlow));
    const text = visibleText(html);
    expect(text).toContain("Your night.");
    expect(html).not.toMatch(/tracking-\[0\.28em\][^>]*>Your night</);
    expect(showOtherSomnadiaHint({ filedLate: false, phone: true, inTest: true, lockedCopyExists: true })).toBe(
      false,
    );
    expect(showOtherSomnadiaHint({ filedLate: false, phone: true, inTest: false, lockedCopyExists: false })).toBe(
      false,
    );
    expect(showOtherSomnadiaHint({ filedLate: false, phone: false, inTest: true, lockedCopyExists: false })).toBe(
      true,
    );
    expect(text).toContain("Already filed on the other Somnadia?");
    const later = diary({
      morningDraft: {
        morningDate: "2026-09-26",
        step: 1,
        sleepLatencyMinutes: 10,
      },
    });
    const laterText = visibleText(render(later, createElement(CheckInFlow)));
    expect(laterText).toContain("10 min");
    expect(laterText).not.toContain("Missed a morning?");
  });
});

describe("B6 Operator login", () => {
  it("does not print the default passphrase", () => {
    const text = visibleText(
      renderToString(
        createElement(OperatorGate, { error: null, loading: false, onOpen: () => undefined }),
      ),
    );
    expect(text).not.toContain("circadia-local");
    expect(text).toContain("Set a passphrase before anyone else uses this computer.");
    expect(readFileSync("README.md", "utf8")).toContain("circadia-local");
  });
});

describe("B7 This week", () => {
  it("keeps delete on All testers and drops it from This week", () => {
    expect(readFileSync("src/app/mod/page.tsx", "utf8")).not.toContain("DeleteTesterNights");
    expect(readFileSync("src/app/mod/testers/page.tsx", "utf8")).toContain("DeleteTesterNights");
  });
});

describe("B9 You Study when not in a test", () => {
  it("says Not in a test and keeps the join control", () => {
    const text = visibleText(render(diary(), createElement(YouView)));
    expect(text).toContain("Not in a test");
    expect(text).toContain("Everything stays on this device. If you were sent an invite code, you can join here.");
    expect(text).toContain("Start the shakedown");
    expect(text).not.toContain("Dreams and chat do not");
    expect(text).not.toContain("An invite starts the shakedown");
  });
});

describe("B10 library in a test", () => {
  it("renders Help, not the shelf", () => {
    const state = diary({
      episode: {
        ...createEpisode({
          clinicianId: "doc-1",
          enrolledAt: new Date(2026, 8, 20, 22, 0, 0).toISOString(),
          baselineNights: 14,
        }),
        state: "enrolled",
      },
      study: { ...emptyState().study, consented: true },
    });
    const text = visibleText(render(state, createElement(LibraryView)));
    expect(text).toContain("Help");
    expect(text).toContain(HELP_AFTER_CLINIC);
    expect(text).not.toContain("What we are willing to say.");
    expect(visibleText(render(state, createElement(HelpView)))).toContain(HELP_AFTER_CLINIC);
    expect(baselineAfterReply(false)).toContain("Your Notes open");
    expect(HELP_AFTER_SOLO).toContain("That's the end of the test");
  });
});

describe("B14 Last filed", () => {
  it("uses this morning, yesterday, or the weekday", () => {
    expect(lastFiledWhen("2026-09-26", FROZEN)).toBe("this morning");
    expect(lastFiledWhen("2026-09-25", FROZEN)).toBe("yesterday");
    expect(lastFiledWhen("2026-09-20", FROZEN)).toBe("Sunday");
    expect(lastFiledLine([night("2026-09-26")], FROZEN)).toBe("Last filed: this morning");
    expect(lastFiledLine([night("2026-09-25")], FROZEN)).toBe("Last filed: yesterday");
    expect(lastFiledLine([night("2026-09-20")], FROZEN)).toBe("Last filed: Sunday");
  });
});

describe("B15 Mac reminders", () => {
  it("names the phone app inside the Mac app", () => {
    expect(remindersUnavailableHint(true)).toBe("Reminders come from the phone app.");
    expect(remindersUnavailableHint(false)).not.toContain("Reminders come from the phone app.");
    expect(remindersUnavailableHint(true)).not.toContain("browser tab");
  });
});
