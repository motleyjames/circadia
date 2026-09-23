import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const FROZEN_MS = vi.hoisted(() => {
  const now = new Date(2026, 8, 23, 16, 0, 0);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  return now.getTime();
});

import { ChatBar } from "@/components/chat-bar";
import { CheckInFlow } from "@/components/check-in-flow";
import { ConsentScreen } from "@/components/consent-screen";
import { LibraryView } from "@/components/library-view";
import { Onboarding } from "@/components/onboarding";
import { StudyGate } from "@/components/study-gate";
import { TonightView } from "@/components/tonight-view";
import { YouView } from "@/components/you-view";
import { CircadiaPreviewTree } from "@/context/circadia-store";
import {
  CONSENT_FAULT_DISCLOSURE,
  CONSENT_VERSION,
  DISCLOSURE_GROUP_SUMMARIES,
  DISCLOSURE_LINES,
  capDisclosureLine,
  disclosureGroupItems,
} from "@/lib/consent";
import { applySampleWeek } from "@/lib/demo";
import { createEpisode } from "@/lib/episode";
import { emptyState } from "@/lib/storage";
import type { CircadiaState, ConsultThread, MorningReport, Profile } from "@/lib/types";

const FROZEN = new Date(FROZEN_MS);

const profile: Profile = {
  firstName: "Ada",
  lastName: "West",
  name: "Ada West",
  age: 34,
  sex: "female",
  heightCm: 170,
  weightKg: 68,
  bodyConfirmed: true,
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
    wokeInNight: true,
    nightWakingMinutes: 30,
    usedSupplement: false,
    windDownHelped: "yes",
    createdAt: `${morningDate}T07:30:00.000Z`,
    inBedAt: "23:00",
    triedToSleepAt: "23:00",
    outOfBedAt: "07:10",
    awakeningCount: 1,
    ...extra,
  };
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function render(state: CircadiaState, view: ReturnType<typeof createElement>): string {
  return renderToString(createElement(CircadiaPreviewTree, { state }, view));
}

function diary(over: Partial<CircadiaState> = {}): CircadiaState {
  return { ...emptyState(), profile, ...over };
}

function enrolledToday(): CircadiaState {
  return diary({
    episode: {
      ...createEpisode({
        clinicianId: "doc-1",
        enrolledAt: new Date(2026, 8, 23, 10, 0, 0).toISOString(),
        baselineNights: 14,
      }),
      state: "enrolled",
    },
    study: { ...emptyState().study, consented: true, consentVersion: CONSENT_VERSION },
  });
}

const priorConsult: ConsultThread = {
  id: "consult-prior-1",
  title: "I was up 30 minutes",
  createdAt: "2026-09-20T12:00:00.000Z",
  updatedAt: "2026-09-20T12:01:00.000Z",
  messages: [
    {
      id: "m1",
      role: "you",
      text: "I was up 30 minutes",
      createdAt: "2026-09-20T12:00:00.000Z",
    },
    {
      id: "m2",
      role: "circadia",
      text: "Get up after 20 minutes.",
      createdAt: "2026-09-20T12:01:00.000Z",
    },
  ],
};

describe("A1 intake defaults stay empty", () => {
  it("age, height and weight start empty and Continue stays disabled", () => {
    const html = render(emptyState(), createElement(Onboarding));
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="19"');
    expect(html).not.toContain('value="5"');
    expect(html).not.toContain('value="10"');
    expect(html).not.toContain('value="145"');
    expect(html).toContain("disabled");
    expect(visibleText(html)).toContain("Add your age to continue.");
  });
});

describe("A2 usual times", () => {
  it("intake step 3 asks both clocks; You clock labels change only while observing", () => {
    const src = readFileSync("src/components/onboarding.tsx", "utf8");
    expect(src).toContain("When do you usually get into bed?");
    expect(src).toContain("When do you usually get out of bed?");
    expect(src).not.toContain("Asleep-by is figured from that");

    const observing = visibleText(render(enrolledToday(), createElement(YouView)));
    expect(observing).toContain("bedtime");
    expect(observing).toContain("get-up time");
    expect(observing).not.toMatch(/\bAsleep-by\b/);
    expect(observing).not.toMatch(/\bWake\b/);

    const solo = visibleText(render(diary(), createElement(YouView)));
    expect(solo).toContain("Asleep-by");
    expect(solo).toContain("Wake");
    expect(solo).not.toContain("Usual bedtime");
  });
});

describe("A3 enrollment morning is not offered", () => {
  it("Tonight on the enrollment afternoon shows Your first morning is tomorrow", () => {
    const text = visibleText(render(enrolledToday(), createElement(TonightView)));
    expect(text).toContain("Your first morning is tomorrow.");
    expect(text).not.toContain("File this morning");
    expect(text).not.toContain("Start the morning interview");
  });

  it("the morning after enrollment does not offer the enrollment day as missed", () => {
    vi.setSystemTime(new Date(2026, 8, 24, 8, 0, 0));
    const state = diary({
      episode: {
        ...createEpisode({
          clinicianId: "doc-1",
          enrolledAt: new Date(2026, 8, 23, 22, 0, 0).toISOString(),
          baselineNights: 14,
        }),
        state: "enrolled",
      },
    });
    const text = visibleText(render(state, createElement(CheckInFlow)));
    vi.setSystemTime(FROZEN);
    expect(text).not.toContain("Sep 23");
    expect(text).not.toContain("Missed a morning?");
  });
});

