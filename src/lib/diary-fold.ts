import { upsertConsult } from "@/lib/consult-threads";
import { dedupeReportsByMorningDate } from "@/lib/morning-file";
import type { CircadiaState, WindDownSession } from "@/lib/types";

/**
 * Fold two unlocked diaries. Same morning date keeps the later page.
 * Profile, study, and the live consult stay on this device — only nights,
 * wind-downs, filed consults, and notes come across.
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
  return {
    ...local,
    reports,
    sessions,
    consultHistory,
    researchNotes: incomingNotes.length > localNotes.length ? incoming.researchNotes : local.researchNotes,
    demoWeek: local.demoWeek && incoming.demoWeek,
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
