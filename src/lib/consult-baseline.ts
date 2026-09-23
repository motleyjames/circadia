import type { Profile } from "@/lib/types";
import { parseDiaryAsk, DEEP, LAST, WEEK } from "@/lib/diary-consult";
import { flagMedications } from "@/lib/metrics";
import { matchResearch } from "@/lib/research";
import {
  isClockBaselineQuestion,
  isMissedBaselineQuestion,
  isMixAlcoholQuestion,
  TOPIC_ALL_NIGHTER,
  TOPIC_BASELINE_AFTER,
  TOPIC_BASELINE_CHANGE,
  TOPIC_BASELINE_WHY,
  TOPIC_CAFFEINE,
  TOPIC_EXERCISE,
  TOPIC_HERBALS,
  TOPIC_HOW_DOING,
  TOPIC_JET_LAG,
  TOPIC_MAGNESIUM,
  TOPIC_MEDS,
  TOPIC_MELATONIN,
  TOPIC_MY_DREAM,
  TOPIC_NAMED_MEDS,
  TOPIC_NAP,
  TOPIC_NAP_NOT,
  TOPIC_NICOTINE,
  TOPIC_ONSET,
  TOPIC_OTC,
  TOPIC_OTC_GEL,
  TOPIC_OTC_NIGHTLY,
  TOPIC_OWN_NUMBER,
  TOPIC_PREGNANCY,
  TOPIC_REFLUX,
  TOPIC_RLS,
  TOPIC_RX,
  TOPIC_SCHEDULE,
  TOPIC_SCREENS,
  TOPIC_SHIFT,
  TOPIC_SLEEP_NEED,
  TOPIC_SNORING,
  TOPIC_TEMPERATURE,
  TOPIC_THC,
  TOPIC_ALCOHOL,
  TOPIC_ALCOHOL_NOT,
  TOPIC_WAKING,
  TOPIC_WIND_DOWN,
} from "@/lib/consult-routes";

export type ChatReply = { text: string; citations: string[] };

/** Profile only. Reports, week and latest are not on this type so they cannot be read. */
export type BaselineConsult = {
  profile: Pick<Profile, "activity" | "medications">;
};

export type BaselineKind = "safety" | "baseline" | "closed" | "hold" | "explain" | "library" | "withhold";

export const WAIT_CLINIC =
  "If it is too much to carry for two weeks, tell your clinician now — they would rather hear it than have you wait.";
export const WAIT_SOLO =
  "If it is too much to carry for two weeks, that is a reason to see a doctor, not to push through.";
export const USUAL =
  "If you are thinking of changing this, wait until after night 14. For now your usual habit is the useful one.";

export const BASELINE_WITHHOLD =
  "I don’t have a note I trust on that, and I would rather say so than make something up. If it is worrying you, it is worth raising with a doctor. Things I can explain properly: alcohol, caffeine, melatonin, Unisom-type sleep aids, prescription sleep drugs, screens, snoring, or why the diary asks what it asks.";

export const BASELINE_STARTERS = [
  { q: "Why fourteen nights?", hint: "What the diary is for." },
  { q: "Why not check the clock?", hint: "A guess is all the morning needs." },
  { q: "What happens after night 14?", hint: "When your notes open." },
  { q: "What does alcohol do to the night?", hint: "Drowsy going in. Broken in the second half." },
  { q: "Is melatonin a sleeping pill?", hint: "It is a clock signal. Clinics do not treat it as one." },
  { q: "What does Unisom actually do?", hint: "An old allergy medicine sold as a sleep aid." },
] as const;

function wait(solo: boolean): string {
  return solo ? WAIT_SOLO : WAIT_CLINIC;
}

function who(solo: boolean): string {
  return solo ? "this test" : "your clinician";
}

function closedReply(solo: boolean): ChatReply {
  const close =
    "Your nights are recorded, and I am keeping them closed until night 14. Seeing them now tends to change them — people start fixing the number instead of sleeping their usual way. After night 14, Notes opens with all fourteen.";
  return {
    text: solo ? close : `${close} Your clinician will go through them with you.`,
    citations: [],
  };
}

function holdOnset(solo: boolean): ChatReply {
  return {
    text: `Lying there unable to switch off is exactly what these fourteen nights are for, and it is hard. I am not going to give you a plan tonight — changing how you sleep now would hide the thing ${who(solo)} needs to see. Do what you would usually do, and put it in the diary as it was. ${wait(solo)}`,
    citations: ["sleep-pressure"],
  };
}

function holdWaking(solo: boolean): ChatReply {
  return {
    text: `Waking in the night and not getting back is one of the main things the diary measures, so it matters that these nights look like your usual ones. Do whatever you normally do when it happens, and do not check the clock to time it — a rough guess in the morning is all the diary wants. ${wait(solo)}`,
    citations: ["racing-mind"],
  };
}

