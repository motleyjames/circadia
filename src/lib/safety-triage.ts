import { CRISIS_LINE } from "@/lib/safety-copy";
import type { Profile } from "@/lib/types";

/**
 * Questions that must be answered before the consult engine gets a turn.
 *
 * The topic ladder in `chat.ts` matches on sleep words, and some of the most
 * urgent things a person types contain those same words. "I keep falling asleep
 * at the wheel" matched `fall asleep` and was answered with advice to go to bed
 * later. "I want to kill myself, I haven't slept in days" reached the withhold
 * fallback and was handed a menu of topics. Both are answered here instead.
 *
 * Rules for everything in this file:
 * - Name what was heard. Do not pivot straight to sleep hygiene.
 * - Point at a human. This is the one place the app stops being the answer.
 * - Never a topic menu. A menu after a disclosure like this reads as not listening.
 */

export type TriageReply = { text: string; citations: string[] };

/** Suicide, self-harm, or "I cannot go on". Insomnia is an independent risk factor. */
const CRISIS =
  /\b(kill(ing)? myself|suicid\w*|end(ing)? (my life|it all|it|things)|take my own life|want to die|wanna die|better off dead|no (reason|point) (to|in) liv\w*|not worth living|don'?t want to (be here|live|wake up|go on)|can'?t go on|hurt myself|harm myself|self[- ]harm)\b/;

