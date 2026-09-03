import { isScheduledMorning } from "@/lib/schedule";
import { HEALTHY_EFFICIENCY_PCT, weekGeometry, type WeekGeometry } from "@/lib/sleep-metrics";
import { clockToMinutes, formatClock, formatDuration, screenOffClock } from "@/lib/time";
import type { MorningReport, Profile } from "@/lib/types";

/**
 * What Circadia is allowed to send to a phone, and when.
 *
 * A sleep app sending phone alerts is a contradiction it has to earn its way out
 * of, so there are three and that is the whole set. Everything here is pure — it
 * takes a profile, the diary and a clock, and returns the notifications that should
 * be on the phone right now. Nothing in this file talks to a device, which is what
 * makes every rule below testable rather than aspirational.
 *
 * The rules, in the order they matter:
 *
 * 1. **Nothing between screens-down and morning.** Circadia must never be the thing
 *    that wakes you. Enforced by `withinQuietHours`, asserted in the tests, and the
 *    reason the morning ping is pinned to wake time rather than a fixed hour.
 * 2. **Complete on the lock screen.** No teaser, no badge, no "tap to see". A person
 *    who never opens the app still learns the finding.
 * 3. **Silence when there is nothing to say.** Under four scored nights there is no
 *    weekly. A filed morning cancels that day's morning ping.
 * 4. **No streaks, no guilt, no win-backs.** Missing a morning is normal and is never
 *    mentioned.
 * 5. **Ask late.** Permission is requested after the first morning is filed, never on
 *    install — iOS never asks twice, and asked cold on day one most people decline.
 */

export type PingKind = "screens-down" | "morning" | "weekly";

export type Ping = {
  /** Stable per kind and day, so rescheduling replaces rather than duplicates. */
  id: number;
  kind: PingKind;
  at: Date;
  title: string;
  body: string;
};

/** How long after target wake the morning ping lands. */
export const MORNING_DELAY_MINUTES = 25;

/** Scored nights needed before the weekly read is worth sending. */
export const WEEKLY_MIN_NIGHTS = 4;

/** How far ahead to schedule. iOS caps pending local notifications at 64. */
export const HORIZON_DAYS = 7;

/**
 * Notification ids are derived, never sequential.
 *
 * The plugin replaces a pending notification when a new one reuses its id, so a
 * derived id makes rescheduling idempotent: planning twice on the same day
 * overwrites the same three slots instead of stacking six alerts on one evening.
 * Sequential ids would have produced a duplicate every time the app reopened.
 */
export function pingId(kind: PingKind, day: Date): number {
  const slot: Record<PingKind, number> = { "screens-down": 1, morning: 2, weekly: 3 };
  const ymd =
    day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
  // Room for three slots per day, and inside the plugin's 32-bit id range.
  return (ymd % 1000000) * 10 + slot[kind];
}

function atClock(day: Date, clock: string): Date {
  const out = new Date(day);
  const minutes = clockToMinutes(clock);
  out.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return out;
}

function addDays(day: Date, n: number): Date {
  const out = new Date(day);
  out.setDate(out.getDate() + n);
  return out;
}

function isoDate(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/**
 * True when a clock falls in the protected stretch between screens-down and the
 * morning ping. Nothing may be scheduled inside it, ever.
 */
export function withinQuietHours(
  clock: string,
  targetSleep: string,
  targetWake: string,
): boolean {
  const start = clockToMinutes(screenOffClock(targetSleep));
  const end = (clockToMinutes(targetWake) + MORNING_DELAY_MINUTES) % (24 * 60);
  const at = clockToMinutes(clock);
  // The window almost always crosses midnight, so both orderings are real.
  return start <= end ? at > start && at < end : at > start || at < end;
}

/** The finding the weekly ping carries, or null when there is nothing to report. */
export function weeklyLine(week: WeekGeometry | null): string | null {
  if (!week || week.nights < WEEKLY_MIN_NIGHTS) return null;
  const nights = `${week.nights} night${week.nights === 1 ? "" : "s"}`;
  const asleep = formatDuration(week.meanTotalSleepMinutes);
  const eff = Math.round(week.meanEfficiencyPct);
  const tail =
    week.meanEfficiencyPct >= HEALTHY_EFFICIENCY_PCT
      ? "which is inside the healthy range."
      : `which is under the ${HEALTHY_EFFICIENCY_PCT}% clinics look for.`;
  return `${nights}, averaging ${asleep} asleep at ${eff}% efficiency — ${tail}`;
}

export type PlanInput = {
  profile: Profile;
  reports: MorningReport[];
};

/**
 * The notifications that should be pending on this phone right now.
 *
 * Returns the complete set rather than a diff: the caller cancels everything and
 * re-schedules this list, so there is exactly one source of truth for what is on
 * the device and no way for a stale ping to survive a settings change.
 */
export function planNotifications({ profile, reports }: PlanInput, now = new Date()): Ping[] {
  if (!profile.notificationsEnabled) return [];

  const screensDownClock = screenOffClock(profile.targetSleep);
  const filed = new Set(reports.map((r) => r.morningDate));
  const week = weekGeometry(reports.slice(-7));
  const finding = weeklyLine(week);
  const out: Ping[] = [];

  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const day = addDays(now, offset);

    // 1. Screens down, an hour before the sleep target. The notification IS the cue,
    //    so it says what to do and explicitly does not ask to be opened.
    const screensDownAt = atClock(day, screensDownClock);
    if (screensDownAt > now) {
      out.push({
        id: pingId("screens-down", day),
        kind: "screens-down",
        at: screensDownAt,
        title: "Screens down",
        body: `Asleep by ${formatClock(profile.targetSleep, profile.units)} gives you your window. Dim the room — no need to open this.`,
      });
    }

    // 2. Morning, shortly after the wake target — but only for a morning that is not
    //    already filed. The ping for a morning already written would be nagging.
    const morningAt = atClock(day, profile.targetWake);
    morningAt.setMinutes(morningAt.getMinutes() + MORNING_DELAY_MINUTES);
    if (morningAt > now && !filed.has(isoDate(day))) {
      out.push({
        id: pingId("morning", day),
        kind: "morning",
        at: morningAt,
        title: "Morning",
        body: "Two minutes on last night, while it is still fresh. Rough answers are fine.",
      });
    }

    // 3. The weekly read, the evening before the next morning they have to be up for,
    //    so a shift worker gets it on their own week rather than the calendar's.
    if (finding && isScheduledMorning(isoDate(addDays(day, 1)), profile.scheduledDays)) {
      const weeklyAt = atClock(day, weeklyClock(profile));
      if (weeklyAt > now && !withinQuietHours(weeklyClock(profile), profile.targetSleep, profile.targetWake)) {
        out.push({
          id: pingId("weekly", day),
          kind: "weekly",
          at: weeklyAt,
          title: "Your week is in",
          body: finding,
        });
        // One weekly per planning pass. More than one is a newsletter.
        break;
      }
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * When the weekly read lands: two hours before screens-down, so it arrives while
 * there is still an evening left to read it in and never inside quiet hours.
 */
export function weeklyClock(profile: Profile): string {
  const minutes = (clockToMinutes(screenOffClock(profile.targetSleep)) - 120 + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
