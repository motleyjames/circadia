import { dedupeReportsByMorningDate } from "@/lib/morning-file";
import { formatMorningDate } from "@/lib/schedule";
import type { MorningReport, Profile } from "./types";
import { delayedClock, durationVsNeed, flagMedications, weekBreakdown } from "./metrics";
import {
  formatClock,
  formatDuration,
  mean,
  overnightDuration,
  sleepNeedHours,
} from "./time";

export const WEEK_WINDOW = 7;
const SKETCH_NIGHTS = 3;

export { formatMorningDate };

export type WeekReview = {
  nightsLogged: number;
  sketch: boolean;
  headline: string;
  kicker: string;
  read: string;
  worked: string[];
  hurt: string[];
  doThis: string[];
};

type Advice = { p: number; t: string };

export function lastSevenReports(reports: MorningReport[]): MorningReport[] {
  return dedupeReportsByMorningDate(reports).slice(-WEEK_WINDOW);
}

export function weekReviewMouth(review: WeekReview): string {
  return [review.headline, review.kicker, review.read, ...review.worked, ...review.hurt, ...review.doThis].join(
    "\n",
  );
}

export function listMorningDates(reports: MorningReport[]): string {
  const dates = [...reports]
    .sort((a, b) => a.morningDate.localeCompare(b.morningDate))
    .map((r) => formatMorningDate(r.morningDate));
  return joinAnd(dates);
}

export function availableMorningDates(reports: MorningReport[]): string {
  return listMorningDates(lastSevenReports(reports));
}

/** One morning, grounded in the log. `card` is Notes; `consult` is the longer desk answer. */
export function formatNightNote(
  report: MorningReport,
  profile: Profile,
  mode: "card" | "consult" = "card",
): string {
  const date = formatMorningDate(report.morningDate);
  const dur = overnightDuration(report.fellAsleepAt, report.wokeAt);
  const asleep = formatClock(report.fellAsleepAt, profile.units);
  const wake = formatClock(report.wokeAt, profile.units);
  const need = sleepNeedHours(profile.age);
  const parts: string[] = [
    `${date} — ${report.rating}/5. Asleep around ${asleep}, up ${wake} (${formatDuration(dur)}).`,
    `About ${report.sleepLatencyMinutes} minutes to fall asleep.`,
  ];
  if (report.drank) {
    const n = report.drinkCount;
    parts.push(`Drinks${n != null ? ` (${n})` : ""}${report.spins ? ", with spins" : ""}.`);
  } else {
    parts.push("No drinks.");
  }
  if (report.screenOffMinutes === 0) parts.push("Phone in bed.");
  else if (report.screenOffMinutes <= 15) parts.push("Phone still on near bed.");
  else if (mode === "consult" && report.screenOffMinutes >= 45) {
    parts.push(`Screens down about ${report.screenOffMinutes} minutes.`);
  }
  if (report.wokeInNight) {
    parts.push(
      report.nightWakingMinutes
        ? `Woke in the night (~${report.nightWakingMinutes} min).`
        : "Woke in the night.",
    );
  }
  if (report.windDownHelped === "yes") parts.push("Wind-down helped.");
  else if (report.windDownHelped === "no") parts.push("Wind-down did not help.");
  if (report.usedSupplement && report.supplementKind && report.supplementKind !== "other") {
    parts.push(`Logged ${report.supplementKind} that night.`);
  }
  if (mode === "consult") {
    const hours = dur / 60;
    if (report.sleepLatencyMinutes >= 30 && hours >= need.min - 0.4) {
      parts.push("You were in bed long enough. This is a falling-asleep night, not a short-sleep night.");
    } else if (hours < need.min - 0.4) {
      parts.push(`${need.label}. This one ran short.`);
    }
    if (report.sleepLatencyMinutes >= 30 || report.wokeInNight) {
      parts.push(
        "If you are still awake after about 20 minutes, get out of bed. Lights low, something boring, back when sleepy.",
      );
    }
  }
  return parts.join(" ");
}

