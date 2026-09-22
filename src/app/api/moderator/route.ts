import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isOperatorSurface } from "@/lib/surface";
import { moderatorKeyOk } from "@/lib/mod-key";
import { parseInboxPayload } from "@/lib/inbox-payload";
import { summarizeInbox } from "@/lib/moderator";
import { ensureOperatorKeys } from "@/lib/operator-keys";
import { loadInviteBook, loadRejectedPacks, loadWithdrawn, reconcileRejectedPacks } from "@/lib/operator-store";
import { fetchBookPacks } from "@/lib/pack-fetch";
import { studyInboxDir } from "@/lib/study-inbox";
import type { StudyPack } from "@/lib/types";

export const runtime = "nodejs";

function providedKey(request: Request): string {
  return request.headers.get("x-circadia-mod")?.trim() ?? "";
}

async function inboxJson(input: {
  fingerprint: string | null;
  workerUnreachable: boolean;
  withdrawn: Record<string, boolean>;
  fetchFails: { reason: string; arrivedAt: string; file?: string }[];
}) {
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

  const rejects = reconcileRejectedPacks(inboxFails, dir, input.fetchFails);

  const packs: { file: string; pack: StudyPack }[] = [];
  for (const file of files) {
    const parsed = parseInboxPayload(file.payload);
    if (parsed.ok && parsed.kind === "study") {
      packs.push({ file: file.file, pack: parsed.value });
    }
  }

  return {
    ok: true,
    ...summarizeInbox(files),
    packs,
    rejects,
    fingerprint: input.fingerprint,
    workerUnreachable: input.workerUnreachable,
    withdrawn: Object.entries(input.withdrawn)
      .filter(([, left]) => left)
      .map(([id]) => id),
  };
}

export async function GET(request: Request) {
  if (!isOperatorSurface()) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (!moderatorKeyOk(providedKey(request))) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
  }

  const dir = studyInboxDir();
  let fingerprint: string | null = null;
  try {
    fingerprint = (await ensureOperatorKeys(dir)).fingerprint;
  } catch {
    fingerprint = null;
  }

  return NextResponse.json(
    await inboxJson({
      fingerprint,
      workerUnreachable: false,
      withdrawn: loadWithdrawn(dir),
      fetchFails: loadRejectedPacks(dir).filter((row) => row.file?.startsWith("fetch:")),
    }),
  );
}

export async function POST(request: Request) {
  if (!isOperatorSurface()) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (!moderatorKeyOk(providedKey(request))) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
  }

  const dir = studyInboxDir();
  let fingerprint: string | null = null;
  let workerUnreachable = false;
  let withdrawn = loadWithdrawn(dir);
  let fetchFails = loadRejectedPacks(dir).filter((row) => row.file?.startsWith("fetch:"));
  try {
    const keys = await ensureOperatorKeys(dir);
    fingerprint = keys.fingerprint;
    const pulled = await fetchBookPacks({ book: loadInviteBook(dir), privateKey: keys.privateKey, inbox: dir });
    workerUnreachable = pulled.unreachable;
    if (!pulled.unreachable) {
      withdrawn = pulled.withdrawn;
      fetchFails = pulled.rejects;
    }
  } catch {
    workerUnreachable = true;
  }

  return NextResponse.json(
    await inboxJson({
      fingerprint,
      workerUnreachable,
      withdrawn,
      fetchFails,
    }),
  );
}
