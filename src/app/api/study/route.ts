import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { inboxParticipantId, parseInboxPayload } from "@/lib/inbox-payload";
import { studyInboxDir } from "@/lib/study-inbox";

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

export async function POST(request: Request) {
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
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = inboxParticipantId(parsed).slice(0, 8);
  const file = path.join(dir, `${parsed.kind}-${id}-${stamp}.json`);
  await writeFile(file, JSON.stringify(parsed.value, null, 2), "utf8");

  const forwarded = await forward(parsed.value);
  return NextResponse.json({ ok: true, stored: true, forwarded, kind: parsed.kind });
}
