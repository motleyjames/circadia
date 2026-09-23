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

import { BottomNav } from "@/components/bottom-nav";
import { ChatBar } from "@/components/chat-bar";
import { HelpView } from "@/components/help-view";
import { InsightsView } from "@/components/insights-view";
import { LibraryView } from "@/components/library-view";
import { SidebarNav } from "@/components/sidebar-nav";
import { TonightView } from "@/components/tonight-view";
import { YouView } from "@/components/you-view";
import { CircadiaPreviewTree } from "@/context/circadia-store";
import {
  BASELINE_AFTER_CLINIC,
  BASELINE_AFTER_SOLO,
  HELP_AFTER_CLINIC,
  HELP_AFTER_SOLO,
  BASELINE_CLOCK,
  BASELINE_MISSED,
  BASELINE_WHY,
  baselineChangeReply,
} from "@/lib/consult-baseline";
import { createEpisode } from "@/lib/episode";
import { hasSleepFigure } from "@/lib/observation";
import { MEDICAL_DISCLAIMER } from "@/lib/safety-copy";
import { emptyState } from "@/lib/storage";
import type { CircadiaState, MorningReport, Profile } from "@/lib/types";

const FROZEN = new Date(FROZEN_MS);
const ENROLLED = new Date(2026, 8, 20, 22, 0, 0);

const VOCAB =
  /meditat|breath|noise|soundscape|consult|library|efficiency|score|streak|chronotype|night owl|7–9 hours|clock that holds/i;

const HELP_WRONG =
  "If you've fallen asleep while driving, or someone has seen you stop breathing in your sleep, please see a doctor soon — don't wait for the end of the test. If you're thinking about harming yourself, call or text 988 in the US, or your local emergency number.";

const OLD_DISCLAIMER =
  "Educational tool. Not medical care. If you stop breathing at night, fall asleep while driving, or cannot stay awake, that is a clinic, not a chat bar.";

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
  scheduledDays: [false, true, true, true, true, true, false],
};

function episode(over: Partial<ReturnType<typeof createEpisode>> = {}) {
  return {
    ...createEpisode({
      clinicianId: "doc-1",
      enrolledAt: ENROLLED.toISOString(),
      baselineNights: 14,
    }),
    ...over,
  };
}

function night(morningDate: string, extra: Partial<MorningReport> = {}): MorningReport {
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
    ...extra,
  };
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

