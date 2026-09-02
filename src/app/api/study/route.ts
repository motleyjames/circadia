import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { inboxParticipantId, parseInboxPayload } from "@/lib/inbox-payload";
import { isOperatorSurface } from "@/lib/surface";
import { studyInboxDir } from "@/lib/study-inbox";
import { isLocalRequest } from "@/lib/vault";

export const runtime = "nodejs";

async function forward(body: unknown): Promise<boolean> {
  const ingest = process.env.STUDY_INGEST_URL?.trim();
  if (!ingest) return false;
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = process.env.STUDY_INGEST_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(ingest, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (isOperatorSurface()) {
    return NextResponse.json({ ok: false, error: "This is the operator." }, { status: 404 });
  }
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ok: false, error: "Cross-site request refused." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, inbox: true });
}

export async function POST(request: Request) {
  if (isOperatorSurface()) {
    return NextResponse.json({ ok: false, error: "This is the operator." }, { status: 404 });
  }
  // Same guard the vault, fold-inbox and locked-diary routes use: a page on
  // another site must not be able to drive this inbox or the forward to ingest.
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ok: false, error: "Cross-site request refused." }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseInboxPayload(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const dir = studyInboxDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Already UUID-checked by the schema validators; sliced only for a short name.
  const id = inboxParticipantId(parsed).slice(0, 8);
  const file = path.join(dir, `${parsed.kind}-${id}-${stamp}.json`);
  // The validators are the real guard. This holds the line if one ever loosens.
  const rel = path.relative(dir, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ ok: false, error: "Invalid participant number." }, { status: 400 });
  }
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(parsed.value, null, 2), { encoding: "utf8", mode: 0o600 });

  const forwarded = await forward(parsed.value);
  return NextResponse.json({ ok: true, stored: true, forwarded, kind: parsed.kind });
}
