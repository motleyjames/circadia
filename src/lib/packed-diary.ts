import { parseLockedDiary } from "@/lib/diary-pack";
import type { DiskVault } from "@/lib/vault";

/** Static pack only. put-on-phone writes this after reading the Mac vault. Stay-signed-in is not in the file. */
export const PACKED_DIARY_HREF = "/circadia-locked.json";

let packedDiaryInflight: Promise<DiskVault | null> | null = null;

export function resetPackedDiaryCacheForTests(): void {
  packedDiaryInflight = null;
}

export async function fetchPackedDiary(): Promise<DiskVault | null> {
  if (typeof window === "undefined") return null;
  if (!packedDiaryInflight) packedDiaryInflight = loadPackedDiary();
  return packedDiaryInflight;
}

async function loadPackedDiary(): Promise<DiskVault | null> {
  if (typeof fetch !== "function") return null;
  const hrefs = packedDiaryHrefs();
  for (const href of hrefs) {
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) continue;
      const parsed = parseLockedDiary(await res.json());
      if (parsed) return parsed;
    } catch {
      /* try the next href — Capacitor origins differ */
    }
  }
  return null;
}

function packedDiaryHrefs(): string[] {
  const hrefs = [PACKED_DIARY_HREF];
  try {
    const loc = (globalThis as { window?: { location?: { href?: string } } }).window?.location?.href;
    if (typeof loc === "string" && loc.length > 0) {
      hrefs.push(new URL("circadia-locked.json", loc).toString());
    }
  } catch {
    /* absolute path is enough */
  }
  return hrefs;
}