function dateSpan(reports: MorningReport[]): string {
  if (reports.length === 0) return "";
  if (reports.length === 1) return formatMorningDate(reports[0]!.morningDate);
  return `${formatMorningDate(reports[0]!.morningDate)}–${formatMorningDate(reports[reports.length - 1]!.morningDate)}`;
}

function joinAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  if (items.length <= 4) return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  return `${items[0]}, ${items[1]}, and ${items.length - 2} other nights`;
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return mean(values);
}

function ratingGap(
  left: MorningReport[],
  right: MorningReport[],
): { left: number; right: number; gap: number } | null {
  const a = meanOrNull(left.map((r) => r.rating));
  const b = meanOrNull(right.map((r) => r.rating));
  if (a == null || b == null) return null;
  return { left: a, right: b, gap: a - b };
}

function latencyGap(
  left: MorningReport[],
  right: MorningReport[],
): { left: number; right: number; gap: number } | null {
  const a = meanOrNull(left.map((r) => r.sleepLatencyMinutes));
  const b = meanOrNull(right.map((r) => r.sleepLatencyMinutes));
  if (a == null || b == null) return null;
  return { left: a, right: b, gap: a - b };
}

function pushUnique(list: string[], line: string, cap = 4): void {
  if (list.length >= cap) return;
  if (list.includes(line)) return;
  list.push(line);
}

function lateWake(report: MorningReport): boolean {
  const [h, m] = report.wokeAt.split(":").map(Number);
  return h * 60 + m >= 10 * 60;
}

function nightsAt(week: MorningReport[], rating: number): MorningReport[] {
  return week.filter((r) => r.rating === rating);
}

/**
 * A clinician-style week read from the last seven mornings.
 * Honest when the window is thin. Never unlocks a bottle. Mouth-safe.
 */
