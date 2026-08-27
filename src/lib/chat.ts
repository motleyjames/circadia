import type { ChatMessage, MorningReport, Profile, WeekBreakdown } from "@/lib/types";
import { buildSleepNotes } from "@/lib/advisor";
import { readDream } from "@/lib/dreams";
import { flagMedications, weekBreakdown } from "@/lib/metrics";
import { buildRecommendations } from "@/lib/recommendations";
import { extraConsult } from "@/lib/consult-extra";
import { resolveQuestion } from "@/lib/chat-history";
import { matchResearch } from "@/lib/research";
import { formatClock, formatDuration, newId, overnightDuration, sleepNeedHours } from "@/lib/time";

export type ChatReply = {
  text: string;
  citations: string[];
};

export const CLINIC_PROMPTS = [
  "Why can’t I fall asleep?",
  "I keep waking at 3.",
  "What is Unisom?",
  "Should I take melatonin?",
  "What does alcohol actually do?",
] as const;

type Consult = {
  profile: Profile;
  reports: MorningReport[];
  week: WeekBreakdown;
  latest: MorningReport | undefined;
};

function lastNight(latest: MorningReport | undefined, units: Profile["units"]): string {
  if (!latest) return "";
  const dur = formatDuration(overnightDuration(latest.fellAsleepAt, latest.wokeAt));
  const bits = [
    `Last night: ${dur}, rated ${latest.rating}/5`,
    `asleep ~${formatClock(latest.fellAsleepAt, units)}`,
  ];
  if (latest.drank) {
    bits.push(
      `${latest.drinkCount ?? "some"} drink${latest.drinkCount === 1 ? "" : "s"}${latest.spins ? ", spins" : ""}`,
    );
  }
  return `${bits.join("; ")}.`;
}

function howYouLook(consult: Consult): string {
  const { profile, reports, week } = consult;
  const need = sleepNeedHours(profile.age);
  if (reports.length === 0) {
    return `I have your target (${formatClock(profile.targetSleep, profile.units)}–${formatClock(profile.targetWake, profile.units)}) but no mornings yet. ${need.label}. One night does not count as a pattern.`;
  }
  const parts: string[] = [
    `Across ${reports.length} night${reports.length === 1 ? "" : "s"}: average ${formatDuration(week.meanDurationMinutes)}`,
    `rated ${week.meanRating.toFixed(1)}/5`,
  ];
  if (week.nightsWithHighLatency >= 2) parts.push("falling asleep often took more than 30 minutes");
  if (week.nightsWokeInNight >= 2) parts.push("you woke and struggled more than once");
  if (week.alcoholNights) parts.push(`drinks on ${week.alcoholNights}/${reports.length} nights`);
  if (week.wakeSpreadMinutes >= 75) parts.push("wake time is drifting");
  return `${parts.join("; ")}.`;
}