function holdSchedule(solo: boolean, allNighter: boolean): ChatReply {
  const body = `For these fourteen nights the right schedule is your usual one — naps, weekends and late mornings included. That is the pattern ${who(solo)} starts from. Changes come after night 14, fitted to what your diary actually shows. ${wait(solo)}`;
  return {
    text: allNighter
      ? `If you might drive or cannot stay awake, sleep is safety — see a doctor if it keeps happening. ${body}`
      : body,
    citations: ["circadian-anchor"],
  };
}

function isClosedTopic(q: string, lower: string): boolean {
  if (parseDiaryAsk(q, [])) return true;
  if (DEEP.test(lower) || LAST.test(lower) || WEEK.test(lower)) return true;
  if (TOPIC_HOW_DOING.test(lower)) return true;
  if (TOPIC_MY_DREAM.test(lower)) return true;
  if (TOPIC_OWN_NUMBER.test(lower)) return true;
  return false;
}

function namedMedsReply(consult: BaselineConsult): ChatReply {
  const meds = flagMedications(consult.profile.medications);
  const named = meds.length
    ? meds.map((m) => `${m.name}: ${m.note}`).join(" ")
    : "I only comment on names you listed in You. I will never tell you to stop a prescribed drug.";
  return { text: named, citations: ["medications"] };
}

type Routed = { kind: BaselineKind; reply: ChatReply };