/** Falling asleep at the wheel is not an insomnia question. It is an emergency. */
const DROWSY_DRIVING =
  /(fall(ing|s)? asleep|fell asleep|nod(ded|ding)? off|doz(ed|ing) off|micro ?sleep)[^.?!]{0,30}(wheel|driv|road|car|truck)|driv[^.?!]{0,30}(fall(ing)? asleep|fell asleep|nod(ded|ding)? off|can'?t stay awake)|(almost|nearly) (crash|wreck)/;

/** Someone watched you stop breathing, or you wake choking. Not a coaching problem. */
const WITNESSED_APNEA =
  /\b(stop(s|ped)? breathing|stops? breathing|pauses? in (my )?breathing|quit breathing)\b|\b(chok(e|es|ing)|gasp(s|ing)?)\b[^.?!]{0,25}(sleep|night|awake|up)|(wake|woke|waking)[^.?!]{0,20}\b(chok\w*|gasp\w*)/;

/** Sleep loss can both trigger and signal a manic episode. Restriction is contraindicated. */
const MANIA = /\b(bipolar|manic|mania|hypomani\w*)\b/;

/** Several days with no sleep at all is a red flag, not a sleep-hygiene question. */
const NO_SLEEP_FOR_DAYS =
  /\b(haven'?t|have not|hardly|barely|not)\b[^.?!]{0,15}\bslept\b[^.?!]{0,15}\b(in|for)\b[^.?!]{0,10}\b(\d+|two|three|four|five|several|a few)\b[^.?!]{0,10}\b(days?|nights?)\b|\b\d+\s*(days?|nights?)\s*(with(out)?|no)\s*sleep\b/;

/** Daily heavy use, or drinking in order to sleep. Abrupt cessation can be dangerous. */
const ALCOHOL_DEPENDENCE =
  /\b(bottle of wine|six ?pack|6 ?pack|fifth of|pint of (vodka|whisk|gin|rum))\b[^.?!]{0,30}\b(every|each|most|per) (night|day|evening)\b|\b(drink|drinking)\b[^.?!]{0,20}\b(every|each) (night|day)\b[^.?!]{0,20}\b(to (get to )?sleep|to pass out|to knock)\b|\b(can'?t|cannot|never) (get to )?sleep without (a |the )?(drink|beer|wine|glass|bottle)\b|\b(need|rely on|depend on)\b[^.?!]{0,15}\b(drink|alcohol|booze|wine|beer)\b[^.?!]{0,15}\bto (get to )?sleep\b|\b(withdrawal|dt'?s|delirium tremens|shakes when i (don'?t|do not) drink)\b/;

/** A caregiver asking about a child, rather than the account holder. */
const CHILD_SUBJECT =
  /\bmy (baby|infant|newborn|toddler|kid|child|son|daughter|teen(ager)?|\d{1,2}[- ]year[- ]old)\b|\b(for|to) (a|my) (baby|infant|toddler|kid|child)\b|\b\d{1,2} year old\b/;

/** Dose or "should I take it" questions, as opposed to "what is this". */
const ASKING_TO_TAKE =
  /\b(how much|how many|dose|dosage|\bmg\b|milligram|should i (take|try|use|start|give)|can i (take|try|use|give)|is it (safe|ok|okay) to (take|give)|take)\b/;

function reply(text: string, citations: string[]): TriageReply {
  return { text, citations };
}

/**
 * Runs before every other route. Returns null when nothing urgent was said.
 * Order matters: the most dangerous reading of an ambiguous line wins.
 */
export function safetyTriage(lower: string, profile: Profile | null): TriageReply | null {
  if (CRISIS.test(lower)) {
    return reply(
      `That matters more than tonight's sleep, and I am not the right kind of help for it. ${CRISIS_LINE} If you can, tell one person tonight — someone in the room, or someone you can call. Not sleeping makes everything feel more final than it is, and that feeling is a symptom, not the truth. I will still be here for the sleep part whenever you want it.`,
      [],
    );
  }

  if (DROWSY_DRIVING.test(lower)) {
    return reply(
      "Stop driving. Falling asleep at the wheel is not a sleep-schedule problem I can coach — it is the one symptom where the next hour matters more than the next month. Pull over somewhere safe, and get a ride tonight rather than driving home. Then book a doctor: nodding off during the day, especially while driving, points at something that needs a proper look — an airway problem, a sleep disorder, or a medication. Please do not wait on this one.",
      ["bmi-osa", "sleep-debt"],
    );
  }

  if (WITNESSED_APNEA.test(lower)) {
    return reply(
      "Someone seeing you stop breathing, or waking up choking or gasping, is the one thing here I will not try to coach. That points at the airway, and none of the sleep tools in this app fix it — they can even hide it for a while. Ask a doctor for a sleep apnea evaluation and say those exact words: stopping breathing, choking, gasping. It is a common thing, it is testable, and it is treatable. Do that before you spend another night on schedule tweaks.",
      ["bmi-osa"],
    );
  }

  if (MANIA.test(lower)) {
    return reply(
      "Say this to whoever manages that with you before you change anything about your sleep. Losing sleep can set off an episode, and cutting time in bed — which is the usual next step for stubborn insomnia — is not safe to run on your own when mania is in the picture. If you are sleeping much less than usual and feel fine or wired on it, that is worth a call today, not next week. I will keep to the steady-wake-time part and leave the rest to your clinician.",
      ["circadian-anchor"],
    );
  }

  if (NO_SLEEP_FOR_DAYS.test(lower)) {
    return reply(
      "Several days with almost no sleep is past what this app should be handling. Please talk to a doctor — today if you can. Going that long without sleep can be a sign of something that needs treating rather than a schedule to fix, and it also makes driving genuinely dangerous. If you feel unsafe or unlike yourself, that is an urgent call, not a wait-and-see. When you are on the other side of it, come back and we will do the steady part properly.",
      ["sleep-debt"],
    );
  }

  if (ALCOHOL_DEPENDENCE.test(lower)) {
    return reply(
      "Drinking that much, most nights, to get to sleep is worth saying out loud to a doctor — not because of the sleep, but because of the drinking. One thing first: if you drink heavily every day, do not stop suddenly on your own. Coming off alcohol abruptly can be medically dangerous, and it is something to do with a doctor's help. So I am not going to run my usual two-dry-nights experiment with you. Alcohol does wreck the second half of the night, and you will likely sleep better without it — but the safe route there goes through a person, not this app.",
      ["alcohol"],
    );
  }

  return childOrMinorGate(lower, profile);
}

/**
 * Dosing questions from, or about, someone under 18.
 *
 * The melatonin route quotes 0.3–1 mg to whoever asks. Intake accepts age 13, so
 * a fifteen-year-old asking "how much melatonin should I take" was getting adult
 * dosing from a library note that says, in the same breath, not to start it under
 * 18 without a clinician.
 */
function childOrMinorGate(lower: string, profile: Profile | null): TriageReply | null {
  const aboutSupplement = /melatonin|magnesium|gummies|gummy/.test(lower);
  const aboutOtc = /unisom|benadryl|zzzquil|zzquil|doxylamine|diphenhydramine|nyquil|tylenol pm|advil pm|sleeping pill|sleep aid/.test(lower);
  if (!aboutSupplement && !aboutOtc) return null;
  if (!ASKING_TO_TAKE.test(lower)) return null;

  if (CHILD_SUBJECT.test(lower)) {
    return reply(
      "I will not give a dose for a child. Sleep aids for kids — melatonin included, even the gummies sold beside the vitamins — belong with a paediatrician, because the right answer depends on age, weight, and what is actually keeping them up. Melatonin is also one of the more common accidental-overdose calls to poison control, so it is worth keeping out of reach whatever you decide. Ask their doctor. Most childhood sleep problems turn out to be about timing and the wind-down, not a supplement.",
      ["melatonin"],
    );
  }

  const age = profile?.age;
  if (typeof age === "number" && age > 0 && age < 18) {
    return reply(
      "You are under 18, so I am not going to give you a dose for that. Sleep aids at your age are a conversation with a doctor and a parent — not because you cannot be trusted with it, but because the dose and the reason both matter more while you are still growing, and the good evidence in teenagers is thin. What I can help with is free and works: the same wake time every day including weekends, daylight in your eyes early, and getting off screens before bed. Teenagers' clocks genuinely run late — that part is biology, not laziness — so the morning light matters more for you than for most people.",
      ["melatonin", "duration-age", "morning-light"],
    );
  }

  return null;
}
