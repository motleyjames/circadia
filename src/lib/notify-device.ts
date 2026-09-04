import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { planNotifications, type PlanInput, type Ping } from "@/lib/sleep-notifications";

/**
 * The one place Circadia talks to the operating system's notification centre.
 *
 * ## Why this file exists at all
 *
 * The previous implementation checked for the browser's own notification object and
 * then fired it from a timer. Both halves were wrong on a phone. That object is not
 * exposed inside a Capacitor WKWebView — Safari 16.4 added Web Push for home-screen
 * PWAs, not embedded webviews — so the check always failed and the function returned
 * immediately. It had never fired on iPhone, silently, since the day it shipped. And
 * even where the browser API exists, a timer only survives while the app is open,
 * which is the one condition a bedtime reminder can never rely on.
 *
 * `@capacitor/local-notifications` schedules on the device itself: it fires with
 * the app closed, needs no server, no APNs certificate and no push token, so
 * nothing about a person's sleep schedule leaves their phone. That is the only
 * notification architecture consistent with the rest of Circadia.
 *
 * Everything that decides *what* to send lives in `sleep-notifications.ts` and is
 * pure. This file only carries the result across the bridge, and every call is
 * wrapped: a person who has denied permission, or is running the diary in a plain
 * browser, must never see a crash from a reminder they did not ask for.
 */

/** True only where a real notification centre is reachable. */
export function canNotify(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
  } catch {
    return false;
  }
}

/**
 * Ask for permission.
 *
 * Called after the first morning is filed, never on install: iOS only ever asks
 * once, and asked cold on day one most people decline — which cannot be undone
 * from inside the app.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    if (current.display === "denied") return false;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === "granted";
  } catch {
    return false;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await notificationPermission()) === "granted";
}

/**
 * What the operating system currently says.
 *
 * "prompt" is the state that matters: it means iOS has never asked, so asking is
 * still possible. "denied" cannot be undone from inside the app — only in Settings —
 * so the UI has to say that rather than offer a switch that quietly does nothing.
 */
export type NotificationPermission = "granted" | "denied" | "prompt" | "unavailable";

export async function notificationPermission(): Promise<NotificationPermission> {
  if (!canNotify()) return "unavailable";
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === "granted") return "granted";
    if (display === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

/** Take everything Circadia has pending off the device. */
export async function clearScheduled(): Promise<void> {
  if (!canNotify()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length === 0) return;
    await LocalNotifications.cancel({ notifications: pending.notifications });
  } catch {
    /* Nothing pending, or the bridge is gone. Either way there is nothing to undo. */
  }
}

/**
 * Make the device match the plan.
 *
 * Cancel-then-schedule rather than diffing. The plan is the complete set of what
 * should be pending, so replacing wholesale means a stale ping cannot outlive a
 * changed bed time, a filed morning or a switched-off toggle — the failure mode
 * that matters most here is a notification firing after the reason for it is gone.
 */
export async function syncNotifications(input: PlanInput, now = new Date()): Promise<number> {
  if (!canNotify()) return 0;
  if (!(await hasNotificationPermission())) {
    await clearScheduled();
    return 0;
  }

  const plan = planNotifications(input, now);
  await clearScheduled();
  if (plan.length === 0) return 0;

  try {
    await LocalNotifications.schedule({ notifications: plan.map(toPlugin) });
    return plan.length;
  } catch {
    return 0;
  }
}

/**
 * Fire one ping a few seconds from now, so a person can see the thing work.
 *
 * Every real notification here is hours away by design, which makes "is this even
 * on?" unanswerable without waiting until bedtime. Uses an id outside the derived
 * range so it can never collide with a scheduled ping or survive as a stale one.
 */
export const TEST_PING_ID = 999_999_999;

/** Set once, on this device, the first time reminders are confirmed working. */
const CONFIRMED_KEY = "circadia:notify-confirmed";

/**
 * One ping, once ever, the first time this device has working reminders.
 *
 * Every real reminder is hours away, so without this the first thing a person learns
 * about the feature is silence — indistinguishable from it being broken, which it
 * genuinely was until 0.12.0. This fires seconds after the app opens with permission
 * granted, while the phone is still in their hand, and then never again: the flag is
 * set before the send so a failure cannot turn it into a repeating greeting.
 *
 * Deliberately not on a schedule and deliberately not repeated per version — it is a
 * confirmation, not an announcement, and an app that greets you at every update is
 * the kind of thing this whole module is written to avoid being.
 */
export async function confirmNotificationsOnce(screensDownAt: string): Promise<boolean> {
  if (!canNotify()) return false;
  try {
    if (window.localStorage.getItem(CONFIRMED_KEY)) return false;
  } catch {
    // No storage means no way to remember having sent it, and a greeting that could
    // repeat on every launch is worse than one that never arrives.
    return false;
  }
  if (!(await hasNotificationPermission())) return false;

  try {
    window.localStorage.setItem(CONFIRMED_KEY, new Date().toISOString());
  } catch {
    return false;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_PING_ID,
          title: "Reminders are on",
          body: `First one lands at ${screensDownAt}, an hour before your asleep-by. Nothing will arrive between then and the morning.`,
          schedule: { at: new Date(Date.now() + 4000), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/** Testing seam: lets someone re-confirm from You after clearing the flag. */
export function resetNotificationConfirmation(): void {
  try {
    window.localStorage.removeItem(CONFIRMED_KEY);
  } catch {
    /* Nothing to clear. */
  }
}

export async function sendTestNotification(seconds = 5): Promise<boolean> {
  if (!canNotify()) return false;
  if (!(await hasNotificationPermission())) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEST_PING_ID }] });
  } catch {
    /* Nothing pending under that id. */
  }
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_PING_ID,
          title: "Circadia",
          body: `Reminders are on. This is the only one that will ever arrive on demand.`,
          schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

function toPlugin(ping: Ping) {
  return {
    id: ping.id,
    title: ping.title,
    body: ping.body,
    schedule: { at: ping.at, allowWhileIdle: true },
    // The body is the whole message; there is nothing behind a tap worth badging for.
    smallIcon: "ic_stat_icon_config_sample",
    extra: { kind: ping.kind },
  };
}
