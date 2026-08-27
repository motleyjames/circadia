export type ResearchArticle = {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  source: string;
  /** Extra match keys for chat — brand names, street names, spellings. */
  aliases?: string[];
  /** Plain-English chat line. Library body may keep jargon; this must not. */
  say?: string;
};

/**
 * Curated, conservative sleep-science notes.
 * These are teaching texts for Circadia — not a dump of papers, and not medical advice.
 * Claims stay close to AASM / NSF / CBT-I consensus and name uncertainty when the literature is mixed.
 */
export const RESEARCH: ResearchArticle[] = [
  {
    id: "circadian-anchor",
    title: "The wake time is the circadian anchor",
    summary:
      "A stable get-up time, including weekends, is the strongest schedule lever most people have.",
    body: "Your circadian system is a clock in the brain (the SCN) that is set primarily by light. The most reliable way to train that clock is a consistent wake time, then morning outdoor light within about an hour of getting up. Sleeping in on weekends creates 'social jet lag': a mini time-zone shift that makes Sunday night harder. CBT-I clinics treat a fixed wake time as non-negotiable even when the night was short — naps and an earlier bedtime are the recovery tools, not a late morning.",
    tags: ["schedule", "circadian", "wake", "light"],
    aliases: ["wake time", "get-up time", "getting up time"],
    say: "A stable get-up time, including weekends, is the strongest schedule lever most people have. Morning outdoor light helps. Sleeping in pushes tonight later.",
    source: "CBT-I clinical practice; Czeisler circadian photoreception work; AASM insomnia guideline",
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
    source: "Bootzin stimulus control; Spielman sleep restriction; AASM CBT-I recommendation",
  },
  {
    id: "light-screens",
    title: "Screens, light, and the hour before bed",
    summary:
      "The hour before bed is for dim, boring, offline. Blue light matters — arousal from content usually matters more.",
    body: "Intrinsically photosensitive retinal ganglion cells (melanopsin) tell the clock it is daytime. Bright, especially short-wavelength light in the evening can delay melatonin onset. That is real. What wellness marketing skips: scrolling, gaming, and unfinished work are alerting even on night mode. Circadia's one-hour screen-off is a behavioral gate, not a blue-light gadget. Dim the room, park the phone outside the bedroom if you can, and do a wind-down you could do half-asleep. Morning outdoor light is the other half of this: it advances the clock and makes the next night easier.",
    tags: ["screens", "light", "melatonin", "evening"],
    aliases: ["blue light", "night shift mode", "screens off"],
    source: "Brainard / Berson melanopsin literature; AASM light and circadian timing reviews",
  },
  {
    id: "alcohol",
    title: "Alcohol is a sleep fragmenter, not a sleep aid",
    summary:
      "Drinks can shorten sleep latency and then shred the second half of the night — including REM.",
    body: "Ethanol is sedating on the way in. In the second half of the night it causes rebound wakefulness, more arousals, and suppressed REM, with a later REM rebound that feels like vivid or spinning-adjacent dreams. 'Spins' are a vestibular/intoxication signal that the dose was already in a range that will not produce restorative sleep. There is no healthy-sleep version of a heavy night. Even one to two drinks measurably fragment sleep in lab studies for many people. If sleep is the goal, alcohol is one of the highest-leverage things to move.",
    tags: ["alcohol", "rem", "staying", "rating"],
    aliases: ["alcohol", "beer", "wine", "hangover"],
    source: "Ebrahim et al. alcohol and sleep architecture; AASM substance and sleep reviews",
  },
  {
    id: "melatonin",
    title: "Melatonin is a clock signal, not a sleeping pill",
    summary:
      "Low-dose, correctly timed melatonin can shift a late clock. High doses at lights-out usually miss the point.",
    body: "Endogenous melatonin rises in dim evening light and tells the body it is night. Supplemental melatonin can phase-shift the clock, which is why it is used (carefully) for delayed sleep phase and jet lag. Hypnotic use — 5–10 mg at bedtime because you cannot fall asleep — is often the wrong tool: you may get next-day grogginess, and you have not trained the clock. Typical circadian-science doses discussed in the literature are closer to 0.3–1 mg, taken earlier than people expect (often 1–3 hours before desired sleep, sometimes earlier for delayed phase under clinical guidance). It is not first-line for chronic insomnia; CBT-I is. Do not start it if you are pregnant, on interacting medications, or under 18 without a clinician. Circadia will only raise it after a week of logs, and only as education.",
    tags: ["melatonin", "supplement", "circadian", "delayed"],
    aliases: ["melatonin"],
    source: "Auld / Ferracioli-Oda melatonin meta-analyses; AASM melatonin position; circadian phase-response literature",
  },
  {
    id: "magnesium",
    title: "Magnesium: modest evidence, not a cure",
    summary:
      "Glycinate is the form people mean for sleep. The trial evidence is small and mixed. Deficiency is the cleanest case.",
    body: "Magnesium is involved in NMDA/GABA signaling and muscle relaxation, which is why it gets marketed for sleep. Human evidence: a few small RCTs (including older-adult samples) show modest gains in subjective sleep; systematic reviews call the data insufficient for a strong recommendation. People who are deficient, eat little, drink heavily, or have restless legs sometimes feel a difference. Typical discussed doses are 200–400 mg elemental magnesium in the evening, glycinate or citrate preferred over oxide. Kidney disease is a hard stop — magnesium can accumulate. It should never outrank schedule, alcohol, and stimulus control. Circadia treats it as an optional adjunct after a week of data, with low confidence.",
    tags: ["magnesium", "supplement", "latency", "restless"],
    aliases: ["magnesium", "glycinate"],
    source: "Abbasi 2012; Mah & Pitre 2021 systematic review; NIH ODS magnesium fact sheet",
  },
  {
    id: "duration-age",
    title: "How much sleep you actually need",
    summary:
      "Adults: at least 7 hours. Young adults often need the upper end of 7–9. More time in bed is not always more sleep.",
    body: "The American Academy of Sleep Medicine recommends adults sleep 7 or more hours. The National Sleep Foundation bands: teens 8–10, younger adults 7–9, older adults 7–8. Short sleep raises cardiometabolic and mood risk over years — that is population data, not a diagnosis from one Tuesday. Long time in bed with poor sleep is a different problem (insomnia phenotype) and is treated by shrinking the window, not stretching it. Circadia scores your logs against the band for your age, then looks at whether the nights are consistent.",
    tags: ["duration", "age", "need"],
    source: "AASM 7-hour consensus; National Sleep Foundation duration recommendations",
  },
  {
    id: "activity",
    title: "Movement helps sleep — timing still matters",
    summary:
      "Regular moderate activity improves sleep quality on average. A hard workout in the last hour can delay it for some people.",
    body: "Meta-analyses find that regular aerobic and resistance training improve sleep quality and reduce insomnia symptoms. The mechanism is mixed: body temperature, anxiety reduction, and higher sleep pressure. Elite nuance: vigorous late-night training can delay sleep onset in some people via core temperature and sympathetic arousal. Circadia does not ban evening exercise; it flags a pattern if high activity plus late intense sessions sit next to long latency. Sedentary weeks with poor ratings get a gentle push toward daytime walking and morning light, which is also circadian medicine.",
    tags: ["activity", "exercise", "latency"],
    source: "Kredlow et al. exercise and sleep meta-analysis; insomnia exercise RCTs",
  },
  {
    id: "bmi-osa",
    title: "Unrefreshing sleep and airway risk",
    summary:
      "If sleep is long but you wake wrecked, or BMI is high, snoring and apnea belong on the checklist — with a clinician, not an app.",
    body: "Obstructive sleep apnea fragments sleep without always looking like 'insomnia' on a diary. Higher BMI, larger neck, snoring, gasping, and unrefreshing sleep are classic flags. Circadia does not diagnose OSA. It will mention screening when body mass and poor ratings line up, because treating insomnia techniques alone will not fix an airway problem. That is a feature, not an upsell: the honest move is a conversation with a clinician or a sleep study, not another supplement.",
    tags: ["osa", "bmi", "staying", "rating"],
    source: "AASM OSA guidelines; population BMI–OSA association literature",
  },
  {
    id: "dreams",
    title: "What dreams actually are",
    summary:
      "Dreams are mostly REM cognition: emotion, memory stitching, a noisy narrator. They are not a dictionary.",
    body: "Most vivid dreaming clusters in REM. Leading accounts: activation-synthesis (the cortex stories noisy brainstem activation), memory consolidation, and emotional processing. Nightmares rise with trauma, alcohol withdrawal/rebound REM, and some medications (notably some antidepressants). There is no reputable evidence for a universal symbol book. If you ask Circadia 'what it means,' it will reflect themes you wrote, note sleep-state physiology (alcohol, late sleep, supplements), and refuse prophecy. Keeping a dream log can still be useful: it is a journal of affect, and nightmare rehearsal therapy is a real clinical tool for recurrent nightmares.",
    tags: ["dreams", "rem", "meaning"],
    source: "Hobson activation-synthesis; Wamsley / Stickgold memory and dreaming; IRT for nightmares",
  },
  {
    id: "medications",
    title: "Medications that commonly collide with sleep",
    summary:
      "Stimulants, some antidepressants, steroids, and decongestants are frequent hidden clocks. Never stop a prescribed drug from an app.",
    body: "Common disruptors: amphetamine salts and methylphenidate (dose timing), bupropion, SSRIs (sleep architecture changes, sometimes insomnia or vivid dreams), corticosteroids, pseudoephedrine, and some beta blockers (melatonin suppression, nightmares). Common sedating drugs (diphenhydramine, some antipsychotics) can knock you out and still wreck sleep quality. Circadia only pattern-matches names you typed so the advisor can talk about timing and questions for your prescriber. It will never tell you to change a dose.",
    tags: ["medications", "supplements", "context"],
    aliases: ["adderall", "vyvanse", "ritalin", "wellbutrin"],
    source: "Clinical sleep pharmacology reviews; FDA labels for common agents",
  },
  {
    id: "wind-down",
    title: "Wind-down is a skill, not a vibe",
    summary:
      "Breathing, muscle release, and stable noise work because they drop arousal — not because they are magic frequencies.",
    body: "Pre-sleep arousal (cognitive and physiologic) is a core insomnia maintaining factor. Slow breathing (including 4-7-8 as a simple cadence), progressive muscle relaxation, and a body scan are CBT-I-adjacent tools with reasonable evidence for reducing latency in people who practice them. Broadband noise (pink/brown) can mask household sound and give the attention system something boring to hold. There is no special '528 Hz heal the circadian rhythm' effect Circadia will claim. Use a session, then tell the morning interview whether it helped — that is how we learn your response, not a population average.",
    tags: ["wind-down", "meditation", "sound", "latency"],
    source: "CBT-I relaxation component; noise-masking sleep studies; PMR literature",
  },
  {
    id: "caffeine",
    title: "Caffeine is an adenosine blocker",
    summary:
      "It does not just 'give energy.' It occupies the receptor that tells the brain you have been awake long enough to sleep.",
    body: "Adenosine accumulates with hours awake and promotes sleepiness. Caffeine is an adenosine-receptor antagonist. Typical half-life is about 5–6 hours; it is longer in pregnancy, with oral contraceptives, and in slow CYP1A2 metabolizers. A 3 pm coffee can still be pharmacologically present at 11. Elite practice: if sleep-onset is the complaint, last caffeine before early afternoon, and do not use it to paper over a late wake time. Circadia does not yet log caffeine in the morning interview — if it is in your life, say so in chat so the note can include it.",
    tags: ["caffeine", "coffee", "adenosine", "latency", "falling"],
    aliases: ["caffeine", "coffee", "espresso", "energy drink"],
    source: "Adenosine/caffeine pharmacology; sleep-onset and caffeine timing literature",
  },
  {
    id: "naps",
    title: "Catch-up sleep vs protecting the clock",
    summary:
      "A late morning after a short night feels kind and trains a later clock. Protect wake time; safety still comes first if you drive.",
    say: "Sleeping in after a short night feels kind and pushes tonight later. Protect your wake time. Catch-up is a short nap before mid-afternoon, or an earlier bedtime once you are actually sleepy. If you might drive, sleep is safety.",
    body: "Homeostatic pressure and circadian timing are two systems. Sleeping until noon after a 3 am night discharges pressure at the wrong clock time and delays tonight. In CBT-I, the wake time stays put even after a poor night; recovery is a brief nap (about 20 minutes, before mid-afternoon) or an earlier bedtime only once sleepy — not more hours in bed hoping. Exception: if you might drive, operate machinery, or cannot stay awake, sleep is a safety intervention, not a willpower test. Tell a clinician if sleepiness is that severe — that can be apnea, narcolepsy, or severe restriction, not 'bad habits.'",
    tags: ["naps", "weekend", "sleep in", "catch up", "wake", "schedule"],
    source: "CBT-I sleep restriction and stimulus-control practice; AASM insomnia guideline",
  },
  {
    id: "otc-antihistamines",
    title: "Unisom, Benadryl, and other aisle sleep aids",
    summary:
      "They are old allergy medicines sold for sleep. They can knock you out. They are not good sleep, and they are not a nightly plan.",
    body: "Unisom SleepTabs are usually doxylamine. Some Unisom gels, ZzzQuil, Tylenol PM, Advil PM, and Benadryl use diphenhydramine. Both are first-generation antihistamines. They make you drowsy by blocking a wake signal, not by fixing the clock or sleep pressure. Lab and clinic reviews: next-day fog is common, the effect fades if you take them often, and the sleep you get is often lighter and more broken. Sleep clinics do not recommend them as ongoing insomnia treatment. Rare backup for a one-off night is a different question than a habit. Do not mix with alcohol. Older adults, glaucoma, urinary retention, and other drowsy meds raise the risk — that is a pharmacist or doctor, not an aisle. Circadia will not tell you to start these.",
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
    source: "AASM 2017 insomnia guideline (antihistamines not recommended for chronic insomnia); first-generation antihistamine sleep and hangover literature; Beers criteria for older adults",
  },
  {
    id: "prescription-hypnotics",
    title: "Prescription sleep drugs",
    summary:
      "Ambien and similar drugs can help you fall asleep. They do not replace a wake-time plan, and an app will never change your dose.",
    body: "Zolpidem (Ambien), eszopiclone (Lunesta), zaleplon (Sonata), and some benzodiazepines are prescription hypnotics. Trazodone and hydroxyzine are often used off-label for sleep. They can shorten the time it takes to fall asleep. They can also cause next-day grogginess, odd nighttime behavior (especially zolpidem), and worse sleep for a few nights if you stop suddenly. Sleep clinics still treat a stable wake time and 'bed is for sleep' as the long-term plan, with or without a pill. Circadia will never tell you to start, stop, or change a prescribed drug. That is your prescriber.",
    tags: ["ambien", "zolpidem", "lunesta", "trazodone", "prescription", "hypnotic"],
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
    ],
    source: "FDA labels for zolpidem and eszopiclone; AASM pharmacologic insomnia guideline; clinical reviews of off-label trazodone for sleep",
  },
  {
    id: "cannabis-sleep",
    title: "THC, CBD, and sleep",
    summary:
      "THC can make you sleepy and then steal REM. CBD is mixed. Neither is a clean insomnia treatment.",
    body: "THC is sedating for many people on the way in, then it suppresses REM. When it wears off you can get vivid or restless nights — similar in shape to alcohol, not identical. CBD evidence for insomnia is small and mixed; high doses can be alerting for some people. Edibles last longer than smoke and are easier to overshoot. If sleep is the goal, nightly THC is a trade: easier onset, worse architecture. Circadia will not tell you to start or stop cannabis; it will treat it as a confounder on the diary if you say you use it.",
    tags: ["thc", "cbd", "cannabis", "weed", "rem"],
    aliases: ["thc", "cbd", "cannabis", "weed", "marijuana", "edible", "edibles", "gummies"],
    source: "Cannabinoids and sleep architecture reviews; REM suppression with THC; mixed CBD insomnia trials",
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
    source: "Nicotine and sleep latency literature; pouch/vape sleep disruption reports",
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
    source: "Circadian jet-lag reviews; timed light; melatonin phase-response for travel",
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
    source: "Shift work disorder clinical reviews; light and melatonin in night workers",
  },
  {
    id: "restless-legs",
    title: "Restless legs are not 'just anxiety in bed'",
    summary:
      "An urge to move, worse at rest in the evening, needs a clinician — sometimes iron. Not Unisom.",
    say: "Restless legs is an urge to move, worse at rest, worse in the evening. It is not the same as a racing mind. A clinician may check iron. Unisom and other drowsy antihistamines can make it worse for some people. I will not diagnose you from a chat line — if this is you, say it to a human.",
    body: "RLS is a sensorimotor disorder, often worse in the evening, relieved by movement. Iron deficiency is a common reversible contributor. Some antihistamines and antidepressants worsen RLS. Circadia does not diagnose RLS; it points to clinic instead of an aisle sedative.",
    tags: ["rls", "restless", "legs", "iron"],
    aliases: ["restless legs", "rls", "jimmy legs", "urge to move"],
    source: "IRLSSG / AASM restless legs guidance; iron and RLS; antihistamine worsening",
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
    source: "Obstetric sleep reviews; melatonin and pregnancy caution; OTC antihistamine pregnancy guidance varies by agent and must be clinician-led",
  },
  {
    id: "herbals",
    title: "Tea-aisle sleep: theanine, valerian, ashwagandha, glycine",
    summary:
      "Mild at best, mixed evidence, not a plan. Valerian has liver rare-risk noise. None outrank wake time.",
    say: "L-theanine is mild. Glycine has small sleep data. Ashwagandha is mixed and not a sleep drug. Valerian is mixed and has rare liver-injury reports — not something to stack 'to be sure.' None of these beat a wake time and getting out of bed if you are awake. I will not tell you to start them.",
    body: "Theanine, valerian, ashwagandha, and glycine are marketed for sleep with small or mixed trials. Valerian has rare hepatotoxicity reports. Circadia treats them as optional, low-confidence, never first-line, and never a stack.",
    tags: ["theanine", "valerian", "ashwagandha", "glycine", "herbal"],
    aliases: ["theanine", "l-theanine", "valerian", "ashwagandha", "glycine", "chamomile", "lemon balm"],
    source: "Herbal sleep systematic reviews; valerian hepatotoxicity case literature; glycine sleep trials small",
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
    source: "Nocturnal GERD and sleep fragmentation literature",
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
    source: "Body temperature and sleep-onset literature; pre-sleep bathing studies",
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
    source: "Sleep restriction, accident risk, and circadian recovery practice",
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
