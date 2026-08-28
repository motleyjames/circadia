/**
 * Sleep-consult corpus: paraphrases + follow-ups.
 * Invariants, not snapshot essays. Generated so we can cover thousands of
 * utterances without 3,000 copy-pasted expects.
 */

export type CorpusCase = {
  id: string;
  q: string;
  prior?: string[];
  citationsInclude?: string[];
  must: string;
  withhold?: boolean;
};

const BAN = /aasm|cbt-i|\bscn\b|empty diary|need band|stop taking|stop the drug/;

const FRAMES = [
  (s: string) => s,
  (s: string) => `${s}?`,
  (s: string) => `Hey — ${s}`,
  (s: string) => `quick: ${s}`,
  (s: string) => `honestly ${s}`,
  (s: string) => `ok so ${s}`,
  (s: string) => `be straight: ${s}`,
  (s: string) => `for real, ${s}`,
  (s: string) => `simple terms: ${s}`,
  (s: string) => `I've heard mixed things. ${s}`,
  (s: string) => `can you explain ${s}`,
  (s: string) => `not trying to be weird but ${s}`,
];

const FOLLOW_FRAMES = [
  (s: string) => s,
  (s: string) => `${s}?`,
  (s: string) => `wait, ${s}`,
  (s: string) => `ok but ${s}`,
  (s: string) => `and ${s}`,
  (s: string) => `one more: ${s}`,
];

type Topic = {
  id: string;
  citations: string[];
  must: string;
  stems: string[];
  followUps?: { q: string; must?: string; citations?: string[] }[];
};

