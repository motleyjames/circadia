import type { ChatMessage, MorningReport, Profile } from "@/lib/types";
import { buildSleepNotes } from "@/lib/advisor";
import { readDream } from "@/lib/dreams";
import { weekBreakdown } from "@/lib/metrics";
import { buildRecommendations } from "@/lib/recommendations";
import { RESEARCH, searchResearch } from "@/lib/research";
import { formatClock, formatDuration, newId } from "@/lib/time";

export type ChatReply = {
  text: string;
  citations: string[];
};

export function answerQuestion(
  question: string,
  profile: Profile | null,
  reports: MorningReport[],
): ChatReply {
  const q = question.trim();
  if (!q) {
    return { text: "Ask about tonight, last night, or a lever. Short questions.", citations: [] };
  }

  const lower = q.toLowerCase();

  if (/dream|nightmare|meaning/.test(lower)) {
    const lastDream = [...reports].reverse().find((r) => r.dream?.text);
    if (lastDream?.dream) {
      const read = readDream(lastDream.dream.text, lastDream, profile);
      return {
        text: `${read.physiology} ${read.meaning}`,
        citations: ["dreams", "alcohol"],
      };
    }
    return {
      text: "Log a dream in the morning interview and toggle “any meaning?” I will stay on physiology and the words you wrote — no dictionary.",
      citations: ["dreams"],
    };
  }

  if (!profile) {
    return {
      text: "Finish the profile first so I can use age, meds, activity, and your window.",
      citations: [],
    };
  }

  const notes = buildSleepNotes(profile, reports);
  const week = weekBreakdown(reports);
  const recs = buildRecommendations(profile, reports);
  const retrieved = searchResearch(q);

  if (/melatonin/.test(lower)) {
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "melatonin") : undefined;
    const article = RESEARCH.find((a) => a.id === "melatonin")!;
    return {
      text: rec
        ? rec.body
        : `${article.summary} I wait for about ${recs.nightsNeeded} mornings (${recs.nightsLogged} so far). It is a clock signal, not a sleeping pill.`,
      citations: ["melatonin"],
    };
  }

  if (/magnesium/.test(lower)) {
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "magnesium") : undefined;
    return {
      text: rec
        ? rec.body
        : `Magnesium is mixed evidence, not a protocol. After ${recs.nightsNeeded} nights I will say whether your pattern even fits. Logged: ${recs.nightsLogged}.`,
      citations: ["magnesium"],
    };
  }

  if (/alcohol|drink|drunk|spins/.test(lower)) {
    const n = week.alcoholNights;
    return {
      text: reports.length
        ? `Alcohol shortens latency then fragments the second half, including REM. Your log: ${n} of ${reports.length} nights had drinks.`
        : "Alcohol shortens latency then fragments the second half of the night, including REM. Log the drink bubbles and I will compare those nights to the dry ones.",
      citations: ["alcohol"],
    };
  }

  if (/screen|phone|blue light|blue-light/.test(lower)) {
    return {
      text: reports.length
        ? `The hour is a behavioral gate — content is usually more alerting than the LED. Your average screen-off window is about ${Math.round(week.meanScreenOffMinutes)} minutes.`
        : "Circadia’s rule is one hour off screens. The ping is that rule, not a blue-light gadget. Morning outdoor light is the other half.",
      citations: ["light-screens"],
    };
  }

  if (/schedule|wake time|bedtime|circadian|tonight/.test(lower)) {
    return {
      text: [
        `Target ${formatClock(profile.targetSleep, profile.units)}–${formatClock(profile.targetWake, profile.units)}. Wake time is the anchor.`,
        week.nights.length
          ? `Mean sleep ${formatDuration(week.meanDurationMinutes)}, wake spread ~${Math.round(week.wakeSpreadMinutes)} min.`
          : "Log a few mornings and I will score the spread.",
      ].join(" "),
      citations: ["circadian-anchor"],
    };
  }

  if (/how.*(doing|sleeping)|am i ok|is my sleep|tips|advice|help me/.test(lower)) {
    const top = notes.filter((n) => n.kind !== "context").slice(0, 2);
    return {
      text:
        top.map((n) => `${n.title}: ${n.body}`).join(" ") ||
        "Log a morning and I will have a breakdown instead of generic tips.",
      citations: top.flatMap((n) => n.sourceIds).slice(0, 4),
    };
  }

  if (retrieved.length > 0) {
    const article = retrieved[0];
    const personal = notes.find((n) => n.sourceIds.includes(article.id));
    return {
      text: [article.summary, personal ? `On your logs: ${personal.title}.` : ""].filter(Boolean).join(" "),
      citations: [article.id],
    };
  }

  const top = notes.filter((n) => n.kind !== "context").slice(0, 2);
  return {
    text:
      top.map((n) => `${n.title}. ${n.body}`).join(" ") ||
      "I answer from your logs, your profile, and the library. Try screens, alcohol, melatonin, dreams, or the schedule.",
    citations: top.flatMap((n) => n.sourceIds).slice(0, 3),
  };
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
