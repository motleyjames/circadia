import { createEpisode, nightsElapsedSince } from "@/lib/episode";
import { CROCKFORD_ALPHABET } from "@/lib/password";
import { sha256 } from "@/lib/password";
import { allowlistedSafetyKinds, isCrisisDisclosure } from "@/lib/safety-triage";
import type { CircadiaState, PackSafetyCategory, Profile, SafetyFlag } from "@/lib/types";

export const COHORTS = ["friend", "stranger", "lab"] as const;
export type Cohort = (typeof COHORTS)[number];

export const INVITE_CODE_CHARS = 8;
export const INVITE_CODE_CHARS_V2 = 16;
export const INVITE_DERIVE_PREFIX = "circadia/invite/v1:";
export const INVITE_DERIVE_PREFIX_V2 = "circadia/invite/v2:";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PACK_SAFETY_CATEGORIES = ["witnessed-apnea", "drowsy-driving"] as const;

/**
 * James's local record of one tester. Name and cohort never leave this Mac.
 * `code` is what the tester types. `participantId` is derived from it.
 */
export type OperatorInvite = {
  /** Null when the row names or dismisses an existing id — never minted. */
  code: string | null;
  participantId: string;
  name: string;
  cohort: Cohort | null;
  createdAt: string;
  dismissed: boolean;
};

export function isCohort(value: unknown): value is Cohort {
  return typeof value === "string" && (COHORTS as readonly string[]).includes(value);
}

export function isPackSafetyCategory(value: unknown): value is PackSafetyCategory {
  return typeof value === "string" && (PACK_SAFETY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Frozen at v1. Separate from normalizeRecoveryCode so a change to one
 * cannot silently shift every tester's participantId.
 */
export function normalizeInviteCode(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[\s-]/g, "");
  let out = "";
  for (const raw of stripped) {
    let c = raw;
    if (c === "I" || c === "L") c = "1";
    else if (c === "O") c = "0";
    else if (c === "U") return null;
    if (!CROCKFORD_ALPHABET.includes(c)) return null;
    out += c;
  }
  return out.length === INVITE_CODE_CHARS ? out : null;
}

export function formatInviteCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

/**
 * Frozen at v2. Same Crockford substitutions as v1, length 16.
 * Never call normalizeInviteCode from here.
 */
export function normalizeInviteCodeV2(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[\s-]/g, "");
  let out = "";
  for (const raw of stripped) {
    let c = raw;
    if (c === "I" || c === "L") c = "1";
    else if (c === "O") c = "0";
    else if (c === "U") return null;
    if (!CROCKFORD_ALPHABET.includes(c)) return null;
    out += c;
  }
  return out.length === INVITE_CODE_CHARS_V2 ? out : null;
}