const TOPICS: Topic[] = [
  {
    id: "otc",
    citations: ["otc-antihistamines"],
    must: "doxylamine|allergy|diphenhydramine|antihistamine|unisom|benadryl",
    stems: [
      "tell me about unisom",
      "what is unisom",
      "should I take unisom",
      "is unisom safe",
      "unisom for sleep",
      "what about benadryl at night",
      "zzzquil vs unisom",
      "tylenol pm to sleep",
      "advil pm tonight",
      "doxylamine for insomnia",
      "diphenhydramine as a sleep aid",
      "is nytol any good",
      "nyquil to knock me out",
      "can I take unisom every night",
      "unisom sleep tabs",
    ],
    followUps: [
      { q: "what about the gels", must: "diphenhydramine|gel" },
      { q: "is that safe every night", must: "night" },
      { q: "is it safe", must: "habit|nightly|backup|not" },
      { q: "can I mix it with a drink", citations: ["alcohol", "otc-antihistamines"], must: "mix|alcohol|do not" },
    ],
  },
  {
    id: "rx",
    citations: ["prescription-hypnotics"],
    must: "prescription|ambien|prescriber|never tell you to start",
    stems: [
      "tell me about ambien",
      "is ambien safe",
      "should I take zolpidem",
      "what is lunesta",
      "trazodone for sleep",
      "hydroxyzine at night",
      "can I stop my ambien",
      "sonata vs ambien",
      "restoril for insomnia",
      "what is quviviq",
      "is dayvigo a sleeping pill",
      "belsomra vs ambien",
      "should I take suvorexant",
    ],
    followUps: [
      { q: "can I stop it", must: "never|prescriber|stop" },
      { q: "is that addictive", must: "prescriber|groggy|never" },
    ],
  },
  {
    id: "thc",
    citations: ["cannabis-sleep"],
    must: "thc|rem|cannabis",
    stems: [
      "does weed help sleep",
      "thc for insomnia",
      "cbd gummies at night",
      "marijuana before bed",
      "edibles to sleep",
      "will cannabis fix my sleep",
    ],
    followUps: [
      { q: "what about cbd", must: "cbd|mixed" },
      { q: "every night though", must: "night|rem|trade" },
    ],
  },
  {
    id: "melatonin",
    citations: ["melatonin"],
    must: "clock|sleeping pill",
    stems: [
      "should I take melatonin",
      "tell me about melatonin",
      "is melatonin a sleeping pill",
      "melatonin 10mg",
      "can melatonin help me fall asleep",
      "is melatonin safe",
      "do I need melatonin",
    ],
    followUps: [
      { q: "how much", must: "0\\.3|1 mg" },
      { q: "when do I take it", must: "hour" },
      { q: "is 10 mg better", must: "10" },
    ],
  },
  {
    id: "magnesium",
    citations: ["magnesium"],
    must: "glycinate|mixed|kidney|knockout",
    stems: [
      "should I take magnesium",
      "magnesium glycinate for sleep",
      "does magnesium work",
      "magnesium oxide tonight",
    ],
    followUps: [{ q: "how much", must: "glycinate|mixed|kidney|week" }],
  },
  {
    id: "alcohol",
    citations: ["alcohol"],
    must: "second half|shred|fragment|drowsy",
    stems: [
      "what does alcohol actually do",
      "does wine help me sleep",
      "a beer before bed",
      "why do I wake after drinking",
      "hangover sleep",
      "I had four drinks",
      "spins last night",
    ],
    followUps: [
      { q: "even one drink", must: "drink|shred|second" },
      { q: "what about two dry nights", must: "dry" },
    ],
  },
  {
    id: "caffeine",
    citations: ["caffeine"],
    must: "5–6 hours|5-6 hours|afternoon|adenosine|coffee",
    stems: [
      "does coffee ruin sleep",
      "caffeine at 3pm",
      "espresso after lunch",
      "energy drink at night",
      "when should I stop caffeine",
      "I drink coffee at 5",
    ],
    followUps: [
      { q: "what about 3pm", must: "3 pm|afternoon|5–6|5-6" },
      { q: "and energy drinks", must: "caffeine|adenosine|afternoon" },
    ],
  },
  {
    id: "screens",
    citations: ["light-screens"],
    must: "dim|phone|light|hour",
    stems: [
      "are screens killing my sleep",
      "blue light glasses",
      "should I scroll in bed",
      "phone in the bedroom",
      "night mode is enough right",
    ],
    followUps: [{ q: "is night mode enough", must: "content|feed|dim|hour" }],
  },
  {
    id: "naps",
    citations: ["naps"],
    must: "wake time|nap|noon",
    stems: [
      "should I sleep in tomorrow",
      "can I nap at 5pm",
      "catch up on the weekend",
      "I slept until noon",
      "is a long nap ok",
    ],
    followUps: [{ q: "what if I might drive", must: "drive|safety" }],
  },
  {
    id: "waking",
    citations: ["sleep-pressure"],
    must: "20 minutes|get up|leave the bed|clock",
    stems: [
      "I keep waking at 3",
      "I wake at 3am",
      "why do I wake in the middle of the night",
      "I can't stay asleep",
      "staying asleep is the problem",
    ],
    followUps: [{ q: "should I just lie there", must: "20 minutes|leave|get up" }],
  },
  {
    id: "onset",
    citations: ["sleep-pressure"],
    must: "20 minutes|sleepy|try",
    stems: [
      "why can't I fall asleep",
      "I can't sleep",
      "mind racing in bed",
      "I lie awake for hours",
      "wired at bedtime",
      "insomnia every night",
    ],
    followUps: [{ q: "should I just try harder", must: "try|get up|20" }],
  },
  {
    id: "duration",
    citations: ["duration-age"],
    must: "hours",
    stems: [
      "how much sleep do I need",
      "how many hours should I sleep",
      "is 6 hours enough",
      "do I need 8 hours",
    ],
  },
  {
    id: "exercise",
    citations: ["activity"],
    must: "day|workout|light",
    stems: [
      "should I work out at 10pm",
      "does exercise help sleep",
      "gym late at night",
      "I'm sedentary and sleep badly",
    ],
  },
  {
    id: "apnea",
    citations: ["bmi-osa"],
    must: "snor|gasp|clinician|apnea|airway",
    stems: [
      "I snore a lot",
      "could this be apnea",
      "I gasp at night",
      "unrefreshing sleep and I snore",
      "do I need a cpap",
    ],
  },
  {
    id: "meds",
    citations: ["medications"],
    must: "adderall|prescriber|never tell you to stop|stimulant",
    stems: [
      "is my Adderall wrecking sleep",
      "vyvanse and insomnia",
      "does ritalin keep me up",
      "wellbutrin nights",
    ],
    followUps: [{ q: "should I stop it", must: "never|prescriber|stop" }],
  },
  {
    id: "wind",
    citations: ["wind-down"],
    must: "breath|noise|arousal|magic",
    stems: [
      "does 4-7-8 help",
      "brown noise for sleep",
      "should I meditate",
      "wind-down ideas",
    ],
  },
  {
    id: "schedule",
    citations: ["circadian-anchor"],
    must: "wake|light|clock",
    stems: [
      "what wake time should I pick",
      "why is wake time the anchor",
      "my bedtime keeps moving",
    ],
  },
  {
    id: "dreams",
    citations: ["dreams"],
    must: "dictionary|meaning|rem|dream",
    stems: [
      "what does my dream mean",
      "are nightmares from alcohol",
      "why are my dreams so vivid",
    ],
  },
  {
    id: "nicotine",
    citations: ["nicotine"],
    must: "stimulant|pouch|vape|nicotine",
    stems: [
      "does vaping hurt sleep",
      "zyn at 1am",
      "nicotine pouch in bed",
      "cigarettes and insomnia",
    ],
  },
  {
    id: "jetlag",
    citations: ["jet-lag"],
    must: "light|clock|hotel|time zone",
    stems: [
      "how do I beat jet lag",
      "melatonin for jet lag",
      "red eye tomorrow",
      "time zone shift sleep",
    ],
  },
  {
    id: "shift",
    citations: ["shift-work"],
    must: "dark|shift|window",
    stems: [
      "I work night shift",
      "graveyard shift sleep tips",
      "rotating shift insomnia",
    ],
  },
  {
    id: "rls",
    citations: ["restless-legs"],
    must: "urge|iron|clinician",
    stems: [
      "I think I have restless legs",
      "rls at night",
      "urge to move in bed",
    ],
  },
  {
    id: "pregnancy",
    citations: ["pregnancy-sleep"],
    must: "clinician|obstetric|pharmacist",
    stems: [
      "unisom while pregnant",
      "melatonin pregnant",
      "I am pregnant and cannot sleep",
      "postpartum insomnia",
    ],
  },
  {
    id: "herbals",
    citations: ["herbals"],
    must: "theanine|valerian|glycine|ashwagandha|not tell you to start",
    stems: [
      "is valerian safe",
      "l-theanine for sleep",
      "ashwagandha at night",
      "glycine before bed",
      "chamomile tea enough",
    ],
  },
  {
    id: "reflux",
    citations: ["late-eating"],
    must: "reflux|meal|heartburn|eat",
    stems: [
      "heartburn wakes me",
      "I eat late and sleep badly",
      "is this gerd",
      "late dinner insomnia",
    ],
  },
  {
    id: "temp",
    citations: ["temperature"],
    must: "shower|cool|temperature",
    stems: [
      "hot shower before bed",
      "I'm too hot at night",
      "does a cooling mattress matter",
      "warm bath for sleep",
    ],
  },
  {
    id: "debt",
    citations: ["sleep-debt"],
    must: "noon|nap|wake",
    stems: [
      "I pulled an all nighter",
      "I only slept 4 hours",
      "all-nighter recovery",
    ],
  },
];