export function buildWeekReview(profile: Profile, reports: MorningReport[]): WeekReview {
  const week = lastSevenReports(reports);
  const n = week.length;
  if (n === 0) {
    return {
      nightsLogged: 0,
      sketch: true,
      headline: "",
      kicker: "",
      read: "",
      worked: [],
      hurt: [],
      doThis: [],
    };
  }

  const stats = weekBreakdown(week);
  const sketch = n < SKETCH_NIGHTS;
  const clockLate = delayedClock(week, profile.targetSleep);
  const need = sleepNeedHours(profile.age);
  const vsNeed = durationVsNeed(stats.meanDurationMinutes, profile.age);
  const meds = flagMedications(profile.medications);
  const wakeClock = formatClock(profile.targetWake, profile.units);

  const drink = week.filter((r) => r.drank);
  const dry = week.filter((r) => !r.drank);
  const drinkVsDry = ratingGap(drink, dry);
  const spinsNights = drink.filter((r) => r.spins);

  const bright = week.filter((r) => r.screenOffMinutes <= 15);
  const dim = week.filter((r) => r.screenOffMinutes >= 45);
  const screenRatings = ratingGap(bright, dim);
  const screenLat = latencyGap(bright, dim);
  const phoneInBed = week.filter((r) => r.screenOffMinutes === 0);

  const wdYes = week.filter((r) => r.windDownHelped === "yes");
  const wdSkip = week.filter((r) => r.windDownHelped === "did_not_use");
  const wdNo = week.filter((r) => r.windDownHelped === "no");
  const wdRatings = ratingGap(wdYes, wdSkip);
  const wdLat = latencyGap(wdYes, wdSkip);

  const lateWakeNights = week.filter(lateWake);
  const slowNights = week.filter((r) => r.sleepLatencyMinutes >= 30);
  const wokeNights = week.filter((r) => r.wokeInNight);
  const shortNights = week.filter((r) => overnightDuration(r.fellAsleepAt, r.wokeAt) < need.min * 60 - 45);

  const bestRating = Math.max(...week.map((r) => r.rating));
  const worstRating = Math.min(...week.map((r) => r.rating));
  const split = bestRating > worstRating;
  const betterNights = nightsAt(week, bestRating);
  const worseNights = nightsAt(week, worstRating);

  const worked: string[] = [];
  const hurt: string[] = [];
  const advice: Advice[] = [];

  if (split) {
    if (bestRating >= 3) {
      for (const night of betterNights.slice(0, 3)) {
        pushUnique(worked, formatNightNote(night, profile, "card"));
      }
    }
    for (const night of worseNights.slice(0, 3)) {
      pushUnique(hurt, formatNightNote(night, profile, "card"));
    }
  } else if (bestRating >= 3) {
    for (const night of week.slice(-3)) {
      pushUnique(worked, formatNightNote(night, profile, "card"));
    }
  } else {
    for (const night of week.slice(-3)) {
      pushUnique(hurt, formatNightNote(night, profile, "card"));
    }
  }

  if (drink.length > 0 && dry.length > 0 && drinkVsDry && drinkVsDry.gap <= -0.4) {
    if (!split || !worseNights.every((r) => r.drank)) {
      const spin = spinsNights.length > 0 ? ` Spins on ${listMorningDates(spinsNights)}.` : "";
      pushUnique(
        hurt,
        `${listMorningDates(drink)} after drinks felt worse than ${listMorningDates(dry)}.${spin}`,
      );
    } else if (spinsNights.length > 0) {
      pushUnique(hurt, `Spins on ${listMorningDates(spinsNights)} — that dose usually breaks the second half of the night.`);
    }
    advice.push({
      p: 95,
      t: "Keep two dry nights this week and compare how you feel in the morning. If those win, drinks are the problem — not something in the aisle.",
    });
  } else if (drink.length === n && n >= 2) {
    pushUnique(hurt, `Drinks every night (${dateSpan(week)}). I cannot compare a dry morning yet.`);
    advice.push({
      p: 92,
      t: "Put two dry nights on the calendar. Without them I am guessing, and I will not guess.",
    });
  } else if (drink.length >= 1 && dry.length === 0) {
    pushUnique(hurt, `${listMorningDates(drink)}: drinks, and no dry night yet to compare.`);
    advice.push({
      p: 88,
      t: "Log one dry night, then another. Two is a pattern. One is still a snapshot.",
    });
  } else if (!split && dry.length >= 3 && drink.length === 0 && (meanOrNull(dry.map((r) => r.rating)) ?? 0) >= 3.4) {
    pushUnique(worked, `${dateSpan(week)} stayed dry, and the mornings held.`);
  }

  if (
    bright.length >= 1 &&
    dim.length >= 1 &&
    ((screenRatings && screenRatings.gap <= -0.4) || (screenLat && screenLat.gap >= 12))
  ) {
    if (!hurt.some((line) => /phone/i.test(line))) {
      const extra =
        screenLat && screenLat.gap >= 12
          ? ` About ${Math.round(screenLat.gap)} extra minutes to fall asleep.`
          : "";
      pushUnique(
        hurt,
        `Phone late on ${listMorningDates(bright)}. Hour off on ${listMorningDates(dim)} felt better.${extra}`,
      );
    }
    advice.push({
      p: 78,
      t: "Park the phone an hour before bed. Dim room, not dark-room-and-scroll.",
    });
  } else if (bright.length >= Math.ceil(n * 0.6) && n >= 3) {
    if (!hurt.some((line) => /phone/i.test(line))) {
      pushUnique(hurt, `Phone late on ${listMorningDates(bright)}. Light that late is a clock cue, not just a habit.`);
    }
    advice.push({
      p: 72,
      t: "Give the last hour to something that does not glow. A week of that is a cleaner test than a supplement.",
    });
  } else if (phoneInBed.length === n && n >= 3) {
    pushUnique(hurt, `Phone in bed every night (${dateSpan(week)}).`);
    advice.push({
      p: 70,
      t: "Charge the phone across the room. Try two nights and compare how long it took to fall asleep.",
    });
  }

  const wdHelpedRating = wdRatings && wdRatings.gap >= 0.4;
  const wdHelpedLat = wdLat && wdLat.gap <= -10;
  if (wdYes.length >= 1 && wdSkip.length >= 1 && (wdHelpedRating || wdHelpedLat)) {
    if (!worked.some((line) => /wind-down/i.test(line))) {
      const faster = wdHelpedLat
        ? ` About ${Math.abs(Math.round(wdLat!.gap))} minutes faster than ${listMorningDates(wdSkip)}.`
        : "";
      pushUnique(worked, `Wind-down on ${listMorningDates(wdYes)}.${faster}`);
    }
    advice.push({
      p: 68,
      t: "Use the same wind-down on the hard nights, not only the easy ones. Repeat beats remix.",
    });
  } else if (!split && wdYes.length >= 3 && (meanOrNull(wdYes.map((r) => r.rating)) ?? 0) >= 3.5) {
    pushUnique(worked, `Wind-down on ${listMorningDates(wdYes)}, and those mornings landed well.`);
    advice.push({
      p: 55,
      t: "Do not drop the wind-down because one night was messy. Keep the same one.",
    });
  } else if (wdNo.length >= 2) {
    pushUnique(hurt, `Wind-down did not help on ${listMorningDates(wdNo)}. That session is not earning its keep.`);
    advice.push({
      p: 52,
      t: "Switch once: if breathwork felt like homework, try boring noise. If noise annoyed you, try the visual with the phone face down.",
    });
  }

  if (stats.wakeSpreadMinutes >= 90 && n >= 3) {
    const latest = [...week].sort((a, b) => {
      const [ah, am] = a.wokeAt.split(":").map(Number);
      const [bh, bm] = b.wokeAt.split(":").map(Number);
      return bh * 60 + bm - (ah * 60 + am);
    })[0]!;
    pushUnique(
      hurt,
      `Get-up time jumped around. Latest was ${formatClock(latest.wokeAt, profile.units)} on ${formatMorningDate(latest.morningDate)}. Sleeping in writes the next night’s delay.`,
    );
    advice.push({
      p: 90,
      t: `Get up at ${wakeClock} even after a short night. The clock learns the wake, not the bedtime.`,
    });
  } else if (n >= 5 && stats.wakeSpreadMinutes <= 45) {
    pushUnique(worked, `Wake stayed near ${wakeClock} across ${dateSpan(week)}.`);
  }

  if (clockLate && n >= 2 && lateWakeNights.length >= 1) {
    if (!worseNights.every(lateWake)) {
      pushUnique(
        hurt,
        `Late mornings on ${listMorningDates(lateWakeNights)}. That is a delayed clock, not “not a morning person.”`,
      );
    }
    advice.push({
      p: 86,
      t: `Get outside within an hour of waking, ideally near ${wakeClock}. Morning light is the strongest clock cue I can give you without a prescription.`,
    });
  } else if (clockLate && n >= 2) {
    advice.push({
      p: 86,
      t: `Get outside within an hour of waking, ideally near ${wakeClock}. Morning light is the strongest clock cue I can give you without a prescription.`,
    });
  }

  if (slowNights.length >= 2 || (n >= 2 && stats.meanLatencyMinutes >= 30)) {
    const named = slowNights.length > 0 ? slowNights : week;
    const alreadyNamed = split && worseNights.every((r) => r.sleepLatencyMinutes >= 30);
    if (!alreadyNamed) {
      pushUnique(
        hurt,
        `${listMorningDates(named)} — about ${Math.round(stats.meanLatencyMinutes)} minutes to fall asleep.`,
      );
    }
    advice.push({
      p: stats.meanLatencyMinutes >= 40 ? 91 : 84,
      t: "If you are still awake after about 20 minutes, get out of bed. Lights low, something boring, back when you are actually sleepy.",
    });
  }

  if (wokeNights.length >= 2) {
    pushUnique(
      hurt,
      `Woke and could not settle on ${listMorningDates(wokeNights)}. Lying there trying usually makes the next wake likelier.`,
    );
    advice.push({
      p: 80,
      t: "Same as a slow start: out of bed until sleepy. Watching the clock in the dark is not rest.",
    });
  }

  if (shortNights.length >= 2 || vsNeed === "short") {
    const named = shortNights.length > 0 ? shortNights : week;
    pushUnique(
      hurt,
      shortNights.length >= 2
        ? `Short nights on ${listMorningDates(named)} — under the ${need.min}–${need.max}h most people your age need (week ${formatDuration(stats.meanDurationMinutes)}).`
        : `Sleep averaged ${formatDuration(stats.meanDurationMinutes)}. ${need.label}.`,
    );
    advice.push({
      p: 76,
      t: "Protect a real bedtime on school nights before you add a pill. Sleep debt first. Bottles only in consult, and only with enough mornings.",
    });
  } else if (!split && vsNeed === "in_band" && n >= 4 && stats.meanRating >= 3.4) {
    pushUnique(
      worked,
      `Sleep length stayed in range — about ${formatDuration(stats.meanDurationMinutes)} across ${dateSpan(week)}.`,
    );
  }

  if (!split && stats.meanRating >= 3.6 && n >= 4 && hurt.length === 0) {
    pushUnique(
      worked,
      `${dateSpan(week)} felt solid (${stats.meanRating.toFixed(1).replace(/\.0$/, "")}/5), not a one-night fluke.`,
    );
  }

  if (meds.length > 0) {
    pushUnique(
      hurt,
      `${meds[0]!.name} can make nights harder. I will not tell you to stop a prescribed med. If sleep is getting worse, ask whoever wrote it about last-dose time.`,
    );
  }

  advice.sort((a, b) => b.p - a.p);
  const seen = new Set<string>();
  const doThis: string[] = [];
  for (const row of advice) {
    if (seen.has(row.t)) continue;
    seen.add(row.t);
    doThis.push(row.t);
    if (doThis.length === 3) break;
  }
  if (doThis.length === 0) {
    doThis.push(
      sketch
        ? "Log a few more mornings. I can see tonight’s shape; I will not pretend it is a week."
        : "Keep going. This week is steady enough that the next move is repeating what already worked — not a new product.",
    );
  }

  const headline = sketch
    ? n === 1
      ? "One morning."
      : "An early look."
    : n < WEEK_WINDOW
      ? "A partial week."
      : stats.meanRating < 2.8
        ? "A hard week."
        : split
          ? "A split week."
          : "A steady week.";

  const kicker =
    n === 1
      ? `${formatMorningDate(week[0]!.morningDate)}. A snapshot, not a pattern yet.`
      : n < WEEK_WINDOW
        ? `${dateSpan(week)} · ${n} mornings.`
        : `${dateSpan(week)}.`;

  const read = writeRead({
    week,
    profile,
    sketch,
    split,
    betterNights,
    worseNights,
    bestRating,
    worstRating,
    drink,
    dry,
    drinkVsDry,
    slowNights,
    clockLate,
    stats,
    vsNeed,
    need,
  });

  return {
    nightsLogged: n,
    sketch,
    headline,
    kicker,
    read,
    worked,
    hurt,
    doThis,
  };
}

