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
  if (!canNotify()) return false;
  try {
    return (await LocalNotifications.checkPermissions()).display === "granted";
  } catch {
    return false;
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
