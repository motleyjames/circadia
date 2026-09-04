import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HORIZON_DAYS,
  MORNING_DELAY_MINUTES,
  WEEKLY_MIN_NIGHTS,
  pingId,
  planNotifications,
  weeklyClock,
  weeklyLine,
  withinQuietHours,
} from "@/lib/sleep-notifications";
import { weekGeometry } from "@/lib/sleep-metrics";
import type { MorningReport, Profile } from "@/lib/types";

function profile(over: Partial<Profile> = {}): Profile {
  return {
    firstName: "Ada",
    lastName: "L",
    email: "ada@example.com",
    age: 17,
    heightCm: 170,
    weightKg: 62,
    activity: "moderate",
    struggles: ["falling_asleep"],
    targetSleep: "23:00",
    targetWake: "07:00",
    units: "imperial",
    notificationsEnabled: true,
    onboardingComplete: true,
    // Sunday … Saturday. School Monday–Friday.
    scheduledDays: [false, true, true, true, true, true, false],
    ...over,
  } as Profile;
}

function night(morningDate: string, over: Partial<MorningReport> = {}): MorningReport {
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
    ...over,
  };
}

/** Wednesday 2 September 2026, 9am — before every ping of that day. */
const WED_MORNING = new Date(2026, 8, 2, 9, 0, 0);

describe("the quiet window", () => {
  it("covers the whole night from screens-down to the morning ping", () => {
    const inside = ["22:01", "23:00", "00:30", "03:00", "06:59", "07:24"];
    for (const clock of inside) {
      expect(withinQuietHours(clock, "23:00", "07:00"), clock).toBe(true);
    }
  });

  it("leaves the evening and the day open", () => {
    for (const clock of ["07:26", "09:00", "15:00", "20:00", "21:59"]) {
      expect(withinQuietHours(clock, "23:00", "07:00"), clock).toBe(false);
    }
  });

  it("holds for a night shift, where the window does not cross midnight", () => {
    // Asleep at 9am, up at 5pm. Screens down 8am, morning ping 5:25pm.
    expect(withinQuietHours("10:00", "09:00", "17:00")).toBe(true);
    expect(withinQuietHours("23:00", "09:00", "17:00")).toBe(false);
    expect(withinQuietHours("02:00", "09:00", "17:00")).toBe(false);
  });

  it("never schedules anything inside it", () => {
    for (const target of [
      { targetSleep: "23:00", targetWake: "07:00" },
      { targetSleep: "01:30", targetWake: "09:30" },
      { targetSleep: "21:00", targetWake: "05:00" },
      { targetSleep: "09:00", targetWake: "17:00" },
    ]) {
      const pings = planNotifications(
        { profile: profile(target), reports: sevenNights() },
        WED_MORNING,
      );
      expect(pings.length).toBeGreaterThan(0);
      for (const ping of pings) {
        const clock = `${String(ping.at.getHours()).padStart(2, "0")}:${String(ping.at.getMinutes()).padStart(2, "0")}`;
        expect(
          withinQuietHours(clock, target.targetSleep, target.targetWake),
          `${ping.kind} at ${clock} for ${JSON.stringify(target)}`,
        ).toBe(false);
      }
    }
  });
});

function sevenNights(): MorningReport[] {
  return [
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
  ].map((d) => night(d));
}

