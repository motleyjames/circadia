import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { validateStudyPack } from "@/lib/study";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = validateStudyPack(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const pack = parsed.value;
  const dir = path.join(process.cwd(), "data", "study-inbox");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${pack.participantId.slice(0, 8)}-${stamp}.json`);
  await writeFile(file, JSON.stringify(pack, null, 2), "utf8");

  let forwarded = false;
  const ingest = process.env.STUDY_INGEST_URL?.trim();
  if (ingest) {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const token = process.env.STUDY_INGEST_TOKEN?.trim();
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(ingest, {
        method: "POST",
        headers,
        body: JSON.stringify(pack),
      });
      forwarded = res.ok;
    } catch {
      forwarded = false;
    }
  }

  return NextResponse.json({ ok: true, stored: true, forwarded });
}
