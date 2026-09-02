export type ResearchConfidence = "high" | "moderate" | "low";

export type ResearchSource = {
  cite: string;
  year: number;
};

export type ResearchArticle = {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  /** Last month a person confirmed this note against current guidelines. Not a scrape date. */
  reviewedThrough: string;
  confidence: ResearchConfidence;
  sources: ResearchSource[];
  /** Extra match keys for chat — brand names, street names, spellings. */
  aliases?: string[];
  /** Plain-English chat line. Library body may keep jargon; this must not. */
  say?: string;
};

/** CI fails if any note's reviewedThrough is older than this. Local-first: no live PubMed. */
export const RESEARCH_STALE_AFTER_MONTHS = 12;

export function parseReviewedThrough(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Whole months since reviewedThrough. Null if the stamp is malformed. */
export function researchAgeMonths(reviewedThrough: string, now = new Date()): number | null {
  const parsed = parseReviewedThrough(reviewedThrough);
  if (!parsed) return null;
  return (now.getFullYear() - parsed.year) * 12 + (now.getMonth() + 1 - parsed.month);
}

export function staleResearchIds(articles: ResearchArticle[], now = new Date()): string[] {
  return articles
    .filter((article) => {
      const age = researchAgeMonths(article.reviewedThrough, now);
      return age === null || age > RESEARCH_STALE_AFTER_MONTHS;
    })
    .map((article) => article.id);
}

export function researchSourceLine(article: ResearchArticle): string {
  return article.sources.map((source) => source.cite).join("; ");
}

export function formatReviewedThrough(value: string): string {
  const parsed = parseReviewedThrough(value);
  if (!parsed) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parsed.month - 1]} ${parsed.year}`;
}

/**
 * Curated, conservative sleep-science notes.
 * These are teaching texts for Circadia — not a dump of papers, and not medical advice.
 * Claims stay close to AASM / NSF / CBT-I consensus and name uncertainty when the literature is mixed.
 * Freshness is a review stamp plus a test, not a network call.
 */
export const RESEARCH: ResearchArticle[] = [
  {
    id: "circadian-anchor",
    title: "The wake time is the circadian anchor",
    summary:
      "A stable get-up time, including weekends, is the strongest schedule lever most people have.",
    body: "Your circadian system is a clock in the brain (the SCN) that is set primarily by light. The most reliable way to train that clock is a consistent wake time, then morning outdoor light within about an hour of getting up. Sleeping in on weekends creates 'social jet lag': a mini time-zone shift that makes Sunday night harder. CBT-I clinics treat a fixed wake time as non-negotiable even when the night was short — naps and an earlier bedtime are the recovery tools, not a late morning. ACP (2016) and AASM (2021) still put this behavioral package first for chronic insomnia; the 2026 AASM combination guideline did not unseat that.",
    tags: ["schedule", "circadian", "wake", "light"],
    aliases: ["wake time", "get-up time", "getting up time"],
    say: "A stable get-up time, including weekends, is the strongest schedule lever most people have. Morning outdoor light helps. Sleeping in pushes tonight later.",
    reviewedThrough: "2026-09",
    confidence: "high",
    sources: [
      { year: 2016, cite: "ACP 2016 chronic insomnia CPG (CBT-I first-line)" },
      { year: 2021, cite: "AASM 2021 behavioral/psychological insomnia CPG" },
      { year: 2026, cite: "AASM 2026 combination-treatment CPG (Buysse et al., J Clin Sleep Med)" },
    ],
  },
  {
    id: "morning-light",
    title: "Morning light is the other half of the clock",
    summary:
      "Outdoor light in the first hour after you get up advances tonight. A dim indoor morning does not count.",
    aliases: ["morning light", "sunlight", "outdoor light", "get outside", "go outside"],
    say: "Outdoor light in the first hour after you get up is the other half of a stable wake time. A dim indoor morning does not count. You do not need a gadget — a walk, a window, a few minutes outside.",
    body: "Light is the main time cue for the clock in the brain (the SCN). Intrinsically photosensitive retinal ganglion cells (melanopsin) tell that clock it is daytime; outdoor illuminance in the morning is typically orders of magnitude brighter than indoor lamps. Timed morning light advances a late clock. Circadia will not sell you a 10,000-lux box as a requirement — daylight, even through open shade, is the usual tool. The pairing is deliberate: a stable get-up time, then light. One without the other is a weaker lesson. Evening bright light and a dim morning push the other way. Wearable 'circadian scores' are not a substitute for going outside.",
    tags: ["light", "morning", "circadian", "wake"],
    reviewedThrough: "2026-09",
    confidence: "high",
    sources: [
      { year: 2002, cite: "Berson / Brainard melanopsin photoreception; outdoor vs indoor illuminance as a clock cue" },
      { year: 2024, cite: "Timed morning light advances a late clock. Daylight first; a light box is a clinical tool, not a requirement from this app." },
    ],
  },
  {
    id: "sleep-regularity",
    title: "A moving get-up time is a different clock every night",
    summary:
      "How much your wake time swings often matters as much as how long you slept. Irregular mornings are not a rounding error.",
    aliases: [
      "sleep regularity",
      "irregular sleep",
      "inconsistent wake",
      "wake swing",
      "variable wake",
    ],
    say: "If your get-up time swings by more than about an hour, the clock is learning a moving target. How long you slept is not the only score. Defend one morning.",
    body: "Sleep duration is the number people track. Regularity is the one they skip. A Sleep Regularity Index (day-to-day overlap of sleep and wake) tracks how similar consecutive 24-hour patterns are; large cohort work (including Windred and colleagues, 2023–2024) reports that irregular sleep associates with worse cardiometabolic and mortality signals even after accounting for average duration. That is population data, not a diagnosis of this diary. Circadia will not invent an index score from a week of bubbles. It will say when get-up times are swinging hard enough that the clock cannot learn the morning. Social jet lag is the weekend version of the same idea. The lever is still one wake time you protect.",
    tags: ["schedule", "regularity", "wake", "consistency"],
    reviewedThrough: "2026-09",
    confidence: "high",
    sources: [
      {
        year: 2023,
        cite: "Windred et al. 2023–2024 sleep regularity index / UK Biobank: irregular sleep associated with mortality and cardiometabolic markers independent of duration. Group findings, not a personal forecast.",
      },
      {
        year: 2016,
        cite: "Bei et al. and later regularity reviews: day-to-day timing variability is a sleep-health dimension, not a rounding error on duration.",
      },
    ],
  },
  {
    id: "social-jetlag",
    title: "Social jet lag is a weekend time zone you never boarded",
    summary:
      "The gap between school or work mornings and free mornings, reported in hours. Group findings in the literature are not a personal forecast.",
    aliases: ["social jet lag", "social jetlag", "social jet-lag", "weekend sleep shift", "mctq"],
    say: "When school or work mornings sit earlier than free mornings, that gap is social jet lag. Circadia reports the gap in hours. Links in the literature to mood or weight are about groups of people — not a forecast about you.",
    body: "Social jet lag is the gap between when you sleep on mornings you have to get up (school, work) and mornings you do not. Circadia measures that gap over the last four weeks and reports it in hours. It does not turn the number into a personal health forecast.\n\nRoenneberg, Wittmann, and colleagues named the pattern in 2006, in the MCTQ line of work that compares obligated days with free days. Later papers in that line report population-level associations with mood and metabolic markers. Those are group findings. They are not a diagnosis of this diary, and Circadia will not attach them to you.\n\nThe number is withheld when there are no obligated mornings (a school break), or when too few school or free mornings are logged in the window. A zero would be a lie: unknown is not aligned.",
    tags: ["schedule", "weekend", "social jet lag", "mctq"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      {
        year: 2003,
        cite: "Roenneberg T, Wirz-Justice A, Merrow M. Life between clocks. J Biol Rhythms. 2003;18(1):80-90. MCTQ line of work on obligated vs free days.",
      },
      {
        year: 2006,
        cite: "Wittmann M, Dinich J, Merrow M, Roenneberg T. Social jetlag: misalignment of biological and social time. Chronobiol Int. 2006;23(1-2):497-509.",
      },
      {
        year: 2012,
        cite: "Roenneberg T, Allebrandt KV, Merrow M, Vetter C. Social jetlag and obesity. Curr Biol. 2012;22(10):939-943. Population association, not a personal forecast.",
      },
    ],
  },
  {
    id: "sleep-pressure",
    title: "Sleep pressure is not the same thing as being 'tired'",
    summary:
      "Adenosine builds while you are awake. Long time in bed, late naps, and lying awake all scramble the signal.",
    body: "Homeostatic sleep pressure accumulates with hours awake and dissipates during sleep. If you get into bed at 9 and do not fall asleep until 12, you have trained the bed as a waking place and spent three hours flattening the pressure you needed. Stimulus control (Bootzin): bed is for sleep. If you are awake ~20 minutes, get up, keep lights dim, do something boring, return only when sleepy. Sleep restriction — shrinking time in bed toward actual sleep time — is first-line CBT-I, and it is uncomfortable on purpose. Circadia will not prescribe a restriction window without a clinician; it will tell you when time-in-bed looks too long for the sleep you are getting.",
    tags: ["latency", "insomnia", "cbt-i", "falling"],
    aliases: ["sleep pressure", "stimulus control"],
    say: "The longer you are awake, the more sleep pressure you build. Lying in bed trying flattens that. If you are awake about 20 minutes, get up, keep it dim, come back when sleepy.",
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2021, cite: "AASM 2021 CBT-I strong recommendation; Bootzin stimulus control; Spielman sleep restriction" },
      { year: 2026, cite: "AASM 2026 combination CPG (CBT-I alone preferred over CBT-I+med)" },
    ],
  },
  {
    id: "light-screens",
    title: "Screens, light, and the hour before bed",
    summary:
      "The hour before bed is for dim, boring, offline. Blue light matters — arousal from content usually matters more.",
    body: "Intrinsically photosensitive retinal ganglion cells (melanopsin) tell the clock it is daytime. Bright, especially short-wavelength light in the evening can delay melatonin onset. That is real. What wellness marketing skips: scrolling, gaming, and unfinished work are alerting even on night mode. Circadia's one-hour screen-off is a behavioral gate, not a blue-light gadget. Dim the room, park the phone outside the bedroom if you can, and do a wind-down you could do half-asleep. Morning outdoor light is the other half of this: it advances the clock and makes the next night easier.",
    tags: ["screens", "light", "melatonin", "evening"],
    aliases: ["blue light", "night shift mode", "screens off"],
    reviewedThrough: "2026-08",
    confidence: "moderate",
    sources: [
      { year: 2002, cite: "Berson / Brainard melanopsin photoreception" },
      { year: 2024, cite: "Evening light, melanopsin, and circadian timing reviews through 2024" },
    ],
  },
  {
    id: "alcohol",
    title: "Alcohol is a sleep fragmenter, not a sleep aid",
    summary:
      "Drinks can shorten sleep latency and then shred the second half of the night — including REM.",
    body: "Ethanol is sedating on the way in. A 2024 systematic review and meta-analysis in healthy adults found REM delayed and reduced even at a low dose (~two standard drinks); higher doses are what actually shorten time-to-sleep, and they make the REM hit worse. In the second half of the night you get rebound wakefulness, more arousals, and a later REM rebound that feels like vivid or spinning-adjacent dreams. Wine is not an exception — the melatonin in it is not a sleep dose. There is no healthy-sleep version of a heavy night. If sleep is the goal, alcohol is one of the highest-leverage things to move.",
    tags: ["alcohol", "rem", "staying", "rating"],
    aliases: ["alcohol", "beer", "wine", "hangover"],
    say: "Even one or two drinks can steal dream sleep. Heavier drinks make you drowsy going in, then shred the second half — more wake-ups, less dreaming. Wine is not a sleep aid.",
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2024, cite: "Gardiner et al. 2024 Sleep Med Rev (alcohol dose–response, REM)" },
      { year: 2025, cite: "2015–2025 narrative reviews of alcohol/wine and sleep; classic Ebrahim architecture work" },
    ],
  },
  {
    id: "melatonin",
    title: "Melatonin is a clock signal, not a sleeping pill",
    summary:
      "Low-dose, correctly timed melatonin can shift a late clock. High doses at lights-out usually miss the point.",
    body: "Endogenous melatonin rises in dim evening light and tells the body it is night. Supplemental melatonin can phase-shift the clock, which is why it is used (carefully) for delayed sleep phase and jet lag. The AASM 2017 pharmacologic guideline suggests clinicians not use melatonin as a treatment for chronic insomnia versus no treatment (weak recommendation) — that is about knockout use, not clock timing. Hypnotic use — 5–10 mg at bedtime because you cannot fall asleep — is usually the wrong tool: next-day grogginess, and you have not trained the clock. Circadian-science doses in the phase-response literature are closer to 0.3–1 mg, taken earlier than people expect (often 1–3 hours before desired sleep, sometimes earlier for delayed phase under clinical guidance). CBT-I remains first-line for chronic insomnia. Do not start melatonin if you are pregnant, on interacting medications, or under 18 without a clinician. Circadia will only raise it after a week of logs, and only as education.",
    tags: ["melatonin", "supplement", "circadian", "delayed"],
    aliases: ["melatonin"],
    say: "Melatonin is a clock signal, not a sleeping pill. Sleep clinics try a stable wake time first. If a clinician later agrees, the usual discussion is a low dose (often 0.3–1 mg) earlier than bedtime, not 10 mg at lights-out.",
    reviewedThrough: "2026-08",
    confidence: "moderate",
    sources: [
      { year: 2017, cite: "AASM 2017 pharmacologic insomnia CPG (weak against melatonin as hypnotic)" },
      { year: 2021, cite: "ACP 2016 / AASM 2021 CBT-I first-line; Burgess / Lewy melatonin phase-response" },
    ],
  },
  {
    id: "magnesium",
    title: "Magnesium: modest evidence, not a cure",
    summary:
      "Glycinate is the form people mean for sleep. The trial evidence is small and mixed. Deficiency is the cleanest case.",
    body: "Magnesium is involved in NMDA/GABA signaling and muscle relaxation, which is why it gets marketed for sleep. Human evidence is still small and mixed: older-adult RCTs (including Abbasi 2012) and later systematic reviews (Mah & Pitre 2021, and reviews through 2025) do not support a strong recommendation. People who are deficient, eat little, drink heavily, or have restless legs sometimes feel a difference. Typical discussed doses are 200–400 mg elemental magnesium in the evening, glycinate or citrate preferred over oxide. Kidney disease is a hard stop — magnesium can accumulate. It should never outrank schedule, alcohol, and stimulus control. Circadia treats it as an optional adjunct after a week of data, with low confidence.",
    tags: ["magnesium", "supplement", "latency", "restless"],
    aliases: ["magnesium", "glycinate"],
    reviewedThrough: "2026-08",
    confidence: "low",
    sources: [
      { year: 2012, cite: "Abbasi 2012 older-adult magnesium RCT" },
      { year: 2021, cite: "Mah & Pitre 2021 systematic review" },
      { year: 2025, cite: "NIH ODS magnesium fact sheet; reviews through 2025 still mixed" },
    ],
  },
  {
    id: "duration-age",
    title: "How much sleep you actually need",
    summary:
      "Adults: at least 7 hours. Young adults often need the upper end of 7–9. More time in bed is not always more sleep.",
    body: "The American Academy of Sleep Medicine recommends adults sleep 7 or more hours (2015 consensus, still the adult floor). The National Sleep Foundation bands — teens 8–10, younger adults 7–9, adults 7–9, older adults 7–8 — were reaffirmed in June 2026 after a 10-year review of 133 meta-analyses in Sleep Health. That review also found no basis for separate duration bands by sex. Short sleep raises cardiometabolic and mood risk over years — that is population data, not a diagnosis from one Tuesday. Duration is only one piece of sleep health (regularity and daytime function count). Long time in bed with poor sleep is a different problem (insomnia phenotype) and is treated by shrinking the window, not stretching it. Circadia scores your logs against the band for your age, then looks at whether the nights are consistent.",
    tags: ["duration", "age", "need"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2015, cite: "AASM 2015 adult 7-hour consensus (Watson et al.)" },
      { year: 2026, cite: "NSF 2026 10-year review reaffirming 2015 duration bands (Dzierzewski et al., Sleep Health; 133 meta-analyses)" },
    ],
  },
  {
    id: "activity",
    title: "Movement helps sleep — timing still matters",
    summary:
      "Regular moderate activity improves sleep quality on average. A hard workout in the last hour can delay it for some people.",
    body: "Meta-analyses find that regular aerobic and resistance training improve sleep quality and reduce insomnia symptoms. The mechanism is mixed: body temperature, anxiety reduction, and higher sleep pressure. Elite nuance: vigorous late-night training can delay sleep onset in some people via core temperature and sympathetic arousal. Circadia does not ban evening exercise; it flags a pattern if high activity plus late intense sessions sit next to long latency. Sedentary weeks with poor ratings get a gentle push toward daytime walking and morning light, which is also circadian medicine.",
    tags: ["activity", "exercise", "latency"],
    reviewedThrough: "2026-08",
    confidence: "moderate",
    sources: [
      { year: 2015, cite: "Kredlow et al. 2015 exercise and sleep meta-analysis" },
      { year: 2024, cite: "Insomnia exercise RCTs and later meta-analyses through 2024 (modest benefit, timing still matters)" },
    ],
  },
  {
    id: "bmi-osa",
    title: "Unrefreshing sleep and airway risk",
    summary:
      "If sleep is long but you wake wrecked, or BMI is high, snoring and apnea belong on the checklist — with a clinician, not an app.",
    body: "Obstructive sleep apnea fragments sleep without always looking like 'insomnia' on a diary. Higher BMI, larger neck, snoring, gasping, and unrefreshing sleep are classic flags. Circadia does not diagnose OSA and does not score STOP-BANG. It will mention screening when body mass and poor ratings line up, because treating insomnia techniques alone will not fix an airway problem. PAP is first-line treatment when OSA is diagnosed (AASM 2019 adult PAP CPG) — that is a clinician and a sleep study, not another supplement or this app.",
    tags: ["osa", "bmi", "staying", "rating"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2019, cite: "AASM 2019 adult OSA PAP CPG (Patil et al.)" },
      { year: 2021, cite: "AASM surgical-referral CPG for adults with OSA (Kent et al.)" },
    ],
  },
  {
    id: "dreams",
    title: "What dreams actually are",
    summary:
      "Dreams are mostly REM cognition: emotion, memory stitching, a noisy narrator. They are not a dictionary.",
    body: "Most vivid dreaming clusters in REM. Leading accounts: activation-synthesis (the cortex stories noisy brainstem activation), memory consolidation, and emotional processing. Nightmares rise with trauma, alcohol withdrawal/rebound REM, and some medications (notably some antidepressants). There is no reputable evidence for a universal symbol book. If you ask Circadia 'what it means,' it will reflect themes you wrote, note sleep-state physiology (alcohol, late sleep, supplements), and refuse prophecy. Keeping a dream log can still be useful: it is a journal of affect, and nightmare rehearsal therapy is a real clinical tool for recurrent nightmares.",
    tags: ["dreams", "rem", "meaning"],
    reviewedThrough: "2026-08",
    confidence: "moderate",
    sources: [
      { year: 2010, cite: "Hobson activation-synthesis; Wamsley / Stickgold memory and dreaming" },
      { year: 2021, cite: "Imagery rehearsal therapy for nightmares (clinical reviews through 2021)" },
    ],
  },
  {
    id: "medications",
    title: "Medications that commonly collide with sleep",
    summary:
      "Stimulants, some antidepressants, steroids, and decongestants are frequent hidden clocks. Never stop a prescribed drug from an app.",
    body: "Common disruptors: amphetamine salts and methylphenidate (dose timing), bupropion, SSRIs (sleep architecture changes, sometimes insomnia or vivid dreams), corticosteroids, pseudoephedrine, and some beta blockers (melatonin suppression, nightmares). Common sedating drugs (diphenhydramine, some antipsychotics) can knock you out and still wreck sleep quality. Circadia only pattern-matches names you typed so the advisor can talk about timing and questions for your prescriber. It will never tell you to change a dose.",
    tags: ["medications", "supplements", "context"],
    aliases: ["adderall", "vyvanse", "ritalin", "wellbutrin"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2023, cite: "Clinical sleep pharmacology reviews; FDA labels for common agents through 2023–2025" },
    ],
  },
  {
    id: "wind-down",
    title: "Wind-down is a skill, not a vibe",
    summary:
      "Breathing, muscle release, and stable noise work because they drop arousal — not because they are magic frequencies.",
    body: "Pre-sleep arousal (cognitive and physiologic) is a core insomnia maintaining factor. Slow breathing (including 4-7-8 as a simple cadence), progressive muscle relaxation, and a body scan are CBT-I-adjacent tools with reasonable evidence for reducing latency in people who practice them. Broadband noise (pink/brown) can mask household sound and give the attention system something boring to hold. There is no special '528 Hz heal the circadian rhythm' effect Circadia will claim. Use a session, then tell the morning interview whether it helped — that is how we learn your response, not a population average.",
    tags: ["wind-down", "meditation", "sound", "latency"],
    reviewedThrough: "2026-08",
    confidence: "moderate",
    sources: [
      { year: 2021, cite: "AASM 2021 CBT-I relaxation component" },
      { year: 2023, cite: "Noise-masking sleep studies; PMR literature" },
    ],
  },
  {
    id: "caffeine",
    title: "Caffeine is an adenosine blocker",
    summary:
      "It does not just 'give energy.' It occupies the receptor that tells the brain you have been awake long enough to sleep.",
    body: "Adenosine accumulates with hours awake and promotes sleepiness. Caffeine is an adenosine-receptor antagonist. Typical half-life is about 5–6 hours; it is longer in pregnancy, with oral contraceptives, and in slow CYP1A2 metabolizers. A 3 pm coffee can still be pharmacologically present at 11. Elite practice: if sleep-onset is the complaint, last caffeine before early afternoon, and do not use it to paper over a late wake time. Circadia does not yet log caffeine in the morning interview — if it is in your life, say so in chat so the note can include it.",
    tags: ["caffeine", "coffee", "adenosine", "latency", "falling"],
    aliases: ["caffeine", "coffee", "espresso", "energy drink"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2013, cite: "Drake et al. caffeine timing and sleep-onset" },
      { year: 2024, cite: "Adenosine/caffeine pharmacology; typical half-life ~5–6 h (longer in pregnancy, OCPs, slow CYP1A2)" },
    ],
  },
  {
    id: "naps",
    title: "Catch-up sleep vs protecting the clock",
    summary:
      "A late morning after a short night feels kind and trains a later clock. Protect wake time; safety still comes first if you drive.",
    say: "Sleeping in after a short night feels kind and pushes tonight later. Protect your wake time. Catch-up is a short nap before mid-afternoon, or an earlier bedtime once you are actually sleepy. If you might drive, sleep is safety.",
    body: "Homeostatic pressure and circadian timing are two systems. Sleeping until noon after a 3 am night discharges pressure at the wrong clock time and delays tonight. In CBT-I, the wake time stays put even after a poor night; recovery is a brief nap (about 20 minutes, before mid-afternoon) or an earlier bedtime only once sleepy — not more hours in bed hoping. Exception: if you might drive, operate machinery, or cannot stay awake, sleep is a safety intervention, not a willpower test. Tell a clinician if sleepiness is that severe — that can be apnea, narcolepsy, or severe restriction, not 'bad habits.'",
    tags: ["naps", "weekend", "sleep in", "catch up", "wake", "schedule"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2021, cite: "AASM 2021 behavioral CPG; CBT-I sleep restriction and stimulus-control practice" },
    ],
  },
  {
    id: "otc-antihistamines",
    title: "Unisom, Benadryl, and other aisle sleep aids",
    summary:
      "They are old allergy medicines sold for sleep. They can knock you out. They are not good sleep, and they are not a nightly plan.",
    body: "Unisom SleepTabs are usually doxylamine. Some Unisom gels, ZzzQuil, Tylenol PM, Advil PM, and Benadryl use diphenhydramine. Both are first-generation antihistamines. The \u201cPM\u201d products are combination drugs \u2014 the antihistamine plus a painkiller (acetaminophen in Tylenol PM, ibuprofen in Advil PM) \u2014 which is a common way to exceed a daily acetaminophen limit without noticing. They make you drowsy by blocking a wake signal (histamine), not by fixing the clock or sleep pressure. The AASM 2017 pharmacologic guideline suggests clinicians not use diphenhydramine for chronic insomnia (weak). Next-day fog is common, the effect fades if you take them often, and the sleep you get is often lighter and more broken. The 2025 restless-legs guideline separately notes that diphenhydramine and similar antihistamines can worsen that urge-to-move pattern. Rare backup for a one-off night is a different question than a habit. Do not mix with alcohol. Older adults (Beers criteria), glaucoma, urinary retention, and other drowsy meds raise the risk — pharmacist or doctor, not an aisle. Circadia will not tell you to start these.",
    tags: ["unisom", "benadryl", "zzzquil", "doxylamine", "diphenhydramine", "otc", "sleep aid"],
    aliases: [
      "unisom",
      "benadryl",
      "zzzquil",
      "zzquil",
      "doxylamine",
      "diphenhydramine",
      "nyquil",
      "nytol",
      "tylenol pm",
      "advil pm",
      "simply sleep",
      "sleep aid",
      "sleeping pill",
      "sleeping pills",
    ],
    say: "Unisom is an old allergy medicine sold as a sleep aid. SleepTabs are usually doxylamine; some gels, ZzzQuil, Tylenol PM, and Benadryl use diphenhydramine. They can knock you out for a night. That is not the same as good sleep — next-day fog is common, and they work less if you take them often. Not a nightly plan. Do not mix with alcohol. Doxylamine especially can still be working the next morning \u2014 do not drive until you know how it hits you. And the \u201cPM\u201d versions have a painkiller in them too, so check the label if you already take acetaminophen or ibuprofen in the day.",
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2017, cite: "AASM 2017 pharmacologic CPG (weak against diphenhydramine for chronic insomnia)" },
      { year: 2023, cite: "Beers criteria: first-generation antihistamines in older adults" },
      { year: 2025, cite: "AASM 2025 RLS/PLMD CPG: diphenhydramine and similar antihistamines can worsen restless legs" },
    ],
  },
  {
    id: "prescription-hypnotics",
    title: "Prescription sleep drugs",
    summary:
      "Ambien, the newer wake-signal blockers, and off-label trazodone can help some people sleep. They do not replace a wake-time plan. An app will never change your dose.",
    body: "Zolpidem (Ambien), eszopiclone (Lunesta), zaleplon (Sonata), and some benzodiazepines are GABA-acting hypnotics. Dual orexin receptor antagonists (DORAs) — suvorexant (Belsomra, in the 2017 AASM CPG), lemborexant (Dayvigo, 2019), daridorexant (Quviviq, 2022) — block a wake-promoting peptide rather than boosting sleep circuitry the old way; they were mostly approved after the 2017 drug-by-drug CPG, so that document is incomplete for the class. Trazodone and hydroxyzine are often used off-label; AASM 2017 suggests clinicians not use trazodone for chronic insomnia (weak). All of these can shorten latency or waking. They can also cause next-day grogginess, odd nighttime behavior (especially zolpidem), and rebound if stopped suddenly. ACP 2016 and AASM 2021 still put CBT-I first. The AASM 2026 combination CPG (conditional, low certainty) suggests CBT-I plus a medication over a medication alone, and suggests against combination over CBT-I alone. Circadia will never tell you to start, stop, or change a prescribed drug.",
    tags: ["ambien", "zolpidem", "lunesta", "trazodone", "prescription", "hypnotic", "dora"],
    aliases: [
      "ambien",
      "zolpidem",
      "lunesta",
      "eszopiclone",
      "sonata",
      "zaleplon",
      "trazodone",
      "desyrel",
      "hydroxyzine",
      "atarax",
      "vistaril",
      "restoril",
      "temazepam",
      "silenor",
      "doxepin",
      "belsomra",
      "suvorexant",
      "dayvigo",
      "lemborexant",
      "quviviq",
      "daridorexant",
      "orexin",
    ],
    say: "Prescription sleep drugs. Ambien is the common one. A newer family — Belsomra, Dayvigo, Quviviq — blocks a wake signal instead of knocking you out the old way. Trazodone is often used off-label; it is not a first-line sleeping pill. I will never tell you to start, stop, or change a prescription. The long-term plan is still a wake time you protect, and getting out of bed if you are lying there awake. Adding a pill to that plan is not usually better than the plan alone.",
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2017, cite: "AASM 2017 pharmacologic CPG (zolpidem, suvorexant, trazodone, benzodiazepines)" },
      { year: 2021, cite: "AASM 2021 behavioral/psychological insomnia CPG" },
      { year: 2026, cite: "AASM 2026 combination-insomnia CPG (Buysse et al., J Clin Sleep Med): CBT-I+med over med alone (conditional, low certainty); suggested against combo over CBT-I alone" },
    ],
  },
  {
    id: "cannabis-sleep",
    title: "THC, CBD, and sleep",
    summary:
      "THC can make you sleepy and then steal REM. CBD is mixed. Neither is a clean insomnia treatment.",
    body: "THC is sedating for many people on the way in, then it suppresses REM. When it wears off you can get vivid or restless nights — similar in shape to alcohol, not identical. A 2025 pilot randomized night in adults with insomnia (oral 10 mg THC + 200 mg CBD vs placebo) found less total sleep and a large REM cut, not a longer night. CBD-alone evidence for insomnia is still small and mixed; high doses can be alerting for some people. Edibles last longer than smoke and are easier to overshoot. Nightly THC is a trade: easier onset, worse architecture. Circadia will not tell you to start or stop cannabis; it will treat it as a confounder on the diary if you say you use it.",
    tags: ["thc", "cbd", "cannabis", "weed", "rem"],
    aliases: ["thc", "cbd", "cannabis", "weed", "marijuana", "edible", "edibles", "gummies"],
    say: "THC can make you sleepy, then steal dream sleep. A recent lab night in people who already have insomnia found less total sleep and less REM, not more. CBD evidence is still mixed. I will not tell you to start or stop cannabis.",
    reviewedThrough: "2026-08",
    confidence: "low",
    sources: [
      { year: 2024, cite: "Cannabinoid–sleep systematic reviews 2021–2024 still mixed on CBD-alone insomnia" },
      { year: 2025, cite: "Suraev et al. 2025 J Sleep Res (oral 10 mg THC + 200 mg CBD insomnia pilot, high-density EEG): less total sleep and a large REM cut vs placebo" },
    ],
  },
  {
    id: "nicotine",
    title: "Nicotine is a stimulant you take to bed",
    summary:
      "Cigarettes, vapes, and pouches all delay falling asleep. A 1 a.m. pouch is still a stimulant.",
    say: "Nicotine is a stimulant. Cigarettes, vapes, and pouches all count. It delays falling asleep and can fragment the night. If sleep is the goal, last nicotine earlier — not as a 1 a.m. ritual. I will not run a quit lecture from here; I will treat it as part of the clock.",
    body: "Nicotine is a cholinergic stimulant. Night use (including nicotine pouches and vaping) is associated with longer sleep latency and more nocturnal waking. Withdrawal in the second half of the night can also wake people who are dependent. Circadia does not run a cessation program; it names nicotine as a sleep disruptor when the user brings it up.",
    tags: ["nicotine", "vape", "zyn", "pouches", "latency"],
    aliases: ["nicotine", "vape", "vaping", "zyn", "cigarette", "cigarettes", "smoking", "nic pouch"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2024, cite: "Nicotine is a stimulant: evening use delays sleep onset; overnight withdrawal fragments sleep (cigarettes, vapes, pouches)" },
      { year: 2024, cite: "Cessation often worsens sleep for a stretch, then it usually improves — this app is not a quit program" },
    ],
  },
  {
    id: "jet-lag",
    title: "Jet lag is a clock problem, not a missing pill",
    summary:
      "Light at the right time is the treatment. Melatonin is sometimes used as a clock signal — not as a knockout dose at the hotel.",
    say: "Jet lag is your clock sitting in the old time zone. Morning outdoor light at the destination is the main lever. Melatonin is sometimes used as a clock signal for travel, at a low dose, timed by a clinician — not 10 mg at hotel lights-out. I will not build you a pill schedule from here.",
    body: "Transmeridian travel desynchronizes the SCN from local time. Eastward travel is usually harder than westward. Timed light is first-line; melatonin can help as a phase-shift signal under guidance. Circadia will not emit a milligram-by-milligram jet-lag protocol.",
    tags: ["jet lag", "travel", "timezone", "flight"],
    aliases: ["jet lag", "jetlag", "time zone", "timezone", "red eye", "long haul"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2007, cite: "Morgenthaler TI et al. AASM practice parameters for the clinical evaluation and treatment of circadian rhythm sleep disorders (jet lag and shift work types). Sleep. 2007;30(11):1445-1459 — melatonin as a clock signal, not a knockout dose" },
      { year: 2024, cite: "Eastward travel is harder; timed outdoor light at the destination is first-line" },
    ],
  },
  {
    id: "shift-work",
    title: "Night shift is a different clock, not 'bad sleep hygiene'",
    summary:
      "Protect a dark, regular sleep window on work days. Do not copy a 9-to-5 plan onto a 7 p.m. wake.",
    say: "Night shift fights the sun. On work days, protect a dark, regular sleep window and treat it like a real job. Sunglasses on the commute home, blackout curtains, no 'quick errands' that blow the window. This is not the same problem as college-insomnia-plus-phone. Occupational health or a sleep clinic can help if you cannot stay safe at work.",
    body: "Shift work disorder is circadian misalignment from a required night or rotating schedule. Sleep hygiene copied from a day-shift blog often fails. Anchored sleep timing on work blocks, light control, and safety (driving, errors) dominate. Circadia will not pretend a 7 a.m. wake target is honest for someone who clocks out at 7 a.m.",
    tags: ["shift work", "nights", "rotating", "hospital"],
    aliases: ["night shift", "shift work", "graveyard shift", "rotating shift"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2024, cite: "Permanent night shift is rare; most people rotate and the clock never fully adapts" },
      { year: 2024, cite: "Light at the wrong clock-time, caffeine, and naps are the levers. Occupational health, not a personal failing" },
    ],
  },
  {
    id: "restless-legs",
    title: "Restless legs are not 'just anxiety in bed'",
    summary:
      "An urge to move, worse at rest in the evening, needs a clinician — sometimes iron. Not Unisom.",
    say: "Restless legs is an urge to move, worse at rest, worse in the evening. It is not the same as a racing mind. A clinician may check iron. Unisom and other drowsy antihistamines can make it worse for some people. I will not diagnose you from a chat line — if this is you, say it to a human.",
    body: "A crawling or aching urge to move the legs, worse in the evening, better when you walk — that pattern is restless legs, not ordinary tossing. It is common, under-diagnosed, and it wrecks sleep because it hits exactly when you are trying to fall asleep. Iron is still the first thing a clinician checks; low ferritin is a treatable cause. The 2025 AASM restless-legs / periodic-limb-movement guideline (Winkelman et al., J Clin Sleep Med) updates the 2012 parameter: iron evaluation stays central, several over-the-counter sedating antihistamines (diphenhydramine among them) can make the urge worse, and valerian is specifically suggested against for RLS. The larger change is the move away from pramipexole and ropinirole as first-line because of augmentation \u2014 symptoms becoming more intense, starting earlier in the day, or spreading \u2014 toward alpha-2-delta ligands and, in the right patient, intravenous iron. Some antidepressants and dopamine-blocking drugs can worsen it too. Caffeine and alcohol often do as well. Circadia does not diagnose restless legs, score severity, or pick a medicine. If the pattern matches, that is a clinic conversation, not a diary tweak or an aisle sedative.",
    tags: ["rls", "restless", "legs", "iron"],
    aliases: ["restless legs", "rls", "jimmy legs", "urge to move"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2025, cite: "AASM 2025 RLS/PLMD CPG (Winkelman et al., J Clin Sleep Med 21:137–152) updates the 2012 parameter. Iron evaluation remains central. Suggests against valerian for RLS. Antihistamines can worsen symptoms." },
      { year: 2025, cite: "This app does not diagnose RLS, score IRLS, or recommend starting or stopping a prescribed drug." },
    ],
  },
  {
    id: "pregnancy-sleep",
    title: "Pregnancy sleep is a clinician conversation",
    summary:
      "I will not recommend melatonin, Unisom, or herbals in pregnancy. Ask the obstetric clinician.",
    say: "If you are pregnant or could be, I will not recommend melatonin, Unisom, herbals, or a new sleep drug. That is your obstetric clinician and pharmacist. Position, reflux, and the clock still matter — left side later in pregnancy, finish eating earlier if heartburn wakes you — but dosing does not come from this app.",
    body: "Pregnancy changes sleep architecture, reflux, and nocturia. Many OTC sleep aids and supplements lack adequate safety data or have mixed guidance. Circadia withholds pharmacologic suggestions in pregnancy and sends the person to their obstetric clinician.",
    tags: ["pregnancy", "pregnant", "prenatal"],
    aliases: ["pregnant", "pregnancy", "prenatal", "postpartum"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2024, cite: "Pregnancy changes sleep architecture and increases restless legs and snoring. Position, reflux, and bathroom trips are mechanical." },
      { year: 2024, cite: "Melatonin and most OTC antihistamines in pregnancy are clinician-led. This app is not prenatal care." },
    ],
  },
  {
    id: "herbals",
    title: "Tea-aisle sleep: theanine, valerian, ashwagandha, glycine",
    summary:
      "Mild at best, mixed evidence, not a plan. Valerian has liver rare-risk noise. None outrank wake time.",
    say: "L-theanine is mild. Glycine has small sleep data. Ashwagandha is mixed and not a sleep drug. Valerian is mixed and has rare liver-injury reports — not something to stack 'to be sure.' None of these beat a wake time and getting out of bed if you are awake. I will not tell you to start them.",
    body: "Theanine, valerian, ashwagandha, and glycine are marketed for sleep with small or mixed trials. The AASM 2017 pharmacologic guideline suggests clinicians not use valerian for chronic insomnia (weak). The 2025 restless-legs guideline separately suggested against valerian for RLS — a different question, and still not a reason to start it for sleep. Valerian also has rare hepatotoxicity reports. Circadia treats them as optional, low-confidence, never first-line, and never a stack.",
    tags: ["theanine", "valerian", "ashwagandha", "glycine", "herbal"],
    aliases: ["theanine", "l-theanine", "valerian", "ashwagandha", "glycine", "chamomile", "lemon balm"],
    reviewedThrough: "2026-08",
    confidence: "low",
    sources: [
      { year: 2017, cite: "AASM 2017 pharmacologic CPG: insufficient evidence / weak against valerian for chronic insomnia. 'Natural' is not the same as studied." },
      { year: 2025, cite: "AASM 2025 RLS CPG specifically suggested against valerian for restless legs — not a recommendation to start it for sleep either." },
    ],
  },
  {
    id: "late-eating",
    title: "A heavy late meal can wake you as reflux, not insomnia",
    summary:
      "Finish eating a few hours before bed if nights end with heartburn or a sour taste.",
    say: "A heavy late meal, especially spicy food or alcohol, can wake you as reflux — burning, cough, sour taste — which looks like 'insomnia' on a diary. Finish eating a few hours before bed if that is you. This is not a reason to start melatonin.",
    body: "Nocturnal gastroesophageal reflux fragments sleep. Late large meals, recumbency, alcohol, and high-fat food are classic triggers. Circadia distinguishes reflux waking from primary insomnia when the user describes heartburn or a sour taste.",
    tags: ["reflux", "gerd", "heartburn", "eating", "meal"],
    aliases: ["heartburn", "reflux", "gerd", "acid reflux", "late meal", "eat late", "eating late"],
    reviewedThrough: "2026-08",
    confidence: "moderate",
    sources: [
      { year: 2024, cite: "Nocturnal GERD fragments sleep. Late large meals delay onset via temperature, reflux, and metabolic signaling." },
      { year: 2024, cite: "This is not a diet app. Finish eating earlier if heartburn or a sour taste is the 2 a.m. wake." },
    ],
  },
  {
    id: "temperature",
    title: "Warm then cool can help you fall asleep",
    summary:
      "A warm shower, then a cooler room, uses the body's temperature drop. Not a gadget requirement.",
    say: "A warm shower or bath, then a cooler dark room, helps because your body temperature dropping is part of the 'it is night' signal. The timing is the trick: about an hour or two before bed, not right before you get in. It buys roughly ten minutes off how long it takes to drop off. You do not need a $2000 mattress. If you are overheating at 3 a.m., cooler is the experiment, not another pill.",
    body: "Core temperature falls by roughly half a degree to a degree Celsius across the night, and that decline facilitates sleep onset. Passive body heating exploits it: a warm bath or shower dilates the skin, and the heat loss that follows exaggerates the drop. The meta-analytic finding is that the timing matters more than the temperature \u2014 bathing about one to two hours before bed shortened time to fall asleep by around ten minutes, while a bath immediately before bed did not help. A cooler bedroom supports the same decline. Marketing around smart mattresses outruns the need.",
    tags: ["temperature", "shower", "bath", "hot", "cool"],
    aliases: ["hot shower", "warm bath", "hot bath", "too hot at night", "cooling mattress"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2019, cite: "Haghayegh S et al. Before-bedtime passive body heating improves sleep: a systematic review and meta-analysis. Sleep Med Rev. 2019;46:124-135 — bathing 1-2 h before bed shortened sleep onset by ~10 min" },
      { year: 2024, cite: "Pre-sleep warm bathing then a cooler room is a low-risk lever. Extreme cold or a hot bedroom both work against it. Physiology, not a gadget." },
    ],
  },
  {
    id: "sleep-debt",
    title: "After a 4-hour night, do not sleep until noon",
    summary:
      "Protect the wake time. A short early nap. Caffeine early, not at 9 p.m. Safety first if you drive.",
    say: "After a brutal short night, sleeping until noon trains a later clock and makes tonight worse. Protect your wake time. If you need it, a ~20 minute nap before mid-afternoon. Caffeine in the morning, not at 9 p.m. If you might drive or cannot stay awake, sleep is safety — that is a doctor if it keeps happening.",
    body: "Acute sleep restriction raises accident risk. Recovery that delays wake time compounds circadian drift. Short naps and earlier bedtime once sleepy are the usual tools. Circadia will not glorify all-nighters.",
    tags: ["sleep debt", "all nighter", "4 hours", "short night"],
    aliases: ["all nighter", "all-nighter", "slept 4 hours", "only slept", "pulling an all"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2024, cite: "Sleep restriction in the laboratory is unambiguous. Field recovery is slower than people expect." },
      { year: 2024, cite: "'Catching up' on the weekend does not fully reverse weekday restriction. This app reports the gap; it does not medicalize a late night." },
    ],
  },
  {
    id: "racing-mind",
    title: "A mind that will not stop at bedtime",
    summary:
      "The most common reason people cannot fall asleep is not being under-tired. It is being switched on.",
    body: "Chronic insomnia is better explained by hyperarousal than by a sleep deficit: the system that should be powering down stays up, and lying in the dark with nothing to do is when the thinking gets loudest. Harvey's cognitive model describes the loop — worry about not sleeping raises arousal, arousal delays sleep, the delay confirms the worry. The cognitive components of CBT-I target the loop rather than the thoughts' content: a worry window earlier in the evening, writing tomorrow's list down before bed so the brain stops rehearsing it, and getting out of bed when the mind is racing rather than lying there arguing with it. Relaxation practice (progressive muscle relaxation, a body scan, paced breathing) is a supporting component, and it works better with rehearsal than on the first attempt. If the worry is not about sleep — if it is constant, most days, across most areas of life — that is anxiety in its own right and it is very treatable; a clinician is the better route than a sleep app.",
    tags: ["insomnia", "falling", "anxiety", "arousal", "cbt-i"],
    aliases: [
      "racing mind", "mind racing", "racing thoughts", "cannot switch off", "can't switch off",
      "overthinking", "worrying", "worry", "anxiety", "anxious", "panic", "stressed", "stress",
      "ruminating", "rumination", "brain won't shut up", "thoughts", "cant stop thinking",
    ],
    say: "A busy mind at night is the most common version of this, and it is not a personality flaw — it is arousal. Two things help more than trying harder to relax: get the list out of your head and onto paper earlier in the evening, and get out of bed when you are arguing with yourself, because lying there teaches the bed to be where you think. If the worry is not really about sleep and it is most days, that is worth treating on its own with someone.",
    reviewedThrough: "2026-09",
    confidence: "high",
    sources: [
      { year: 2021, cite: "AASM 2021 clinical practice guideline: behavioral and psychological treatments for chronic insomnia (multicomponent CBT-I, strong recommendation)" },
      { year: 2002, cite: "Harvey AG. A cognitive model of insomnia. Behav Res Ther. 2002;40(8):869-893" },
      { year: 2010, cite: "Riemann D et al. The hyperarousal model of insomnia: a review. Sleep Med Rev. 2010;14(1):19-31" },
    ],
  },
  {
    id: "sleep-restriction",
    title: "Shrinking time in bed, and who should not",
    summary:
      "The most effective single piece of insomnia therapy is also the most uncomfortable, and it is not safe for everyone to run alone.",
    body: "Sleep restriction therapy (Spielman) compresses time in bed toward the sleep a person is actually getting, which raises sleep pressure and consolidates a broken night into a solid block; the window is then widened as sleep efficiency improves. It is a core component of CBT-I and carries the strongest evidence in the package. It is also genuinely hard for the first one to two weeks: daytime sleepiness increases before it improves, which is why it is not a self-help manoeuvre for everyone. Contraindications and cautions are specific — bipolar disorder (sleep loss can precipitate mania), seizure disorders (sleep deprivation lowers the threshold), untreated obstructive sleep apnea, parasomnias, and anyone who drives professionally or operates machinery. Circadia will tell you when time in bed looks too long for the sleep you are getting; it will not set a restriction window, because the titration and the safety screening belong with a clinician.",
    tags: ["insomnia", "cbt-i", "treatment", "staying"],
    aliases: [
      "sleep restriction", "restrict sleep", "cut time in bed", "shrink my window", "shrink the window",
      "less time in bed", "sleep window", "time in bed", "sleep efficiency", "sleep consolidation",
    ],
    say: "There is a real treatment behind this: spend less time in bed for a couple of weeks so the sleep you do get packs together instead of spreading thin. It works better than any pill for long-run insomnia, and it feels worse before it feels better — you are more tired in week one, on purpose. That is exactly why I will not hand you a window to try. It is not safe to run alone if you have had mania, a seizure disorder, untreated apnea, or you drive for a living. Ask a sleep clinician to set it with you.",
    reviewedThrough: "2026-09",
    confidence: "high",
    sources: [
      { year: 2021, cite: "AASM 2021 CBT-I guideline: sleep restriction therapy recommended as a component of multicomponent CBT-I" },
      { year: 1987, cite: "Spielman AJ, Saskin P, Thorpy MJ. Treatment of chronic insomnia by restriction of time in bed. Sleep. 1987;10(1):45-56" },
      { year: 2014, cite: "Kyle SD et al. Sleep restriction therapy acutely increases objective sleepiness and reduces vigilance. Sleep. 2014;37(2):229-237 — the basis for the driving and machinery caution" },
    ],
  },
  {
    id: "nocturia",
    title: "Waking up to use the bathroom",
    summary:
      "A very common reason for second-half wakings, and often not really a bladder problem.",
    body: "Nocturia is one of the most frequently reported causes of night waking in adults and rises sharply with age. The distinction that matters clinically: did the bladder wake you, or did you wake anyway and then notice the bladder? People with insomnia commonly report the second, and treating it as a urological problem misses the point. Genuine nocturia has treatable drivers — evening fluid and alcohol timing, diuretics taken late, untreated obstructive sleep apnea (which raises nocturnal urine production through atrial natriuretic peptide release, and is under-recognised as a cause), poorly controlled diabetes, prostatic enlargement in men, and pelvic floor changes in women. Two or more trips a night, or a recent change in pattern, is worth a clinician's time rather than a fluid restriction experiment run alone.",
    tags: ["staying", "waking", "older", "apnea"],
    aliases: [
      "nocturia", "pee", "peeing", "urinate", "urination", "bathroom", "toilet", "bladder", "loo", "wee",
      "get up to pee", "waking to pee", "up to the bathroom",
    ],
    say: "Getting up to the bathroom is one of the most common reasons for waking in the second half of the night. The useful question is whether your bladder woke you, or you woke anyway and then noticed it — with insomnia it is very often the second, and then it is a sleep problem wearing a bladder costume. Worth trying: last drink an hour or two earlier, and alcohol earlier still. Worth a doctor: two or more trips a night, or a recent change. Snoring alongside it points at the airway, which is a surprisingly common cause of this.",
    reviewedThrough: "2026-09",
    confidence: "moderate",
    sources: [
      { year: 2019, cite: "Bliwise DL et al. Nocturia and disturbed sleep in the elderly. Sleep Med — nocturia as a leading cause of sleep maintenance complaints" },
      { year: 2019, cite: "International Continence Society standardisation of terminology for nocturia" },
      { year: 2016, cite: "Association of obstructive sleep apnea with nocturia; resolution with CPAP treatment in a substantial share of patients" },
    ],
  },
  {
    id: "menopause-sleep",
    title: "Perimenopause, hot flashes, and broken nights",
    summary:
      "Sleep complaints rise sharply through the menopause transition, and the night sweats are only part of it.",
    body: "Sleep disturbance is among the most commonly reported symptoms of the menopause transition, with prevalence estimates around 40-60%. Vasomotor symptoms (hot flashes and night sweats) fragment sleep directly, and there is evidence the arousal can precede the subjective flash. But the transition also raises insomnia risk independently of vasomotor symptoms, and increases the incidence of obstructive sleep apnea — the loss of the premenopausal protective effect means apnea in women is routinely missed, because the presentation is more often insomnia and fatigue than loud snoring. CBT-I has been shown to work well in this population and improves sleep even when hot flashes persist, which makes it the reasonable first move. Hormone therapy and non-hormonal options for vasomotor symptoms are a clinician conversation; the Menopause Society's position is that treatment choice depends on symptom burden, age, and time since menopause.",
    tags: ["women", "hormones", "staying", "waking"],
    aliases: [
      "menopause", "menopausal", "perimenopause", "perimenopausal", "hot flash", "hot flashes",
      "hot flushes", "night sweats", "sweating at night", "hrt", "hormone therapy", "estrogen", "oestrogen",
    ],
    say: "Broken sleep through perimenopause and menopause is extremely common, and it is not only the night sweats — the transition raises insomnia risk on its own. Two things worth knowing. Sleep apnea becomes much more common after menopause and is regularly missed in women, because it shows up as insomnia and exhaustion rather than loud snoring. And the talking therapy for insomnia works well here, improving sleep even when the flashes carry on. Treatment for the flashes themselves, hormonal or not, is a conversation with your doctor.",
    reviewedThrough: "2026-09",
    confidence: "moderate",
    sources: [
      { year: 2023, cite: "The Menopause Society 2023 nonhormone therapy position statement; 2022 hormone therapy position statement" },
      { year: 2019, cite: "Drake CL et al. Treating chronic insomnia in postmenopausal women: a randomized clinical trial of CBT-I. Sleep. 2019;42(2)" },
      { year: 2018, cite: "Baker FC et al. Sleep problems during the menopausal transition. Nat Sci Sleep. 2018;10:73-95" },
    ],
  },
  {
    id: "delayed-phase",
    title: "Night owls, and when late is a disorder",
    summary:
      "Some people are not failing at sleep. Their clock genuinely runs late — and that is treatable on its own terms.",
    body: "Delayed sleep-wake phase disorder (DSWPD) is a circadian rhythm disorder, not insomnia: sleep is normal in quality and duration when it is allowed to happen at the person's preferred late hours, and the complaint appears only because school or work demands an early start. It is most prevalent in adolescents and young adults, and chronotype has a substantial heritable component. The distinction matters because the treatments differ — a person with a delayed clock treated as an insomniac will fail at sleep hygiene indefinitely. The AASM guideline for intrinsic circadian rhythm sleep-wake disorders recommends strategically timed melatonin for DSWPD (low dose, several hours before the desired sleep time, acting as a phase-shifting signal rather than a sedative) and supports appropriately timed light exposure. Bright light on waking advances the clock; bright light late at night delays it further. Shifts are gradual and, critically, they are lost quickly when weekend rise times drift back.",
    tags: ["clock", "circadian", "teens", "falling"],
    aliases: [
      "night owl", "night owls", "delayed sleep phase", "dswpd", "dsps", "late chronotype",
      "chronotype", "i'm nocturnal", "cannot sleep before", "can't sleep until 3", "always been a night person",
      "early bird", "morning person",
    ],
    say: "Some people's clocks genuinely run late, and that is different from insomnia — if you sleep fine when nobody makes you get up, and badly when they do, that is a timing problem, not a sleeping problem. It matters because the fix is different: sleep hygiene will not move a clock. Light does. Daylight in your eyes soon after you get up pulls it earlier; bright light late pushes it later. A low dose of melatonin several hours before you want to sleep is used as a clock signal for exactly this, and that one is worth setting up with a clinician rather than guessing. And the whole thing unwinds fast if weekends drift.",
    reviewedThrough: "2026-09",
    confidence: "high",
    sources: [
      { year: 2015, cite: "Auger RR et al. AASM clinical practice guideline: treatment of intrinsic circadian rhythm sleep-wake disorders (DSWPD, ASWPD, N24SWD, ISWRD). J Clin Sleep Med. 2015;11(10):1199-1236" },
      { year: 2007, cite: "Sack RL et al. Circadian rhythm sleep disorders part II: advanced, delayed, irregular and free-running types. Sleep. 2007;30(11):1484-1501" },
    ],
  },
  {
    id: "sleep-trackers",
    title: "What your ring or watch actually knows",
    summary:
      "Consumer trackers estimate sleep from movement and heart rate. Chasing the score can make sleep worse.",
    body: "Consumer wearables infer sleep from actigraphy plus heart rate and variability. They are reasonably good at total sleep time and at detecting sleep versus wake in people who sleep normally, and considerably weaker at staging — the deep/REM/light breakdown presented with the most confidence in the app is the least reliable number on the screen, and validation against polysomnography varies widely by device and by generation. The clinical concern has a name: orthosomnia, described in a 2017 case series, where the pursuit of a perfect sleep score itself drives arousal, extended time in bed, and worse sleep. This is the same mechanism as clock-watching, with better graphics. A tracker is genuinely useful for one thing an insomnia diary also captures: the consistency of your timing across weeks. It is not a diagnostic device, and a normal-looking score does not rule out sleep apnea.",
    tags: ["measurement", "arousal", "insomnia"],
    aliases: [
      "sleep tracker", "tracker", "oura", "oura ring", "whoop", "fitbit", "apple watch", "garmin",
      "sleep score", "deep sleep", "rem score", "my watch says", "my ring says", "orthosomnia", "wearable",
    ],
    say: "Your ring or watch is decent at roughly how long you slept, and weakest at exactly the part it shows most confidently — the deep and dream sleep breakdown. There is a real problem with chasing the number: it raises arousal and makes people lie in bed longer trying to earn a better score, which is the same trap as watching the clock. Use it for one thing only, whether your timing is consistent week to week. How you feel is better data than the score, and a good-looking score does not rule out sleep apnea.",
    reviewedThrough: "2026-09",
    confidence: "moderate",
    sources: [
      { year: 2017, cite: "Baron KG et al. Orthosomnia: are some patients taking the quantified self too far? J Clin Sleep Med. 2017;13(2):351-354" },
      { year: 2019, cite: "Chinoy ED et al. Performance of seven consumer sleep-tracking devices compared with polysomnography. Sleep — staging accuracy substantially below total-sleep-time accuracy" },
    ],
  },
];

export function researchById(id: string): ResearchArticle | undefined {
  return RESEARCH.find((article) => article.id === id);
}

const STOP = new Set([
  "tell",
  "me",
  "about",
  "what",
  "whats",
  "is",
  "are",
  "a",
  "an",
  "the",
  "does",
  "do",
  "can",
  "i",
  "my",
  "your",
  "how",
  "for",
  "with",
  "and",
  "or",
  "to",
  "of",
  "on",
  "in",
  "it",
  "this",
  "that",
  "should",
  "please",
]);

export function includesWord(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (needle.includes(" ")) return hay.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(hay);
}

export function searchResearch(query: string): ResearchArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return RESEARCH;
  const tokens = q.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
  return RESEARCH.map((article) => {
    const aliases = (article.aliases ?? []).join(" ");
    const hay = `${article.title} ${article.summary} ${article.body} ${article.tags.join(" ")} ${aliases}`.toLowerCase();
    let score = tokens.reduce((acc, token) => acc + (includesWord(hay, token) ? 1 : 0), 0);
    if ((article.aliases ?? []).some((alias) => includesWord(q, alias) || (alias.includes(" ") && q.includes(alias)))) {
      score += 5;
    }
    return { article, score };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.article);
}

/** Alias hit only — substring search is too eager for chat (dating ⊂ sedating). */
export function matchResearch(query: string): ResearchArticle | undefined {
  const q = query.toLowerCase();
  return RESEARCH.find((article) =>
    (article.aliases ?? []).some((alias) => includesWord(q, alias) || (alias.includes(" ") && q.includes(alias))),
  );
}
