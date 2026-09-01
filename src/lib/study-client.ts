import { resolveAppUrl } from "@/lib/app-url";
import { isPhoneNative } from "@/lib/phone-native";
import type { AnyRosterEvent, FaultEvent, StudyPack } from "@/lib/types";

export type InboxBody = StudyPack | AnyRosterEvent | FaultEvent;

export type InboxPostResult = { ok: boolean; held?: boolean; error?: string };

/** Phone has no Next inbox. Nights stay on the device until Circadia.app sends. */
export const STUDY_HELD_ERROR =
  "Kept on this phone. Fold a locked copy into Circadia.app when you want nights to leave.";

let inboxProbe: Promise<boolean> | null = null;

export function resetStudyInboxProbeForTests() {
  inboxProbe = null;
}

function studyInboxUrl(): string {
  return resolveAppUrl("/api/study");
}

function looksLikeHtml(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("text/html");
}

async function probeInbox(): Promise<boolean> {
  if (isPhoneNative()) return false;
  try {
    const res = await fetch(studyInboxUrl(), { method: "GET", cache: "no-store" });
    if (res.status === 404) return false;
    if (looksLikeHtml(res)) return false;
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; inbox?: boolean } | null;
    if (payload?.inbox === true) return true;
    return res.status !== 404;
  } catch {
    return false;
  }
}

export async function studyInboxAvailable(): Promise<boolean> {
  if (!inboxProbe) inboxProbe = probeInbox();
  return inboxProbe;
}

export async function postInbox(body: InboxBody): Promise<InboxPostResult> {
  const available = await studyInboxAvailable();
  if (!available) {
    return { ok: false, held: true, error: STUDY_HELD_ERROR };
  }
  try {
    const res = await fetch(studyInboxUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !payload?.ok) {
      return { ok: false, error: payload?.error ?? `Send failed (${res.status}).` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the study inbox. The pack is still on this device." };
  }
}

export async function postStudyPack(pack: StudyPack): Promise<InboxPostResult> {
  return postInbox(pack);
}
