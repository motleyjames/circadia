import { parseInboxPayload } from "@/lib/inbox-payload";
import { ageBand } from "@/lib/study";
import type { AnyRosterEvent, FaultEvent, StudyNight, StudyPack } from "@/lib/types";

export type InboxFile = {
  file: string;
  payload: unknown;
};

export function shortParticipantId(id: string): string {
  return id.slice(0, 8);
}

export type ModeratorPerson = {
  participantId: string;
  struggles: string[];
  targetSleep: string | null;
  targetWake: string | null;
  joinedAt: string | null;
  nightsLogged: number;
  lastAppVersion: string | null;
  faultCount: number;
  lastFault: string | null;
  meanRating: number | null;
  lastDurationMinutes: number | null;
  flags: string[];
  ageBand: string | null;
};

export type ModeratorNightPack = {
  participantId: string;
  receivedAt: string;
  appVersion: string;
  nightCount: number;
  meanRating: number | null;
  lastDurationMinutes: number | null;
  flags: string[];
};

export type ModeratorNightPerson = {
  participantId: string;
  packs: ModeratorNightPack[];
};

export type ModeratorFault = {
  participantId: string;
  at: string;
  message: string;
  href: string | null;
  appVersion: string;
};

export type ModeratorFaultPerson = {
  participantId: string;
  faults: ModeratorFault[];
};

/**
 * Inbox filenames are `{kind}-{id}-{iso}.json` with `:` and `.` folded to `-`.
 * Sort on the stamp, not the whole name — otherwise participant ids reorder history.
 */
export function inboxStampKey(file: string): string {
  const m = file.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?Z/);
  return m?.[0] ?? file;
}

