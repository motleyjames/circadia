import type { StudyPack } from "@/lib/types";

export async function postStudyPack(pack: StudyPack): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/study", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pack),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `Send failed (${res.status}).` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the study inbox. The pack is still on this computer." };
  }
}
