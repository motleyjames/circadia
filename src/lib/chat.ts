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

const DISCLAIMER =
  "Educational, not a diagnosis or a prescription. If sleep is collapsing, you snore/gasp, or mood is unsafe, talk to a clinician — Circadia is a log and a coach, not a doctor.";

export function answerQuestion(
  question: string,
  profile: Profile | null,
  reports: MorningReport[],
): ChatReply {
  const q = question.trim();
  if (!q) {
    return { text: "Ask anything about tonight, last night, or the levers. Short questions are fine.", citations: [] };
  }

  const lower = q.toLowerCase();

  if (/dream|nightmare|meaning/.test(lower)) {
    const lastDream = [...reports].reverse().find((r) => r.dream?.text);
    if (lastDream?.dream) {
      const read = readDream(lastDream.dream.text, lastDream, profile);
      return {
        text: `${read.physiology}\n\n${read.meaning}\n\n${read.caution}`,
        citations: ["dreams", "alcohol"],
      };
    }
    return {
      text: "Log a dream in the morning interview (optional) and toggle “any meaning behind this?” I will stay on sleep physiology and themes you actually wrote — no dream dictionary.",
      citations: ["dreams"],
    };
  }

  if (!profile) {
    return {
      text: "Finish the profile first so I can use age, meds, activity, and your target window. Then ask again.",
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
      text: [
        article.summary,
        rec ? rec.body : `I wait for about ${recs.nightsNeeded} mornings before recommending it. You have ${recs.nightsLogged}. ${article.body.split("Circadia")[0].trim()}`,
        DISCLAIMER,
      ].join("\n\n"),
      citations: ["melatonin"],
    };
  }

  if (/magnesium/.test(lower)) {
    const rec = recs.ready ? recs.supplements.find((s) => s.id === "magnesium") : undefined;
    const article = RESEARCH.find((a) => a.id === "magnesium")!;
    return {
      text: [
        article.summary,
        rec ? rec.body : `Magnesium is a maybe, not a protocol. After ${recs.nightsNeeded} nights I will say whether your pattern even fits the weak evidence. Logged: ${recs.nightsLogged}.`,
        DISCLAIMER,
      ].join("\n\n"),
      citations: ["magnesium"],
    };
  }

  if (/alcohol|drink|drunk|spins/.test(lower)) {
    const n = week.alcoholNights;
    return {
      text: [
        RESEARCH.find((a) => a.id === "alcohol")!.summary,
        reports.length
          ? `In your log: ${n} of ${reports.length} nights had drinks.`
          : "Once you log mornings with the drink bubbles, I can compare those nights to the dry ones.",
        DISCLAIMER,
      ].join("\n\n"),
      citations: ["alcohol"],
    };
  }

  if (/screen|phone|blue light|blue-light/.test(lower)) {
    return {
      text: [
        RESEARCH.find((a) => a.id === "light-screens")!.body,
        reports.length
          ? `Your average screen-off window is about ${Math.round(week.meanScreenOffMinutes)} minutes.`
          : "The rule in Circadia is one hour. The notification is that rule, not a gadget.",
        DISCLAIMER,
      ].join("\n\n"),
      citations: ["light-screens"],
    };
  }

  if (/schedule|wake time|bedtime|circadian|tonight/.test(lower)) {
    return {
      text: [
        `Your target is ${formatClock(profile.targetSleep, profile.units)} to ${formatClock(profile.targetWake, profile.units)}. Screens down at one hour before sleep.`,
        RESEARCH.find((a) => a.id === "circadian-anchor")!.body,
        week.nights.length
          ? `Mean sleep ${formatDuration(week.meanDurationMinutes)}, wake spread ~${Math.round(week.wakeSpreadMinutes)} min.`
          : "",
        DISCLAIMER,
      ]
        .filter(Boolean)
        .join("\n\n"),
      citations: ["circadian-anchor"],
    };
  }

  if (/how.*(doing|sleeping)|am i ok|is my sleep|tips|advice|help me/.test(lower)) {
    const top = notes.filter((n) => n.kind !== "context").slice(0, 3);
    return {
      text: [
        top.map((n) => `• ${n.title}: ${n.body}`).join("\n\n") || "Log a morning and I will have a breakdown instead of generic tips.",
        DISCLAIMER,
      ].join("\n\n"),
      citations: top.flatMap((n) => n.sourceIds).slice(0, 4),
    };
  }

  if (retrieved.length > 0) {
    const article = retrieved[0];
    const personal = notes.find((n) => n.sourceIds.includes(article.id));
    return {
      text: [article.body, personal ? `On your logs: ${personal.body}` : "", DISCLAIMER].filter(Boolean).join("\n\n"),
      citations: [article.id],
    };
  }

  const top = notes.filter((n) => n.kind !== "context").slice(0, 2);
  return {
    text: [
      top.map((n) => `${n.title}. ${n.body}`).join("\n\n") ||
        "I answer from your logs, your profile, and Circadia's sleep library. Try asking about screens, alcohol, melatonin, dreams, or your schedule.",
      DISCLAIMER,
    ].join("\n\n"),
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