function stabilizeTonight(html: string): string {
  return html
    .replace(/orb-bloom-[^"']+/g, "orb-bloom-ID")
    .replace(/orb-arc-[^"']+/g, "orb-arc-ID")
    .replace(/\d{1,2}:\d{2}:\d{2}/g, "HH:MM:SS");
}

function stabilizeYou(html: string): string {
  return html
    .replaceAll("0.20.0", "APP_VERSION")
    .replaceAll("0.21.0", "APP_VERSION")
    .replaceAll("0.22.0", "APP_VERSION")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll(OLD_DISCLAIMER, "MEDICAL_DISCLAIMER")
    .replaceAll(MEDICAL_DISCLAIMER, "MEDICAL_DISCLAIMER");
}

function stripKnownSafety(text: string): string {
  return text
    .replaceAll(HELP_WRONG, "")
    .replaceAll(MEDICAL_DISCLAIMER, "")
    .replaceAll(BASELINE_WHY, "")
    .replaceAll(BASELINE_CLOCK, "")
    .replaceAll(BASELINE_MISSED, "")
    .replaceAll(BASELINE_AFTER_SOLO, "")
    .replaceAll(BASELINE_AFTER_CLINIC, "")
    .replaceAll(HELP_AFTER_SOLO, "")
    .replaceAll(HELP_AFTER_CLINIC, "")
    .replaceAll(baselineChangeReply(false), "")
    .replaceAll(baselineChangeReply(true), "");
}

function render(state: CircadiaState, view: ReturnType<typeof createElement>): string {
  return renderToString(createElement(CircadiaPreviewTree, { state }, view));
}

function diary(over: Partial<CircadiaState> = {}): CircadiaState {
  return { ...emptyState(), profile, ...over };
}

function enrolledDaysAgo(days: number, hour = 22): string {
  const enrolled = new Date(FROZEN);
  enrolled.setHours(hour, 0, 0, 0);
  enrolled.setDate(enrolled.getDate() - days);
  return enrolled.toISOString();
}

function observingState(over: Partial<CircadiaState> = {}): CircadiaState {
  return diary({
    episode: {
      ...createEpisode({
        clinicianId: "doc-1",
        enrolledAt: enrolledDaysAgo(5),
        baselineNights: 14,
      }),
      state: "enrolled",
    },
    study: { ...emptyState().study, consented: true },
    ...over,
  });
}

function completeState(solo = false): CircadiaState {
  return diary({
    episode: episode({ state: "treatment", clinicianId: solo ? null : "doc-1" }),
    reports: [night("2026-10-04")],
  });
}

async function renderTonightAt(state: CircadiaState, when: Date): Promise<string> {
  vi.setSystemTime(when);
  vi.resetModules();
  const { createElement: el } = await import("react");
  const { renderToString: toString } = await import("react-dom/server");
  const { CircadiaPreviewTree: Tree } = await import("@/context/circadia-store");
  const { TonightView: View } = await import("@/components/tonight-view");
  const html = toString(el(Tree, { state }, el(View)));
  vi.setSystemTime(FROZEN);
  return html;
}

describe("C1 test shell", () => {
  it("phone and Mac nav show Today, Record, Help, You while in a test", () => {
    const state = observingState();
    const phone = visibleText(render(state, createElement(BottomNav)));
    const mac = visibleText(render(state, createElement(SidebarNav)));
    for (const text of [phone, mac]) {
      expect(text).toContain("Today");
      expect(text).toContain("Record");
      expect(text).toContain("Help");
      expect(text).toContain("You");
      expect(text).not.toContain("Tonight");
      expect(text).not.toContain("Morning");
      expect(text).not.toContain("Notes");
      expect(text).not.toContain("Library");
    }
    expect(mac).toContain("In the test · Night 6 of 14");
  });

  it("sidebar says Test complete after night 14", () => {
    const text = visibleText(render(completeState(), createElement(SidebarNav)));
    expect(text).toContain("Test complete");
    expect(text).not.toContain("Night 15");
  });

  it("app shell hides Ask and both Consult surfaces in a test", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain("hideAsk={testing}");
    expect(shell).toContain("{testing ? null : <ChatBar variant=\"rail\" />}");
    expect(shell).toContain("variant=\"sheet\"");
  });
});

describe("C2 Today", () => {
  it("enrollment day is Night 1, first morning tomorrow, no action", () => {
    const state = diary({
      episode: {
        ...createEpisode({
          clinicianId: "doc-1",
          enrolledAt: new Date(2026, 8, 26, 10, 0, 0).toISOString(),
          baselineNights: 14,
        }),
        state: "enrolled",
      },
    });
    const text = visibleText(render(state, createElement(TonightView)));
    expect(text).toContain("Night 1 of 14");
    expect(text).toContain("Your first morning is tomorrow.");
    expect(text).toContain("No mornings yet");
    expect(text).not.toContain("Fill in this morning's diary");
    expect(text).not.toContain("Guided meditations");
  });

  it("morning due offers the diary and no orb", () => {
    const text = visibleText(render(observingState(), createElement(TonightView)));
    expect(text).toContain("Night 6 of 14");
    expect(text).toContain("Your diary for last night is ready.");
    expect(text).toContain("Fill in this morning's diary");
    expect(render(observingState(), createElement(TonightView))).toContain("/check-in");
    expect(text).not.toContain("Guided meditations");
    expect(hasSleepFigure(text)).toBe(false);
  });

  it("filed today is evening copy with no action", async () => {
    const html = await renderTonightAt(
      diary({
        episode: episode({ state: "enrolled" }),
        reports: [night("2026-09-26")],
      }),
      new Date(2026, 8, 26, 16, 0, 0),
    );
    const text = visibleText(html);
    expect(text).toContain("Night 7 of 14");
    expect(text).toContain("Nothing to change tonight. Sleep the way you usually do.");
    expect(text).toContain("Last filed: this morning");
    expect(text).not.toContain("Fill in this morning's diary");
  });

  it("night-14 morning unfiled after noon uses the almost-done copy", async () => {
    const html = await renderTonightAt(
      diary({ episode: episode({ state: "enrolled" }) }),
      new Date(2026, 9, 4, 18, 0, 0),
    );
    const text = visibleText(html);
    expect(text).toContain("The test is almost done");
    expect(text).toContain("One morning left to file.");
    expect(text).not.toContain("Night 15");
  });

  it("test complete thanks the clinician reader, or the solo tester", () => {
    const clinic = visibleText(render(completeState(false), createElement(TonightView)));
    expect(clinic).toContain("Your diary is complete");
    expect(clinic).toContain("Thank you. Your clinician will go through it with you.");
    const solo = visibleText(render(completeState(true), createElement(TonightView)));
    expect(solo).toContain("Thank you for testing Somnadia.");
    expect(solo).not.toContain("clinician will go through");
  });
});

describe("C3 Record", () => {
  it("during observation keeps the closed notes text", () => {
    const text = visibleText(render(observingState({ reports: [night("2026-09-22")] }), createElement(InsightsView)));
    expect(text).toContain("Record");
    expect(text).toContain("Your diary opens after night 14.");
    expect(text).toContain(
      "Until then, Somnadia keeps your diary without showing you numbers, so the test sees your usual sleep.",
    );
    expect(text).not.toContain("Notes");
    expect(hasSleepFigure(text)).toBe(false);
  });

  it("after the baseline lists her answers, missing and late nights, and nothing computed", () => {
    const state = diary({
      episode: episode({ state: "treatment" }),
      reports: [
        night("2026-09-21"),
        night("2026-09-23", { filedLate: true, drank: true, drinkCount: 2 }),
      ],
    });
    const text = visibleText(render(state, createElement(InsightsView)));
    expect(text).toContain("Your diary");
    expect(text).toContain("Your answers, as you gave them. Your clinician reads the same record.");
    expect(text).toContain("Into bed");
    expect(text).toContain("Tried to sleep");
    expect(text).toContain("Final waking");
    expect(text).toContain("Out of bed");
    expect(text).toContain("Time to fall asleep");
    expect(text).toContain("Wakings");
    expect(text).toContain("Time awake");
    expect(text).toContain("Quality");
    expect(text).toContain("Anything different the day before");
    expect(text).toContain("Not filed");
    expect(text).toContain("Filed later");
    expect(text).not.toContain("The week.");
    expect(text).not.toMatch(/efficiency/i);
    expect(text).not.toContain("best nights");
    expect(text).not.toContain("worst nights");
  });
});

describe("C4 Help", () => {
  it("renders the imported baseline answers, consent link, leave, safety, and contact", () => {
    const text = visibleText(render(observingState(), createElement(HelpView)));
    expect(text).toContain("About this diary");
    expect(text).toContain(BASELINE_WHY);
    expect(text).toContain(BASELINE_CLOCK);
    expect(text).toContain(HELP_AFTER_CLINIC);
    expect(text).not.toContain(BASELINE_AFTER_CLINIC);
    expect(text).toContain(BASELINE_MISSED);
    expect(text).toContain(baselineChangeReply(false));
    expect(text).toContain("What's shared");
    expect(text).toContain("Read the consent you accepted");
    expect(text).toContain("Leaving the test");
    expect(text).toContain("You can leave from You → Leave the test");
    expect(text).toContain(HELP_WRONG);
    expect(text).toContain("hello@somnadia.com");
    expect(text).not.toContain("Why this one, today");
    expect(text).not.toMatch(/\bAsk\b/);
  });
});

describe("C5 You in a test", () => {
  it("keeps account, morning reminders, the test, usual times, privacy and about", () => {
    const text = visibleText(render(observingState(), createElement(YouView)));
    expect(text).toContain("Account");
    expect(text).toContain("First name");
    expect(text).toContain("Reminders");
    expect(text).toContain("One reminder each morning during the test");
    expect(text).toContain("In the test");
    expect(text).toContain("Leave the test");
    expect(text).toContain("bedtime");
    expect(text).toContain("get-up time");
    expect(text).toContain("Privacy");
    expect(text).toContain("Read the consent you accepted");
    expect(text).toContain("hello@somnadia.com");
    expect(text).toContain("Erase this device");
    expect(text).not.toContain("Asleep-by");
    expect(text).not.toContain("Most people your age need");
    expect(text).not.toContain("What notes may know");
    expect(text).not.toContain("BMI");
    expect(text).not.toContain("This device");
    expect(text).not.toContain("Load sample week");
    expect(text).not.toContain("Fold a locked");
  });
});

describe("vocabulary guard", () => {
  it("Today, Record, Help and You stay free of consumer-app language during and after the baseline", () => {
    const during = observingState({ reports: [night("2026-09-22")] });
    const after = completeState();
    after.reports = [night("2026-09-21"), night("2026-10-04")];
    for (const state of [during, after]) {
      const today = stripKnownSafety(visibleText(render(state, createElement(TonightView))));
      const help = stripKnownSafety(visibleText(render(state, createElement(HelpView))));
      const you = stripKnownSafety(visibleText(render(state, createElement(YouView))));
      for (const text of [today, help]) {
        expect(text).not.toMatch(VOCAB);
        expect(hasSleepFigure(text)).toBe(false);
      }
      expect(you).not.toMatch(VOCAB);
      expect(
        hasSleepFigure(
          you.replace(/\b\d{1,2}:\d{2}\b/g, "").replaceAll("0.22.0", "").replaceAll("0.21.0", "").replaceAll("0.20.0", ""),
        ),
      ).toBe(false);
      const record = stripKnownSafety(visibleText(render(state, createElement(InsightsView))));
      expect(record).not.toMatch(VOCAB);
      if (state === during) {
        expect(hasSleepFigure(record)).toBe(false);
      }
    }
  });
});

describe("C6 intake Neither", () => {
  it("Neither is stored as an empty struggles array", () => {
    const src = readFileSync("src/components/onboarding.tsx", "utf8");
    expect(src).toContain('problem === "neither" ? []');
    expect(src).toContain('id: "neither"');
    expect(src).toContain("I'm here to help test.");
    expect(src).not.toContain("We do not treat them as one complaint.");
    expect(src).not.toContain("Most people your age need");
    expect(src).toContain("Which mornings do you have to be up at a set time?");
    expect(src).toContain("Do you take anything that affects sleep?");
    expect(src).toContain("A morning reminder");
    expect(src).toContain("It never sends anything overnight.");
  });
});

describe("C7 brand line", () => {
  it("brand line is The sleep diary your clinician reads", () => {
    const line = "The sleep diary your clinician reads.";
    expect(readFileSync("src/components/brand-stage.tsx", "utf8")).toContain(line);
    expect(readFileSync("phone/ios/App/App/SceneDelegate.swift", "utf8")).toContain(line);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain(line);
    expect(readFileSync("src/lib/native-open.test.ts", "utf8")).toContain(line);
  });
});

describe("nobody-else-changes", () => {
  it("Tonight, Notes, Library, Consult and You match the pre-edit fixtures", () => {
    const state = diary({ episode: null });
    expect(stabilizeTonight(render(state, createElement(TonightView))), "Tonight").toBe(
      readFileSync("src/lib/consumer-tonight.fixture.html", "utf8"),
    );
    expect(render(state, createElement(InsightsView)), "Notes").toBe(
      readFileSync("src/lib/consumer-notes.fixture.html", "utf8"),
    );
    expect(render(state, createElement(LibraryView)), "Library").toBe(
      readFileSync("src/lib/consumer-library.fixture.html", "utf8"),
    );
    expect(render(state, createElement(ChatBar, { variant: "rail" })), "Consult").toBe(
      readFileSync("src/lib/consumer-consult.fixture.html", "utf8"),
    );
    expect(stabilizeYou(render(state, createElement(YouView))), "You").toBe(
      stabilizeYou(readFileSync("src/lib/consumer-you.fixture.html", "utf8")),
    );
  });
});