export function formatInviteCodeV2(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`;
}

export function inviteCodeVersion(code: string | null | undefined): 1 | 2 | null {
  if (!code) return null;
  if (normalizeInviteCodeV2(code)) return 2;
  if (normalizeInviteCode(code)) return 1;
  return null;
}

function uuidFromDigest(bytes: Uint8Array): string {
  const b = new Uint8Array(bytes.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function deriveInviteParticipantId(normalized: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(`${INVITE_DERIVE_PREFIX}${normalized}`));
  return uuidFromDigest(digest);
}

export async function deriveInviteParticipantIdV2(normalized: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(`${INVITE_DERIVE_PREFIX_V2}${normalized}`));
  return uuidFromDigest(digest);
}

function mintInviteCodeV2(): string {
  const bytes = new Uint8Array(INVITE_CODE_CHARS_V2);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += CROCKFORD_ALPHABET[byte & 31];
  return out;
}

export type MintedInvite = OperatorInvite & { code: string };

export async function generateInvite(name: string, cohort: Cohort, now = new Date()): Promise<MintedInvite> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("An invite needs a name on this Mac.");
  if (!isCohort(cohort)) throw new Error("Unknown cohort.");
  const normalized = mintInviteCodeV2();
  return {
    code: formatInviteCodeV2(normalized),
    participantId: await deriveInviteParticipantIdV2(normalized),
    name: trimmed,
    cohort,
    createdAt: now.toISOString(),
    dismissed: false,
  };
}

/** Accepts any casing, hyphens, or spaces. Returns the derived participantId. */
export async function parseInviteCode(code: string): Promise<string | null> {
  const v2 = normalizeInviteCodeV2(code);
  if (v2) return deriveInviteParticipantIdV2(v2);
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  return deriveInviteParticipantId(normalized);
}

export function readInviteBook(raw: unknown): OperatorInvite[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorInvite[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<OperatorInvite>;
    const participantId =
      typeof r.participantId === "string" && UUID_RE.test(r.participantId) ? r.participantId.toLowerCase() : null;
    if (!participantId) continue;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const cohort = isCohort(r.cohort) ? r.cohort : null;
    const dismissed = r.dismissed === true;
    if (!name && !dismissed) continue;
    if (name && !cohort) continue;
    const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";
    let code: string | null = null;
    if (typeof r.code === "string" && r.code.trim()) {
      const v2 = normalizeInviteCodeV2(r.code);
      if (v2) code = formatInviteCodeV2(v2);
      else {
        const normalized = normalizeInviteCode(r.code);
        code = normalized ? formatInviteCode(normalized) : null;
      }
    }
    out.push({
      code,
      participantId,
      name,
      cohort,
      createdAt,
      dismissed,
    });
  }
  return out;
}

export function nameOrphan(
  book: readonly OperatorInvite[],
  participantId: string,
  name: string,
  cohort: Cohort,
  now = new Date(),
): OperatorInvite[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required.");
  if (!isCohort(cohort)) throw new Error("Unknown cohort.");
  const id = participantId.trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new Error("Unknown participant.");
  const existing = book.find((row) => row.participantId.toLowerCase() === id);
  const next: OperatorInvite = {
    code: existing?.code ?? null,
    participantId: id,
    name: trimmed,
    cohort,
    createdAt: existing?.createdAt || now.toISOString(),
    dismissed: false,
  };
  return [next, ...book.filter((row) => row.participantId.toLowerCase() !== id)];
}

export function dismissOrphan(
  book: readonly OperatorInvite[],
  participantId: string,
  now = new Date(),
): OperatorInvite[] {
  const id = participantId.trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new Error("Unknown participant.");
  const existing = book.find((row) => row.participantId.toLowerCase() === id);
  const next: OperatorInvite = {
    code: existing?.code ?? null,
    participantId: id,
    name: existing?.name ?? "",
    cohort: existing?.cohort ?? null,
    createdAt: existing?.createdAt || now.toISOString(),
    dismissed: true,
  };
  return [next, ...book.filter((row) => row.participantId.toLowerCase() !== id)];
}

export function restoreOrphan(book: readonly OperatorInvite[], participantId: string): OperatorInvite[] {
  const id = participantId.trim().toLowerCase();
  const existing = book.find((row) => row.participantId.toLowerCase() === id);
  if (!existing) return [...book];
  if (!existing.name) return book.filter((row) => row.participantId.toLowerCase() !== id);
  return book.map((row) => (row.participantId.toLowerCase() === id ? { ...row, dismissed: false } : row));
}

export function joinInvite(invites: readonly OperatorInvite[], participantId: string): OperatorInvite | null {
  const id = participantId.trim().toLowerCase();
  return invites.find((row) => row.participantId.toLowerCase() === id) ?? null;
}

export async function enrollWithInvite(
  state: CircadiaState,
  code: string,
  now = new Date(),
): Promise<CircadiaState | null> {
  const v2 = normalizeInviteCodeV2(code);
  const v1 = v2 ? null : normalizeInviteCode(code);
  if (!v2 && !v1) return null;
  if (state.episode?.clinicianId) return null;
  if (typeof state.profile?.age === "number" && state.profile.age < 18) return null;
  const participantId = await parseInviteCode(code);
  if (!participantId) return null;
  const episode = state.episode ?? createEpisode({ clinicianId: null, enrolledAt: now.toISOString() });
  return {
    ...state,
    study: {
      ...state.study,
      asked: true,
      consented: true,
      participantId,
      inviteNormalized: v2 ?? v1,
      inviteVersion: v2 ? 2 : 1,
      sendPending: Boolean(v2),
      withdrawnAt: null,
    },
    episode,
  };
}

/** Allowlisted categories only. Crisis, mania, and every other kind are dropped. */
export function recordAllowlistedFlag(
  flags: readonly SafetyFlag[],
  category: string,
  episodeNight: number,
): SafetyFlag[] {
  if (!isPackSafetyCategory(category)) return [...flags];
  if (!Number.isInteger(episodeNight) || episodeNight < 0) return [...flags];
  return [...flags, { category, episodeNight }];
}

/**
 * One disclosure, one decision. If the line is a crisis, no flag from it
 * is recorded — not drowsy-driving, not apnea, not a count.
 */
export function recordDisclosureFlags(
  flags: readonly SafetyFlag[],
  text: string,
  _profile: Profile | null,
  episodeNight: number | null,
): SafetyFlag[] {
  if (episodeNight === null || !Number.isInteger(episodeNight) || episodeNight < 0) {
    return [...flags];
  }
  const lower = text.toLowerCase();
  if (isCrisisDisclosure(lower)) return [...flags];
  let next = [...flags];
  for (const category of allowlistedSafetyKinds(lower)) {
    next = recordAllowlistedFlag(next, category, episodeNight);
  }
  return next;
}

export function flagsForPack(state: CircadiaState, now = new Date()): SafetyFlag[] {
  const elapsed = state.episode ? nightsElapsedSince(state.episode.enrolledAt, now) : 0;
  const out: SafetyFlag[] = [];
  for (const flag of state.safetyFlags ?? []) {
    if (!isPackSafetyCategory(flag.category)) continue;
    if (!Number.isInteger(flag.episodeNight) || flag.episodeNight < 0) continue;
    if (flag.episodeNight > elapsed) continue;
    out.push({ category: flag.category, episodeNight: flag.episodeNight });
  }
  return out;
}

export function flagNightAt(state: CircadiaState, now = new Date()): number | null {
  if (!state.episode) return null;
  return nightsElapsedSince(state.episode.enrolledAt, now);
}
