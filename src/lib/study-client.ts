import type { AnyRosterEvent, FaultEvent, StudyPack } from "@/lib/types";

export type InboxBody = StudyPack | AnyRosterEvent | FaultEvent;

export async function postInbox(body: InboxBody): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/study", {
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
    return { ok: false, error: "Could not reach the study inbox. The pack is still on this computer." };
  }
}

export async function postStudyPack(pack: StudyPack): Promise<{ ok: boolean; error?: string }> {
  return postInbox(pack);
}
