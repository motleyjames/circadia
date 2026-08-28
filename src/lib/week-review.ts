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
  return [...reports].sort((a, b) => a.morningDate.localeCompare(b.morningDate)).slice(-WEEK_WINDOW);
}

export function weekReviewMouth(review: WeekReview): string {
  return [review.headline, review.kicker, review.read, ...review.worked, ...review.hurt, ...review.doThis].join(
    "\n",
  );
}

function fmt1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

function nightsWord(n: number): string {
  return n === 1 ? "1 morning" : `${n} mornings`;
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

function pushUnique(list: string[], line: string, cap = 3): void {
  if (list.length >= cap) return;
  if (list.includes(line)) return;
  list.push(line);
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
  const spins = drink.some((r) => r.spins);

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

  const lateWakes = week.filter((r) => {
    const [h, m] = r.wokeAt.split(":").map(Number);
    return h * 60 + m >= 10 * 60;
  }).length;
  const highLatency = week.filter((r) => r.sleepLatencyMinutes >= 30).length;
  const wokeNights = week.filter((r) => r.wokeInNight).length;
  const shortNights = week.filter((r) => overnightDuration(r.fellAsleepAt, r.wokeAt) < need.min * 60 - 45).length;

  const worked: string[] = [];
  const hurt: string[] = [];
  const advice: Advice[] = [];

  if (drink.length > 0 && dry.length > 0 && drinkVsDry && drinkVsDry.gap <= -0.4) {
    pushUnique(
      hurt,
      `Drinks: ${drink.length} night${drink.length === 1 ? "" : "s"} averaged ${fmt1(drinkVsDry.left)} vs ${fmt1(drinkVsDry.right)} on dry nights.${spins ? " Spins showed up — that dose usually wrecks the second half of the night." : ""}`,
    );
    advice.push({
      p: 95,
      t: "Keep two dry nights this week and compare how you feel. If drinks keep winning the worse column, that is the lever — not a new bottle.",
    });
  } else if (drink.length === n && n >= 2) {
    pushUnique(hurt, "You logged drinks every night in this window. I cannot see a dry comparison yet — that is the experiment.");
    advice.push({
      p: 92,
      t: "Put two dry nights on the calendar. Without them I am guessing, and I will not guess.",
    });
  } else if (drink.length >= 1 && dry.length === 0) {
    pushUnique(hurt, `${drink.length === 1 ? "A drink night" : `${drink.length} nights with drinks`}, and no dry night in the window to compare.`);
    advice.push({
      p: 88,
      t: "One dry night is already information. Two is a pattern. Log both.",
    });
  } else if (dry.length >= 3 && drink.length === 0 && (meanOrNull(dry.map((r) => r.rating)) ?? 0) >= 3.4) {
    pushUnique(worked, "Dry nights this week. Restedness held without alcohol in the mix.");
  }

  if (
    bright.length >= 1 &&
    dim.length >= 1 &&
    ((screenRatings && screenRatings.gap <= -0.4) || (screenLat && screenLat.gap >= 12))
  ) {
    const latBit =
      screenLat && screenLat.gap >= 12
        ? ` Falling asleep took about ${Math.round(screenLat.gap)} extra minutes when screens stayed late.`
        : "";
    pushUnique(
      hurt,
      `Screens: ${bright.length} night${bright.length === 1 ? "" : "s"} with the phone inside the last 15 minutes looked worse than the hour-off nights.${latBit}`,
    );
    advice.push({
      p: 78,
      t: "Park the phone an hour before bed. Dim room, not dark-room-and-scroll.",
    });
  } else if (bright.length >= Math.ceil(n * 0.6) && n >= 3) {
    pushUnique(
      hurt,
      `Screens were still in the last 15 minutes on ${bright.length} of ${n} nights. Light at that hour is a clock signal, not just a habit.`,
    );
    advice.push({
      p: 72,
      t: "Give the last hour to something that does not glow. One week of that is a cleaner test than a supplement.",
    });
  } else if (phoneInBed.length === n && n >= 3) {
    pushUnique(hurt, "Phone in bed every night this window.");
    advice.push({
      p: 70,
      t: "Charge the phone across the room. Try two nights and compare how long it took to fall asleep.",
    });
  }

  const wdHelpedRating = wdRatings && wdRatings.gap >= 0.4;
  const wdHelpedLat = wdLat && wdLat.gap <= -10;
  if (wdYes.length >= 1 && wdSkip.length >= 1 && (wdHelpedRating || wdHelpedLat)) {
    pushUnique(
      worked,
      wdHelpedLat
        ? `Wind-down: used on ${wdYes.length} night${wdYes.length === 1 ? "" : "s"}. Falling asleep ran about ${Math.abs(Math.round(wdLat!.gap))} minutes faster than the skip nights.`
        : `Wind-down nights averaged ${fmt1(wdRatings!.left)} vs ${fmt1(wdRatings!.right)} when you skipped it.`,
    );
    advice.push({
      p: 68,
      t: "Keep the same wind-down on the hard nights, not only the easy ones. Repeat beats remix.",
    });
  } else if (wdYes.length >= 3 && (meanOrNull(wdYes.map((r) => r.rating)) ?? 0) >= 3.5) {
    pushUnique(worked, `Wind-down showed up on ${wdYes.length} nights, and those mornings landed in decent shape.`);
    advice.push({
      p: 55,
      t: "Do not abandon the wind-down because one night was messy. The protocol is the floor, not a mood.",
    });
  } else if (wdNo.length >= 2) {
    pushUnique(hurt, `Wind-down got a “no” on ${wdNo.length} nights. That session is not earning its keep.`);
    advice.push({
      p: 52,
      t: "Switch modality once: if breathwork felt like homework, try boring noise. If noise annoyed you, try the visual with the phone face down.",
    });
  }

  if (stats.wakeSpreadMinutes >= 90 && n >= 3) {
    const minutes = Math.round(stats.wakeSpreadMinutes);
    pushUnique(
      hurt,
      `Wake time swung about ${minutes} minutes across this window. The clock hates a moving target.`,
    );
    advice.push({
      p: 90,
      t: `Defend ${wakeClock} — even after a short night. Sleeping in writes tomorrow’s delay.`,
    });
  } else if (n >= 5 && stats.wakeSpreadMinutes <= 45) {
    pushUnique(worked, `Wake time stayed inside about ${Math.round(stats.wakeSpreadMinutes)} minutes. That is the clock doing its job.`);
  }

  if (clockLate && n >= 2) {
    pushUnique(
      hurt,
      lateWakes >= 2
        ? `Late mornings showed up (${lateWakes} wake${lateWakes === 1 ? "" : "s"} at 10:00 or later). That pattern usually means the clock is running behind, not that you “are not a morning person.”`
        : "Mornings in this window look delayed — late to bed, late to rise, or both.",
    );
    advice.push({
      p: 86,
      t: `Get outside within an hour of waking, ideally near ${wakeClock}. Morning light is the strongest clock cue I can give you without a prescription.`,
    });
  }

  if (highLatency >= 2 || (n >= 2 && stats.meanLatencyMinutes >= 30)) {
    pushUnique(
      hurt,
      `Falling asleep ran long on ${highLatency || n} night${(highLatency || n) === 1 ? "" : "s"} (about ${Math.round(stats.meanLatencyMinutes)} minutes on average). Time in bed awake teaches the bed the wrong lesson.`,
    );
    advice.push({
      p: 84,
      t: "If you are still awake after about 20 minutes, get out of bed. Dim room, boring, back when sleepy. Do not stack another episode.",
    });
  }

  if (wokeNights >= 2) {
    pushUnique(
      hurt,
      `You woke and struggled on ${wokeNights} night${wokeNights === 1 ? "" : "s"}. Lying there “trying” usually makes the next wake likelier.`,
    );
    advice.push({
      p: 80,
      t: "Same rule as a slow start: out of bed until sleepy. Clock-watching in the dark is not rest.",
    });
  }

  if (shortNights >= 2 || vsNeed === "short") {
    pushUnique(
      hurt,
      shortNights >= 2
        ? `${shortNights} night${shortNights === 1 ? "" : "s"} landed well under the ${need.min}–${need.max}h band for your age (week average ${formatDuration(stats.meanDurationMinutes)}).`
        : `Sleep averaged ${formatDuration(stats.meanDurationMinutes)}. ${need.label}.`,
    );
    advice.push({
      p: 76,
      t: "Protect a real bedtime on school nights before you add a pill. Debt first, bottles later — and bottles only in consult, with enough mornings.",
    });
  } else if (vsNeed === "in_band" && n >= 4 && stats.meanRating >= 3.4) {
    pushUnique(
      worked,
      `Duration held in the ${need.min}–${need.max}h band for your age (week average ${formatDuration(stats.meanDurationMinutes)}).`,
    );
  }

  if (stats.meanRating >= 3.6 && n >= 4 && hurt.length <= 1) {
    pushUnique(worked, `Restedness averaged ${fmt1(stats.meanRating)} / 5. That is a solid week, not a fluke night.`);
  }

  if (meds.length > 0) {
    pushUnique(
      hurt,
      `${meds[0]!.name} can collide with sleep. I will not tell you to stop a prescribed med. Flag last-dose time with whoever wrote it if nights are getting worse.`,
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
        ? "Log a few more mornings. I can already see tonight’s shape; I will not pretend it is a week."
        : "Keep logging. The week is steady enough that the next move is not a new product — it is repeating what already worked.",
    );
  }

  const headline = sketch
    ? n === 1
      ? "One morning. A sketch, not a week."
      : `${nightsWord(n)}. Early, not empty.`
    : n < WEEK_WINDOW
      ? `${nightsWord(n)}. Pattern, not a full week.`
      : stats.meanRating < 2.8
        ? "A hard week. Here is the honest read."
        : hurt.length >= 2
          ? "The week left a trail. Here is what it shows."
          : "A week I can actually read.";

  const kicker =
    n < WEEK_WINDOW
      ? `${nightsWord(n)} in the window. Not seven yet — I will still say what these nights show, and I will not overclaim.`
      : `${nightsWord(n)} in the window.`;

  const read = writeRead({
    n,
    sketch,
    profile,
    stats,
    hurt,
    doThis,
    clockLate,
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
  n: number;
  sketch: boolean;
  profile: Profile;
  stats: ReturnType<typeof weekBreakdown>;
  hurt: string[];
  doThis: string[];
  clockLate: boolean;
  need: ReturnType<typeof sleepNeedHours>;
}): string {
  const { n, sketch, profile, stats, hurt, doThis, clockLate, need } = args;
  const ratingBit = `Restedness averaged ${fmt1(stats.meanRating)} out of 5.`;
  const durBit = `Sleep ran about ${formatDuration(stats.meanDurationMinutes)} against the ${need.min}–${need.max} hours most people your age need.`;
  const latBit =
    stats.meanLatencyMinutes >= 25
      ? ` Falling asleep averaged about ${Math.round(stats.meanLatencyMinutes)} minutes.`
      : stats.meanLatencyMinutes > 0
        ? ` Falling asleep was closer to ${Math.round(stats.meanLatencyMinutes)} minutes.`
        : "";

  if (sketch) {
    const caution =
      n === 1
        ? "One night can lie. I will name what this morning shows and I will not turn it into a diagnosis."
        : "Two or three nights can hint. They cannot close a case.";
    const lever =
      hurt[0] != null ? ` The loudest signal so far: ${lowerFirst(stripLead(hurt[0]))}` : doThis[0] != null ? ` Next: ${doThis[0]}` : "";
    return `${nightsWord(n)} on the board. ${ratingBit} ${durBit}${latBit} ${caution}${lever}`;
  }

  const clockBit = clockLate
    ? " The clock looks delayed — late nights pulling late mornings — which is a timing problem, not a character flaw."
    : ` Wake time is the cheapest clock tool you have; protect ${formatClock(profile.targetWake, profile.units)} before you add chemistry.`;
  const hurtLead =
    hurt.length >= 2
      ? " More than one thing in this window is working against you. Rank the next week by the loudest lever, not by whatever is in the cabinet."
      : hurt.length === 1
        ? " One pattern is doing most of the damage. Fix that before you shop."
        : " Nothing in this window is screaming. Repeat what worked; do not invent a crisis.";
  const next = doThis[0] != null ? ` ${doThis[0]}` : "";

  return `${nightsWord(n)} logged. ${ratingBit} ${durBit}${latBit}${clockBit}${hurtLead}${next}`;
}

function stripLead(line: string): string {
  const cut = line.indexOf(": ");
  if (cut === -1) return line;
  return line.slice(cut + 2);
}

function lowerFirst(line: string): string {
  if (!line) return line;
  return `${line[0]!.toLowerCase()}${line.slice(1)}`;
}
