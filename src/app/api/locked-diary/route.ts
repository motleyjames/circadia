import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseLockedDiary, serializeLockedDiary } from "@/lib/diary-pack";
import { lockedDiaryDestPath } from "@/lib/locked-diary-file";
import { sessionTokenOk } from "@/lib/session-token";
import { isOperatorSurface } from "@/lib/surface";
import { isLocalRequest } from "@/lib/vault";

export const runtime = "nodejs";

function deny() {
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

function blocked(request: Request) {
  return isOperatorSurface() || !isLocalRequest(request) || !sessionTokenOk(request, false);
}

export async function POST(request: Request) {
  if (blocked(request)) return deny();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const vault = parseLockedDiary(raw);
  if (!vault) {
    return NextResponse.json({ ok: false, error: "That file is not a Circadia diary." }, { status: 400 });
  }
  const pack = serializeLockedDiary(vault);
  const dest = lockedDiaryDestPath();
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(pack), { encoding: "utf8", mode: 0o600 });
  return NextResponse.json({ ok: true, name: path.basename(dest) });
}
