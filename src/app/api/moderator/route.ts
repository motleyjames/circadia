import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isOperatorSurface } from "@/lib/surface";
import { moderatorKeyOk } from "@/lib/mod-key";
import { parseInboxPayload } from "@/lib/inbox-payload";
import { summarizeInbox } from "@/lib/moderator";
import { reconcileRejectedPacks } from "@/lib/operator-store";
import { studyInboxDir } from "@/lib/study-inbox";
import type { StudyPack } from "@/lib/types";

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

  const dir = studyInboxDir();
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    names = [];
  }

  const files = [];
  const inboxFails: { reason: string; file: string; arrivedAt: string }[] = [];
  for (const name of names) {
    try {
      const raw = await readFile(path.join(dir, name), "utf8");
      const payload = JSON.parse(raw) as unknown;
      files.push({ file: name, payload });
      const parsed = parseInboxPayload(payload);
      if (!parsed.ok) {
        inboxFails.push({ reason: parsed.error, file: name, arrivedAt: name });
      }
    } catch {
      inboxFails.push({ reason: "Unreadable inbox file.", file: name, arrivedAt: name });
    }
  }

  const rejects = reconcileRejectedPacks(inboxFails, dir);

  const packs: { file: string; pack: StudyPack }[] = [];
  for (const file of files) {
    const parsed = parseInboxPayload(file.payload);
    if (parsed.ok && parsed.kind === "study") {
      packs.push({ file: file.file, pack: parsed.value });
    }
  }

  return NextResponse.json({
    ok: true,
    ...summarizeInbox(files),
    packs,
    rejects,
  });
}
