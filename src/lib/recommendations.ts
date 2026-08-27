import type { MorningReport, Profile, RecommendationPack, SupplementRec } from "@/lib/types";
import { buildSleepNotes } from "@/lib/advisor";
import { delayedClock, weekBreakdown } from "@/lib/metrics";

export const NIGHTS_NEEDED = 7;

export function buildRecommendations(profile: Profile, reports: MorningReport[]): RecommendationPack {
  const nightsLogged = reports.length;
  const ready = nightsLogged >= NIGHTS_NEEDED;
  const week = weekBreakdown(reports);
  const protocol = buildSleepNotes(profile, reports).filter((n) => n.kind !== "context");

  const suggestedSessions: RecommendationPack["suggestedSessions"] = [];
  if (week.meanLatencyMinutes >= 25 || profile.struggles.includes("falling")) {
    suggestedSessions.push({
      kind: "meditation",
      id: "478",
      why: "A simple cadence to drop pre-sleep arousal when sleep onset is the bottleneck.",
    });
    suggestedSessions.push({
      kind: "soundscape",
      id: "brown",
      why: "Brown noise is less hissy than white; useful if your mind needs a boring object.",
    });
  }
  if (week.nightsWokeInNight >= 2 || profile.struggles.includes("staying")) {
    suggestedSessions.push({
      kind: "meditation",
      id: "body-scan",
      why: "For night wakings, a body scan is something to do besides checking the clock.",
    });
    suggestedSessions.push({
      kind: "soundscape",
      id: "rain",
      why: "A rain bed can mask hallway / roommate noise that pokes maintenance insomnia.",
    });
  }
  if (suggestedSessions.length === 0) {
    suggestedSessions.push({
      kind: "soundscape",
      id: "ocean",
      why: "Keep a low-arousal ritual even when things are going well.",
    });
    suggestedSessions.push({
      kind: "meditation",
      id: "pmr",
      why: "Progressive muscle release is a maintenance skill, not only a rescue tool.",
    });
  }

  if (!ready) {
    return {
      ready: false,
      nightsLogged,
      nightsNeeded: NIGHTS_NEEDED,
      supplements: [],
      protocol,
      suggestedSessions: suggestedSessions.slice(0, 3),
    };
  }

  const supplements: SupplementRec[] = [];
  const alcoholDominant = week.alcoholNights / nightsLogged >= 0.45;
  const screenDominant = week.meanScreenOffMinutes < 30 && week.meanLatencyMinutes >= 25;
  const delayed = delayedClock(reports, profile.targetSleep);
  const alreadyOnMelatonin = profile.supplements.some((s) => /melatonin/i.test(s));
  const alreadyOnMagnesium = profile.supplements.some((s) => /magnesium/i.test(s));

  if (alcoholDominant || screenDominant) {
    supplements.push({
      id: "none",
      title: "Not a supplement week",
      body: alcoholDominant
        ? "Drinks show up often enough that melatonin or magnesium would be noise. Run two or more drink-free nights and keep logging. The first-line chemical here is ethanol — remove it before adding anything."
        : "Screens are still inside the last half hour and latency is high. A bottle of melatonin will not outrun a phone. Earn the hour off screens, then we can talk clock tools.",
      notFirstLine: "CBT-I behaviors first. Supplements are adjuncts, and only after the obvious levers move.",
      confidence: "high",
      sourceIds: alcoholDominant ? ["alcohol"] : ["light-screens", "melatonin"],
    });
  } else {
    if (delayed && !alreadyOnMelatonin) {
      supplements.push({
        id: "melatonin",
        title: "Melatonin — discuss low-dose as a clock tool",
        body: "Your sleep onset sits late relative to the target. If a clinician agrees it is appropriate, the evidence-shaped use is roughly 0.3–1 mg, taken earlier than bedtime (often 1–3 hours before desired sleep), in dim light — not 10 mg at lights-out. Pair it with morning outdoor light and a fixed wake time. Skip this if you could be pregnant, are under 18, or take interacting meds, until a human says otherwise.",
        notFirstLine: "Melatonin is not first-line chronic insomnia care. CBT-I and light timing still do most of the work.",
        confidence: "moderate",
        sourceIds: ["melatonin", "circadian-anchor"],
      });
    } else if (alreadyOnMelatonin) {
      supplements.push({
        id: "melatonin",
        title: "You already take melatonin — check timing, not more milligrams",
        body: "More is not better. If latency is still long, the usual miss is taking it as a sleeping pill at lights-out. Ask your clinician about a lower dose earlier, plus stimulus control. Do not stack another brand on top.",
        notFirstLine: "Dose escalation is not the protocol.",
        confidence: "moderate",
        sourceIds: ["melatonin"],
      });
    }

    const magnesiumCandidate =
      week.meanLatencyMinutes >= 30 &&
      week.meanRating <= 3.4 &&
      !alcoholDominant &&
      (profile.activity === "high" || profile.struggles.includes("falling"));

    if (magnesiumCandidate && !alreadyOnMagnesium) {
      supplements.push({
        id: "magnesium",
        title: "Magnesium glycinate — optional, modest evidence",
        body: "Latency is stubborn and ratings are mediocre without alcohol dominating the picture. Magnesium is not a reliable hypnotic; reviews call the evidence mixed. If you and a clinician want a low-risk adjunct, glycinate 200–400 mg in the evening is the usual form people mean. Hard no in significant kidney disease. Track it in the morning interview so we can see if your nights actually change.",
        notFirstLine: "Schedule, stimulus control, and screens still outrank this.",
        confidence: "low",
        sourceIds: ["magnesium"],
      });
    } else if (alreadyOnMagnesium) {
      supplements.push({
        id: "magnesium",
        title: "You already take magnesium — judge it by the logs",
        body: "Keep the brand/dose stable for the next week of interviews. If ratings and latency do not budge, it is not doing sleep work for you, and adding a second product is not the next step.",
        notFirstLine: "Do not stack melatonin plus extra magnesium just because both are in the aisle.",
        confidence: "low",
        sourceIds: ["magnesium"],
      });
    }

    if (supplements.length === 0) {
      supplements.push({
        id: "none",
        title: "No supplement recommendation",
        body: "A week of data does not show a circadian delay that melatonin would honestly target, and magnesium would be a guess. Keep the schedule, the hour off screens, and the morning interview. Adding a bottle now would muddy the experiment.",
        notFirstLine: "Protection of a working pattern beats optimization theater.",
        confidence: "high",
        sourceIds: ["circadian-anchor", "melatonin", "magnesium"],
      });
    }
  }

  return {
    ready: true,
    nightsLogged,
    nightsNeeded: NIGHTS_NEEDED,
    supplements,
    protocol,
    suggestedSessions: uniqueSessions(suggestedSessions).slice(0, 3),
  };
}

function uniqueSessions(
  sessions: RecommendationPack["suggestedSessions"],
): RecommendationPack["suggestedSessions"] {
  const seen = new Set<string>();
  return sessions.filter((s) => {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
