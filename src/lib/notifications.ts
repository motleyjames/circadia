import { clockFromDate, clockToMinutes, screenOffClock } from "@/lib/time";

/**
 * Screen-time state for the Tonight screen.
 *
 * This file used to also send notifications, through the browser's own notification
 * object driven by a timer. Both were wrong on a phone: that object is not exposed
 * inside a Capacitor WKWebView, so the check always failed and nothing ever fired,
 * and a timer only survives while the app is open — the one condition a bedtime
 * reminder cannot rely on. Scheduling now lives in `sleep-notifications.ts` (what to send) and
 * `notify-device.ts` (getting it onto the device). What remains here is the question
 * Tonight actually asks: is the person inside their own wind-down window right now.
 */

/** True between screens-down and the sleep target. */
export function shouldBeOffScreens(targetSleep: string, now = new Date()): boolean {
  const off = clockToMinutes(screenOffClock(targetSleep));
  const sleep = clockToMinutes(targetSleep);
  const current = clockToMinutes(clockFromDate(now));
  if (off < sleep) {
    return current >= off && current < sleep;
  }
  return current >= off || current < sleep;
}
