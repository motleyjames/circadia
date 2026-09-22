import { inviteCodeVersion, isCohort, isPackSafetyCategory, type Cohort, type OperatorInvite } from "@/lib/invite";
import { PRODUCT_NAME } from "@/lib/product";

export { dismissOrphan, nameOrphan, restoreOrphan } from "@/lib/invite";
import { inboxStampKey } from "@/lib/moderator";
import { nightGeometry } from "@/lib/sleep-metrics";
import type { PackSafetyCategory, StudyNight, StudyPack } from "@/lib/types";

export const BASELINE_NIGHTS = 14;
export const NOT_FILING_THRESHOLD = 0.8;
export const NOT_FILING_LOOKBACK = 2;

/** Names come only from the invite book. Never invent one. */
export const CONSOLE_NAME_SOURCE = "invite-book" as const;

export const INVITE_PRIVACY_TAIL =
  "It belongs to them alone: if two people use one code, their nights merge into a single record.";

export type ConsoleArrival = {
  file: string;
  pack: StudyPack;
};

export type ConsoleReject = {
  reason: string;
  arrivedAt: string;
  file?: string;
};

export type SlotKind = "bar" | "outline" | "dashed" | "empty";

export type NightSlot = {
  kind: SlotKind;
  efficiencyPct: number | null;
};

export type ConsoleSectionId =
  | "safety"
  | "not-filing"
  | "baseline-complete"
  | "in-baseline"
  | "not-enrolled";

export type ConsoleTester = {
  participantId: string;
  name: string | null;
  inBook: boolean;
  dismissed: boolean;
  withdrawn: boolean;
  cohort: Cohort | null;
  cohortLabel: string;
  section: ConsoleSectionId;
  nightsElapsed: number | null;
  nightsFiled: number;
  packNightCount: number;
  completion: number | null;
  progressLabel: string;
  filedLabel: string;
  sleepEfficiencyPct: number | null;
  slots: NightSlot[];
  flags: PackSafetyCategory[];
  reason: string;
  lastSync: string;
  action: "name" | "export" | null;
};

export type ConsoleSection = {
  id: ConsoleSectionId;
  title: string;
  testers: ConsoleTester[];
};

export type DataHealthItem = {
  kind: "unreadable" | "orphan" | "unreachable" | "shrunk" | "unreached";
  message: string;
  detail: string | null;
  files: string[];
  participantId: string | null;
  actions: { id: "name" | "dismiss" | "why"; label: string }[];
};

export type CompletionLine = {
  sentence: string;
  percentLabel: string;
  covered: number;
};

export type ConsoleModel = {
  weekLabel: string;
  completion: CompletionLine | null;
  sections: ConsoleSection[];
  testers: ConsoleTester[];
  weekTesters: ConsoleTester[];
  allTesters: AllTesterRow[];
  health: DataHealthItem[] | null;
  attentionCount: number;
  empty: boolean;
};

export type InviteBookRow = {
  participantId: string;
  name: string;
  code: string | null;
  cohort: Cohort | null;
  cohortLabel: string;
  joined: boolean;
  status: string;
  dismissed: boolean;
};

export type AllTesterRow = {
  participantId: string;
  name: string | null;
  state: string;
  nightCount: number;
  lastSync: string;
  dismissed: boolean;
};

const SECTION_TITLE: Record<ConsoleSectionId, string> = {
  safety: "Safety",
  "not-filing": "Not filing",
  "baseline-complete": "Baseline complete",
  "in-baseline": "In baseline",
  "not-enrolled": "Not enrolled",
};

const COHORT_LABEL: Record<Cohort, string> = {
  friend: "Friend",
  stranger: "Stranger",
  lab: "Sleep lab",
};

const COHORT_SENTENCE: Record<Cohort, string> = {
  stranger: "strangers",
  friend: "friends",
  lab: "sleep lab",
};

const COHORT_SENTENCE_ORDER: Cohort[] = ["stranger", "friend", "lab"];