const WITHHOLD_STEMS = [
  "what is the weather in boulder",
  "who won the game last night",
  "write me a python function",
  "what's tesla stock",
  "recipe for lasagna",
  "who is taylor swift dating",
  "translate this to french",
  "best running shoes 2026",
  "how do I boil eggs",
  "what's the capital of france",
  "play a song",
  "define photosynthesis",
];

function unique(cases: CorpusCase[]): CorpusCase[] {
  const seen = new Set<string>();
  const out: CorpusCase[] = [];
  for (const row of cases) {
    const key = `${(row.prior ?? []).join("||")}|${row.q}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function buildCorpus(): CorpusCase[] {
  const cases: CorpusCase[] = [];

  for (const topic of TOPICS) {
    for (const stem of topic.stems) {
      for (const frame of FRAMES) {
        cases.push({
          id: topic.id,
          q: frame(stem),
          citationsInclude: topic.citations,
          must: topic.must,
        });
      }
    }
    for (const fu of topic.followUps ?? []) {
      for (const stem of topic.stems) {
        for (const ff of FOLLOW_FRAMES) {
          cases.push({
            id: `${topic.id}-follow`,
            q: ff(fu.q),
            prior: [stem],
            citationsInclude: fu.citations ?? topic.citations,
            must: fu.must ?? topic.must,
          });
        }
      }
    }
  }

  for (const stem of WITHHOLD_STEMS) {
    for (const frame of FRAMES) {
      cases.push({
        id: "withhold",
        q: frame(stem),
        must: "solid note",
        withhold: true,
      });
    }
  }

  return unique(cases);
}

export function bannedIn(text: string): boolean {
  return BAN.test(text.toLowerCase());
}
