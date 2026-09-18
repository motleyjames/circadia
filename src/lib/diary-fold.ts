import { upsertConsult } from "@/lib/consult-threads";
import type { Episode } from "@/lib/episode";
import { dedupeReportsByMorningDate } from "@/lib/morning-file";
import type { CircadiaState, WindDownSession } from "@/lib/types";

export type EpisodeFoldConflict = {
  localId: string;
  incomingId: string;
};

/**
 * Whole-object episode fold. Highest rev wins. Different ids keep local and
 * name the conflict — field-level merge on windows is how 0.9.0 lost a night.
 */
export function foldEpisode(
  local: Episode | null | undefined,
  incoming: Episode | null | undefined,
): { episode: Episode | null; conflict: EpisodeFoldConflict | null } {
  const left = local ?? null;
  const right = incoming ?? null;
  if (!left && !right) return { episode: null, conflict: null };
  if (left && !right) return { episode: left, conflict: null };
  if (!left && right) return { episode: right, conflict: null };
  if (left!.id === right!.id) {
    if (right!.rev > left!.rev) return { episode: right, conflict: null };
    return { episode: left, conflict: null };
  }
  return {
    episode: left,
    conflict: { localId: left!.id, incomingId: right!.id },
  };
}

/**
 * Fold two unlocked diaries. Same morning date keeps the later page.
 * Profile, study, and the live consult stay on this device — only nights,
 * wind-downs, filed consults, notes, and an episode (highest rev) come across.
 *
 * An episode-id conflict is returned from foldEpisode, not recorded here.
 * persistFailure() is the 0.9.0 quota/encrypt path and is I/O; this module
 * stays pure, so the caller has to decide whether to surface the conflict.
 */
export function mergeDiaryStates(local: CircadiaState, incoming: CircadiaState): CircadiaState {
  const reports = dedupeReportsByMorningDate([...local.reports, ...incoming.reports]);
  const sessions = mergeSessions(local.sessions, incoming.sessions);
  let consultHistory = local.consultHistory;
  for (const thread of incoming.consultHistory) {
    consultHistory = upsertConsult(consultHistory, thread);
  }
  const localNotes = local.researchNotes.trim();
  const incomingNotes = incoming.researchNotes.trim();
  const folded = foldEpisode(local.episode, incoming.episode);
  return {
    ...local,
    reports,
    sessions,
    consultHistory,
    researchNotes: incomingNotes.length > localNotes.length ? incoming.researchNotes : local.researchNotes,
    demoWeek: local.demoWeek && incoming.demoWeek,
    episode: folded.episode,
  };
}

export function morningsAdded(local: CircadiaState, merged: CircadiaState): number {
  const before = new Set(local.reports.map((row) => row.morningDate));
  return merged.reports.filter((row) => !before.has(row.morningDate)).length;
}

function mergeSessions(local: WindDownSession[], incoming: WindDownSession[]): WindDownSession[] {
  const byId = new Map<string, WindDownSession>();
  for (const row of [...local, ...incoming]) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    if (!prev || row.startedAt >= prev.startedAt) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