function route(q: string, lower: string, consult: BaselineConsult, solo: boolean): Routed {
  if (TOPIC_BASELINE_WHY.test(lower)) {
    return {
      kind: "baseline",
      reply: {
        text: "One or two nights say very little — sleep swings a lot from one night to the next. Fourteen nights show the usual ones, the bad ones, and weekdays against weekends. Clinics usually ask for one to two weeks of diary before any treatment starts, and two gives the fairer picture.",
        citations: ["sleep-regularity"],
      },
    };
  }
  if (isClockBaselineQuestion(lower)) {
    return {
      kind: "baseline",
      reply: {
        text: 'Watching the clock at night tends to keep people awake — every check is a small jolt of "how long have I been lying here". The diary only needs your best guess in the morning. A rough answer from memory is worth more than an exact one that cost you sleep.',
        citations: ["racing-mind"],
      },
    };
  }
  if (TOPIC_BASELINE_AFTER.test(lower)) {
    return {
      kind: "baseline",
      reply: {
        text: solo
          ? "Your Notes open and you can see all fourteen nights. After that, Somnadia goes back to its usual reminders and notes."
          : "Your Notes open and you can see all fourteen nights. Your clinician reads the same diary, and the plan comes from there — fitted to your nights rather than a general rule.",
        citations: [],
      },
    };
  }
  if (isMissedBaselineQuestion(lower)) {
    return {
      kind: "baseline",
      reply: {
        text: "That is fine. You can file the last few mornings from memory on the morning screen; they are marked late so nobody mistakes them for same-morning answers. If you cannot remember a night, leave it — a gap is more honest than a guess.",
        citations: [],
      },
    };
  }
  const holdBeatsChange =
    TOPIC_ONSET.test(lower) || TOPIC_WAKING.test(lower) || TOPIC_SCHEDULE.test(lower);
  if (TOPIC_BASELINE_CHANGE.test(lower) && !holdBeatsChange) {
    return {
      kind: "baseline",
      reply: {
        text: `Nothing needs to change for these two weeks. For these two weeks the most useful thing you can do is sleep the way you usually do and fill in the mornings honestly, the bad ones included. There is no score to improve and no way to fail this. ${wait(solo)}`,
        citations: [],
      },
    };
  }

  if (TOPIC_ONSET.test(lower)) {
    return { kind: "hold", reply: holdOnset(solo) };
  }
  if (TOPIC_WAKING.test(lower)) {
    return { kind: "hold", reply: holdWaking(solo) };
  }
  if (TOPIC_SCHEDULE.test(lower)) {
    return { kind: "hold", reply: holdSchedule(solo, false) };
  }

  if (isClosedTopic(q, lower)) {
    return { kind: "closed", reply: closedReply(solo) };
  }

  if (TOPIC_PREGNANCY.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "If you are pregnant or could be, I will not recommend melatonin, Unisom, herbals, or a new sleep drug. That is your obstetric clinician and pharmacist. Left-side sleep later in pregnancy and finishing meals earlier (if heartburn wakes you) still matter. Dosing does not come from this app.",
        citations: ["pregnancy-sleep"],
      },
    };
  }
  if (isMixAlcoholQuestion(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "Do not mix alcohol with Unisom, Benadryl, Ambien, or the newer prescription sleep drugs. The sedation adds up and the sleep you get is still shredded in the second half. I will not tell you how to stack them.",
        citations: ["alcohol", "otc-antihistamines", "prescription-hypnotics"],
      },
    };
  }
  if (TOPIC_NICOTINE.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: `Nicotine is a stimulant. Cigarettes, vapes, and pouches all count. It delays falling asleep and can wake you later when it wears off. I will not run a quit lecture from here. ${USUAL}`,
        citations: ["nicotine"],
      },
    };
  }
  if (TOPIC_JET_LAG.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "Jet lag is your clock sitting in the old time zone. Morning outdoor light at the destination is the main lever. Melatonin is sometimes used as a clock signal for travel, low dose, timed by a clinician — not 10 mg at hotel lights-out. I will not build you a pill schedule from here.",
        citations: ["jet-lag"],
      },
    };
  }
  if (TOPIC_SHIFT.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "Night shift fights the sun. On work days, protect a dark, regular sleep window and treat it like a real job. Sunglasses on the way home, blackout curtains, no errands that blow the window. This is not the same problem as staying up on your phone. If you cannot stay safe at work, that is occupational health or a sleep clinic.",
        citations: ["shift-work"],
      },
    };
  }
  if (TOPIC_RLS.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "Restless legs is an urge to move, worse at rest, worse in the evening — not the same as a racing mind. A clinician may check iron. Unisom-type antihistamines can make it worse for some people. I will not diagnose you from a chat line. If this is you, say it to a human.",
        citations: ["restless-legs"],
      },
    };
  }
  if (TOPIC_HERBALS.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: `L-theanine is mild. Glycine has small sleep data. Ashwagandha is mixed. Valerian is mixed and has rare liver-injury reports — do not stack 'to be sure.' I will not tell you to start them. ${USUAL}`,
        citations: ["herbals"],
      },
    };
  }
  if (TOPIC_REFLUX.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "A heavy late meal, especially spicy food or alcohol, can wake you as reflux — burning, cough, sour taste — which looks like insomnia on a diary. This is not a reason to start melatonin.",
        citations: ["late-eating"],
      },
    };
  }
  if (TOPIC_TEMPERATURE.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "A warm shower or bath, then a cooler dark room, can help you fall asleep because body temperature dropping is part of the night signal. You do not need a $2000 mattress.",
        citations: ["temperature"],
      },
    };
  }
  if (TOPIC_ALL_NIGHTER.test(lower)) {
    return { kind: "hold", reply: holdSchedule(solo, true) };
  }

  if (TOPIC_RX.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "Prescription sleep drugs. Ambien is the common one. A newer family — Belsomra, Dayvigo, Quviviq — blocks a wake signal instead of knocking you out the old way. Trazodone is often used off-label; it is not a first-line sleeping pill. They can help you fall or stay asleep, and they can leave you groggy the next day. One thing worth knowing about Ambien and its close cousins: they carry the strongest warning the regulator issues, for people who drive, eat, or walk while not really awake and remember none of it. If that has ever happened to you on one, tell your prescriber — it is a reason to stop that drug, and that call is theirs to make with you. They are also not meant to be combined with opioid painkillers. I will never tell you to start, stop, or change a prescription. If you already take one, keep taking it exactly as prescribed during these two weeks and tick Sleep aid in the morning — it is part of your usual sleep.",
        citations: ["prescription-hypnotics"],
      },
    };
  }
  if (TOPIC_OTC.test(lower)) {
    const gel = TOPIC_OTC_GEL.test(lower)
      ? " The gels are usually diphenhydramine, not doxylamine. Same family: drowsy, foggy next day, not a nightly plan."
      : "";
    const nightly = TOPIC_OTC_NIGHTLY.test(lower)
      ? " Taking it every night is the thing clinics do not want."
      : "";
    return {
      kind: "explain",
      reply: {
        text: `Unisom is an old allergy medicine sold as a sleep aid. SleepTabs are usually doxylamine; some gels, ZzzQuil, Tylenol PM, and Benadryl use diphenhydramine. They can knock you out for a night. That is not the same as good sleep, and they work less the more often you take them. Two things worth knowing. Doxylamine especially is still in you the next morning — do not drive until you know how it hits you. And the “PM” products are a sedating antihistamine plus a painkiller: Tylenol PM has acetaminophen in it, Advil PM has ibuprofen. If you already take those in the daytime you can double up without meaning to, so check the label. Sleep clinics do not use these as a nightly plan. Fine as a rare backup. Do not mix with alcohol. If you are older or already take drowsy meds, ask a pharmacist first. I will not tell you to start them.${gel}${nightly} If you already use one, keep your usual habit for these two weeks and tick it in the morning. Starting one now would change the baseline.`,
        citations: ["otc-antihistamines"],
      },
    };
  }
  if (TOPIC_THC.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "THC can make you sleepy, then steal dream sleep (REM). A recent lab night in people who already have insomnia found less total sleep and less REM, not more. Coming off it at 3 a.m. can feel restless and vivid — same family as alcohol, not identical. CBD evidence is still mixed. I will not tell you to start or stop cannabis. If you use it most nights, say so — I will treat it as part of the picture, not as a treatment. If you already use one, keep your usual habit for these two weeks and note it in the morning. Starting one now would change the baseline.",
        citations: ["cannabis-sleep"],
      },
    };
  }
  if (TOPIC_NAMED_MEDS.test(lower)) {
    return { kind: "explain", reply: namedMedsReply(consult) };
  }
  if (TOPIC_MELATONIN.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: "Melatonin is a clock signal, not a sleeping pill — clinics do not treat it as one. It is sold as a supplement, so what is in the bottle is often not what is on the label. Starting something new now would change the baseline, so if you are curious, raise it after night 14.",
        citations: ["melatonin"],
      },
    };
  }
  if (TOPIC_MAGNESIUM.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: `Magnesium is not a knockout pill. The evidence is mixed and small. Kidney disease is a hard no — that is a human, not an aisle. ${USUAL}`,
        citations: ["magnesium"],
      },
    };
  }
  if (TOPIC_CAFFEINE.test(lower)) {
    const meds = flagMedications(consult.profile.medications);
    const stimulant = meds.length
      ? `You listed ${meds.map((m) => m.name).join(", ")} — late caffeine on top of a stimulant is a common way to show up as “I can’t sleep.” `
      : "";
    return {
      kind: "explain",
      reply: {
        text: `${stimulant}Caffeine blocks the chemical that builds up while you are awake and tells you it is time to sleep. It hangs around about 5–6 hours for most people. A 3 pm coffee can still be working at 9 pm. ${USUAL}`,
        citations: ["caffeine"],
      },
    };
  }
  if (TOPIC_ALCOHOL.test(lower) && !TOPIC_ALCOHOL_NOT.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: `Even one or two drinks can steal dream sleep. Heavier drinks make you drowsy going in, then shred the second half — more wake-ups, less dreaming. “Spins” means the dose was already past useful sleep. ${USUAL}`,
        citations: ["alcohol"],
      },
    };
  }
  if (TOPIC_SCREENS.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: `Bright evening light can delay the “it is night” signal. The bigger problem is usually the content — unfinished work and feeds keep the brain on. ${USUAL}`,
        citations: ["light-screens"],
      },
    };
  }
  if (TOPIC_NAP.test(lower) && !TOPIC_NAP_NOT.test(lower)) {
    return { kind: "hold", reply: holdSchedule(solo, false) };
  }
  if (TOPIC_SLEEP_NEED.test(lower)) {
    return { kind: "hold", reply: holdSchedule(solo, false) };
  }
  if (TOPIC_EXERCISE.test(lower)) {
    return {
      kind: "explain",
      reply: {
        text: `You marked activity as ${consult.profile.activity}. Moving during the day usually helps sleep, and a hard workout in the last hour can delay it for some people. ${USUAL}`,
        citations: ["activity"],
      },
    };
  }
  if (TOPIC_SNORING.test(lower)) {
    const base =
      "I cannot hear you sleep. Unrefreshing sleep, snoring, gasping, or high body weight is an airway checklist for a clinician — not a magnesium problem. Insomnia tools will not fix sleep apnea. If that list fits, ask for a proper evaluation.";
    return {
      kind: "explain",
      reply: {
        text: solo
          ? base
          : `${base} Tell your clinician about this now rather than after night 14 — it changes how they read your diary.`,
        citations: ["bmi-osa"],
      },
    };
  }
  if (TOPIC_MEDS.test(lower)) {
    return { kind: "explain", reply: namedMedsReply(consult) };
  }
  if (TOPIC_WIND_DOWN.test(lower)) {
    return { kind: "hold", reply: holdSchedule(solo, false) };
  }

  const retrieved = matchResearch(q);
  if (retrieved) {
    return { kind: "library", reply: { text: retrieved.say ?? retrieved.summary, citations: [retrieved.id] } };
  }

  return { kind: "withhold", reply: { text: BASELINE_WITHHOLD, citations: [] } };
}

export function baselineKind(
  q: string,
  lower: string,
  consult: BaselineConsult,
  solo: boolean,
): BaselineKind {
  return route(q, lower, consult, solo).kind;
}

export function answerDuringBaseline(
  q: string,
  lower: string,
  consult: BaselineConsult,
  solo: boolean,
): ChatReply {
  return route(q, lower, consult, solo).reply;
}