describe("planning", () => {
  it("sends nothing at all when notifications are off", () => {
    expect(
      planNotifications(
        { profile: profile({ notificationsEnabled: false }), reports: sevenNights() },
        WED_MORNING,
      ),
    ).toEqual([]);
  });

  it("puts screens down an hour before the sleep target", () => {
    const pings = planNotifications({ profile: profile(), reports: [] }, WED_MORNING);
    const first = pings.find((p) => p.kind === "screens-down")!;
    expect(first.at.getHours()).toBe(22);
    expect(first.at.getMinutes()).toBe(0);
    expect(first.body).toContain("11 pm");
    // The cue is the notification. It must not ask to be opened.
    expect(first.body).toMatch(/no need to open this/i);
  });

  it("does not ping a morning that is already filed", () => {
    const today = planNotifications(
      { profile: profile(), reports: [night("2026-09-02")] },
      new Date(2026, 8, 2, 5, 0, 0),
    ).filter((p) => p.kind === "morning");
    // 2 Sep is filed, so the first morning ping is 3 Sep.
    expect(today[0]!.at.getDate()).toBe(3);
  });

  it("pings a morning that is not filed yet", () => {
    const pings = planNotifications(
      { profile: profile(), reports: [] },
      new Date(2026, 8, 2, 5, 0, 0),
    ).filter((p) => p.kind === "morning");
    expect(pings[0]!.at.getDate()).toBe(2);
    expect(pings[0]!.at.getHours()).toBe(7);
    expect(pings[0]!.at.getMinutes()).toBe(MORNING_DELAY_MINUTES);
  });

  it("never schedules anything in the past", () => {
    const pings = planNotifications(
      { profile: profile(), reports: sevenNights() },
      new Date(2026, 8, 2, 23, 30, 0),
    );
    for (const ping of pings) {
      expect(ping.at.getTime()).toBeGreaterThan(new Date(2026, 8, 2, 23, 30, 0).getTime());
    }
  });

  it("stays inside the horizon and under the platform's pending cap", () => {
    const pings = planNotifications({ profile: profile(), reports: [] }, WED_MORNING);
    expect(pings.length).toBeLessThanOrEqual(64);
    const last = pings[pings.length - 1]!;
    const days = (last.at.getTime() - WED_MORNING.getTime()) / 86_400_000;
    expect(days).toBeLessThan(HORIZON_DAYS);
  });

  it("hands back one id per kind per day, so replanning replaces instead of stacking", () => {
    const once = planNotifications({ profile: profile(), reports: sevenNights() }, WED_MORNING);
    const twice = planNotifications({ profile: profile(), reports: sevenNights() }, WED_MORNING);
    expect(once.map((p) => p.id)).toEqual(twice.map((p) => p.id));
    expect(new Set(once.map((p) => p.id)).size).toBe(once.length);
  });

  it("gives different days different ids", () => {
    const a = pingId("screens-down", new Date(2026, 8, 2));
    const b = pingId("screens-down", new Date(2026, 8, 3));
    const c = pingId("morning", new Date(2026, 8, 2));
    expect(new Set([a, b, c]).size).toBe(3);
    for (const id of [a, b, c]) expect(id).toBeLessThan(2 ** 31);
  });

  it("returns pings in the order they will fire", () => {
    const pings = planNotifications({ profile: profile(), reports: [] }, WED_MORNING);
    const times = pings.map((p) => p.at.getTime());
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });
});

describe("the weekly read", () => {
  it("says nothing under four scored nights", () => {
    expect(weeklyLine(null)).toBeNull();
    for (let n = 0; n < WEEKLY_MIN_NIGHTS; n += 1) {
      const reports = sevenNights().slice(0, n);
      expect(weeklyLine(weekGeometry(reports)), `${n} nights`).toBeNull();
    }
  });

  it("carries the finding itself, so an unopened phone still learns it", () => {
    const line = weeklyLine(weekGeometry(sevenNights()))!;
    expect(line).toMatch(/\d+% efficiency/);
    expect(line).toMatch(/asleep/);
    // No teaser wording anywhere.
    expect(line).not.toMatch(/tap|open|see more|check the app/i);
  });

  it("is not scheduled at all when there is nothing to say", () => {
    const pings = planNotifications({ profile: profile(), reports: [] }, WED_MORNING);
    expect(pings.some((p) => p.kind === "weekly")).toBe(false);
  });

  it("lands the evening before a morning they have to be up for", () => {
    const weekly = planNotifications(
      { profile: profile(), reports: sevenNights() },
      WED_MORNING,
    ).filter((p) => p.kind === "weekly");
    expect(weekly).toHaveLength(1);
    // Wednesday evening, before Thursday — a school morning.
    expect(weekly[0]!.at.getDay()).toBe(3);
  });

  it("follows a shift worker's week, not the calendar's", () => {
    // Off Thursday and Friday; back on Saturday. The read should land Friday evening.
    const shifted = profile({
      scheduledDays: [true, true, true, false, false, false, true],
    });
    const weekly = planNotifications(
      { profile: shifted, reports: sevenNights() },
      WED_MORNING,
    ).filter((p) => p.kind === "weekly");
    expect(weekly).toHaveLength(1);
    expect(weekly[0]!.at.getDay()).toBe(5);
  });

  it("sends exactly one, never a newsletter", () => {
    const pings = planNotifications({ profile: profile(), reports: sevenNights() }, WED_MORNING);
    expect(pings.filter((p) => p.kind === "weekly")).toHaveLength(1);
  });

  it("lands with an evening still left to read it in", () => {
    const clock = weeklyClock(profile());
    expect(clock).toBe("20:00");
    expect(withinQuietHours(clock, "23:00", "07:00")).toBe(false);
  });
});

