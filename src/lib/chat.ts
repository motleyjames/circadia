import type { ChatMessage, MorningReport, Profile, WeekBreakdown } from "@/lib/types";
import { buildSleepNotes } from "@/lib/advisor";
import { readDream } from "@/lib/dreams";
import { flagMedications, weekBreakdown } from "@/lib/metrics";
import { buildRecommendations } from "@/lib/recommendations";
import { searchResearch } from "@/lib/research";
import { formatClock, formatDuration, newId, overnightDuration, sleepNeedHours } from "@/lib/time";

export type ChatReply = {
  text: string;
  citations: string[];
};

export const CLINIC_PROMPTS = [
  "Why can’t I fall asleep?",
  "I keep waking at 3.",
  "Should I take melatonin?",
  "What does alcohol actually do?",
  "Should I sleep in tomorrow?",
] as const;

type Consult = {
  profile: Profile;
  reports: MorningReport[];
  week: WeekBreakdown;
  latest: MorningReport | undefined;
};

function lastNight(latest: MorningReport | undefined, units: Profile["units"]): string {
  if (!latest) return "I don’t have a morning on the chart yet.";
  const dur = formatDuration(overnightDuration(latest.fellAsleepAt, latest.wokeAt));
  const bits = [
    `Last night: ${dur}, rated ${latest.rating}/5`,
    `asleep ~${formatClock(latest.fellAsleepAt, units)}`,
    `latency ~${latest.sleepLatencyMinutes} min`,
  ];
  if (latest.drank) {
    bits.push(`${latest.drinkCount ?? "some"} drink${latest.drinkCount === 1 ? "" : "s"}${latest.spins ? ", spins" : ""}`);
  }
  return `${bits.join("; ")}.`;
}

function impression(consult: Consult): string {
  const { profile, reports, week } = consult;
  if (reports.length === 0) {
    const need = sleepNeedHours(profile.age);
    return `Age ${profile.age}, target ${formatClock(profile.targetSleep, profile.units)}–${formatClock(profile.targetWake, profile.units)}, need band ${need.label}. No mornings yet — I will not invent a diagnosis from an empty diary.`;
  }
  const parts: string[] = [
    `Mean ${formatDuration(week.meanDurationMinutes)} over ${reports.length} night${reports.length === 1 ? "" : "s"}`,
    `rating ${week.meanRating.toFixed(1)}`,
  ];
  if (week.nightsWithHighLatency >= 2) parts.push("onset often >30 min");
  if (week.nightsWokeInNight >= 2) parts.push("maintenance wakings");
  if (week.alcoholNights) parts.push(`alcohol ${week.alcoholNights}/${reports.length}`);
  if (week.wakeSpreadMinutes >= 75) parts.push(`wake time drifting ~${Math.round(week.wakeSpreadMinutes)} min`);
  return `${parts.join("; ")}.`;
}

