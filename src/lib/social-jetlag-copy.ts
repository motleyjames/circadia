import type { MorningReport, ScheduledDays, SleepNote } from "@/lib/types";
import {
  computeSocialJetLag,
  sjlWithhold,
  type SocialJetLag,
  type SjlWithhold,
} from "@/lib/social-jetlag";
import { formatDuration } from "@/lib/time";

/**
 * Mouth-register copy for the social-jet-lag card.
 *
 * Engine jargon (MSFsc, MSF, MSW, chronotype) must never appear here.
 * The measured gap is unsigned circular distance; direction (later vs earlier
 * on free mornings) is the signed shortest arc from school mid-sleep to free
 * mid-sleep. Withhold lines never invent a number — including never rendering
 * 0 as unknown.
 */
export type SocialJetLagCopy = {
  title: string;
  body: string;
  kind: SleepNote["kind"];
  confidence: SleepNote["confidence"];
  sourceIds: readonly string[];
  withheld: boolean;
};

export const SOCIAL_JET_LAG_NOTE_ID = "social-jetlag";

const TITLE = "Social jet lag";
const SOURCE_IDS = [SOCIAL_JET_LAG_NOTE_ID] as const;
const MINUTES_PER_DAY = 24 * 60;

const WITHHOLD: Record<
  SjlWithhold,
  Pick<SocialJetLagCopy, "body" | "kind" | "confidence">
> = {
  "school-break": {
    body: "Social jet lag compares school or work mornings with free ones. With none on the calendar — a school break, a stretch without obligated get-ups — the comparison is meaningless, so Circadia does not invent a number.",
    kind: "context",
    confidence: "high",
  },
  "few-scheduled": {
    body: "Not enough school mornings logged in the last 4 weeks yet.",
    kind: "context",
    confidence: "moderate",
  },
  "few-free": {
    body: "Not enough free mornings logged in the last 4 weeks yet.",
    kind: "context",
    confidence: "moderate",
  },
};

function bandOf(minutes: number): "aligned" | "notable" | "substantial" {
  if (minutes < 60) return "aligned";
  if (minutes < 120) return "notable";
  return "substantial";
}

/** Shortest signed arc from `fromMinutes` to `toMinutes` on a 24h clock. Positive = later. */
export function signedCircularDeltaMinutes(fromMinutes: number, toMinutes: number): number {
  const circle = MINUTES_PER_DAY;
  const from = ((fromMinutes % circle) + circle) % circle;
  const to = ((toMinutes % circle) + circle) % circle;
  let delta = to - from;
  if (delta > circle / 2) delta -= circle;
  if (delta < -circle / 2) delta += circle;
  return delta;
}

function laterClause(band: ReturnType<typeof bandOf>): string {
  if (band === "aligned") return "your two schedules are close to aligned.";
  if (band === "notable") return "a notable shift, like living about an hour west on weekends.";
  return "a substantial shift, like living a couple of time zones west on weekends.";
}

function earlierClause(band: ReturnType<typeof bandOf>): string {
  if (band === "aligned") return "your two schedules are close to aligned.";
  if (band === "notable") return "a notable shift, like living about an hour east on weekends.";
  return "a substantial shift, like living a couple of time zones east on weekends.";
}

/**
 * Turn a measured result, or a withhold reason, into mouth-register copy.
 * Pass exactly one: a `SocialJetLag` with `withhold === null`, or
 * `sjl === null` with a withhold reason.
 */
export function socialJetLagCopy(
  sjl: SocialJetLag | null,
  withhold: SjlWithhold | null,
): SocialJetLagCopy {
  if (withhold) {
    const line = WITHHOLD[withhold];
    return {
      title: TITLE,
      body: line.body,
      kind: line.kind,
      confidence: line.confidence,
      sourceIds: SOURCE_IDS,
      withheld: true,
    };
  }
  if (!sjl) {
    // Fail closed: never mint a 0h measurement from a missing result.
    const line = WITHHOLD["few-scheduled"];
    return {
      title: TITLE,
      body: line.body,
      kind: line.kind,
      confidence: line.confidence,
      sourceIds: SOURCE_IDS,
      withheld: true,
    };
  }

  const gap = sjl.socialJetLagMinutes;
  const signed = signedCircularDeltaMinutes(sjl.mswMinutes, sjl.msfMinutes);
  const band = bandOf(gap);
  const dur = formatDuration(gap);

  let body: string;
  if (gap === 0 || signed === 0) {
    body = `On free mornings your sleep sits at the same time as on school mornings — ${laterClause("aligned")}`;
  } else if (signed > 0) {
    body = `On free mornings your sleep sits about ${dur} later than on school mornings — ${laterClause(band)}`;
  } else {
    body = `On free mornings your sleep sits about ${dur} earlier than on school mornings — ${earlierClause(band)}`;
  }

  return {
    title: TITLE,
    body,
    kind: band === "aligned" ? "steady" : "lever",
    confidence: band === "aligned" ? "high" : "moderate",
    sourceIds: SOURCE_IDS,
    withheld: false,
  };
}

/** Insights / Notes entry point: withhold wins; else the measurement. */
export function socialJetLagCopyFromReports(
  reports: MorningReport[],
  scheduledDays: ScheduledDays,
  now: Date,
): SocialJetLagCopy {
  const reason = sjlWithhold(reports, scheduledDays, now);
  if (reason) return socialJetLagCopy(null, reason);
  return socialJetLagCopy(computeSocialJetLag(reports, scheduledDays, now), null);
}

export function socialJetLagSleepNote(copy: SocialJetLagCopy): SleepNote {
  return {
    id: SOCIAL_JET_LAG_NOTE_ID,
    title: copy.title,
    body: copy.body,
    confidence: copy.confidence,
    sourceIds: [...copy.sourceIds],
    kind: copy.kind,
  };
}