export function parseInboxStamp(file: string): Date | null {
  const key = inboxStampKey(file);
  const m = key.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?Z$/);
  if (!m) return null;
  const ms = (m[5] ?? "000").padStart(3, "0").slice(0, 3);
  const date = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${ms}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatLastSync(arrived: Date, now: Date): string {
  const diffMs = now.getTime() - arrived.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (sameCalendarDay(arrived, now)) return `Today, ${formatClock(arrived)}`;
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(arrived).getTime()) / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return arrived.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function weekOfLabel(now: Date): string {
  const day = now.getDay();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  return `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] || "your tester";
}

export function invitePrivacySentence(name: string): string {
  return `Send this to ${firstNameOf(name)}. ${INVITE_PRIVACY_TAIL}`;
}

export function inviteSendBody(code: string): string {
  return `Your ${PRODUCT_NAME} code is ${code}. Enter it when the app asks for one. It is yours alone — please don't share it.`;
}

export function smsHref(to: string, body: string): string {
  const number = to.replace(/[^\d+]/g, "");
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}

export function mailtoHref(to: string, body: string): string {
  return `mailto:${to.trim()}?body=${encodeURIComponent(body)}`;
}

export function cohortLabel(cohort: Cohort | null, inBook: boolean): string {
  if (!inBook || !cohort || !isCohort(cohort)) return "Not in your book";
  return COHORT_LABEL[cohort];
}

