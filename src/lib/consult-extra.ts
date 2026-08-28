type Reply = { text: string; citations: string[] };

/** Extra sleep topics the main regex ladder does not own yet. */
export function extraConsult(lower: string): Reply | null {
  if (/pregnan|postpartum|prenatal/.test(lower)) {
    return {
      text: "If you are pregnant or could be, I will not recommend melatonin, Unisom, herbals, or a new sleep drug. That is your obstetric clinician and pharmacist. Left-side sleep later in pregnancy and finishing meals earlier (if heartburn wakes you) still matter. Dosing does not come from this app.",
      citations: ["pregnancy-sleep"],
    };
  }

  if (
    (/alcohol|beer|wine/.test(lower) &&
      /unisom|benadryl|ambien|melatonin|zzzquil|belsomra|dayvigo|quviviq/.test(lower)) ||
    (/mix|together|stack/.test(lower) && /alcohol/.test(lower))
  ) {
    return {
      text: "Do not mix alcohol with Unisom, Benadryl, Ambien, or the newer prescription sleep drugs. The sedation adds up and the sleep you get is still shredded in the second half. I will not tell you how to stack them.",
      citations: ["alcohol", "otc-antihistamines", "prescription-hypnotics"],
    };
  }

  if (/nicotine|vape|vaping|\bzyn\b|cigarette|smoking|nic pouch/.test(lower)) {
    return {
      text: "Nicotine is a stimulant. Cigarettes, vapes, and pouches all count. It delays falling asleep and can wake you later when it wears off. If sleep is the goal, last nicotine earlier — not as a 1 a.m. ritual. I will not run a quit lecture from here.",
      citations: ["nicotine"],
    };
  }

  if (/jet ?lag|time zone|timezone|red[- ]eye|long haul/.test(lower)) {
    return {
      text: "Jet lag is your clock sitting in the old time zone. Morning outdoor light at the destination is the main lever. Melatonin is sometimes used as a clock signal for travel, low dose, timed by a clinician — not 10 mg at hotel lights-out. I will not build you a pill schedule from here.",
      citations: ["jet-lag"],
    };
  }

  if (/night shift|shift work|graveyard|rotating shift|i work nights/.test(lower)) {
    return {
      text: "Night shift fights the sun. On work days, protect a dark, regular sleep window and treat it like a real job. Sunglasses on the way home, blackout curtains, no errands that blow the window. This is not the same problem as staying up on your phone. If you cannot stay safe at work, that is occupational health or a sleep clinic.",
      citations: ["shift-work"],
    };
  }

  if (/restless legs|\brls\b|jimmy legs|urge to move/.test(lower)) {
    return {
      text: "Restless legs is an urge to move, worse at rest, worse in the evening — not the same as a racing mind. A clinician may check iron. Unisom-type antihistamines can make it worse for some people. I will not diagnose you from a chat line. If this is you, say it to a human.",
      citations: ["restless-legs"],
    };
  }

  if (/theanine|valerian|ashwagandha|glycine|chamomile|lemon balm/.test(lower)) {
    return {
      text: "L-theanine is mild. Glycine has small sleep data. Ashwagandha is mixed. Valerian is mixed and has rare liver-injury reports — do not stack 'to be sure.' None of these beat a wake time and getting out of bed if you are awake. I will not tell you to start them.",
      citations: ["herbals"],
    };
  }

  if (/heartburn|reflux|\bgerd\b|eat late|eating late|late meal|late dinner/.test(lower)) {
    return {
      text: "A heavy late meal, especially spicy food or alcohol, can wake you as reflux — burning, cough, sour taste — which looks like insomnia on a diary. Finish eating a few hours before bed if that is you. This is not a reason to start melatonin.",
      citations: ["late-eating"],
    };
  }

  if (/hot shower|warm bath|hot bath|too hot at night|cooling mattress|overheat/.test(lower)) {
    return {
      text: "A warm shower or bath, then a cooler dark room, can help you fall asleep because body temperature dropping is part of the night signal. You do not need a $2000 mattress. If you are overheating at 3 a.m., cooler is the experiment, not another pill.",
      citations: ["temperature"],
    };
  }

  if (/all[- ]?nighter|slept 4 hours|only slept [1-5]|pulling an all|all nighter/.test(lower)) {
    return {
      text: "After a brutal short night, sleeping until noon trains a later clock and makes tonight worse. Protect your wake time. If you need it, a ~20 minute nap before mid-afternoon. Caffeine in the morning, not at 9 p.m. If you might drive or cannot stay awake, sleep is safety — a doctor if it keeps happening.",
      citations: ["sleep-debt", "naps"],
    };
  }

  return null;
}