function answerQuestionWithProfile(q: string, consult: Consult): ChatReply {
  const { profile, reports, week, latest } = consult;
  const lower = q.toLowerCase();
  const recs = buildRecommendations(profile, reports);
  const notes = buildSleepNotes(profile, reports);
  const units = profile.units;
  const meds = flagMedications(profile.medications);

  if (/dream|nightmare|meaning/.test(lower)) {
    const lastDream = [...reports].reverse().find((r) => r.dream?.text);
    if (lastDream?.dream) {
      const read = readDream(lastDream.dream.text, lastDream, profile);
      return { text: `${read.physiology} ${read.meaning}`, citations: ["dreams", "alcohol"] };
    }
    return {
      text: "I don’t have a dream on the chart. In the morning interview, add it and toggle “any meaning?” I will talk physiology and the words you wrote. I will not run a symbol dictionary — that is not sleep medicine.",
      citations: ["dreams"],
    };
  }

  if (/melatonin/.test(lower)) {
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "melatonin" || s.id === "none") : undefined;
    const plan = recs.ready
      ? rec?.body
      : `AASM first-line for chronic insomnia is CBT-I, not melatonin. I wait for about ${recs.nightsNeeded} mornings before even discussing it as a clock tool. You have ${recs.nightsLogged}. It is a phase-shift signal (often 0.3–1 mg, earlier than bedtime), not a 10 mg hypnotic at lights-out.`;
    return { text: `${lastNight(latest, units)} ${plan}`, citations: ["melatonin"] };
  }

  if (/magnesium/.test(lower)) {
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "magnesium" || s.id === "none") : undefined;
    const plan = recs.ready
      ? rec?.body
      : `Magnesium is not a hypnotic. Reviews call the evidence mixed and small. I will only mention glycinate as an adjunct after ${recs.nightsNeeded} nights if your pattern even fits (${recs.nightsLogged} logged). Kidney disease is a hard stop — that is a human, not an aisle.`;
    return { text: plan ?? "", citations: ["magnesium"] };
  }

  if (/alcohol|drink|drunk|spins|hangover/.test(lower)) {
    const n = week.alcoholNights;
    const chart = reports.length
      ? `On your diary: ${n} of ${reports.length} nights had drinks.`
      : "Once the drink bubbles are on the chart I can compare those nights to the dry ones.";
    return {
      text: `${chart} Ethanol is a sedative on the way in, then a fragmenter: more arousals and less REM in the second half, with rebound later. Spins means the dose was already past restorative sleep. If we run one experiment, make two nights dry and compare ratings. That beats a new bottle.`,
      citations: ["alcohol"],
    };
  }

  if (/screen|phone|blue light|blue-light|scroll/.test(lower)) {
    const avg = reports.length ? ` Your mean screen-off window is ~${Math.round(week.meanScreenOffMinutes)} min.` : "";
    return {
      text: `Melanopsin cells tell the clock it is daytime; bright evening light can delay melatonin. In clinic I still put more weight on the content — unfinished work and feeds are alerting on night mode.${avg} The prescription is behavioral: dim, offline, one hour. Morning outdoor light is the other half of the same medicine.`,
      citations: ["light-screens"],
    };
  }

  if (/caffeine|coffee|espresso|energy drink|adderall late|stimulant/.test(lower) && /caffeine|coffee|espresso|energy/.test(lower)) {
    return {
      text: `${meds.length ? `You listed ${meds.map((m) => m.name).join(", ")} — stacking late caffeine on a stimulant is a common way to present as “insomnia.” ` : ""}Caffeine blocks adenosine, the chemical that builds sleep pressure. Half-life is often 5–6 hours. If onset is the problem, last caffeine before early afternoon. I do not log coffee in the morning interview yet; if you drink it after 2, tell me and I will treat it as part of the chart.`,
      citations: ["caffeine"],
    };
  }

  if (/nap|sleep in|sleeping in|catch up|weekend|slept until|sleep till/.test(lower)) {
    return {
      text: `${impression(consult)} After a short night, sleeping until noon feels kind and delays tonight — that is social jet lag. CBT-I protects the wake time (${formatClock(profile.targetWake, units)}). Recovery: a ~20 min nap before mid-afternoon, or get in bed earlier only once you are actually sleepy. Exception: if you might drive or cannot stay awake, sleep is safety, not stubbornness — that severity belongs in clinic.`,
      citations: ["naps", "circadian-anchor"],
    };
  }

  if (/3 ?am|3:00|middle of the night|wake up at night|waking up|stay asleep|staying asleep|maintenance/.test(lower)) {
    return {
      text: `${lastNight(latest, units)} Waking and not dropping back is maintenance insomnia. I rank: alcohol in the second half, too much time in bed, clock-watching, then airway (snore, gasp, wrecked after a “long” night). Do not negotiate with the clock. If you are up ~20 minutes, leave the bed, keep it dim and boring, return when sleepy. That is stimulus control — first-line, not a hack.`,
      citations: ["sleep-pressure", "alcohol", "bmi-osa"],
    };
  }

  if (/can'?t fall|cannot fall|fall asleep|falling asleep|onset|wired|mind racing|lying awake/.test(lower)) {
    return {
      text: `${lastNight(latest, units)} Onset trouble is usually pressure plus a bed that has been trained for thinking. Do not get in to “try.” Dim, off screens, wind-down here. Get in when sleepy. Twenty minutes still awake: get up. AASM first-line is that protocol (CBT-I), not melatonin at lights-out.`,
      citations: ["sleep-pressure", "wind-down"],
    };
  }

  if (/how much sleep|how many hours|sleep need|enough sleep|6 hours|seven hours/.test(lower)) {
    const need = sleepNeedHours(profile.age);
    const mean = reports.length ? ` Your mean on the chart is ${formatDuration(week.meanDurationMinutes)}.` : "";
    return {
      text: `AASM: adults 7 hours or more. NSF for age ${profile.age}: ${need.label}.${mean} One short night is not a diagnosis. Stretching time in bed when you are not sleeping is the insomnia phenotype — we shrink the window, we do not pad it.`,
      citations: ["duration-age"],
    };
  }

  if (/exercise|workout|gym|run|sedentary|active/.test(lower)) {
    return {
      text: `You marked activity as ${profile.activity}. Regular daytime movement improves sleep on average (temperature, anxiety, pressure). A hard session in the last hour can delay onset for some people via core temperature and arousal. Walk and morning light first. Do not make the first experiment 10 pm HIIT.`,
      citations: ["activity"],
    };
  }

  if (/snore|apnea|gasp|cpap|airway|osa/.test(lower)) {
    return {
      text: `I cannot hear you sleep. Unrefreshing sleep, snoring, gasping, or high body mass is an airway checklist for a clinician, not a magnesium problem. Insomnia tools will not fix obstructive apnea. If that list fits, ask for a proper evaluation.`,
      citations: ["bmi-osa"],
    };
  }

  if (
    /\b(meds?|medication|prescription|adderall|vyvanse|ritalin|stimulant|wellbutrin|ssri|zoloft|lexapro)\b/.test(
      lower,
    )
  ) {
    const named = meds.length
      ? meds.map((m) => `${m.name}: ${m.note}`).join(" ")
      : "I only comment on names you listed in You. I will never tell you to stop a prescribed drug.";
    return { text: named, citations: ["medications"] };
  }

  if (/breathe|478|4-7-8|meditation|noise|brown|wind-down|wind down|calm/.test(lower)) {
    return {
      text: `Pre-sleep arousal is a maintaining factor for insomnia. Slow breathing, muscle release, and boring noise drop that arousal. They are not magic frequencies. Use one session tonight, then tell the morning interview if it helped — your response beats a population average.`,
      citations: ["wind-down"],
    };
  }

  if (/schedule|wake time|bedtime|circadian|tonight|clock/.test(lower)) {
    return {
      text: `${impression(consult)} The SCN (brain clock) is set mainly by light. Defend ${formatClock(profile.targetWake, units)}, then outdoor light within an hour of getting up. Screens down an hour before ${formatClock(profile.targetSleep, units)}. The clock cannot learn a moving target.`,
      citations: ["circadian-anchor"],
    };
  }

  if (/how.*(doing|sleeping)|am i ok|is my sleep|tips|advice|help me|what should i do|plan|impression/.test(lower)) {
    const top = notes.filter((n) => n.kind === "alert" || n.kind === "lever" || n.kind === "steady").slice(0, 2);
    const plan = top.map((n) => n.body).join(" ");
    return {
      text: `Impression: ${impression(consult)} Plan: ${plan || "Log a morning. I will not give generic hygiene as if it were a consult."}`,
      citations: top.flatMap((n) => n.sourceIds).slice(0, 4),
    };
  }

  const retrieved = searchResearch(q).filter((article) =>
    q
      .toLowerCase()
      .split(/\s+/)
      .some((token) => token.length > 3 && `${article.title} ${article.tags.join(" ")}`.toLowerCase().includes(token)),
  );
  if (retrieved[0]) {
    return { text: retrieved[0].summary, citations: [retrieved[0].id] };
  }

  const top = notes.filter((n) => n.kind !== "context").slice(0, 1);
  if (top[0]) {
    return {
      text: `${impression(consult)} ${top[0].body}`,
      citations: top[0].sourceIds,
    };
  }

  return {
    text: `${impression(consult)} Ask me the way you would in clinic — onset, 3 a.m. wakings, melatonin, alcohol, sleeping in, caffeine, or the meds on your list.`,
    citations: ["circadian-anchor"],
  };
}

export function answerQuestion(
  question: string,
  profile: Profile | null,
  reports: MorningReport[],
): ChatReply {
  const q = question.trim();
  if (!q) {
    return { text: "What is the actual problem tonight — onset, waking, or tomorrow’s clock?", citations: [] };
  }

  if (!profile) {
    return {
      text: "Finish the profile so I have age, meds, activity, and the window. I will not consult off an empty chart.",
      citations: [],
    };
  }

  const sorted = [...reports].sort((a, b) => a.morningDate.localeCompare(b.morningDate));
  return answerQuestionWithProfile(q, {
    profile,
    reports: sorted,
    week: weekBreakdown(sorted),
    latest: sorted[sorted.length - 1],
  });
}

export function makeChatMessage(role: ChatMessage["role"], text: string, citations?: string[]): ChatMessage {
  return {
    id: newId(),
    role,
    text,
    createdAt: new Date().toISOString(),
    citations,
  };
}
