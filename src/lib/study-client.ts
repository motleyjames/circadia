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
    return payload?.inbox === true;
  } catch {
    return false;
  }
}

export async function studyInboxAvailable(): Promise<boolean> {
  if (!inboxProbe) inboxProbe = probeInbox();
  return inboxProbe;
}

function held(): InboxPostResult {
  return { ok: false, held: true, error: STUDY_HELD_ERROR };
}

export async function postInbox(body: InboxBody): Promise<InboxPostResult> {
  if (isPhoneNative()) return held();
  const available = await studyInboxAvailable();
  if (!available) return held();
  try {
    const res = await fetch(studyInboxUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (looksLikeHtml(res)) return held();
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (payload?.ok) return { ok: true };
    if (payload?.error) return { ok: false, error: payload.error };
    if (!res.ok) return { ok: false, error: `Send failed (${res.status}).` };
    return held();
  } catch {
    return { ok: false, error: "Could not reach the study inbox. The pack is still on this device." };
  }
}

export async function postStudyPack(pack: StudyPack): Promise<InboxPostResult> {
  return postInbox(pack);
}
