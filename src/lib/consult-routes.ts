/** Shared topic regexes. The main ladder and the baseline ladder both import these. */

export const TOPIC_DREAM = /dream|nightmare|meaning/;
export const TOPIC_DREAM_EXCLUDE = /doxylamine|unisom|melatonin/;

export const TOPIC_RX =
  /ambien|zolpidem|lunesta|trazodone|hydroxyzine|atarax|sonata|restoril|silenor|belsomra|suvorexant|dayvigo|lemborexant|quviviq|daridorexant|\borexin\b|\bdoras?\b/;

export const TOPIC_OTC =
  /unisom|benadryl|zzzquil|zzquil|doxylamine|diphenhydramine|nyquil|nytol|tylenol pm|advil pm/;
export const TOPIC_OTC_GEL = /gel|sleepgel|dipheng/;
export const TOPIC_OTC_NIGHTLY = /every night|habit|long term|daily|each night/;

export const TOPIC_THC = /\b(thc|cbd|cannabis|weed|marijuana|edibles?|gummies)\b/;

export const TOPIC_NAMED_MEDS =
  /\b(adderall|vyvanse|ritalin|concerta|wellbutrin|ssri|zoloft|lexapro|medication|prescription med)\b/;

export const TOPIC_MELATONIN = /melatonin/;
export const TOPIC_MELATONIN_WHEN = /when|how long before|what time/;
export const TOPIC_MELATONIN_DOSE = /how much|dose|mg\b|milligram/;

export const TOPIC_MAGNESIUM = /magnesium/;

export const TOPIC_CAFFEINE = /caffeine|coffee|espresso|energy drink/;

export const TOPIC_ALCOHOL =
  /alcohol|drink|drunk|spins|hangover|\b(beer|wine|vodka|shots?|tequila|whiskey)\b/;
export const TOPIC_ALCOHOL_NOT = /coffee|caffeine|water/;

export const TOPIC_SCREENS = /screen|phone|blue light|blue-light|scroll|night mode/;

export const TOPIC_NAP = /nap|sleep in|sleeping in|catch up|weekend|slept until|sleep till/;
export const TOPIC_NAP_NOT = /lie awake|lying awake|fall asleep/;

export const TOPIC_WAKING =
  /3 ?a\.?m\b|at 3\b|3:00|middle of the night|wake up at night|waking up|\bwaking\b|stay asleep|staying asleep|maintenance/;

export const TOPIC_ONSET =
  /can'?t fall|cannot fall|can'?t sleep|cannot sleep|\binsomnia\b|fall asleep|falling asleep|onset|wired|mind racing|lie awake|lying awake/;

export const TOPIC_SLEEP_NEED =
  /how much sleep|how many hours|sleep need|enough sleep|[6-9] hours|eight hours|seven hours|do i need \d/;

export const TOPIC_EXERCISE = /exercise|work out|workout|\bgym\b|sedentary|hiit/;

export const TOPIC_SNORING =
  /snor\w*|apnea|apnoea|gasp\w*|cpap|airway|\bosa\b|deviated septum|morning headache/;

export const TOPIC_MEDS = /\b(meds?|medication)s?\b/;

export const TOPIC_WIND_DOWN = /breathe|478|4-7-8|meditat|noise|brown|wind-down|wind down|calm/;

export const TOPIC_SCHEDULE = /schedule|wake time|bedtime|circadian|tonight|clock/;

export const TOPIC_HOW_DOING =
  /how.*(doing|sleeping)|am i ok|is my sleep|tips|advice|what should i do|plan|impression/;

export const TOPIC_PREGNANCY = /pregnan|postpartum|prenatal/;

export const TOPIC_ALCOHOL_DRINK = /alcohol|beer|wine/;
export const TOPIC_MIX_DRUGS =
  /unisom|benadryl|ambien|melatonin|zzzquil|belsomra|dayvigo|quviviq/;
export const TOPIC_MIX_WORDS = /mix|together|stack/;
export const TOPIC_ALCOHOL_WORD = /alcohol/;

export const TOPIC_NICOTINE = /nicotine|vape|vaping|\bzyn\b|cigarette|smoking|nic pouch/;

export const TOPIC_JET_LAG = /jet ?lag|time zone|timezone|red[- ]eye|long haul/;

export const TOPIC_SHIFT = /night shift|shift work|graveyard|rotating shift|i work nights/;

export const TOPIC_RLS = /restless legs|\brls\b|jimmy legs|urge to move/;

export const TOPIC_HERBALS = /theanine|valerian|ashwagandha|glycine|chamomile|lemon balm/;

export const TOPIC_REFLUX = /heartburn|reflux|\bgerd\b|eat late|eating late|late meal|late dinner/;

export const TOPIC_TEMPERATURE =
  /hot shower|warm bath|hot bath|too hot at night|cooling mattress|overheat/;

export const TOPIC_ALL_NIGHTER =
  /all[- ]?nighter|slept 4 hours|only slept [1-5]|pulling an all|all nighter/;

export function isMixAlcoholQuestion(lower: string): boolean {
  return (
    (TOPIC_ALCOHOL_DRINK.test(lower) && TOPIC_MIX_DRUGS.test(lower)) ||
    (TOPIC_MIX_WORDS.test(lower) && TOPIC_ALCOHOL_WORD.test(lower))
  );
}

export const TOPIC_BASELINE_WHY =
  /why (14|fourteen|two weeks)|how long.*(diary|baseline)|what is (a|the|my) baseline/;
export const TOPIC_BASELINE_CLOCK_TRIGGER =
  /clock|what time (it is|is it)|check(ing)? the time|time it/;
export const TOPIC_BASELINE_CLOCK_CONTEXT = /diary|guess|how long|minutes|exact|check/;
export const TOPIC_BASELINE_AFTER =
  /after (night )?14|after (the )?two weeks|what happens (next|after)|when (do|does|will) (i|my) (see|notes|numbers)/;
export const TOPIC_BASELINE_MISSED = /missed|forgot|didn'?t (fill|file|log|do)|skip(ped)?/;
export const TOPIC_BASELINE_MISSED_CONTEXT = /morning|diary|night|entry/;
export const TOPIC_BASELINE_CHANGE =
  /should i (change|do|try) (anything|something)|anything (i should|to) (change|do)|what (can|should) i do/;

export const TOPIC_MY_DREAM = /\bmy (dream|nightmare)s?\b/;
export const TOPIC_OWN_NUMBER = /efficiency|average|how many hours did i|\bscore\b/;

export function isClockBaselineQuestion(lower: string): boolean {
  return TOPIC_BASELINE_CLOCK_TRIGGER.test(lower) && TOPIC_BASELINE_CLOCK_CONTEXT.test(lower);
}

export function isMissedBaselineQuestion(lower: string): boolean {
  return TOPIC_BASELINE_MISSED.test(lower) && TOPIC_BASELINE_MISSED_CONTEXT.test(lower);
}
