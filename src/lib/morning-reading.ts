import type { MorningReport, Profile } from "./types";
import { medicationClasses, profileBmi } from "./metrics";
import { researchById } from "./research";
import {
  DEFAULT_HEIGHT_CM,
  DEFAULT_WEIGHT_KG,
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

const LATE_WAKE_MINUTES = 10 * 60;

export function latestMorningReport(reports: MorningReport[]): MorningReport | null {
  if (reports.length === 0) return null;
  const sorted = [...reports].sort((a, b) => {
    const byDate = a.morningDate.localeCompare(b.morningDate);
    if (byDate !== 0) return byDate;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return sorted[sorted.length - 1] ?? null;
}

export function suggestMorningReading(
  profile: Profile,
  report: MorningReport,
): MorningReading {
  const id = pickArticleId(profile, report);
  return buildReading(id, profile, report);
}

export function suggestMorningReadingForLogs(
  profile: Profile,
  reports: MorningReport[],
): MorningReading | null {
  const latest = latestMorningReport(reports);
  if (!latest) return null;
  return suggestMorningReading(profile, latest);
}

function pickArticleId(profile: Profile, report: MorningReport): string {
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

  // One page. Highest leverage on THIS night. Do not rotate for variety.
  if (report.drank) return "alcohol";
  if (kind === "antihistamine") return "otc-antihistamines";
  if (kind === "melatonin" || kind === "both") return "melatonin";
  if (stimulant && late) return "medications";
  if (late) return "sleep-pressure";
  if (report.wokeInNight && report.nightWakingMinutes >= 10) return "sleep-pressure";
  if (phone) return "light-screens";
  if (
    (report.windDownHelped === "no" || report.windDownHelped === "did_not_use") &&
    report.rating <= 2
  ) {
    return "wind-down";
  }
  if (wakeMinutes >= LATE_WAKE_MINUTES) return "circadian-anchor";
  if (short) return "sleep-debt";
  if (report.dream?.text?.trim()) return "dreams";
  if (bodyMeasured && bmi >= 30 && report.rating <= 2 && hours >= 8) return "bmi-osa";
  if (kind === "magnesium") return "magnesium";
  return "circadian-anchor";
}

function buildReading(id: string, profile: Profile, report: MorningReport): MorningReading {
  const article = researchById(id) ?? researchById("circadian-anchor");
  if (!article) {
    throw new Error("Library is missing the circadian-anchor note.");
  }
  return {
    articleId: article.id,
    title: article.title,
    why: whyFor(article.id, profile, report),
    note: article.say ?? article.summary,
    kicker: `From this morning · ${formatMorningDate(report.morningDate)}`,
  };
}

function whyFor(id: string, profile: Profile, report: MorningReport): string {
  const date = formatMorningDate(report.morningDate);
  const rating = `${report.rating}/5`;
  const wake = formatClock(report.wokeAt, profile.units);
  const dur = formatDuration(overnightDuration(report.fellAsleepAt, report.wokeAt));
  const latency = `about ${report.sleepLatencyMinutes} minutes`;

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
    case "sleep-debt":
      return `${date} was ${dur} against a need closer to ${needBand(profile.age)}. Debt is real; sleeping in is usually the wrong repayment.`;
    case "dreams":
      return `You wrote a dream down on ${date}. This is what dreams actually are — physiology and a noisy narrator, not a dictionary.`;
    case "bmi-osa":
      return `${date} ran long (${dur}) and still rated ${rating}. When sleep is long and unrefreshing, airway belongs on the checklist — with a clinician, not an aisle.`;
    case "magnesium":
      return `You used magnesium on ${date}. Modest evidence. Not a cure. Read this so the bottle does not outrank the clock.`;
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
