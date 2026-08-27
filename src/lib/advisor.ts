import type { MorningReport, Profile, SleepNote } from "@/lib/types";
import { delayedClock, durationVsNeed, flagMedications, profileBmi, weekBreakdown } from "@/lib/metrics";
import { formatClock, formatDuration, minutesToClock, sleepNeedHours } from "@/lib/time";

const NIGHTS_FOR_PATTERN = 3;

function note(
  id: string,
  title: string,
  body: string,
  confidence: SleepNote["confidence"],
  sourceIds: string[],
  kind: SleepNote["kind"],
): SleepNote {
  return { id, title, body, confidence, sourceIds, kind };
}

export function buildSleepNotes(profile: Profile, reports: MorningReport[]): SleepNote[] {
  const notes: SleepNote[] = [];
  const week = weekBreakdown(reports);
  const need = sleepNeedHours(profile.age);
  const bmi = profileBmi(profile);
  const medFlags = flagMedications(profile.medications);
  const units = profile.units;

  if (reports.length === 0) {
    notes.push(
      note(
        "empty",
        "Tonight we start the clock",
        `Target window is ${formatClock(profile.targetSleep, units)} to ${formatClock(profile.targetWake, units)}. Screens down an hour before sleep. The first useful picture of your sleep shows up after a few mornings — not after one night.`,
        "high",
        ["circadian-anchor", "light-screens"],
        "steady",
      ),
    );
    if (profile.struggles.includes("falling")) {
      notes.push(
        note(
          "struggle-fall",
          "Falling asleep is a pressure problem as much as a mindset problem",
          "If you lie in bed 'trying,' you are teaching the bed that it is for thinking. Wind-down in another room, get in only when sleepy, and get out if you are still awake around 20 minutes. We will see your latency numbers in the morning interview.",
          "high",
          ["sleep-pressure", "wind-down"],
          "lever",
        ),
      );
    }
    if (profile.struggles.includes("staying")) {
      notes.push(
        note(
          "struggle-stay",
          "Staying asleep: clock, alcohol, and airway before supplements",
          "Night wakings are often circadian (too early a clock, too much time in bed), alcohol in the second half of the night, or an airway issue. The morning bubbles will tell us which pattern you actually have.",
          "high",
          ["alcohol", "bmi-osa", "circadian-anchor"],
          "lever",
        ),
      );
    }
    return notes;
  }

  const latest = reports[reports.length - 1];
  const latestDuration = week.nights[week.nights.length - 1]?.durationMinutes ?? 0;

  if (week.wakeSpreadMinutes >= 75 && reports.length >= NIGHTS_FOR_PATTERN) {
    notes.push(
      note(
        "wake-spread",
        "Your get-up time is drifting",
        `Wake times are swinging by about ${Math.round(week.wakeSpreadMinutes)} minutes across logs. That is social jet lag in miniature. Pick ${formatClock(profile.targetWake, units)} and defend it — even after a rough night. The clock cannot learn a moving target.`,
        "high",
        ["circadian-anchor"],
        "lever",
      ),
    );
  }

  if (week.meanScreenOffMinutes < 35 && week.meanLatencyMinutes >= 20 && reports.length >= 2) {
    notes.push(
      note(
        "screens",
        "Screens are still in the last hour",
        `Average screen-off is about ${Math.round(week.meanScreenOffMinutes)} minutes, and you are still taking roughly ${Math.round(week.meanLatencyMinutes)} minutes to fall asleep. The content is usually the stimulant, not just the LED. Park the phone when Circadia pings — then use a wind-down here instead of one more scroll.`,
        "high",
        ["light-screens", "wind-down"],
        "lever",
      ),
    );
  }

  if (week.alcoholNights >= 1) {
    const alcoholPoor = reports.filter((r) => r.drank && (r.rating <= 2 || r.spins || r.wokeInNight));
    if (alcoholPoor.length > 0 || week.alcoholNights / reports.length >= 0.4) {
      notes.push(
        note(
          "alcohol",
          "Alcohol is showing up in the second half of the night",
          `${week.alcoholNights} of ${reports.length} logged nights had drinks.${alcoholPoor.some((r) => r.spins) ? " Spins means the dose was already in a range that fragments sleep and REM." : ""} Lab pattern: easier to fall asleep, then more awakenings and thinner REM later. If you want one experiment this week, make two nights drink-free and compare ratings. That comparison is worth more than a new supplement.`,
          "high",
          ["alcohol"],
          "alert",
        ),
      );
    }
  }

  if (week.nightsWithHighLatency >= Math.max(2, Math.ceil(reports.length * 0.4))) {
    notes.push(
      note(
        "latency",
        "Sleep onset is regularly over 30 minutes",
        "That is the insomnia-onset pattern. Two moves beat melatonin here: (1) do not get into bed until you are actually sleepy, (2) if you are awake ~20 minutes, get up, keep it dim and boring, come back only when sleepy. Lying there 'trying' is practice for insomnia.",
        "high",
        ["sleep-pressure"],
        "lever",
      ),
    );
  }

  if (week.nightsWokeInNight >= Math.max(2, Math.ceil(reports.length * 0.4))) {
    notes.push(
      note(
        "staying",
        "You are waking and not falling back easily",
        "Maintenance insomnia is usually not solved by a heavier nighttime pill. Check the alcohol notes, keep the bedroom for sleep, and get out of bed if the mind is up. If you snore, gasp, or wake wrecked despite a long night, that is an airway question for a clinician — Circadia cannot hear you sleep.",
        "moderate",
        ["sleep-pressure", "bmi-osa", "alcohol"],
        "lever",
      ),
    );
  }

  const vsNeed = durationVsNeed(week.meanDurationMinutes, profile.age);
  if (vsNeed === "short") {
    notes.push(
      note(
        "short",
        "You are getting less sleep than most people your age",
        `Mean sleep is ${formatDuration(week.meanDurationMinutes)}. ${need.label}. Protect the wind-down hour and the wake time first — going to bed earlier while still wired often backfires.`,
        "high",
        ["duration-age", "circadian-anchor"],
        "lever",
      ),
    );
  } else if (vsNeed === "long" && week.meanRating <= 3) {
    notes.push(
      note(
        "long-poor",
        "Long nights, low ratings — extra time in bed is not extra sleep",
        `Mean time asleep is ${formatDuration(week.meanDurationMinutes)} with a ${week.meanRating.toFixed(1)} average rating. Stretching the window usually makes sleep lighter. A clinician would shrink time in bed toward the sleep you actually get. Do not aggressively cut time in bed on your own if you have bipolar spectrum history, untreated apnea, or you drive for a living — that needs a human.`,
        "moderate",
        ["duration-age", "sleep-pressure"],
        "lever",
      ),
    );
  }

  if (delayedClock(reports, profile.targetSleep) && reports.length >= NIGHTS_FOR_PATTERN) {
    notes.push(
      note(
        "delayed",
        "Your clock looks delayed relative to the target",
        `Average sleep onset is later than ${formatClock(profile.targetSleep, units)}. Classic young-adult pattern. Morning outdoor light within an hour of ${formatClock(profile.targetWake, units)}, dim evenings, and a defended wake time shift this faster than raising melatonin. After a week of logs Circadia may discuss low-dose melatonin as a clock tool — not as a hypnotic.`,
        "moderate",
        ["circadian-anchor", "melatonin", "light-screens"],
        "lever",
      ),
    );
  }

  if (profile.activity === "sedentary" && week.meanRating <= 3.2 && reports.length >= NIGHTS_FOR_PATTERN) {
    notes.push(
      note(
        "sedentary",
        "Days are quiet; nights are paying for it",
        "You marked activity as sedentary. Regular daytime walking plus morning light is circadian medicine and a sleep-pressure builder. It is not a punishment workout plan. Avoid making the first experiment a 10 pm HIIT session.",
        "moderate",
        ["activity"],
        "lever",
      ),
    );
  }

  if (bmi >= 30 && week.meanRating <= 3.4) {
    notes.push(
      note(
        "bmi",
        "Worth a snoring / apnea check",
        `Body mass index from the numbers you entered is about ${bmi.toFixed(1)}. Combined with unsatisfying sleep, that is a reason to ask a clinician about snoring, gasping, and unrefreshing sleep — not a reason to start magnesium. An app cannot rule apnea in or out.`,
        "moderate",
        ["bmi-osa"],
        "context",
      ),
    );
  }

  for (const flag of medFlags) {
    notes.push(
      note(
        `med-${flag.name.toLowerCase().replace(/\s+/g, "-")}`,
        `${flag.name} can collide with sleep`,
        flag.note,
        "moderate",
        ["medications"],
        "context",
      ),
    );
  }

  const usedMela = reports.filter((r) => r.usedSupplement && (r.supplementKind === "melatonin" || r.supplementKind === "both"));
  if (usedMela.length >= 2 && week.meanLatencyMinutes >= 30) {
    notes.push(
      note(
        "mela-timing",
        "Melatonin is not landing as a hypnotic",
        "You have used melatonin on multiple nights and latency is still high. That usually means dose-at-lights-out is the wrong use. If a clinician agrees it is appropriate, the evidence-based job of melatonin is clock-shifting at a low dose, earlier in the evening — while stimulus control does the falling-asleep work.",
        "moderate",
        ["melatonin", "sleep-pressure"],
        "lever",
      ),
    );
  }

  if (latest.windDownHelped === "yes") {
    notes.push(
      note(
        "winddown-yes",
        "Last night's session helped — keep that one",
        "You said the wind-down helped. Repeat the same session tonight before inventing a new stack. Habit beats novelty for arousal.",
        "high",
        ["wind-down"],
        "steady",
      ),
    );
  } else if (latest.windDownHelped === "no") {
    notes.push(
      note(
        "winddown-no",
        "Last night's session did not help — switch modality",
        "If breathwork felt like homework, try brown noise and a paper book. If noise felt annoying, try the 4-7-8 visual with the phone face down after it starts. We learn from the morning answer, not from a brand of calm.",
        "moderate",
        ["wind-down"],
        "lever",
      ),
    );
  }

  const levers = notes.filter((n) => n.kind === "lever" || n.kind === "alert");
  if (levers.length === 0) {
    notes.unshift(
      note(
        "steady",
        "This stretch looks steady — protect it",
        `Mean sleep ${formatDuration(week.meanDurationMinutes)}, rating ${week.meanRating.toFixed(1)} / 5, last night ${formatDuration(latestDuration)}. Keep the same wake time, keep the hour off screens, morning light, and do not 'reward' a good week with a 2 am night. Stability is the whole product.`,
        "high",
        ["circadian-anchor", "duration-age", "light-screens"],
        "steady",
      ),
    );
  } else if (week.meanRating >= 4 && reports.length >= 5 && week.wakeSpreadMinutes < 45) {
    notes.unshift(
      note(
        "mostly-good",
        "Mostly good — one or two levers, not a new identity",
        "Ratings are solid and wake time is fairly stable. Read the notes below as small course corrections, not a diagnosis that something is wrong with you.",
        "high",
        ["circadian-anchor"],
        "steady",
      ),
    );
  }

  notes.push(
    note(
      "latest",
      `Last night · ${formatDuration(latestDuration)} · ${latest.rating}/5`,
      `Asleep about ${formatClock(latest.fellAsleepAt, units)}, up ${formatClock(latest.wokeAt, units)}. Latency bucket ~${latest.sleepLatencyMinutes} min. Screens down ~${latest.screenOffMinutes} min.${latest.drank ? ` Drinks: ${latest.drinkCount ?? "yes"}${latest.spins ? ", spins yes" : ""}.` : " No alcohol logged."}`,
      "high",
      [],
      "context",
    ),
  );

  return dedupeNotes(notes);
}

function dedupeNotes(notes: SleepNote[]): SleepNote[] {
  const seen = new Set<string>();
  return notes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

export function midpointClock(minutes: number): string {
  return minutesToClock(minutes);
}
