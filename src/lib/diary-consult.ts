import type { MorningReport, Profile } from "./types";
import {
  availableMorningDates,
  buildWeekReview,
  formatMorningDate,
  formatNightNote,
  lastSevenReports,
  listMorningDates,
} from "./week-review";

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_ALT = Object.keys(MONTH_INDEX).join("|");

type DateHit = { month: number; day: number; year?: number; at: number; label: string };

type DiaryAsk =
  | { kind: "night"; report: MorningReport }
  | { kind: "week" }
  | { kind: "missing"; label: string };

const DEEP =
  /break\s*downs?|walk me through|how (did|was|is) (my )?sleep|how did i sleep|deeper (look|read|note|breakdown)|my (sleep|mornings?|nights?|diary|chart)|that night|that morning|these mornings|on the chart/;
const LAST = /last night|last morning|yesterday morning|yesterday|this morning|the latest morning/;
const WEEK = /this week|my week|\bthe week\b|weekly|these (last )?(seven|7) nights/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hitsIn(q: string): DateHit[] {
  const hits: DateHit[] = [];
  const push = (hit: DateHit) => {
    if (hit.month < 1 || hit.month > 12 || hit.day < 1 || hit.day > 31) return;
    hits.push(hit);
  };

  for (const m of q.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    push({
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      at: m.index ?? 0,
      label: formatMorningDate(m[0]!),
    });
  }

  for (const m of q.matchAll(new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"))) {
    const month = MONTH_INDEX[m[1]!.toLowerCase()];
    const day = Number(m[2]);
    if (!month) continue;
    push({
      month,
      day,
      at: m.index ?? 0,
      label: formatMorningDate(`2026-${pad2(month)}-${pad2(day)}`),
    });
  }

  for (const m of q.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\.?\\b`, "gi"))) {
    const day = Number(m[1]);
    const month = MONTH_INDEX[m[2]!.toLowerCase()];
    if (!month) continue;
    push({
      month,
      day,
      at: m.index ?? 0,
      label: formatMorningDate(`2026-${pad2(month)}-${pad2(day)}`),
    });
  }

  for (const m of q.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g)) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const yearRaw = m[3];
    const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : undefined;
    push({
      month,
      day,
      year,
      at: m.index ?? 0,
      label: formatMorningDate(`2026-${pad2(month)}-${pad2(day)}`),
    });
  }

  for (const m of q.matchAll(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/gi)) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    hits.push({
      month: 0,
      day,
      at: m.index ?? 0,
      label: `the ${day}`,
    });
  }

  return hits.sort((a, b) => a.at - b.at);
}

function matchHit(hit: DateHit, reports: MorningReport[]): MorningReport[] {
  const sorted = [...reports].sort((a, b) => a.morningDate.localeCompare(b.morningDate));
  return sorted.filter((r) => {
    const [, ms, ds] = r.morningDate.split("-");
    const month = Number(ms);
    const day = Number(ds);
    if (hit.month === 0) return day === hit.day;
    if (month !== hit.month || day !== hit.day) return false;
    if (hit.year && Number(r.morningDate.slice(0, 4)) !== hit.year) return false;
    return true;
  });
}

export function parseDiaryAsk(q: string, reports: MorningReport[]): DiaryAsk | null {
  const lower = q.toLowerCase();
  const hits = hitsIn(lower);
  const lastHit = hits[hits.length - 1];
  const deep = DEEP.test(lower);
  const last = LAST.test(lower);
  const week = WEEK.test(lower);

  if (lastHit) {
    const matched = matchHit(lastHit, reports);
    if (matched.length >= 1) return { kind: "night", report: matched[matched.length - 1]! };
    if (lastHit.month !== 0) return { kind: "missing", label: lastHit.label };
    if (deep || last || week) return { kind: "missing", label: lastHit.label };
  }

  if (deep && last) {
    const latest = lastSevenReports(reports).at(-1);
    if (latest) return { kind: "night", report: latest };
    return { kind: "missing", label: "last night" };
  }

  if (week && (deep || /sleep|mornings?|nights?/.test(lower))) return { kind: "week" };
  if (deep && !lastHit) return { kind: "week" };
  return null;
}

function nightCitations(report: MorningReport): string[] {
  const ids: string[] = [];
  if (report.sleepLatencyMinutes >= 30 || report.wokeInNight) ids.push("sleep-pressure");
  if (report.drank) ids.push("alcohol");
  if (report.screenOffMinutes <= 15) ids.push("light-screens");
  if (report.windDownHelped === "yes" || report.windDownHelped === "no") ids.push("wind-down");
  if (ids.length === 0) ids.push("duration-age");
  return ids.slice(0, 4);
}

function consultNight(report: MorningReport, profile: Profile, all: MorningReport[]): string {
  const note = formatNightNote(report, profile, "consult");
  const others = lastSevenReports(all).filter((r) => r.morningDate !== report.morningDate);
  if (others.length === 0) return note;
  const better = others.filter((r) => r.rating > report.rating);
  const worse = others.filter((r) => r.rating < report.rating);
  if (better.length > 0) {
    return `${note} Compared with ${listMorningDates(better)}, this is the worse morning.`;
  }
  if (worse.length > 0) {
    return `${note} Compared with ${listMorningDates(worse)}, this is the better morning.`;
  }
  return `${note} The other mornings in this window rated about the same.`;
}

function consultWeek(profile: Profile, reports: MorningReport[]): string {
  const window = lastSevenReports(reports);
  const review = buildWeekReview(profile, reports);
  const nights = window.map((r) => formatNightNote(r, profile, "card")).join(" ");
  const next = review.doThis[0] ? ` What I would try: ${review.doThis[0]}` : "";
  return `${review.read.replace(/\n\n/g, " ")} Night by night: ${nights}.${next}`;
}

/**
 * Grounded answers from the morning log. Null means this is not a diary question
 * (or there is no chart yet) — chat should keep routing.
 */
export function answerDiaryQuestion(
  question: string,
  profile: Profile,
  reports: MorningReport[],
): { text: string; citations: string[] } | null {
  if (reports.length === 0) return null;
  const ask = parseDiaryAsk(question, reports);
  if (!ask) return null;

  if (ask.kind === "missing") {
    const have = availableMorningDates(reports);
    return {
      text: have
        ? `I do not have a morning for ${ask.label}. The nights on the chart are ${have}. Ask about one of those, or log that morning first.`
        : `I do not have a morning for ${ask.label} yet. Log it in the morning interview and I can walk through it.`,
      citations: ["duration-age"],
    };
  }

  if (ask.kind === "night") {
    return {
      text: consultNight(ask.report, profile, reports),
      citations: nightCitations(ask.report),
    };
  }

  const window = lastSevenReports(reports);
  const review = buildWeekReview(profile, reports);
  const cites = [
    ...new Set(window.flatMap((r) => nightCitations(r))),
  ].slice(0, 4);
  return {
    text: consultWeek(profile, reports),
    citations: cites.length > 0 ? cites : review.doThis.length > 0 ? ["circadian-anchor"] : ["duration-age"],
  };
}
