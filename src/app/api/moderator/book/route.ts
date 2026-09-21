import { NextResponse } from "next/server";
import { readInviteBook } from "@/lib/invite";
import { moderatorKeyOk } from "@/lib/mod-key";
import { loadInviteBook, saveInviteBook } from "@/lib/operator-store";
import { isOperatorSurface } from "@/lib/surface";

export const runtime = "nodejs";

function providedKey(request: Request): string {
  return request.headers.get("x-circadia-mod")?.trim() ?? "";
}

export async function GET(request: Request) {
  if (!isOperatorSurface()) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (!moderatorKeyOk(providedKey(request))) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, invites: loadInviteBook() });
}

export async function PUT(request: Request) {
  if (!isOperatorSurface()) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (!moderatorKeyOk(providedKey(request))) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const invites = readInviteBook(Array.isArray(raw) ? raw : (raw as { invites?: unknown })?.invites);
  saveInviteBook(invites);
  return NextResponse.json({ ok: true, invites });
}