function answerQuestionWithProfile(q: string, consult: Consult): ChatReply {
  const { profile, reports, week, latest } = consult;
  const lower = q.toLowerCase();
  const recs = buildRecommendations(profile, reports);
  const notes = buildSleepNotes(profile, reports);
  const units = profile.units;
  const meds = flagMedications(profile.medications);
  const diary = lastNight(latest, units);

  if (/dream|nightmare|meaning/.test(lower) && !/doxylamine|unisom|melatonin/.test(lower)) {
    const lastDream = [...reports].reverse().find((r) => r.dream?.text);
    if (lastDream?.dream) {
      const read = readDream(lastDream.dream.text, lastDream, profile);
      return { text: `${read.physiology} ${read.meaning}`, citations: ["dreams", "alcohol"] };
    }
    return {
      text: "I don’t have a dream on the chart yet. In the morning interview you can add it. I will talk about sleep stage and the words you wrote — not a symbol dictionary.",
      citations: ["dreams"],
    };
  }

  const extra = extraConsult(lower);
  if (extra) return extra;

  if (
    /ambien|zolpidem|lunesta|trazodone|hydroxyzine|atarax|sonata|restoril|silenor/.test(
      lower,
    )
  ) {
    return {
      text: "Those are prescription sleep drugs (Ambien is the one people mean most). They can help you fall asleep. They can also leave you groggy, and some people get odd nighttime behavior. I will never tell you to start, stop, or change a prescription — that is your prescriber. The long-term plan is still the same: a wake time you protect, and getting out of bed if you are lying there awake.",
      citations: ["prescription-hypnotics"],
    };
  }

  if (
    /unisom|benadryl|zzzquil|zzquil|doxylamine|diphenhydramine|nyquil|nytol|tylenol pm|advil pm/.test(
      lower,
    )
  ) {
    const gel = /gel|sleepgel|dipheng/.test(lower)
      ? " The gels are usually diphenhydramine, not doxylamine. Same family: drowsy, foggy next day, not a nightly plan."
      : "";
    const nightly = /every night|habit|long term|daily|each night/.test(lower)
      ? " Taking it every night is the thing clinics do not want."
      : "";
    return {
      text: `Unisom is an old allergy medicine sold as a sleep aid. SleepTabs are usually doxylamine; some gels, ZzzQuil, Tylenol PM, and Benadryl use diphenhydramine. They can knock you out for a night. That is not the same as good sleep — next-day fog is common, and they work less if you take them often. Sleep clinics do not use these as a nightly plan. Fine as a rare backup; not a habit. Do not mix with alcohol. If you are older or already take drowsy meds, ask a pharmacist or doctor first. I will not tell you to start them.${gel}${nightly}`,
      citations: ["otc-antihistamines"],
    };
  }

  if (/\b(thc|cbd|cannabis|weed|marijuana|edibles?|gummies)\b/.test(lower)) {
    return {
      text: "THC can make you sleepy, then steal dream sleep (REM). Coming off it at 3 a.m. can feel like a restless, vivid night — in the same family as alcohol, not identical. CBD evidence for insomnia is small and mixed. I will not tell you to start or stop cannabis. If you use it most nights, say so — I will treat it as part of the picture, not as a treatment.",
      citations: ["cannabis-sleep"],
    };
  }

  if (/\b(adderall|vyvanse|ritalin|concerta|wellbutrin|ssri|zoloft|lexapro|medication|prescription med)\b/.test(lower)) {
    const named = meds.length
      ? meds.map((m) => `${m.name}: ${m.note}`).join(" ")
      : "I only comment on names you listed in You. I will never tell you to stop a prescribed drug.";
    return { text: named, citations: ["medications"] };
  }

  if (/melatonin/.test(lower)) {
    const when = /when|how long before|what time/.test(lower)
      ? " Timing people discuss with a clinician is often 1–3 hours before desired sleep, not at lights-out."
      : "";
    const howMuch = /how much|dose|mg\b|milligram/.test(lower)
      ? " The clock-tool discussion is often 0.3–1 mg — not 10 mg."
      : "";
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "melatonin" || s.id === "none") : undefined;
    const plan = recs.ready
      ? rec?.body
      : `Melatonin is a clock signal, not a sleeping pill. Sleep clinics try a stable wake time first. I wait for about ${recs.nightsNeeded} mornings before talking about it as a clock tool — you have ${recs.nightsLogged}. If a clinician later agrees, the usual discussion is a low dose (often 0.3–1 mg) earlier than bedtime, not a big dose at lights-out.`;
    return { text: [diary, plan, howMuch, when].filter(Boolean).join(" "), citations: ["melatonin"] };
  }

  if (/magnesium/.test(lower)) {
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "magnesium" || s.id === "none") : undefined;
    const plan = recs.ready
      ? rec?.body
      : `Magnesium is not a knockout pill. The evidence is mixed and small. I will only mention glycinate as a maybe after ${recs.nightsNeeded} nights if your pattern even fits (${recs.nightsLogged} logged). Kidney disease is a hard no — that is a human, not an aisle.`;
    return { text: plan ?? "", citations: ["magnesium"] };
  }

  if (/caffeine|coffee|espresso|energy drink/.test(lower)) {
    return {
      text: `${meds.length ? `You listed ${meds.map((m) => m.name).join(", ")} — late caffeine on top of a stimulant is a common way to show up as “I can’t sleep.” ` : ""}Caffeine blocks the chemical that builds up while you are awake and tells you it is time to sleep. It hangs around about 5–6 hours for most people. A 3 pm coffee can still be working at 9 pm. If falling asleep is the problem, last caffeine by early afternoon.`,
      citations: ["caffeine"],
    };
  }

  if (/alcohol|drink|drunk|spins|hangover|\b(beer|wine|vodka|shots?|tequila|whiskey)\b/.test(lower) && !/coffee|caffeine|water/.test(lower)) {
    const n = week.alcoholNights;
    const chart = reports.length
      ? `On your diary: drinks on ${n} of ${reports.length} nights.`
      : "Once drink nights are on the chart I can compare them to dry ones.";
    return {
      text: `${chart} Alcohol makes you drowsy going in, then shreds the second half of the night — more wake-ups, less dream sleep. “Spins” means the dose was already past useful sleep. If we run one experiment: two dry nights, compare how you rate the morning. That beats a new bottle.`,
      citations: ["alcohol"],
    };
  }

  if (/screen|phone|blue light|blue-light|scroll|night mode/.test(lower)) {
    const avg = reports.length ? ` Your average screens-off window is about ${Math.round(week.meanScreenOffMinutes)} min.` : "";
    return {
      text: `Bright evening light can delay the “it is night” signal. The bigger problem is usually the content — unfinished work and feeds keep the brain on.${avg} Dim the room, get off the phone for an hour, and get morning outdoor light. That pair trains the clock.`,
      citations: ["light-screens"],
    };
  }

  if (/nap|sleep in|sleeping in|catch up|weekend|slept until|sleep till/.test(lower) && !/lie awake|lying awake|fall asleep/.test(lower)) {
    return {
      text: `Sleeping until noon after a short night feels kind and pushes tonight later — like a tiny time-zone shift. Protect your wake time (${formatClock(profile.targetWake, units)}) even after a rough night. Catch-up: a ~20 minute nap before mid-afternoon, or go to bed earlier only once you are actually sleepy. Exception: if you might drive or cannot stay awake, sleep is safety. That severity belongs with a doctor.`,
      citations: ["naps", "circadian-anchor"],
    };
  }

  if (
    /3 ?a\.?m\b|at 3\b|3:00|middle of the night|wake up at night|waking up|\bwaking\b|stay asleep|staying asleep|maintenance/.test(
      lower,
    )
  ) {
    return {
      text: `${diary ? `${diary} ` : ""}Waking and not dropping back is a staying-asleep problem. I rank: alcohol in the second half, too much time in bed, watching the clock, then snoring / gasping. If you are up about 20 minutes, leave the bed, keep it dim and boring, return when sleepy. Do not negotiate with the clock.`,
      citations: ["sleep-pressure", "alcohol", "bmi-osa"],
    };
  }

  if (/can'?t fall|cannot fall|can'?t sleep|cannot sleep|\binsomnia\b|fall asleep|falling asleep|onset|wired|mind racing|lie awake|lying awake/.test(lower)) {
    return {
      text: `${diary ? `${diary} ` : ""}Trouble falling asleep is usually “not sleepy enough yet” plus a bed that has been used for thinking. Do not get in to try. Dim lights, off screens, wind-down here. Get in when you are actually sleepy. Still awake about 20 minutes: get up. That beats a sleeping pill at lights-out.`,
      citations: ["sleep-pressure", "wind-down"],
    };
  }

  if (/how much sleep|how many hours|sleep need|enough sleep|[6-9] hours|eight hours|seven hours|do i need \d/.test(lower)) {
    const need = sleepNeedHours(profile.age);
    const mean = reports.length ? ` Your average on the chart is ${formatDuration(week.meanDurationMinutes)}.` : "";
    return {
      text: `${need.label}.${mean} One short night is not a diagnosis. Lying in bed longer when you are not sleeping usually makes sleep worse — we shrink the window, we do not pad it.`,
      citations: ["duration-age"],
    };
  }

  if (/exercise|work out|workout|\bgym\b|sedentary|hiit/.test(lower)) {
    return {
      text: `You marked activity as ${profile.activity}. Moving during the day usually helps sleep. A hard workout in the last hour can delay it for some people. Walk and morning light first. Do not make the first experiment 10 pm HIIT.`,
      citations: ["activity"],
    };
  }

  if (/snore|apnea|gasp|cpap|airway|osa/.test(lower)) {
    return {
      text: `I cannot hear you sleep. Unrefreshing sleep, snoring, gasping, or high body weight is an airway checklist for a clinician — not a magnesium problem. Insomnia tools will not fix sleep apnea. If that list fits, ask for a proper evaluation.`,
      citations: ["bmi-osa"],
    };
  }

  if (/\b(meds?|medication)s?\b/.test(lower)) {
    const named = meds.length
      ? meds.map((m) => `${m.name}: ${m.note}`).join(" ")
      : "I only comment on names you listed in You. I will never tell you to stop a prescribed drug.";
    return { text: named, citations: ["medications"] };
  }

  if (/breathe|478|4-7-8|meditat|noise|brown|wind-down|wind down|calm/.test(lower)) {
    return {
      text: `A racing mind at bedtime keeps insomnia going. Slow breathing, muscle release, and boring noise lower that. They are not magic frequencies. Use one session tonight, then tell the morning interview if it helped — your response beats a population average.`,
      citations: ["wind-down"],
    };
  }

  if (/schedule|wake time|bedtime|circadian|tonight|clock/.test(lower)) {
    return {
      text: `The clock in your brain is set mainly by light. Defend ${formatClock(profile.targetWake, units)}, then get outdoor light within an hour of getting up. Screens down an hour before ${formatClock(profile.targetSleep, units)}. The clock cannot learn a moving target.`,
      citations: ["circadian-anchor"],
    };
  }

  if (/how.*(doing|sleeping)|am i ok|is my sleep|tips|advice|what should i do|plan|impression/.test(lower)) {
    const top = notes.filter((n) => n.kind === "alert" || n.kind === "lever" || n.kind === "steady").slice(0, 2);
    const plan = top.map((n) => n.body).join(" ");
    return {
      text: `${howYouLook(consult)} ${plan || "Log a morning. I will not give generic tips as if they were a consult."}`,
      citations: top.flatMap((n) => n.sourceIds).slice(0, 4),
    };
  }

  const retrieved = matchResearch(q);
  if (retrieved) {
    return { text: retrieved.say ?? retrieved.summary, citations: [retrieved.id] };
  }

  return {
    text: "I don’t have a solid note on that. Ask about falling asleep, 3 a.m. wakings, alcohol, caffeine, melatonin, Unisom-type sleep aids, screens, sleeping in, or the meds on your list.",
    citations: [],
  };
}

export function answerQuestion(
  question: string,
  profile: Profile | null,
  reports: MorningReport[],
  history: ChatMessage[] = [],
): ChatReply {
  const raw = question.trim();
  if (!raw) {
    return { text: "What is the actual problem tonight — falling asleep, waking, or tomorrow’s clock?", citations: [] };
  }

  if (!profile) {
    return {
      text: "Finish setup so I have your age, meds, and wake time. I will not guess off an empty chart.",
      citations: [],
    };
  }

  const q = resolveQuestion(raw, history);
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
