import type { ResearchArticle } from "./research";
import type { MorningReport, Profile } from "./types";
import { medicationClasses, profileBmi } from "./metrics";
import { researchById } from "./research";
import { computeSocialJetLag } from "./social-jetlag";
import {
  DEFAULT_HEIGHT_CM,
  DEFAULT_WEIGHT_KG,
  circularSpreadMinutes,
  clockToMinutes,
  formatClock,
  formatDuration,
  overnightDuration,
  sleepNeedHours,
} from "./time";
import { formatMorningDate } from "./week-review";

export type MorningReading = {
  articleId: string;
  title: string;
  why: string;
  note: string;
  kicker: string;
};

export type MorningReadingOptions = {
  /** Article ids already handed on recent mornings. Same night + same list stays deterministic. */
  recentIds?: readonly string[];
  /** Logs on or before this morning — used for regularity and social jet lag. */
  reports?: MorningReport[];
};

/** Catalog pages that need a signal Circadia does not collect in the morning bubbles. */
export const NEVER_AUTO_IDS = [
  "pregnancy-sleep",
  "jet-lag",
  "shift-work",
  "herbals",
  "nicotine",
  "cannabis-sleep",
  "restless-legs",
  "late-eating",
  "temperature",
  "caffeine",
  "activity",
  "prescription-hypnotics",
] as const;

/** These win even if that page was yesterday. A drink night is still a drink night. */
export const SAFETY_PIN_IDS = ["alcohol", "otc-antihistamines", "melatonin", "medications"] as const;

/** Skip this many recently handed pages among still-justified notes. */
export const READING_RECENCY = 4;

const NEVER_AUTO = new Set<string>(NEVER_AUTO_IDS);
const SAFETY_PIN = new Set<string>(SAFETY_PIN_IDS);
const LATE_WAKE_MINUTES = 10 * 60;
const REGULARITY_SPREAD_MINUTES = 75;
const SJL_PAGE_MINUTES = 60;

export function latestMorningReport(reports: MorningReport[]): MorningReport | null {
  if (reports.length === 0) return null;
  const sorted = sortMorningReports(reports);
  return sorted[sorted.length - 1] ?? null;
}

export function suggestMorningReading(
  profile: Profile,
  report: MorningReport,
  options: MorningReadingOptions = {},
): MorningReading {
  const reports = options.reports ?? [report];
  const id = pickArticleId(profile, report, options.recentIds ?? [], reports);
  return buildReading(id, profile, report, reports);
}

export function suggestMorningReadingForLogs(
  profile: Profile,
  reports: MorningReport[],
): MorningReading | null {
  const walked = walkMorningReadings(profile, reports);
  return walked.at(-1) ?? null;
}

/** Every morning's handed page, oldest first. Used to keep the Library shelf honest. */
export function morningReadingHistory(profile: Profile, reports: MorningReport[]): MorningReading[] {
  return walkMorningReadings(profile, reports);
}

export function recentMorningArticleIds(profile: Profile, reports: MorningReport[]): string[] {
  return morningReadingHistory(profile, reports).map((row) => row.articleId);
}

/**
 * Pinned reading first, then pages that have not been handed recently, then the rest.
 * Catalog relative order is preserved inside each group.
 */
export function orderLibraryArticles(
  articles: readonly ResearchArticle[],
  pinnedId: string | null,
  recentIds: readonly string[],
): ResearchArticle[] {
  const recent = new Set(recentIds);
  const pinned = pinnedId ? articles.find((article) => article.id === pinnedId) : undefined;
  const rest = articles.filter((article) => article.id !== pinnedId);
  const fresh = rest.filter((article) => !recent.has(article.id));
  const seen = rest.filter((article) => recent.has(article.id));
  return [...(pinned ? [pinned] : []), ...fresh, ...seen];
}

function walkMorningReadings(profile: Profile, reports: MorningReport[]): MorningReading[] {
  const sorted = sortMorningReports(reports);
  const recent: string[] = [];
  const out: MorningReading[] = [];
  for (const report of sorted) {
    const prior = reportsOnOrBefore(sorted, report);
    const reading = suggestMorningReading(profile, report, {
      recentIds: recent.slice(-READING_RECENCY),
      reports: prior,
    });
    out.push(reading);
    recent.push(reading.articleId);
  }
  return out;
}

