import { createEpisode } from "@/lib/episode";
import { newId } from "@/lib/time";
import type { CircadiaState } from "@/lib/types";

export const COHORTS = ["friend", "stranger", "lab"] as const;
export type Cohort = (typeof COHORTS)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * James's local record of one tester. Name and cohort never leave this Mac.
 * `participantId` is the invite code the tester types.
 */
export type OperatorInvite = {
  participantId: string;
  name: string;
  cohort: Cohort;
  createdAt: string;
};

export function isCohort(value: unknown): value is Cohort {
  return typeof value === "string" && (COHORTS as readonly string[]).includes(value);
}

export function generateInvite(name: string, cohort: Cohort, now = new Date()): OperatorInvite {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("An invite needs a name on this Mac.");
  if (!isCohort(cohort)) throw new Error("Unknown cohort.");
  return {
    participantId: newId(),
    name: trimmed,
    cohort,
    createdAt: now.toISOString(),
  };
}

/** The invite code is a UUID. It becomes the device's participantId. */
export function parseInviteCode(code: string): string | null {
  const trimmed = code.trim().toLowerCase();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export function readInviteBook(raw: unknown): OperatorInvite[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorInvite[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<OperatorInvite>;
    const participantId = typeof r.participantId === "string" ? parseInviteCode(r.participantId) : null;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!participantId || !name || !isCohort(r.cohort)) continue;
    const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";
    out.push({ participantId, name, cohort: r.cohort, createdAt });
  }
  return out;
}

export function joinInvite(invites: readonly OperatorInvite[], participantId: string): OperatorInvite | null {
  const id = participantId.trim().toLowerCase();
  return invites.find((row) => row.participantId.toLowerCase() === id) ?? null;
}

/**
 * Start a solo episode from an invite. The code is the participantId, so a
 * reinstall that types the same code joins the same Operator record.
 */
export function enrollWithInvite(state: CircadiaState, code: string, now = new Date()): CircadiaState | null {
  const participantId = parseInviteCode(code);
  if (!participantId) return null;
  if (state.episode?.clinicianId) return null;
  const episode =
    state.episode && state.study.participantId === participantId
      ? state.episode
      : createEpisode({ clinicianId: null, enrolledAt: now.toISOString() });
  return {
    ...state,
    study: {
      ...state.study,
      asked: true,
      consented: true,
      participantId,
    },
    episode,
  };
}
