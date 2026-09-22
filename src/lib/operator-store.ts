import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readInviteBook, type OperatorInvite } from "@/lib/invite";
import { studyInboxDir } from "@/lib/study-inbox";

export const OPERATOR_DIR_NAME = ".operator";
export const INVITE_BOOK_FILE = "invite-book.json";
export const REJECT_LOG_FILE = "rejects.json";

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

function ensureOperatorDir(inbox: string): void {
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
): RejectedPack[] {
  const arrivalOnly = loadRejectedPacks(inbox).filter((row) => !row.file);
  const next = [...arrivalOnly, ...inboxFails];
  writeRejectedPacks(next, inbox);
  return next;
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
