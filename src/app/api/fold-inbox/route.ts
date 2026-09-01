import { readFile, stat, unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { parseLockedDiary } from "@/lib/diary-pack";
import { foldInboxFilePath, lockedDiaryDestPath } from "@/lib/locked-diary-file";
import { sessionTokenOk } from "@/lib/session-token";
import { isOperatorSurface } from "@/lib/surface";
import { isLocalRequest } from "@/lib/vault";
import type { DiskVault } from "@/lib/vault";

export const runtime = "nodejs";

/** Ciphertext only. Bigger than this is not a diary — fail closed. */
const MAX_INBOX_BYTES = 20 * 1024 * 1024;

function deny() {
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

function blocked(request: Request) {
  return isOperatorSurface() || !isLocalRequest(request) || !sessionTokenOk(request, false);
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function readVaultFile(file: string): Promise<{ vault: DiskVault; digest: string } | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_INBOX_BYTES) return null;
    const raw = await readFile(file, "utf8");
    const vault = parseLockedDiary(JSON.parse(raw) as unknown);
    if (!vault) return null;
    return { vault, digest: `${raw.length}:${raw.slice(0, 48)}:${raw.slice(-24)}` };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (blocked(request)) return deny();
  const inbox = await readVaultFile(foldInboxFilePath());
  if (inbox) {
    return noStore({
      ok: true,
      source: "inbox",
      digest: inbox.digest,
      vault: inbox.vault,
    });
  }
  const dropped = await readVaultFile(lockedDiaryDestPath());
  if (dropped) {
    return noStore({
      ok: true,
      source: "downloads",
      digest: dropped.digest,
      vault: dropped.vault,
    });
  }
  return noStore({ ok: true, source: null, digest: null, vault: null });
}

export async function POST(request: Request) {
  if (blocked(request)) return deny();
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { source?: unknown }).source
      : undefined;
  if (source !== "inbox") {
    return NextResponse.json({ ok: true, consumed: false });
  }
  try {
    await unlink(foldInboxFilePath());
  } catch {
    /* already gone */
  }
  return NextResponse.json({ ok: true, consumed: true });
}