export function formatInboxReceived(file: string): string {
  const key = inboxStampKey(file);
  const m = key.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${m[1]} ${m[2]}:${m[3]}`;
}

function newestFirstByStamp(a: string, b: string): number {
  return inboxStampKey(b).localeCompare(inboxStampKey(a));
}

/** One row per person. Packs inside are newest first. */
export function groupNightsByParticipant(nights: ModeratorNightPack[]): ModeratorNightPerson[] {
  const sorted = [...nights].sort((a, b) => newestFirstByStamp(a.receivedAt, b.receivedAt));
  const map = new Map<string, ModeratorNightPack[]>();
  const order: string[] = [];
  for (const pack of sorted) {
    const list = map.get(pack.participantId);
    if (!list) {
      map.set(pack.participantId, [pack]);
      order.push(pack.participantId);
    } else {
      list.push(pack);
    }
  }
  return order.map((participantId) => ({
    participantId,
    packs: map.get(participantId) ?? [],
  }));
}

/** One row per person. Faults inside are newest first. */
export function groupFaultsByParticipant(faults: ModeratorFault[]): ModeratorFaultPerson[] {
  const sorted = [...faults].sort((a, b) => b.at.localeCompare(a.at));
  const map = new Map<string, ModeratorFault[]>();
  const order: string[] = [];
  for (const fault of sorted) {
    const list = map.get(fault.participantId);
    if (!list) {
      map.set(fault.participantId, [fault]);
      order.push(fault.participantId);
    } else {
      list.push(fault);
    }
  }
  return order.map((participantId) => ({
    participantId,
    faults: map.get(participantId) ?? [],
  }));
}

export type ModeratorSnapshot = {
  userCount: number;
  nightPackCount: number;
  nightCount: number;
  faultCount: number;
  people: ModeratorPerson[];
  nights: ModeratorNightPack[];
  faults: ModeratorFault[];
};

function nightFlags(nights: StudyNight[]): string[] {
  const flags: string[] = [];
  if (nights.some((n) => n.drank)) flags.push("alcohol");
  if (nights.some((n) => n.sleepLatencyMinutes >= 50)) flags.push("latency");
  if (nights.some((n) => n.wokeInNight)) flags.push("washes");
  if (nights.some((n) => n.usedSupplement)) flags.push("aid");
  if (nights.some((n) => n.rating <= 2)) flags.push("rough");
  return flags;
}

function meanRating(nights: StudyNight[]): number | null {
  if (!nights.length) return null;
  return nights.reduce((sum, n) => sum + n.rating, 0) / nights.length;
}

export function summarizeInbox(files: InboxFile[]): ModeratorSnapshot {
  const people = new Map<string, ModeratorPerson>();
  const nights: ModeratorNightPack[] = [];
  const faults: ModeratorFault[] = [];
  const latestPack = new Map<string, StudyPack>();
  const latestRoster = new Map<string, AnyRosterEvent>();

  function person(id: string): ModeratorPerson {
    const existing = people.get(id);
    if (existing) return existing;
    const created: ModeratorPerson = {
      participantId: id,
      struggles: [],
      targetSleep: null,
      targetWake: null,
      joinedAt: null,
      nightsLogged: 0,
      lastAppVersion: null,
      faultCount: 0,
      lastFault: null,
      meanRating: null,
      lastDurationMinutes: null,
      flags: [],
      ageBand: null,
    };
    people.set(id, created);
    return created;
  }

  for (const file of files) {
    const parsed = parseInboxPayload(file.payload);
    if (!parsed.ok) continue;
    const id = parsed.value.participantId;
    const row = person(id);
    row.lastAppVersion = parsed.value.appVersion;

    if (parsed.kind === "roster") {
      const roster = parsed.value;
      const prev = latestRoster.get(id);
      if (!prev || roster.at >= prev.at) latestRoster.set(id, roster);
      if (!row.joinedAt || roster.at < row.joinedAt) row.joinedAt = roster.at;
    }

    if (parsed.kind === "study") {
      const pack = parsed.value;
      const prev = latestPack.get(id);
      if (!prev || pack.nights.length >= prev.nights.length) latestPack.set(id, pack);
      nights.push({
        participantId: id,
        receivedAt: file.file,
        appVersion: pack.appVersion,
        nightCount: pack.nights.length,
        meanRating: meanRating(pack.nights),
        lastDurationMinutes: pack.nights.at(-1)?.durationMinutes ?? null,
        flags: nightFlags(pack.nights),
      });
    }

    if (parsed.kind === "fault") {
      const fault = parsed.value as FaultEvent;
      row.faultCount += 1;
      row.lastFault = fault.message;
      faults.push({
        participantId: id,
        at: fault.at,
        message: fault.message,
        href: fault.href,
        appVersion: fault.appVersion,
      });
    }
  }

  for (const [id, roster] of latestRoster) {
    const row = person(id);
    row.struggles = roster.struggles;
    row.targetSleep = roster.targetSleep;
    row.targetWake = roster.targetWake;
    row.lastAppVersion = roster.appVersion;
    row.ageBand = roster.schema === "circadia-roster-v2" ? roster.ageBand : ageBand(roster.age);
  }

  for (const [id, pack] of latestPack) {
    const row = person(id);
    row.nightsLogged = pack.nights.length;
    row.meanRating = meanRating(pack.nights);
    row.lastDurationMinutes = pack.nights.at(-1)?.durationMinutes ?? null;
    row.flags = nightFlags(pack.nights);
    row.ageBand = pack.profile.ageBand;
    if (!row.struggles.length) row.struggles = pack.profile.struggles;
    if (!row.targetSleep) row.targetSleep = pack.profile.targetSleep;
    if (!row.targetWake) row.targetWake = pack.profile.targetWake;
  }

  const peopleList = [...people.values()].sort((a, b) =>
    a.participantId.localeCompare(b.participantId),
  );
  faults.sort((a, b) => b.at.localeCompare(a.at));
  nights.sort((a, b) => newestFirstByStamp(a.receivedAt, b.receivedAt));

  return {
    userCount: peopleList.length,
    nightPackCount: nights.length,
    nightCount: peopleList.reduce((sum, p) => sum + p.nightsLogged, 0),
    faultCount: faults.length,
    people: peopleList,
    nights,
    faults,
  };
}