export function shortTesterId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export function buildInviteBook(
  book: readonly OperatorInvite[],
  arrivals: readonly ConsoleArrival[],
  now: Date,
  withdrawn: readonly string[] = [],
): InviteBookRow[] {
  const firstArrival = new Map<string, Date>();
  for (const row of arrivals) {
    const id = row.pack.participantId.toLowerCase();
    const at = parseInboxStamp(row.file);
    if (!at) continue;
    const prev = firstArrival.get(id);
    if (!prev || at < prev) firstArrival.set(id, at);
  }
  const withdrawnSet = new Set(withdrawn.map((id) => id.toLowerCase()));
  return book.map((invite) => {
    const joinedAt = firstArrival.get(invite.participantId.toLowerCase()) ?? null;
    const left = withdrawnSet.has(invite.participantId.toLowerCase());
    return {
      participantId: invite.participantId,
      name: invite.name,
      code: invite.code,
      cohort: invite.cohort,
      cohortLabel: invite.cohort ? COHORT_LABEL[invite.cohort] : "—",
      joined: joinedAt !== null && !left,
      status: inviteCodeVersion(invite.code) === 1
        ? "Needs a new invite"
        : left
          ? "Withdrawn"
          : joinedAt
            ? `Joined ${joinedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "Not joined yet",
      dismissed: invite.dismissed,
    };
  });
}

export function buildConsoleModel(input: {
  arrivals: readonly ConsoleArrival[];
  book: readonly OperatorInvite[];
  rejects: readonly ConsoleReject[];
  now: Date;
  withdrawn?: readonly string[];
  workerUnreachable?: boolean;
}): ConsoleModel {
  const byPerson = new Map<string, ConsoleArrival[]>();
  for (const row of input.arrivals) {
    const id = row.pack.participantId.toLowerCase();
    const list = byPerson.get(id);
    if (list) list.push(row);
    else byPerson.set(id, [row]);
  }

  const withdrawn = new Set((input.withdrawn ?? []).map((id) => id.toLowerCase()));
  const testers: ConsoleTester[] = [];
  for (const [participantId, rows] of byPerson) {
    testers.push(stitchTester(participantId, rows, input.book, input.now, withdrawn.has(participantId)));
  }

  const weekTesters = testers.filter((row) => !row.dismissed && !row.withdrawn);
  const buckets: Record<ConsoleSectionId, ConsoleTester[]> = {
    safety: [],
    "not-filing": [],
    "baseline-complete": [],
    "in-baseline": [],
    "not-enrolled": [],
  };
  for (const tester of weekTesters) {
    if (tester.section === "safety") buckets.safety.push(tester);
    else if (tester.section === "not-filing") buckets["not-filing"].push(tester);
    else if (tester.section === "baseline-complete") buckets["baseline-complete"].push(tester);
    else if (tester.section === "not-enrolled") buckets["not-enrolled"].push(tester);
    else buckets["in-baseline"].push(tester);
  }

  const sections: ConsoleSection[] = (
    ["safety", "not-filing", "in-baseline", "baseline-complete", "not-enrolled"] as const
  )
    .filter((id) => buckets[id].length)
    .map((id) => ({ id, title: SECTION_TITLE[id], testers: buckets[id] }));

  const health = dataHealth(
    weekTesters,
    liveRejects(input.rejects, input.arrivals),
    input.now,
    input.workerUnreachable === true,
    input.arrivals,
  );

  return {
    weekLabel: weekOfLabel(input.now),
    completion: completionLine(weekTesters),
    sections,
    testers,
    weekTesters,
    allTesters: testers.map((row) => ({
      participantId: row.participantId,
      name: row.name,
      state: row.dismissed ? "Dismissed" : row.withdrawn ? "Withdrawn" : SECTION_TITLE[row.section],
      nightCount: row.section === "not-enrolled" ? row.packNightCount : row.nightsFiled,
      lastSync: row.lastSync,
      dismissed: row.dismissed,
    })),
    health,
    attentionCount: buckets.safety.length + buckets["not-filing"].length,
    empty: weekTesters.length === 0,
  };
}

function stitchTester(
  participantId: string,
  rows: ConsoleArrival[],
  book: readonly OperatorInvite[],
  now: Date,
  withdrawn: boolean,
): ConsoleTester {
  const ordered = [...rows].sort((a, b) => inboxStampKey(a.file).localeCompare(inboxStampKey(b.file)));
  const newest = ordered[ordered.length - 1]!;
  const nightsElapsed = Number.isInteger(newest.pack.nightsElapsed) ? newest.pack.nightsElapsed! : null;
  const flags = allowlistedFlags(newest.pack.safetyFlags);
  const packNights = newest.pack.nights;
  const packNightCount = packNights.length;
  const source = newest.pack.nights;
  const filed = new Map<number, { night: StudyNight; efficiencyPct: number | null }>();
  for (const night of source) {
    if (night.episodeNight === undefined) continue;
    if (!Number.isInteger(night.episodeNight) || night.episodeNight < 0) continue;
    if (nightsElapsed !== null && night.episodeNight >= nightsElapsed) continue;
    filed.set(night.episodeNight, { night, efficiencyPct: nightEfficiency(night) });
  }

  const notEnrolled = nightsElapsed === null;
  const nightsFiled = notEnrolled ? packNightCount : filed.size;
  const rawCompletion =
    nightsElapsed === null || nightsElapsed <= 0 ? null : filed.size / nightsElapsed;
  const completion = rawCompletion === null ? null : Math.min(1, rawCompletion);
  const missedLastTwo = nightsElapsed !== null && lastTwoUnfiled(nightsElapsed, filed);
  const belowThreshold = completion !== null && completion < NOT_FILING_THRESHOLD;
  const notFiling = missedLastTwo || belowThreshold;
  const section = sectionFor(flags, notFiling, nightsElapsed);

  const invite = book.find((row) => row.participantId.toLowerCase() === participantId) ?? null;
  const inBook = Boolean(invite?.name) && CONSOLE_NAME_SOURCE === "invite-book";
  const name = inBook ? invite!.name : null;
  const cohort = inBook ? invite!.cohort : null;
  const dismissed = invite?.dismissed === true;
  const arrived = parseInboxStamp(newest.file);
  const slots = notEnrolled ? [] : buildSlots(filed, nightsElapsed);
  const scored = (notEnrolled ? packNights : [...filed.values()].map((row) => row.night))
    .map(nightEfficiency)
    .filter((n): n is number => n !== null);
  const sleepEfficiencyPct = scored.length
    ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
    : null;
  const missed = nightsElapsed !== null ? Math.max(0, nightsElapsed - filed.size) : 0;
  const orphan = !inBook;

  return {
    participantId,
    name,
    inBook,
    dismissed,
    withdrawn,
    cohort,
    cohortLabel: cohortLabel(cohort, inBook),
    section,
    nightsElapsed,
    nightsFiled,
    packNightCount,
    completion,
    progressLabel: progressLabel(nightsElapsed, packNightCount),
    filedLabel: filedLabel(nightsElapsed, nightsFiled, packNightCount),
    sleepEfficiencyPct,
    slots,
    flags,
    reason: reasonFor({ section, flags, missedLastTwo, nightsElapsed, nightsFiled, missed, orphan }),
    lastSync: arrived ? formatLastSync(arrived, now) : "—",
    action: orphan ? "name" : section === "baseline-complete" ? "export" : null,
  };
}

function sectionFor(
  flags: readonly PackSafetyCategory[],
  notFiling: boolean,
  nightsElapsed: number | null,
): ConsoleSectionId {
  if (flags.length > 0) return "safety";
  if (nightsElapsed === null) return "not-enrolled";
  if (notFiling) return "not-filing";
  if (nightsElapsed !== null && nightsElapsed >= BASELINE_NIGHTS) return "baseline-complete";
  return "in-baseline";
}

function lastTwoUnfiled(nightsElapsed: number, filed: Map<number, unknown>): boolean {
  if (nightsElapsed <= 0) return false;
  const start = Math.max(0, nightsElapsed - NOT_FILING_LOOKBACK);
  for (let night = start; night < nightsElapsed; night++) {
    if (filed.has(night)) return false;
  }
  return true;
}

function buildSlots(
  filed: Map<number, { efficiencyPct: number | null }>,
  nightsElapsed: number | null,
): NightSlot[] {
  const slots: NightSlot[] = [];
  for (let i = 0; i < BASELINE_NIGHTS; i++) {
    const row = filed.get(i);
    if (row) {
      slots.push(
        row.efficiencyPct !== null
          ? { kind: "bar", efficiencyPct: row.efficiencyPct }
          : { kind: "outline", efficiencyPct: null },
      );
      continue;
    }
    if (nightsElapsed !== null && i < nightsElapsed) {
      slots.push({ kind: "dashed", efficiencyPct: null });
      continue;
    }
    slots.push({ kind: "empty", efficiencyPct: null });
  }
  return slots;
}

function allowlistedFlags(raw: unknown): PackSafetyCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<PackSafetyCategory>();
  const out: PackSafetyCategory[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const category = (row as { category?: unknown }).category;
    if (!isPackSafetyCategory(category)) continue;
    if (seen.has(category)) continue;
    seen.add(category);
    out.push(category);
  }
  return out;
}

function nightEfficiency(night: StudyNight): number | null {
  const geometry = nightGeometry({
    inBedAt: night.inBedAt,
    outOfBedAt: night.outOfBedAt,
    wokeAt: night.wokeAt,
    triedToSleepAt: night.triedToSleepAt,
    sleepLatencyMinutes: night.sleepLatencyMinutes,
    wokeInNight: night.wokeInNight,
    nightWakingMinutes: night.nightWakingMinutes,
    awakeningCount: night.awakeningCount,
  });
  return geometry ? geometry.efficiencyPct : null;
}

function progressLabel(nightsElapsed: number | null, _packNightCount: number): string {
  if (nightsElapsed === null) return "Not enrolled";
  if (nightsElapsed >= BASELINE_NIGHTS) return "Complete";
  return `Night ${nightsElapsed} of ${BASELINE_NIGHTS}`;
}

function filedLabel(nightsElapsed: number | null, nightsFiled: number, packNightCount: number): string {
  if (nightsElapsed === null) {
    const n = packNightCount;
    return `${n} ${n === 1 ? "night" : "nights"}, outside any baseline`;
  }
  if (nightsElapsed >= BASELINE_NIGHTS) {
    return `${nightsFiled} of ${BASELINE_NIGHTS} filed`;
  }
  return `${nightsFiled} filed`;
}

function reasonFor(input: {
  section: ConsoleSectionId;
  flags: readonly PackSafetyCategory[];
  missedLastTwo: boolean;
  nightsElapsed: number | null;
  nightsFiled: number;
  missed: number;
  orphan: boolean;
}): string {
  if (input.section === "safety") return safetyReason(input.flags);
  if (input.section === "not-enrolled") {
    return input.orphan
      ? "Nights are arriving, but this code has no name"
      : "These nights sit outside a baseline";
  }
  if (input.orphan && input.section === "in-baseline") {
    return "Nights are arriving, but this code has no name";
  }
  if (input.section === "not-filing") {
    if (input.missedLastTwo && input.missed > NOT_FILING_LOOKBACK) {
      return `No morning filed in the last 2 nights, and ${input.missed} missed in total`;
    }
    if (input.missedLastTwo) return "No morning filed in the last 2 nights";
    if (input.nightsElapsed !== null) {
      return `${input.missed} of ${input.nightsElapsed} mornings missed`;
    }
    return "Mornings are being missed";
  }
  if (input.section === "baseline-complete") return "The 14-night diary is ready";
  if (input.missed === 0) return "Every morning filed";
  if (input.nightsElapsed !== null) return `${input.nightsFiled} of ${input.nightsElapsed} mornings filed`;
  return "Nights are arriving";
}

function safetyReason(flags: readonly PackSafetyCategory[]): string {
  const apnea = flags.includes("witnessed-apnea");
  const drowsy = flags.includes("drowsy-driving");
  if (apnea && drowsy) {
    return "Reported witnessed apnea and drowsy driving. Worth telling them once, plainly, to see a doctor.";
  }
  if (drowsy) return "Reported drowsy driving. Worth telling them once, plainly, to see a doctor.";
  return "Reported witnessed apnea. Worth telling them once, plainly, to see a doctor.";
}

function completionLine(testers: readonly ConsoleTester[]): CompletionLine | null {
  const covered = testers.filter(
    (row) =>
      row.inBook &&
      row.nightsElapsed !== null &&
      row.nightsElapsed > 0 &&
      row.section !== "not-enrolled",
  );
  if (!covered.length) return null;
  const percent = ratioPercent(
    covered.reduce((sum, row) => sum + row.nightsFiled, 0),
    covered.reduce((sum, row) => sum + (row.nightsElapsed ?? 0), 0),
  );
  const parts = COHORT_SENTENCE_ORDER.flatMap((cohort) => {
    const group = covered.filter((row) => row.cohort === cohort);
    if (!group.length) return [];
    const label = COHORT_SENTENCE[cohort];
    const value = ratioPercent(
      group.reduce((sum, row) => sum + row.nightsFiled, 0),
      group.reduce((sum, row) => sum + (row.nightsElapsed ?? 0), 0),
    );
    return [`${label} ${value}%`];
  });
  const who = covered.length === 1 ? "1 named tester" : `${covered.length} named testers`;
  const rest = parts.length ? `: ${parts.join(", ")}` : "";
  return {
    percentLabel: `${percent}%`,
    covered: covered.length,
    sentence: `Completion so far is ${percent}% across ${who}${rest}.`,
  };
}

function liveRejects(
  rejects: readonly ConsoleReject[],
  arrivals: readonly ConsoleArrival[],
): ConsoleReject[] {
  const parsed = new Set(arrivals.map((row) => row.file));
  return rejects.filter((row) => !row.file || !parsed.has(row.file));
}

function reasonPhrase(reason: string): string {
  const trimmed = reason.trim().replace(/\.$/, "");
  return trimmed ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : "unreadable pack";
}

function rejectInstant(row: ConsoleReject): number {
  const fromFile = parseInboxStamp(row.arrivedAt);
  if (fromFile) return fromFile.getTime();
  const iso = new Date(row.arrivedAt);
  return Number.isFinite(iso.getTime()) ? iso.getTime() : Number.POSITIVE_INFINITY;
}

function dataHealth(
  testers: readonly ConsoleTester[],
  rejects: readonly ConsoleReject[],
  now: Date,
  workerUnreachable = false,
  arrivals: readonly ConsoleArrival[] = [],
): DataHealthItem[] | null {
  const items: DataHealthItem[] = [];
  if (workerUnreachable) {
    items.push({
      kind: "unreachable",
      message: "The Worker could not be reached. Nothing stored was changed.",
      detail: null,
      files: [],
      participantId: null,
      actions: [],
    });
  }
  const byReason = new Map<string, ConsoleReject[]>();
  for (const row of rejects) {
    const list = byReason.get(row.reason) ?? [];
    list.push(row);
    byReason.set(row.reason, list);
  }
  for (const [reason, rows] of byReason) {
    const ordered = [...rows].sort((a, b) => rejectInstant(a) - rejectInstant(b));
    const first = whenLabel(ordered[0]!.arrivedAt, now);
    const lastStamp = ordered.at(-1)!.arrivedAt;
    const last = rejectInstant(ordered.at(-1)!) !== rejectInstant(ordered[0]!) ? whenLabel(lastStamp, now) : null;
    const range = last ? `${first} to ${last}` : first;
    const n = rows.length;
    items.push({
      kind: "unreadable",
      message: `${n} ${n === 1 ? "pack" : "packs"} from ${range} couldn't be read: ${reasonPhrase(reason)}.`,
      detail: null,
      files: ordered.map((row) => row.file ?? row.arrivedAt),
      participantId: null,
      actions: [{ id: "why", label: "See why" }],
    });
  }
  for (const tester of testers) {
    if (tester.inBook) continue;
    const code = shortTesterId(tester.participantId);
    items.push({
      kind: "orphan",
      message: `Code ${code} isn't in your book. Add a name, or check whether a tester mistyped their code.`,
      detail: null,
      files: [],
      participantId: tester.participantId,
      actions: [
        { id: "name", label: "Add a name" },
        { id: "dismiss", label: "Dismiss" },
      ],
    });
  }
  const byPerson = new Map<string, ConsoleArrival[]>();
  for (const row of arrivals) {
    const id = row.pack.participantId.toLowerCase();
    const list = byPerson.get(id);
    if (list) list.push(row);
    else byPerson.set(id, [row]);
  }
  for (const tester of testers) {
    const rows = byPerson.get(tester.participantId.toLowerCase()) ?? [];
    const ordered = [...rows].sort((a, b) => inboxStampKey(a.file).localeCompare(inboxStampKey(b.file)));
    const newest = ordered.at(-1);
    const previous = ordered.at(-2);
    const label = tester.name ?? `Code ${shortTesterId(tester.participantId)}`;
    if (newest && previous && newest.pack.nights.length < previous.pack.nights.length) {
      items.push({
        kind: "shrunk",
        message: `${label}'s newest pack has fewer nights than the one before it.`,
        detail: null,
        files: [newest.file, previous.file],
        participantId: tester.participantId,
        actions: [],
      });
    }
    const elapsed = newest && Number.isInteger(newest.pack.nightsElapsed) ? newest.pack.nightsElapsed! : null;
    if (newest && elapsed !== null) {
      const unreached = newest.pack.nights.some(
        (night) =>
          night.episodeNight !== undefined &&
          Number.isInteger(night.episodeNight) &&
          night.episodeNight >= elapsed,
      );
      if (unreached) {
        items.push({
          kind: "unreached",
          message: `${label} has a night in a slot that has not been reached.`,
          detail: null,
          files: [newest.file],
          participantId: tester.participantId,
          actions: [],
        });
      }
    }
  }
  return items.length ? items : null;
}

export function ratioPercent(filed: number, elapsed: number): number {
  if (elapsed <= 0) return 0;
  return Math.min(100, Math.round((100 * filed) / elapsed));
}

function whenLabel(stamp: string, now: Date): string {
  const fromFile = parseInboxStamp(stamp);
  if (fromFile) return fromFile.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const iso = new Date(stamp);
  if (Number.isFinite(iso.getTime())) return iso.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return stamp;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatClock(value: Date): string {
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