function sortMorningReports(reports: MorningReport[]): MorningReport[] {
  return [...reports].sort((a, b) => {
    const byDate = a.morningDate.localeCompare(b.morningDate);
    if (byDate !== 0) return byDate;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function reportsOnOrBefore(reports: MorningReport[], report: MorningReport): MorningReport[] {
  return reports.filter((row) => {
    const byDate = row.morningDate.localeCompare(report.morningDate);
    if (byDate < 0) return true;
    if (byDate > 0) return false;
    return row.createdAt.localeCompare(report.createdAt) <= 0;
  });
}

function noonOnMorning(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
}

function pickArticleId(
  profile: Profile,
  report: MorningReport,
  recentIds: readonly string[],
  reports: MorningReport[],
): string {
  const ranked = rankedArticleIds(profile, report, reports);
  const top = ranked[0] ?? "circadian-anchor";
  if (SAFETY_PIN.has(top)) return top;
  const recent = new Set(recentIds);
  return ranked.find((id) => !recent.has(id)) ?? top;
}

function rankedArticleIds(profile: Profile, report: MorningReport, reports: MorningReport[]): string[] {
  const ids: string[] = [];
  const push = (id: string) => {
    if (NEVER_AUTO.has(id) || ids.includes(id)) return;
    if (!researchById(id)) return;
    ids.push(id);
  };

  const latency = report.sleepLatencyMinutes;
  const late = latency >= 30;
  const phone = report.screenOffMinutes <= 15;
  const wakeMinutes = clockToMinutes(report.wokeAt);
  const durMin = overnightDuration(report.fellAsleepAt, report.wokeAt);
  const need = sleepNeedHours(profile.age);
  const hours = durMin / 60;
  const short = hours + 0.5 < need.min;
  const kind = report.usedSupplement ? report.supplementKind : undefined;
  const stimulant = medicationClasses(profile.medications).includes("stimulant");
  const bmi = profileBmi(profile);
  const bodyMeasured =
    profile.heightCm !== DEFAULT_HEIGHT_CM || profile.weightKg !== DEFAULT_WEIGHT_KG;
  const window = reportsOnOrBefore(reports, report);

  if (report.drank) push("alcohol");
  if (kind === "antihistamine") push("otc-antihistamines");
  if (kind === "melatonin" || kind === "both") push("melatonin");
  if (stimulant && late) push("medications");
  if (late) push("sleep-pressure");
  if (report.wokeInNight && report.nightWakingMinutes >= 10) push("sleep-pressure");
  if (phone) push("light-screens");
  if (
    (report.windDownHelped === "no" || report.windDownHelped === "did_not_use") &&
    report.rating <= 2
  ) {
    push("wind-down");
  }
  if (wakeMinutes >= LATE_WAKE_MINUTES) {
    push("circadian-anchor");
    push("naps");
  }
  if (short) push("sleep-debt");
  if (report.dream?.text?.trim()) push("dreams");
  if (bodyMeasured && bmi >= 30 && report.rating <= 2 && hours >= 8) push("bmi-osa");
  if (kind === "magnesium") push("magnesium");

  const sjl = computeSocialJetLag(window, profile.scheduledDays, noonOnMorning(report.morningDate));
  if (sjl && sjl.socialJetLagMinutes >= SJL_PAGE_MINUTES) push("social-jetlag");

  if (window.length >= 3) {
    const spread = circularSpreadMinutes(window.map((row) => row.wokeAt));
    if (spread >= REGULARITY_SPREAD_MINUTES) push("sleep-regularity");
  }

  if (report.screenOffMinutes > 15 && report.screenOffMinutes < 60) push("light-screens");

  push("circadian-anchor");
  push("morning-light");
  push("duration-age");
  return ids;
}

function buildReading(
  id: string,
  profile: Profile,
  report: MorningReport,
  reports: MorningReport[],
): MorningReading {
  const article = researchById(id) ?? researchById("circadian-anchor");
  if (!article) {
    throw new Error("Library is missing the circadian-anchor note.");
  }
  return {
    articleId: article.id,
    title: article.title,
    why: whyFor(article.id, profile, report, reports),
    note: article.say ?? article.summary,
    kicker: `From this morning · ${formatMorningDate(report.morningDate)}`,
  };
}

function whyFor(id: string, profile: Profile, report: MorningReport, reports: MorningReport[]): string {
  const date = formatMorningDate(report.morningDate);
  const rating = `${report.rating}/5`;
  const wake = formatClock(report.wokeAt, profile.units);
  const dur = formatDuration(overnightDuration(report.fellAsleepAt, report.wokeAt));
  const latency = `about ${report.sleepLatencyMinutes} minutes`;
  const window = reportsOnOrBefore(reports, report);

  switch (id) {
    case "alcohol": {
      const count = report.drinkCount != null ? ` (${report.drinkCount})` : "";
      const spins = report.spins ? ", with spins" : "";
      return `You logged drinks on ${date}${count}${spins}, and rated it ${rating}. This is the note I would hand you before we talk about anything in the aisle.`;
    }
    case "otc-antihistamines":
      return `You used an aisle sleep aid on ${date}. Read this before the next bottle — it is not a sleep medicine in the way people think.`;
    case "melatonin":
      return report.supplementKind === "both"
        ? `You used melatonin and magnesium on ${date}. Melatonin first: it is a clock signal, not a reason to take more.`
        : `You used melatonin on ${date}. This is what it actually is — a clock signal — not a reason to take more.`;
    case "medications":
      return `You have a stimulant-class medication on file, and it took ${latency} to fall asleep on ${date}. Timing is a conversation with your prescriber — not a change from this app.`;
    case "sleep-pressure":
      if (report.sleepLatencyMinutes >= 30) {
        return `It took ${latency} to fall asleep on ${date}. Sleep pressure is the lever — not another tablet.`;
      }
      return `You were up in the night on ${date}${nightWakeClause(report)}. Fragmented sleep is usually pressure, drinks, or the clock — you logged no drinks, so start here.`;
    case "light-screens":
      return report.screenOffMinutes === 0
        ? `The phone was still in bed on ${date}. Light and content at that hour are not a small variable.`
        : `Screens were down about ${report.screenOffMinutes} minutes on ${date}. The hour before bed is still the gate — dim, boring, offline.`;
    case "wind-down":
      return `Wind-down ${windDownVerb(report.windDownHelped)} on ${date}, and the night still rated ${rating}. The hour before bed is a skill, not a mood.`;
    case "circadian-anchor":
      if (clockToMinutes(report.wokeAt) >= LATE_WAKE_MINUTES) {
        return `You got up at ${wake} on ${date}. The morning is the stake. This is the note on why a late get-up writes tonight's delay.`;
      }
      return `A ${rating} night on ${date}, up at ${wake}. Protect that get-up time. This is the note on why the morning, not the bedtime, is the stake.`;
    case "naps":
      return `You got up at ${wake} on ${date}. Sleeping in feels like catching up and trains a later clock. Protect the wake; a short early nap is the safer repayment.`;
    case "sleep-debt":
      return `${date} was ${dur} against a need closer to ${needBand(profile.age)}. Debt is real; sleeping in is usually the wrong repayment.`;
    case "dreams":
      return `You wrote a dream down on ${date}. This is what dreams actually are — physiology and a noisy narrator, not a dictionary.`;
    case "bmi-osa":
      return `${date} ran long (${dur}) and still rated ${rating}. When sleep is long and unrefreshing, airway belongs on the checklist — with a clinician, not an aisle.`;
    case "magnesium":
      return `You used magnesium on ${date}. Modest evidence. Not a cure. Read this so the bottle does not outrank the clock.`;
    case "social-jetlag": {
      const sjl = computeSocialJetLag(window, profile.scheduledDays, noonOnMorning(report.morningDate));
      if (sjl && sjl.socialJetLagMinutes >= 1) {
        return `Obligated mornings and free mornings differ by about ${formatDuration(sjl.socialJetLagMinutes)}. That gap is this page — a schedule fact, not a forecast.`;
      }
      return `Obligated mornings and free mornings are not sitting at the same time. That gap is this page.`;
    }
    case "sleep-regularity": {
      const spread = Math.round(circularSpreadMinutes(window.map((row) => row.wokeAt)));
      return `Get-up times are swinging by about ${spread} minutes across recent mornings, including ${date}. A moving target is this page.`;
    }
    case "morning-light":
      return `Up at ${wake} on ${date}. Outdoor light in that first hour is the other half of protecting the morning.`;
    case "duration-age":
      return `${date} was ${dur} against a need closer to ${needBand(profile.age)} for your age. Duration is only one score — but it is still a score.`;
    default:
      return `A ${rating} night on ${date}. This is the page that morning earned.`;
  }
}

function nightWakeClause(report: MorningReport): string {
  if (!report.nightWakingMinutes) return "";
  return `, about ${report.nightWakingMinutes} minutes`;
}

function windDownVerb(help: MorningReport["windDownHelped"]): string {
  if (help === "no") return "did not help";
  if (help === "did_not_use") return "was skipped";
  if (help === "a_bit") return "helped only a bit";
  return "was used";
}

function needBand(age: number): string {
  const need = sleepNeedHours(age);
  return `${need.min}–${need.max} hours`;
}
