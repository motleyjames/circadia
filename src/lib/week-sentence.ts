import { HEALTHY_EFFICIENCY_PCT, type WeekGeometry } from "@/lib/sleep-metrics";
import { formatDuration } from "@/lib/time";

/**
 * One paragraph that says what the week's geometry means.
 *
 * The numbers above it are true but mute — a person reading "81%" does not
 * necessarily know that the problem is the front of the night rather than the
 * length of it. This turns the same figures into the sentence a clinician would
 * say first, and nothing more than that.
 *
 * Three rules it will not break:
 *
 * 1. **Never diagnose.** No insomnia, no apnea, no disorder, whatever the shape.
 * 2. **Never prescribe a sleep window.** Sleep restriction works and is genuinely
 *    dangerous to self-administer — it is the one part that belongs with a person.
 * 3. **Never scold.** It names where the waking time sat, not what they did wrong.
 */

export type WeekSentence = {
  /** The gap, stated plainly. */
  lead: string;
  /** Where the waking time actually sat. */
  where: string;
};

/** The three places waking time can sit inside a night. */
type Where = "front" | "middle" | "end";

function largestGap(week: WeekGeometry): { where: Where; minutes: number } {
  const parts: { where: Where; minutes: number }[] = [
    { where: "front", minutes: week.meanLatencyMinutes },
    { where: "middle", minutes: week.meanWasoMinutes },
    { where: "end", minutes: week.meanTerminalMinutes },
  ];
  return parts.reduce((biggest, part) => (part.minutes > biggest.minutes ? part : biggest));
}

/** Below this, naming "the biggest part" of the gap is naming noise. */
const MIN_MEANINGFUL_GAP_MINUTES = 10;

export function weekSentence(week: WeekGeometry): WeekSentence {
  const inBed = formatDuration(week.meanTimeInBedMinutes);
  const asleep = formatDuration(week.meanTotalSleepMinutes);
  const nights = `${week.nights} night${week.nights === 1 ? "" : "s"}`;
  const lead = `Across ${nights} you spent about ${inBed} in bed to get ${asleep} of sleep.`;

  if (week.meanEfficiencyPct >= HEALTHY_EFFICIENCY_PCT) {
    return {
      lead,
      where: "Almost all of the time you gave sleep, you used. That is what a settled night looks like, and it is worth knowing which of your habits produced it.",
    };
  }

  const gap = largestGap(week);
  if (gap.minutes < MIN_MEANINGFUL_GAP_MINUTES) {
    return {
      lead,
      where: `That gap is spread thinly across the night rather than sitting in one place, so there is no single part of it to point at yet.`,
    };
  }

  const minutes = `${gap.minutes} minutes`;
  const where =
    gap.where === "front"
      ? `Most of that gap is at the front: about ${minutes} a night between lights out and sleep.`
      : gap.where === "middle"
        ? `Most of that gap is in the middle: about ${minutes} a night awake after you had already fallen asleep.`
        : `Most of that gap is at the end: about ${minutes} a night lying there after you had woken for the last time.`;

  return {
    lead,
    where: `${where} The shortfall is opportunity you already had rather than time you were missing — which is the more workable of the two problems.`,
  };
}

/**
 * How much this page is standing on, said before any of the numbers.
 *
 * A reader deciding how much weight to give a figure needs the denominator first,
 * not in a footnote — especially when some nights are filed and unscoreable.
 */
export function standingOn(filed: number, scored: number): string {
  if (filed === 0) return "The week read starts on night one.";
  const nights = `${scored} of ${filed} morning${filed === 1 ? "" : "s"}`;
  if (scored === 0) {
    return `${filed} morning${filed === 1 ? "" : "s"} filed, none of them yet carrying the bed times these numbers need.`;
  }
  if (scored < 4) {
    return `${nights} scored. That is a sketch, not a pattern — it firms up around four.`;
  }
  return `${nights} scored. Enough to see a pattern, not enough to prove a cause. Nothing here is a diagnosis.`;
}
