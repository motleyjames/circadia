import { parseInboxPayload } from "@/lib/inbox-payload";
import type { FaultEvent, RosterEvent, StudyNight, StudyPack } from "@/lib/types";

export type InboxFile = {
  file: string;
  payload: unknown;
};

export type ModeratorPerson = {
  participantId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: string | null;
  struggles: string[];
  targetSleep: string | null;
  targetWake: string | null;
  joinedAt: string | null;
  lastNightAt: string | null;
  nightsLogged: number;
  lastAppVersion: string | null;
  faultCount: number;
  lastFault: string | null;
};

export type ModeratorNightPack = {
  participantId: string;
  name: string | null;
  receivedAt: string;
  appVersion: string;
  nightCount: number;
  meanRating: number | null;
  lastDurationMinutes: number | null;
  flags: string[];
};

export type ModeratorFault = {
  participantId: string;
  name: string | null;
  at: string;
  message: string;
  href: string | null;
  appVersion: string;
};

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
  const names = new Map<string, string>();
  const nights: ModeratorNightPack[] = [];
  const faults: ModeratorFault[] = [];
  const latestPack = new Map<string, StudyPack>();
  const latestRoster = new Map<string, RosterEvent>();

  function person(id: string): ModeratorPerson {
    const existing = people.get(id);
    if (existing) return existing;
    const created: ModeratorPerson = {
      participantId: id,
      name: null,
      email: null,
      phone: null,
      age: null,
      heightCm: null,
      weightKg: null,
      activity: null,
      struggles: [],
      targetSleep: null,
      targetWake: null,
      joinedAt: null,
      lastNightAt: null,
      nightsLogged: 0,
      lastAppVersion: null,
      faultCount: 0,
      lastFault: null,
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
        name: null,
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
        name: null,
        at: fault.at,
        message: fault.message,
        href: fault.href,
        appVersion: fault.appVersion,
      });
    }
  }

  for (const [id, roster] of latestRoster) {
    const row = person(id);
    names.set(id, roster.name);
    row.name = roster.name;
    row.email = roster.email;
    row.phone = roster.phone;
    row.age = roster.age;
    row.heightCm = roster.heightCm;
    row.weightKg = roster.weightKg;
    row.activity = roster.activity;
    row.struggles = roster.struggles;
    row.targetSleep = roster.targetSleep;
    row.targetWake = roster.targetWake;
    row.lastAppVersion = roster.appVersion;
  }

  for (const [id, pack] of latestPack) {
    const row = person(id);
    row.nightsLogged = pack.nights.length;
    row.lastNightAt = pack.nights.length ? "logged" : null;
  }

  for (const night of nights) night.name = names.get(night.participantId) ?? null;
  for (const fault of faults) fault.name = names.get(fault.participantId) ?? null;

  const peopleList = [...people.values()].sort((a, b) => (a.name ?? a.participantId).localeCompare(b.name ?? b.participantId));
  faults.sort((a, b) => b.at.localeCompare(a.at));
  nights.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

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
