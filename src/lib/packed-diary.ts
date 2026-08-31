import { parseLockedDiary } from "@/lib/diary-pack";
import type { DiskVault } from "@/lib/vault";

/** Sidecar copy. The iPhone gate prefers the inline script in index.html. */
export const PACKED_DIARY_HREF = "/circadia-locked.json";
export const PACKED_DIARY_STATUS_KEY = "__CIRCADIA_PACK_STATUS__";
export const PACKED_DIARY_GLOBAL_KEY = "__CIRCADIA_LOCKED_DIARY__";

export type PackedDiaryStatus = "packed" | "empty" | "missing";

let packedDiaryInflight: Promise<DiskVault | null> | null = null;

export function resetPackedDiaryCacheForTests(): void {
  packedDiaryInflight = null;
}

function packWindow(): Window | undefined {
  return typeof globalThis === "object"
    ? (globalThis as { window?: Window }).window
    : undefined;
}

/** Sync. Set by the inline script pack-mac-diary injects into index.html. */
export function packedDiaryStatus(): PackedDiaryStatus {
  const w = packWindow() as
    | (Window & { __CIRCADIA_PACK_STATUS__?: unknown; __CIRCADIA_LOCKED_DIARY__?: unknown })
    | undefined;
  if (!w) return "missing";
  if (w.__CIRCADIA_PACK_STATUS__ === "packed" || w.__CIRCADIA_PACK_STATUS__ === "empty") {
    return w.__CIRCADIA_PACK_STATUS__;
  }
  if (parseLockedDiary(w.__CIRCADIA_LOCKED_DIARY__)) return "packed";
  return "missing";
}

export function readInlinePackedDiary(): DiskVault | null {
  const w = packWindow() as (Window & { __CIRCADIA_LOCKED_DIARY__?: unknown }) | undefined;
  if (!w) return null;
  return parseLockedDiary(w.__CIRCADIA_LOCKED_DIARY__);
}

export async function fetchPackedDiary(): Promise<DiskVault | null> {
  if (typeof window === "undefined") return null;
  if (!packedDiaryInflight) packedDiaryInflight = loadPackedDiary();
  return packedDiaryInflight;
}

async function loadPackedDiary(): Promise<DiskVault | null> {
  const inline = readInlinePackedDiary();
  if (inline) return inline;
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
    const loc = packWindow()?.location?.href;
    if (typeof loc === "string" && loc.length > 0) {
      hrefs.push(new URL("circadia-locked.json", loc).toString());
    }
  } catch {
    /* absolute path is enough */
  }
  return hrefs;
}
