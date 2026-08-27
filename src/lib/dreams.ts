import type { MorningReport, Profile } from "@/lib/types";
import { RESEARCH, searchResearch } from "@/lib/research";

export type DreamRead = {
  physiology: string;
  themes: string[];
  meaning: string;
  caution: string;
};

const THEME_RULES: Array<{ pattern: RegExp; label: string; gloss: string }> = [
  { pattern: /fall(ing)?|teeth|chase|chased|late|exam|test/, label: "threat / loss of control", gloss: "common when the waking day has evaluation pressure or a sense of being behind — frequent in students." },
  { pattern: /water|ocean|drown|flood|rain|tide/, label: "water / overwhelm", gloss: "often tracks affect load, not a literal prophecy about emotion. useful as a journal tag, not a symbol key." },
  { pattern: /dead|death|funeral|grave/, label: "death imagery", gloss: "usually change or fear, not prediction. if it is recurrent and distressing, that is nightmare territory — a clinician can use rehearsal therapy." },
  { pattern: /ex\b|cheating|jealous|partner|crush/, label: "attachment", gloss: "REM likes unfinished social emotion. it is not evidence something is happening." },
  { pattern: /fly|flying|lucid/, label: "agency / lucidity", gloss: "often shows up with lighter REM or practice. interesting, not enlightenment." },
  { pattern: /spin|spins|vertigo|dizzy/, label: "vestibular", gloss: "can be leftover from alcohol, fever, or actually spinning out before bed — check last night's drink bubbles." },
  { pattern: /school|class|campus|professor|homework/, label: "school residue", gloss: "the day's unfinished loops. consolidation, not a message from the future." },
];

export function readDream(text: string, report: MorningReport | undefined, profile: Profile | null): DreamRead {
  const lower = text.toLowerCase();
  const matched = THEME_RULES.filter((rule) => rule.pattern.test(lower));
  const themes = matched.map((m) => `${m.label}: ${m.gloss}`);

  const physBits: string[] = [];
  if (report?.drank) {
    physBits.push(
      report.spins
        ? "You logged drinks and spins. Rebound REM plus vestibular leftover is a boring, strong explanation for wild or spinning dreams."
        : "Alcohol suppresses REM early, then REM rebounds later — vivid or bizarre dreams after drinking are physiology before meaning.",
    );
  }
  if (report?.usedSupplement && (report.supplementKind === "melatonin" || report.supplementKind === "both")) {
    physBits.push("Melatonin can intensify recall for some people. Treat that as a side effect, not a spiritual upgrade.");
  }
  if (profile && flagAntidepressant(profile)) {
    physBits.push("Some antidepressants change dream intensity. Mention that to your prescriber if nightmares are new.");
  }
  if (physBits.length === 0) {
    physBits.push(
      "Most story-like dreams cluster in REM, especially in the last third of the night. They stitch emotion and memory. They are not a coded letter.",
    );
  }

  const meaning =
    matched.length > 0
      ? `If we stay honest: the images you wrote lean ${matched.map((m) => m.label).join(", ")}. The useful question is what yesterday felt like, not what a dream dictionary says a snake 'means.'`
      : "I will not invent a myth for this. Keep the text as a mood snapshot. If a dream repeats and wrecks the night, that is a nightmare-treatment conversation, not a symbol to decode.";

  return {
    physiology: physBits.join(" "),
    themes,
    meaning,
    caution:
      "Circadia refuses fortune-telling. Dream 'meaning' here is theme-tagging plus sleep physiology. Confidence is low on interpretation, high on the alcohol/REM mechanism when that is in the log.",
  };
}

function flagAntidepressant(profile: Profile): boolean {
  return profile.medications.some((m) =>
    /prozac|zoloft|lexapro|ssri|effexor|wellbutrin|sertraline|fluoxetine|escitalopram|venlafaxine|bupropion/.test(
      m.toLowerCase(),
    ),
  );
}

export function dreamArticleIds(): string[] {
  return ["dreams", "alcohol"];
}

export function relatedDreamResearch() {
  return RESEARCH.filter((a) => a.id === "dreams" || a.id === "alcohol");
}

export function searchDreamSupport(query: string) {
  return searchResearch(query);
}
