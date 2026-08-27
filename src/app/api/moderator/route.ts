import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { moderatorKeyOk } from "@/lib/mod-key";
import { summarizeInbox } from "@/lib/moderator";
import { studyInboxDir } from "@/lib/study-inbox";

export const runtime = "nodejs";

function providedKey(request: Request): string {
  return request.headers.get("x-circadia-mod")?.trim() ?? "";
}

export async function GET(request: Request) {
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
  for (const name of names) {
    try {
      const raw = await readFile(path.join(dir, name), "utf8");
      files.push({ file: name, payload: JSON.parse(raw) as unknown });
    } catch {
      // skip unreadable rows
    }
  }

  return NextResponse.json({ ok: true, ...summarizeInbox(files) });
}
