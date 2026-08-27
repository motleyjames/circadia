import { clockFromDate, clockToMinutes, screenOffClock } from "@/lib/time";

const NOTIFY_TITLE = "Circadia";
const LAST_PING_KEY = "circadia:last-screen-ping";

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function pingScreenOff() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const today = new Date().toDateString();
  if (sessionStorage.getItem(LAST_PING_KEY) === today) return;
  sessionStorage.setItem(LAST_PING_KEY, today);
  try {
    new Notification(NOTIFY_TITLE, {
      body: "Screens down. One hour to the sleep window. Dim the room.",
    });
  } catch {
    /* some browsers require a service worker */
  }
}

export function shouldBeOffScreens(targetSleep: string, now = new Date()): boolean {
  const off = clockToMinutes(screenOffClock(targetSleep));
  const sleep = clockToMinutes(targetSleep);
  const current = clockToMinutes(clockFromDate(now));
  if (off < sleep) {
    return current >= off && current < sleep;
  }
  return current >= off || current < sleep;
}

export function msUntilScreenOff(targetSleep: string, now = new Date()): number {
  const off = clockToMinutes(screenOffClock(targetSleep));
  const current = now.getHours() * 60 + now.getMinutes();
  let delta = off - current;
  if (delta < 0) delta += 24 * 60;
  return (delta * 60 - now.getSeconds()) * 1000;
}

/**
 * Arm a one-shot ping. Does not prompt — permission is only requested from You / onboarding.
 * `cancelled` closes the race where unmount happens while a timeout is being set.
 */
export function startScreenOffWatcher(targetSleep: string, enabled: boolean): () => void {
  if (!enabled || typeof window === "undefined") return () => undefined;
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return () => undefined;
  }

  let cancelled = false;
  let timer: number | undefined;

  const arm = () => {
    if (cancelled) return;
    if (shouldBeOffScreens(targetSleep)) {
      pingScreenOff();
      return;
    }
    const wait = Math.min(msUntilScreenOff(targetSleep), 6 * 60 * 60 * 1000);
    timer = window.setTimeout(() => {
      if (cancelled) return;
      if (shouldBeOffScreens(targetSleep)) pingScreenOff();
    }, Math.max(1000, wait));
  };

  arm();

  return () => {
    cancelled = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
