import type { MedicationClass, MorningReport, NightMetrics, Profile, WeekBreakdown } from "@/lib/types";
import {
  bmiKgM,
  circularMeanMinutes,
  circularSpreadMinutes,
  clockToMinutes,
  mean,
  overnightDuration,
  midpointMinutes,
  sleepNeedHours,
} from "@/lib/time";

export function metricsForReport(report: MorningReport): NightMetrics {
  return {
    reportId: report.id,
    morningDate: report.morningDate,
    durationMinutes: overnightDuration(report.fellAsleepAt, report.wokeAt),
    midpointMinutes: midpointMinutes(report.fellAsleepAt, report.wokeAt),
    rating: report.rating,
    drank: report.drank,
    screenOffMinutes: report.screenOffMinutes,
    sleepLatencyMinutes: report.sleepLatencyMinutes,
    wokeInNight: report.wokeInNight,
  };
}

export function weekBreakdown(reports: MorningReport[]): WeekBreakdown {
  const sorted = [...reports].sort((a, b) => a.morningDate.localeCompare(b.morningDate));
  const nights = sorted.map(metricsForReport);
  return {
    nights,
    meanDurationMinutes: mean(nights.map((n) => n.durationMinutes)),
    meanRating: mean(nights.map((n) => n.rating)),
    meanLatencyMinutes: mean(nights.map((n) => n.sleepLatencyMinutes)),
    meanScreenOffMinutes: mean(nights.map((n) => n.screenOffMinutes)),
    alcoholNights: nights.filter((n) => n.drank).length,
    wakeSpreadMinutes: circularSpreadMinutes(sorted.map((r) => r.wokeAt)),
    sleepSpreadMinutes: circularSpreadMinutes(sorted.map((r) => r.fellAsleepAt)),
    meanMidpointMinutes: circularMeanMinutes(sorted.map((r) => {
      const mid = midpointMinutes(r.fellAsleepAt, r.wokeAt);
      const h = Math.floor(mid / 60);
      const m = Math.round(mid % 60);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    })),
    nightsWithHighLatency: nights.filter((n) => n.sleepLatencyMinutes >= 30).length,
    nightsWokeInNight: nights.filter((n) => n.wokeInNight).length,
  };
}

export function durationVsNeed(meanMinutes: number, age: number): "short" | "in_band" | "long" {
  const need = sleepNeedHours(age);
  const hours = meanMinutes / 60;
  if (hours < need.min - 0.35) return "short";
  if (hours > need.max + 0.6) return "long";
  return "in_band";
}

export function profileBmi(profile: Profile): number {
  return bmiKgM(profile.weightKg, profile.heightCm);
}

export type MedicationFlag = {
  name: string;
  note: string;
};

const DISRUPTOR_PATTERNS: Array<{ pattern: RegExp; note: string; class: Exclude<MedicationClass, "other"> }> = [
  {
    pattern: /adderall|vyvanse|lisdexamfetamine|ritalin|concerta|methylphenidate|focalin|modafinil|armodafinil|provigil|nuvigil/,
    note: "Stimulant-class. Timing and late doses are a common insomnia cause. Ask your prescriber about last-dose clock time — do not change it from here.",
    class: "stimulant",
  },
  {
    pattern: /wellbutrin|bupropion|contrave/,
    note: "Bupropion is activating for many people. Morning dosing is typical; evening dosing collides with sleep.",
    class: "bupropion",
  },
  {
    pattern: /prozac|fluoxetine|zoloft|sertraline|lexapro|escitalopram|paxil|paroxetine|celexa|citalopram|ssri|snri|effexor|venlafaxine|cymbalta|duloxetine/,
    note: "Many antidepressants change sleep architecture and can cause insomnia or vivid dreams. That is a clinician conversation, not a supplement problem.",
    class: "antidepressant",
  },
  {
    pattern: /prednisone|prednisolone|methylprednisolone|dexamethasone|steroid/,
    note: "Systemic steroids are notorious for wired nights. Flag this on the nights you take them.",
    class: "steroid",
  },
  {
    pattern: /pseudoephedrine|sudafed|phenylephrine/,
    note: "Decongestants are stimulants in disguise. Avoid after mid-afternoon if sleep is the priority.",
    class: "decongestant",
  },
  {
    pattern: /propranolol|metoprolol|atenolol|beta.?block/,
    note: "Some beta blockers suppress melatonin and are linked to nightmares. Worth mentioning to the prescriber if dreams or sleep tanked after starting.",
    class: "beta-blocker",
  },
  {
    pattern: /benadryl|diphenhydramine|unisom|doxylamine|nyquil|pm\b/,
    note: "Antihistamine 'PM' drugs sedate you and often worsen sleep quality. They are not a sleep system.",
    class: "antihistamine",
  },
];

export function flagMedications(names: string[]): MedicationFlag[] {
  const flags: MedicationFlag[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    for (const row of DISRUPTOR_PATTERNS) {
      if (row.pattern.test(trimmed.toLowerCase())) {
        flags.push({ name: trimmed, note: row.note });
        break;
      }
    }
  }
  return flags;
}

/** Class labels only — never the string the person typed. */
export function medicationClasses(names: string[]): MedicationClass[] {
  const found = new Set<MedicationClass>();
  for (const name of names) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) continue;
    let hit: MedicationClass | null = null;
    for (const row of DISRUPTOR_PATTERNS) {
      if (row.pattern.test(trimmed)) {
        hit = row.class;
        break;
      }
    }
    found.add(hit ?? "other");
  }
  return [...found];
}

export function delayedClock(reports: MorningReport[], targetSleep: string): boolean {
  if (reports.length === 0) return false;
  const meanSleep = circularMeanMinutes(reports.map((r) => r.fellAsleepAt));
  const targetMin = clockToMinutes(targetSleep);
  let delta = meanSleep - targetMin;
  if (delta < -12 * 60) delta += 24 * 60;
  if (delta > 12 * 60) delta -= 24 * 60;
  return delta >= 45;
}
