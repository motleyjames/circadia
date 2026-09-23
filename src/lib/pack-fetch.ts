import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { circadiaVaultUrl } from "@/lib/circadia-sync";
import { parseInboxPayload } from "@/lib/inbox-payload";
import { inviteCodeVersion, normalizeInviteCodeV2, type OperatorInvite } from "@/lib/invite";
import { openEnvelope } from "@/lib/pack-seal";
import { derivePackLocation } from "@/lib/pack-derive";
import {
  deleteInboxPacksFor,
  loadFetchEtags,
  loadWithdrawn,
  saveFetchEtags,
  saveWithdrawn,
  type RejectedPack,
} from "@/lib/operator-store";
import { studyInboxDir } from "@/lib/study-inbox";
import { validateStudyPack } from "@/lib/study";
import type { StudyPack } from "@/lib/types";

export const FETCH_POLL_MS = 3 * 60 * 1000;

export type PackFetchResult = {
  unreachable: boolean;
  written: string[];
  rejects: RejectedPack[];
  withdrawn: Record<string, boolean>;
};

type FetchedObject = {
  participantId: string;
  workerId: string;
  status: number;
  etag: string | null;
  lastModified: string | null;
  body: string;
};

export function workerRejectReason(status: number): string {
  if (status === 401 || status === 403) {
    return `Couldn't reach the pack store (HTTP ${status}). Nothing was lost.`;
  }
  return "Worker refused the pack.";
}

function stampOf(value: Date): string {
  return value.toISOString().replace(/[:.]/g, "-");
}

function arrivedAt(headers: { lastModified: string | null }, now: Date): Date {
  if (headers.lastModified) {
    const parsed = new Date(headers.lastModified);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return now;
}

function inboxFileName(pack: StudyPack, arrived: Date): string {
  return `study-${pack.participantId.slice(0, 8).toLowerCase()}-${stampOf(arrived)}.json`;
}

export function writeInboxPack(pack: StudyPack, arrived: Date, inbox = studyInboxDir()): string {
  const name = inboxFileName(pack, arrived);
  const file = path.join(inbox, name);
  const rel = path.relative(inbox, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid participant number.");
  }
  mkdirSync(inbox, { recursive: true });
  writeFileSync(file, JSON.stringify(pack, null, 2), { encoding: "utf8", mode: 0o600 });
  return name;
}

export async function fetchBookPacks(input: {
  book: readonly OperatorInvite[];
  privateKey: CryptoKey;
  inbox?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<PackFetchResult> {
  const inbox = input.inbox ?? studyInboxDir();
  const now = input.now ?? new Date();
  const doFetch = input.fetchImpl ?? fetch;
  const etags = loadFetchEtags(inbox);
  const withdrawn = { ...loadWithdrawn(inbox) };
  const rejects: RejectedPack[] = [];
  const written: string[] = [];

  const jobs: { invite: OperatorInvite; workerId: string; bearer: string }[] = [];
  for (const invite of input.book) {
    if (inviteCodeVersion(invite.code) !== 2 || !invite.code) continue;
    const normalized = normalizeInviteCodeV2(invite.code);
    if (!normalized) continue;
    const loc = await derivePackLocation(normalized);
    jobs.push({ invite, workerId: loc.workerId, bearer: loc.bearer });
  }

  const fetched: FetchedObject[] = [];
  for (const job of jobs) {
    let res: Response;
    try {
      res = await doFetch(circadiaVaultUrl(job.workerId), {
        method: "GET",
        headers: { authorization: `Bearer ${job.bearer}` },
      });
    } catch {
      return { unreachable: true, written: [], rejects: [], withdrawn };
    }
    if (res.status >= 500) {
      return { unreachable: true, written: [], rejects: [], withdrawn };
    }
    fetched.push({
      participantId: job.invite.participantId.toLowerCase(),
      workerId: job.workerId,
      status: res.status,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      body: res.status === 200 ? await res.text() : "",
    });
  }

  const nextEtags = { ...etags };
  for (const row of fetched) {
    if (row.status === 404) continue;
    if (row.status !== 200) {
      rejects.push({
        reason: workerRejectReason(row.status),
        arrivedAt: now.toISOString(),
        file: `fetch:${row.participantId}`,
        status: row.status,
      });
      continue;
    }
    if (row.etag && etags[row.workerId] === row.etag) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.body) as unknown;
    } catch {
      rejects.push({
        reason: "Sealed pack was not JSON.",
        arrivedAt: now.toISOString(),
        file: `fetch:${row.participantId}`,
      });
      if (row.etag) nextEtags[row.workerId] = row.etag;
      continue;
    }

    const opened = await openEnvelope(parsed, input.privateKey, row.participantId);
    if (!opened.ok) {
      rejects.push({
        reason: opened.error,
        arrivedAt: now.toISOString(),
        file: `fetch:${row.participantId}`,
      });
      if (row.etag) nextEtags[row.workerId] = row.etag;
      continue;
    }
    if (opened.kind === "withdrawal") {
      withdrawn[row.participantId] = true;
      deleteInboxPacksFor(row.participantId, inbox);
      if (row.etag) nextEtags[row.workerId] = row.etag;
      continue;
    }

    const checked = validateStudyPack(opened.value);
    if (!checked.ok) {
      rejects.push({
        reason: checked.error,
        arrivedAt: now.toISOString(),
        file: `fetch:${row.participantId}`,
      });
      if (row.etag) nextEtags[row.workerId] = row.etag;
      continue;
    }

    const parsedInbox = parseInboxPayload(opened.value);
    if (!parsedInbox.ok || parsedInbox.kind !== "study") {
      rejects.push({
        reason: parsedInbox.ok ? "Not a study pack." : parsedInbox.error,
        arrivedAt: now.toISOString(),
        file: `fetch:${row.participantId}`,
      });
      if (row.etag) nextEtags[row.workerId] = row.etag;
      continue;
    }

    withdrawn[row.participantId] = false;
    const arrived = arrivedAt(row, now);
    written.push(writeInboxPack(parsedInbox.value, arrived, inbox));
    if (row.etag) nextEtags[row.workerId] = row.etag;
  }

  saveFetchEtags(nextEtags, inbox);
  saveWithdrawn(withdrawn, inbox);
  return { unreachable: false, written, rejects, withdrawn };
}
