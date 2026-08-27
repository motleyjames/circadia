import type { ChatMessage } from "@/lib/types";
import { includesWord, RESEARCH } from "@/lib/research";

const LEAD =
  /^(hey — |quick: |honestly |ok so |ok but |wait,? |be straight: |for real, |simple terms: |i['’]ve heard mixed things\. |can you explain |not trying to be weird but |one more:\s*|and )/i;

export function stripLead(question: string): string {
  return question.trim().replace(LEAD, "").trim();
}

const STANDALONE =
  /^(how much sleep|how many hours|why can'?t|should i take|tell me about|what is |what does |is my |i keep |i can'?t |i cannot |do you think)/i;

const FOLLOW_START =
  /^(what about|and the|and that|is that|is it|how much|when (do|should|is)|the gels|the tabs|sleepgels?|every night|side effects?|instead|can i take that|is it safe|safe to|dose|the other|and if|what if i already|should i stop|can i stop|even one|what if i might)/i;

export function isFollowUp(question: string): boolean {
  const t = stripLead(question).toLowerCase();
  if (!t) return false;
  if (STANDALONE.test(t)) return false;
  const words = t.split(/\s+/).length;
  if (FOLLOW_START.test(t)) return true;
  if (words <= 8 && /\b(mg|gels?|tabs?|safe|dose|nightly|better|stop|drink|drive|lie there|try harder|night mode|dry nights?)\b/.test(t))
    return true;
  if (words <= 5 && /^(safe\??|when\??|why\??|really\??|and .+|but .+|the gels\??)$/.test(t)) return true;
  return false;
}

/** Named topic in this utterance alone — used to switch topics instead of blending. */
export function topicHint(question: string): string | undefined {
  const q = stripLead(question).toLowerCase();
  let best: { id: string; len: number } | undefined;
  for (const article of RESEARCH) {
    for (const alias of article.aliases ?? []) {
      if (alias.length < 3) continue;
      if (!includesWord(q, alias) && !(alias.includes(" ") && q.includes(alias))) continue;
      if (!best || alias.length > best.len) best = { id: article.id, len: alias.length };
    }
  }
  return best?.id;
}

/** Fold a short follow-up onto the last user question so Unisom → “the gels?” still hits Unisom. */
export function resolveQuestion(question: string, history: ChatMessage[]): string {
  const q = stripLead(question);
  if (!q) return question.trim();
  if (topicHint(q)) return q;
  if (!isFollowUp(q) || history.length === 0) return q;
  const lastYou = [...history].reverse().find((m) => m.role === "you")?.text ?? "";
  return `${lastYou} ${q}`.trim();
}