function writeRead(args: {
  week: MorningReport[];
  profile: Profile;
  sketch: boolean;
  split: boolean;
  betterNights: MorningReport[];
  worseNights: MorningReport[];
  bestRating: number;
  worstRating: number;
  drink: MorningReport[];
  dry: MorningReport[];
  drinkVsDry: { gap: number } | null;
  slowNights: MorningReport[];
  clockLate: boolean;
  stats: ReturnType<typeof weekBreakdown>;
  vsNeed: ReturnType<typeof durationVsNeed>;
  need: ReturnType<typeof sleepNeedHours>;
}): string {
  const {
    week,
    profile,
    sketch,
    split,
    betterNights,
    worseNights,
    bestRating,
    worstRating,
    drink,
    dry,
    drinkVsDry,
    slowNights,
    clockLate,
    stats,
    vsNeed,
    need,
  } = args;
  const n = week.length;
  const paras: string[] = [];

  if (n === 1) {
    const r = week[0]!;
    paras.push(formatNightNote(r, profile, "consult"));
    paras.push("One morning is a snapshot. I would not change your plan on it yet.");
    return paras.join("\n\n");
  }

  if (split) {
    paras.push(
      `${listMorningDates(betterNights)} ${betterNights.length === 1 ? "was" : "were"} the better ${betterNights.length === 1 ? "morning" : "mornings"} (${bestRating}/5). ${listMorningDates(worseNights)} ${worseNights.length === 1 ? "was" : "were"} worse (${worstRating}/5).`,
    );
  } else {
    paras.push(`${listMorningDates(week)} ${n === 2 ? "both" : "all"} came in at ${bestRating}/5.`);
  }

  const lat = Math.round(stats.meanLatencyMinutes);
  const lengthBit =
    vsNeed === "short"
      ? `Sleep averaged ${formatDuration(stats.meanDurationMinutes)}, short of the ${need.min}–${need.max} hours most people your age need.`
      : `You were in bed long enough — about ${formatDuration(stats.meanDurationMinutes)} against the ${need.min}–${need.max} hours most people your age need.`;
  if (slowNights.length >= 1 && vsNeed !== "short") {
    paras.push(
      `${lengthBit} The problem is falling asleep: about ${lat} minutes on average. Extra time in bed is not the missing piece.`,
    );
  } else if (vsNeed === "short") {
    paras.push(`${lengthBit} Protect a real bedtime before you add anything from the aisle.`);
  } else if (clockLate) {
    paras.push(
      `${lengthBit} Bed and wake both ran late. That is a timing issue, not a character one. Defend ${formatClock(profile.targetWake, profile.units)}.`,
    );
  } else {
    paras.push(lengthBit);
  }

  const focus = split ? worseNights[worseNights.length - 1] : week[week.length - 1];
  if (focus) {
    const bits: string[] = [
      `On ${formatMorningDate(focus.morningDate)} you fell asleep around ${formatClock(focus.fellAsleepAt, profile.units)} and got up at ${formatClock(focus.wokeAt, profile.units)}.`,
    ];
    if (focus.sleepLatencyMinutes >= 30) {
      bits.push(`It took about ${focus.sleepLatencyMinutes} minutes to drop off.`);
    }
    if (focus.drank) bits.push("Drinks were on that log.");
    if (focus.screenOffMinutes <= 15) bits.push("The phone was still on near bed.");
    if (focus.wokeInNight) bits.push("You woke and had to settle again.");
    if (split && betterNights[0] && betterNights[0]!.morningDate !== focus.morningDate) {
      const good = betterNights[0]!;
      const diffs: string[] = [];
      if (good.drank !== focus.drank) diffs.push(focus.drank ? "the worse night had drinks; the better one did not" : "the better night had drinks");
      if (good.screenOffMinutes >= 45 && focus.screenOffMinutes <= 15) diffs.push("the phone stayed later on the worse night");
      if (good.windDownHelped === "yes" && focus.windDownHelped !== "yes") diffs.push("wind-down showed up on the better morning");
      if (diffs.length > 0) bits.push(`What changed: ${diffs.join("; ")}.`);
    }
    paras.push(bits.join(" "));
  }

  if (drink.length > 0 && dry.length > 0 && drinkVsDry && drinkVsDry.gap <= -0.4) {
    paras.push(
      `Drink nights (${listMorningDates(drink)}) averaged worse than dry ones (${listMorningDates(dry)}). That split is worth more than a new bottle.`,
    );
  }

  if (sketch) {
    paras.push("A few mornings can point. They are not a diagnosis, and I will not lock a plan yet.");
  } else if (!split && stats.meanRating >= 3.5) {
    paras.push("I would keep this week, not add anything.");
  }

  return paras.join("\n\n");
}
