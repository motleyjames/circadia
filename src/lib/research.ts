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
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2016, cite: "ACP 2016 chronic insomnia CPG (CBT-I first-line)" },
      { year: 2021, cite: "AASM 2021 behavioral/psychological insomnia CPG" },
      { year: 2026, cite: "AASM 2026 combination-treatment CPG (Buysse et al., J Clin Sleep Med)" },
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
    body: "Unisom SleepTabs are usually doxylamine. Some Unisom gels, ZzzQuil, Tylenol PM, Advil PM, and Benadryl use diphenhydramine. Both are first-generation antihistamines. They make you drowsy by blocking a wake signal (histamine), not by fixing the clock or sleep pressure. The AASM 2017 pharmacologic guideline suggests clinicians not use diphenhydramine for chronic insomnia (weak). Next-day fog is common, the effect fades if you take them often, and the sleep you get is often lighter and more broken. The 2025 restless-legs guideline separately notes that diphenhydramine and similar antihistamines can worsen that urge-to-move pattern. Rare backup for a one-off night is a different question than a habit. Do not mix with alcohol. Older adults (Beers criteria), glaucoma, urinary retention, and other drowsy meds raise the risk — pharmacist or doctor, not an aisle. Circadia will not tell you to start these.",
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
    say: "Unisom is an old allergy medicine sold as a sleep aid. SleepTabs are usually doxylamine; some gels, ZzzQuil, Tylenol PM, and Benadryl use diphenhydramine. They can knock you out for a night. That is not the same as good sleep — next-day fog is common, and they work less if you take them often. Not a nightly plan. Do not mix with alcohol.",
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
      { year: 2015, cite: "AASM 2015 melatonin CPG still the jet-lag timing document: melatonin as a clock signal, not a knockout dose" },
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
    body: "A crawling or aching urge to move the legs, worse in the evening, better when you walk — that pattern is restless legs, not ordinary tossing. It is common, under-diagnosed, and it wrecks sleep because it hits exactly when you are trying to fall asleep. Iron is still the first thing a clinician checks; low ferritin is a treatable cause. The 2025 AASM restless-legs / periodic-limb-movement guideline (Winkelman et al., J Clin Sleep Med) updates the 2012 parameter: iron evaluation stays central, several over-the-counter sedating antihistamines (diphenhydramine among them) can make the urge worse, and valerian is specifically suggested against for RLS. Some antidepressants and dopamine-blocking drugs can worsen it too. Caffeine and alcohol often do as well. Circadia does not diagnose restless legs, score severity, or pick a medicine. If the pattern matches, that is a clinic conversation, not a diary tweak or an aisle sedative.",
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
    say: "A warm shower or bath, then a cooler dark room, can help you fall asleep because body temperature dropping is part of the 'it is night' signal. You do not need a $2000 mattress. If you are overheating at 3 a.m., cooler is the experiment, not another pill.",
    body: "Core temperature decline facilitates sleep onset. Warm bathing before bed followed by a cooler sleep environment is a low-risk behavioral lever. Marketing around smart mattresses outruns the need.",
    tags: ["temperature", "shower", "bath", "hot", "cool"],
    aliases: ["hot shower", "warm bath", "hot bath", "too hot at night", "cooling mattress"],
    reviewedThrough: "2026-08",
    confidence: "high",
    sources: [
      { year: 2024, cite: "A 1–2°C drop in core temperature is part of sleep onset. A cool room and warm extremities help that drop." },
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
