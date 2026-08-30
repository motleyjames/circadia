import { NextResponse } from "next/server";
import { sessionTokenOk } from "@/lib/session-token";
import { isOperatorSurface } from "@/lib/surface";
import { isLocalRequest, parseDiskVault } from "@/lib/vault";
import { readDiskVault, writeDiskVault } from "@/lib/vault-file";

export const runtime = "nodejs";

function deny() {
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

function blocked(request: Request) {
  return isOperatorSurface() || !isLocalRequest(request) || !sessionTokenOk(request, false);
}

export async function GET(request: Request) {
  if (blocked(request)) return deny();
  const vault = await readDiskVault();
  return NextResponse.json(vault, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  if (blocked(request)) return deny();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const vault = parseDiskVault(raw);
  await writeDiskVault(vault);
  return NextResponse.json({ ok: true });
}
