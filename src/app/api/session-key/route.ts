import { NextResponse } from "next/server";
import { keychain } from "@/lib/keychain";
import { bytesFromBase64 } from "@/lib/password";
import { isOperatorSurface } from "@/lib/surface";
import { isLocalRequest } from "@/lib/vault";

export const runtime = "nodejs";

function deny() {
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

function loginOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const login = value.trim();
  if (login.length < 3 || login.length > 180) return null;
  if (login.includes("\0")) return null;
  return login;
}

function masterOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const bytes = bytesFromBase64(value);
    if (bytes.length !== 32) return null;
    return value;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (isOperatorSurface() || !isLocalRequest(request)) return deny();
  const url = new URL(request.url);
  const login = loginOf(url.searchParams.get("login"));
  if (!login) return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 400 });
  const master = keychain.get(login);
  if (!master) return NextResponse.json({ ok: false, error: "No session." }, { status: 404 });
  return NextResponse.json({ ok: true, login, master }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (isOperatorSurface() || !isLocalRequest(request)) return deny();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const body = raw as { login?: unknown; master?: unknown };
  const login = loginOf(body.login);
  const master = masterOf(body.master);
  if (!login || !master) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 400 });
  }
  if (!keychain.set(login, master)) {
    return NextResponse.json({ ok: false, error: "Keychain unavailable." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (isOperatorSurface() || !isLocalRequest(request)) return deny();
  const url = new URL(request.url);
  const login = loginOf(url.searchParams.get("login"));
  if (!login) return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 400 });
  keychain.delete(login);
  return NextResponse.json({ ok: true });
}
