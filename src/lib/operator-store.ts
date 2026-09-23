import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DELETE_STUDY_CONFIRM, typedWordMatches } from "@/lib/confirm-word";
import { readInviteBook, type OperatorInvite } from "@/lib/invite";
import { studyInboxDir } from "@/lib/study-inbox";

export { DELETE_STUDY_CONFIRM };

export const OPERATOR_DIR_NAME = ".operator";
export const INVITE_BOOK_FILE = "invite-book.json";
export const REJECT_LOG_FILE = "rejects.json";
export const OPERATOR_PRIVATE_FILE = "operator-private.json";
export const OPERATOR_PUBLIC_FILE = "operator-public.b64";
export const FETCH_ETAG_FILE = "fetch-etags.json";
export const WITHDRAWN_FILE = "withdrawn.json";

export type RejectedPack = {
  reason: string;
  arrivedAt: string;
  file?: string;
};

export function operatorStoreDir(inbox = studyInboxDir()): string {
  return path.join(inbox, OPERATOR_DIR_NAME);
}

export function inviteBookPath(inbox = studyInboxDir()): string {
  return path.join(operatorStoreDir(inbox), INVITE_BOOK_FILE);
}

export function rejectLogPath(inbox = studyInboxDir()): string {
  return path.join(operatorStoreDir(inbox), REJECT_LOG_FILE);
}

export function operatorPrivatePath(inbox = studyInboxDir()): string {
  return path.join(operatorStoreDir(inbox), OPERATOR_PRIVATE_FILE);
}

export function operatorPublicPath(inbox = studyInboxDir()): string {
  return path.join(operatorStoreDir(inbox), OPERATOR_PUBLIC_FILE);
}

export function fetchEtagPath(inbox = studyInboxDir()): string {
  return path.join(operatorStoreDir(inbox), FETCH_ETAG_FILE);
}

export function withdrawnPath(inbox = studyInboxDir()): string {
  return path.join(operatorStoreDir(inbox), WITHDRAWN_FILE);
}

export function ensureOperatorDir(inbox: string): void {
  mkdirSync(operatorStoreDir(inbox), { recursive: true });
}

export function loadInviteBook(inbox = studyInboxDir()): OperatorInvite[] {
  try {
    return readInviteBook(JSON.parse(readFileSync(inviteBookPath(inbox), "utf8")));
  } catch {
    return [];
  }
}

export function saveInviteBook(invites: readonly OperatorInvite[], inbox = studyInboxDir()): void {
  ensureOperatorDir(inbox);
  writeFileSync(inviteBookPath(inbox), JSON.stringify(invites, null, 2), { encoding: "utf8", mode: 0o600 });
}

function coerceRejected(value: unknown): RejectedPack[] {
  if (!Array.isArray(value)) return [];
  const out: RejectedPack[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<RejectedPack>;
    if (typeof r.reason !== "string" || !r.reason.trim()) continue;
    if (typeof r.arrivedAt !== "string" || !r.arrivedAt.trim()) continue;
    const next: RejectedPack = { reason: r.reason.trim().slice(0, 500), arrivedAt: r.arrivedAt };
    if (typeof r.file === "string" && r.file) next.file = r.file;
    out.push(next);
  }
  return out;
}

export function loadRejectedPacks(inbox = studyInboxDir()): RejectedPack[] {
  try {
    return coerceRejected(JSON.parse(readFileSync(rejectLogPath(inbox), "utf8")));
  } catch {
    return [];
  }
}

function writeRejectedPacks(rows: readonly RejectedPack[], inbox: string): void {
  ensureOperatorDir(inbox);
  writeFileSync(rejectLogPath(inbox), JSON.stringify(rows, null, 2), { encoding: "utf8", mode: 0o600 });
}

/** Inbox-file rejects are replaced by what still fails to parse. Arrival-only rows have no file and stay. */
export function reconcileRejectedPacks(
  inboxFails: readonly RejectedPack[],
  inbox = studyInboxDir(),
  fetchFails: readonly RejectedPack[] = [],
): RejectedPack[] {
  const arrivalOnly = loadRejectedPacks(inbox).filter((row) => !row.file);
  const next = [...arrivalOnly, ...inboxFails, ...fetchFails];
  writeRejectedPacks(next, inbox);
  return next;
}

function readJsonObject(file: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadFetchEtags(inbox = studyInboxDir()): Record<string, string> {
  const raw = readJsonObject(fetchEtagPath(inbox));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) out[key] = value;
  }
  return out;
}

export function saveFetchEtags(etags: Record<string, string>, inbox = studyInboxDir()): void {
  ensureOperatorDir(inbox);
  writeFileSync(fetchEtagPath(inbox), JSON.stringify(etags, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function loadWithdrawn(inbox = studyInboxDir()): Record<string, boolean> {
  const raw = readJsonObject(withdrawnPath(inbox));
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function saveWithdrawn(rows: Record<string, boolean>, inbox = studyInboxDir()): void {
  ensureOperatorDir(inbox);
  writeFileSync(withdrawnPath(inbox), JSON.stringify(rows, null, 2), { encoding: "utf8", mode: 0o600 });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function deleteInboxPacksFor(participantId: string, inbox = studyInboxDir()): string[] {
  const id = participantId.trim().toLowerCase();
  if (!UUID_RE.test(id)) return [];
  const prefix = `study-${id.slice(0, 8)}-`;
  let names: string[] = [];
  try {
    names = readdirSync(inbox);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const file = path.join(inbox, name);
    let match = name.startsWith(prefix);
    if (!match) {
      try {
        const raw = JSON.parse(readFileSync(file, "utf8")) as { participantId?: unknown };
        match = typeof raw.participantId === "string" && raw.participantId.toLowerCase() === id;
      } catch {
        match = false;
      }
    }
    if (!match) continue;
    unlinkSync(file);
    removed.push(name);
  }
  return removed;
}

export function deleteAllStudyData(
  confirmation: string,
  inbox = studyInboxDir(),
): { ok: true } | { ok: false } {
  if (!typedWordMatches(confirmation, DELETE_STUDY_CONFIRM)) return { ok: false };
  let names: string[] = [];
  try {
    names = readdirSync(inbox);
  } catch {
    names = [];
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    unlinkSync(path.join(inbox, name));
  }
  for (const file of [rejectLogPath(inbox), inviteBookPath(inbox), withdrawnPath(inbox), fetchEtagPath(inbox)]) {
    try {
      unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
  return { ok: true };
}

export function recordRejectedPack(
  entry: { reason: string; arrivedAt?: string; file?: string },
  inbox = studyInboxDir(),
): RejectedPack {
  const next: RejectedPack = {
    reason: String(entry.reason || "Rejected.").trim().slice(0, 500) || "Rejected.",
    arrivedAt: entry.arrivedAt?.trim() || new Date().toISOString(),
  };
  if (entry.file) next.file = entry.file;
  const existing = loadRejectedPacks(inbox);
  if (next.file) {
    const prior = existing.find((row) => row.file === next.file);
    if (prior) return prior;
  }
  existing.push(next);
  ensureOperatorDir(inbox);
  writeFileSync(rejectLogPath(inbox), JSON.stringify(existing, null, 2), { encoding: "utf8", mode: 0o600 });
  return next;
}