describe("no streaks, no guilt", () => {
  it("never mentions a missed morning, a streak or a comeback", () => {
    const patchy = [night("2026-08-27"), night("2026-08-31"), night("2026-09-01"), night("2026-09-02")];
    const pings = planNotifications({ profile: profile(), reports: patchy }, WED_MORNING);
    const words = /streak|missed|you haven|don't forget|do not forget|come back|we miss|keep it up|broke/i;
    for (const ping of pings) {
      expect(ping.title, ping.kind).not.toMatch(words);
      expect(ping.body, ping.kind).not.toMatch(words);
    }
  });

  it("writes bodies that stand alone on a lock screen", () => {
    const pings = planNotifications({ profile: profile(), reports: sevenNights() }, WED_MORNING);
    expect(pings.length).toBeGreaterThan(0);
    for (const ping of pings) {
      expect(ping.title.length, ping.kind).toBeGreaterThan(0);
      expect(ping.body.length, ping.kind).toBeGreaterThan(20);
      expect(ping.body, ping.kind).not.toMatch(/tap to (see|view|read)/i);
    }
  });
});

describe("the wiring that made this silent before", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("does not reach for the Web Notification API anywhere", () => {
    // The original bug: `!("Notification" in window)` is always true inside a
    // Capacitor WKWebView, so every ping returned before doing anything, on every
    // phone, from the day it shipped. Nothing may guard on that again.
    for (const file of [
      "src/lib/notifications.ts",
      "src/lib/notify-device.ts",
      "src/lib/sleep-notifications.ts",
      "src/context/circadia-store.tsx",
      "src/components/onboarding.tsx",
      "src/components/you-view.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/"Notification" in window/);
      expect(read(file), file).not.toMatch(/new Notification\(/);
      expect(read(file), file).not.toMatch(/Notification\.(permission|requestPermission)/);
    }
  });

  it("schedules on the device, so a ping survives the app being closed", () => {
    const device = read("src/lib/notify-device.ts");
    expect(device).toContain('from "@capacitor/local-notifications"');
    expect(device).toContain("LocalNotifications.schedule");
    // A setTimeout only runs while the app is open. That is not a bedtime reminder.
    expect(device).not.toMatch(/setTimeout/);
    expect(read("src/lib/notifications.ts")).not.toMatch(/setTimeout/);
  });

  it("ships the plugin in both package files, or cap sync never builds it in", () => {
    const root = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    const phone = JSON.parse(read("phone/package.json")) as { dependencies: Record<string, string> };
    expect(root.dependencies["@capacitor/local-notifications"]).toBeTruthy();
    expect(phone.dependencies["@capacitor/local-notifications"]).toBeTruthy();
  });

  it("is on the phone's plugin allowlist, or it is compiled out of the app", () => {
    // includePlugins is an allowlist. A plugin missing from it is absent at runtime,
    // isPluginAvailable returns false, and every ping is silently dropped — the exact
    // failure this rewrite exists to end, reached a different way.
    const cap = read("phone/capacitor.config.ts");
    expect(cap).toContain('"@capacitor/local-notifications"');
    const listed = cap.slice(cap.indexOf("includePlugins"), cap.indexOf("plugins:"));
    expect(listed).toContain("@capacitor/local-notifications");
  });

  it("asks for permission after a morning exists, never at install", () => {
    const onboarding = read("src/components/onboarding.tsx");
    expect(onboarding).not.toMatch(/requestNotificationPermission|ensureNotificationPermission/);
    const store = read("src/context/circadia-store.tsx");
    expect(store).toContain("requestNotificationPermission");
    // Gated on the OS still being willing to ask, plus at least one filed morning.
    expect(store).toContain('=== "prompt"');
    expect(store).toContain("snapshot().reports.length > 0");
  });

  it("can still ask someone who already had a diary before reminders existed", () => {
    // The regression: the prompt fired only while filing the FIRST morning ever, so
    // every existing user was permanently unaskable — toggle on, permission never
    // granted, every ping dropped silently. That condition must not come back.
    const store = read("src/context/circadia-store.tsx");
    expect(store).not.toMatch(/reports\.length === 0/);
    expect(store).not.toContain("askToNotify");
  });

  it("never leaves a switch claiming to be on while the OS is dropping every ping", () => {
    const store = read("src/context/circadia-store.tsx");
    expect(store).toContain('=== "denied"');
    expect(store).toContain("notificationsEnabled: false");
    const you = read("src/components/you-view.tsx");
    // A denial cannot be undone from inside the app, so the UI has to say so.
    expect(you).toMatch(/Settings/);
    expect(you).toContain("notificationPermission");
  });

  it("keeps the test ping's id clear of every id a real ping can take", () => {
    // Derived ids are (YYYYMMDD % 1e6) * 10 + slot, so they top out in the millions.
    let highest = 0;
    for (const y of [2026, 2030, 2099]) {
      for (const m of [0, 5, 11]) {
        for (const d of [1, 28]) {
          for (const kind of ["screens-down", "morning", "weekly"] as const) {
            highest = Math.max(highest, pingId(kind, new Date(y, m, d)));
          }
        }
      }
    }
    const TEST_PING_ID = 999_999_999;
    expect(highest).toBeLessThan(TEST_PING_ID);
    expect(read("src/lib/notify-device.ts")).toContain(`TEST_PING_ID = 999_999_999`);
  });

  it("confirms itself once, the first time reminders actually work", () => {
    const device = read("src/lib/notify-device.ts");
    expect(device).toContain("confirmNotificationsOnce");
    // Remembered per device, so it is a confirmation and not a greeting on every launch.
    expect(device).toContain("circadia:notify-confirmed");
    // The flag is set BEFORE the send: a failure must not turn it into a repeat.
    const body = device.slice(device.indexOf("export async function confirmNotificationsOnce"));
    expect(body.indexOf("setItem(CONFIRMED_KEY")).toBeLessThan(body.indexOf("LocalNotifications.schedule"));
    // Gated on permission, so it cannot fire into a void.
    expect(body).toContain("hasNotificationPermission");

    const store = read("src/context/circadia-store.tsx");
    expect(store).toContain("confirmNotificationsOnce");
    // It names when the first real one lands rather than saying "test".
    expect(device).toContain("First one lands at");
  });

  it("offers a way to see one arrive without waiting until bedtime", () => {
    const device = read("src/lib/notify-device.ts");
    expect(device).toContain("sendTestNotification");
    // Outside the derived id range, so a test can never collide with a real ping.
    expect(device).toContain("TEST_PING_ID");
    expect(read("src/components/you-view.tsx")).toContain("sendTestNotification");
  });

  it("re-plans whenever a target, the toggle or the diary moves", () => {
    const store = read("src/context/circadia-store.tsx");
    expect(store).toContain("syncNotifications");
    for (const dep of ["notificationsEnabled", "targetSleep", "targetWake", "scheduledDays"]) {
      expect(store, dep).toContain(dep);
    }
  });
});