describe("A4 sample week", () => {
  it("is hidden in You once an episode or consent exists, and the action no-ops", () => {
    expect(visibleText(render(diary(), createElement(YouView)))).toContain("Load sample week");
    expect(visibleText(render(enrolledToday(), createElement(YouView)))).not.toContain("Load sample week");
    const consented = diary({
      study: { ...emptyState().study, consented: true, consentVersion: CONSENT_VERSION },
    });
    expect(visibleText(render(consented, createElement(YouView)))).not.toContain("Load sample week");

    const before = diary({
      episode: enrolledToday().episode,
      reports: [night("2026-09-22")],
    });
    expect(applySampleWeek(before)).toBe(before);
    const consentedOnly = diary({
      study: { ...emptyState().study, consented: true },
      reports: [night("2026-09-22")],
    });
    expect(applySampleWeek(consentedOnly)).toBe(consentedOnly);
    const open = diary({ reports: [night("2026-09-22")] });
    expect(applySampleWeek(open).demoWeek).toBe(true);
  });
});

describe("A5 library morning-reading card", () => {
  it("does not render Why this one, today while observing", () => {
    const filed = enrolledToday();
    filed.reports = [night("2026-09-24")];
    const observing = visibleText(render(filed, createElement(LibraryView)));
    expect(observing).not.toContain("Why this one, today");

    const open = visibleText(
      render(diary({ reports: [night("2026-09-22")] }), createElement(LibraryView)),
    );
    expect(open).toContain("Why this one, today");
  });
});

describe("A6 consult history while observing", () => {
  it("hides History and shows the night-14 line; New still works", () => {
    const parked = enrolledToday();
    parked.consultHistory = [priorConsult];
    const parkedText = visibleText(render(parked, createElement(ChatBar, { variant: "rail" })));
    expect(parkedText).toContain("Your earlier consults open again after night 14.");
    expect(parkedText).not.toMatch(/\bHistory\b/);
    expect(parkedText).not.toContain("I was up 30 minutes");
    expect(parkedText).not.toContain("Get up after 20 minutes.");

    const live = enrolledToday();
    live.consultHistory = [priorConsult];
    live.chat = [
      {
        id: "live-1",
        role: "you",
        text: "Why fourteen nights?",
        createdAt: "2026-09-23T16:00:00.000Z",
      },
    ];
    live.activeConsultId = "live-thread";
    const liveText = visibleText(render(live, createElement(ChatBar, { variant: "rail" })));
    expect(liveText).toContain("New");
    expect(liveText).toContain("Why fourteen nights?");
    expect(liveText).toContain("Your earlier consults open again after night 14.");
    expect(liveText).not.toMatch(/\bHistory\b/);
  });
});

describe("A8 rendered consent", () => {
  it("shows the v5 disclosure, including See every item", () => {
    expect(CONSENT_VERSION).toBe(5);
    const html = render(emptyState(), createElement(ConsentScreen, { onNotNow: () => undefined }));
    const text = visibleText(html);
    expect(text).toContain(CONSENT_FAULT_DISCLOSURE);
    expect(text).toContain(DISCLOSURE_GROUP_SUMMARIES["About you"]);
    expect(text).toContain("when you joined");
    expect(text).toContain("The dates of your nights");
    expect(text).toContain("See every item");
    expect(text).toContain(capDisclosureLine(DISCLOSURE_LINES.targetSleep));
    expect(text).toContain(capDisclosureLine(DISCLOSURE_LINES.targetWake));
    for (const heading of ["About you", "Each morning", "How the test runs", "Safety notes"] as const) {
      for (const item of disclosureGroupItems(heading)) {
        expect(text).toContain(capDisclosureLine(item.line));
      }
    }
  });
});

describe("A9 study gate", () => {
  it("asks for the invite and points at the next screen", () => {
    const text = visibleText(render(emptyState(), createElement(StudyGate, { onNotNow: () => undefined })));
    expect(text).toContain("Joining a test?");
    expect(text).toContain("Enter the invite code you were sent. The next screen explains exactly what is shared.");
    expect(text).toContain("Join with this invite");
    expect(text).toContain("Not joining — keep everything on this device");
    expect(text).not.toContain("pipeline");
    expect(text).not.toContain("roster card");
    expect(text).not.toContain("James");
  });
});

describe("A10 You → Study", () => {
  it("shows In the test, the night count, Last sent, and Leave the test", () => {
    const state = enrolledToday();
    state.study = {
      ...state.study,
      consented: true,
      lastStatus: "sent",
      lastSentAt: "2026-09-23T15:00:00.000Z",
    };
    const text = visibleText(render(state, createElement(YouView)));
    expect(text).toContain("In the test");
    expect(text).toContain("Night 1 of 14");
    expect(text).toContain("Last sent");
    expect(text).toContain("Leave the test");
    expect(text).not.toContain("Pipeline on");
    expect(text).not.toContain("Last reached James");
    expect(text).not.toContain("Dreams and chat stay here");

    const held = enrolledToday();
    held.study = { ...held.study, consented: true, lastStatus: "held" };
    expect(visibleText(render(held, createElement(YouView)))).toContain(
      "Waiting to send — it will go when you're online.",
    );
  });
});
