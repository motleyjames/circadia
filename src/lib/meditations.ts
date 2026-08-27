import type { MeditationId } from "@/lib/types";

export type MeditationBeat = {
  atSeconds: number;
  text: string;
  breath?: "in" | "hold" | "out" | "rest";
};

export type MeditationScript = {
  id: MeditationId;
  title: string;
  durationSeconds: number;
  blurb: string;
  beats: MeditationBeat[];
};

export const MEDITATIONS: MeditationScript[] = [
  {
    id: "478",
    title: "4–7–8 breathing",
    durationSeconds: 4 * 60,
    blurb: "A slow cadence. Not a miracle ratio — just longer exhales than ins.",
    beats: [
      { atSeconds: 0, text: "Sit or lie down. Phone face-down after this starts. Jaw unclench.", breath: "rest" },
      { atSeconds: 12, text: "Inhale quietly through the nose for four.", breath: "in" },
      { atSeconds: 16, text: "Hold.", breath: "hold" },
      { atSeconds: 23, text: "Exhale through the mouth for eight. Let the shoulders drop.", breath: "out" },
      { atSeconds: 32, text: "Again. In for four.", breath: "in" },
      { atSeconds: 36, text: "Hold seven.", breath: "hold" },
      { atSeconds: 43, text: "Out for eight.", breath: "out" },
      { atSeconds: 55, text: "If counting annoys you, just make the exhale longer than the in.", breath: "rest" },
      { atSeconds: 80, text: "In.", breath: "in" },
      { atSeconds: 84, text: "Hold.", breath: "hold" },
      { atSeconds: 91, text: "Out. The room can stay dim.", breath: "out" },
      { atSeconds: 120, text: "Halfway. You are not trying to fall asleep on command. You are lowering arousal.", breath: "rest" },
      { atSeconds: 150, text: "In for four.", breath: "in" },
      { atSeconds: 154, text: "Hold.", breath: "hold" },
      { atSeconds: 161, text: "Out for eight.", breath: "out" },
      { atSeconds: 190, text: "Last cycles. If the mind is loud, that is fine. Keep the breath boring.", breath: "rest" },
      { atSeconds: 210, text: "In.", breath: "in" },
      { atSeconds: 214, text: "Hold.", breath: "hold" },
      { atSeconds: 221, text: "Out.", breath: "out" },
      { atSeconds: 235, text: "Stop counting. Let breathing be ordinary. If sleepy, go to bed. If not, stay dim and off screens.", breath: "rest" },
    ],
  },
  {
    id: "body-scan",
    title: "Body scan",
    durationSeconds: 8 * 60,
    blurb: "Attention down the body. Use this at night wakings instead of the clock.",
    beats: [
      { atSeconds: 0, text: "Lights stay low. You can keep your eyes closed." },
      { atSeconds: 15, text: "Notice the weight of your body on the bed or floor. You do not have to relax it yet." },
      { atSeconds: 40, text: "Forehead. Unknit. Soften the tiny muscles around the eyes." },
      { atSeconds: 70, text: "Jaw. Tongue off the roof of the mouth. A little space between the teeth." },
      { atSeconds: 100, text: "Neck and shoulders. Let them be heavy. They do not have to hold the day." },
      { atSeconds: 140, text: "Arms. Left, then right. Hands. Fingers. Nothing to grip." },
      { atSeconds: 180, text: "Chest. Breathe without fixing the breath. Rise, fall." },
      { atSeconds: 230, text: "Belly. Let it be unfashionable. Soft." },
      { atSeconds: 280, text: "Hips and low back. Heavy into the surface." },
      { atSeconds: 330, text: "Thighs. Knees. Calves. You are allowed to feel ordinary." },
      { atSeconds: 390, text: "Feet. The last place people hold. Let them go dull." },
      { atSeconds: 430, text: "Whole body as one shape. If you drift, good. If you don't, still good. Stay off the clock." },
      { atSeconds: 470, text: "End. If you are in bed and sleepy, stay. If you are wired, get up dimly until sleepy." },
    ],
  },
  {
    id: "pmr",
    title: "Muscle release",
    durationSeconds: 6 * 60,
    blurb: "Tighten a muscle group for a few seconds, then drop it. Contrast teaches release.",
    beats: [
      { atSeconds: 0, text: "Progressive muscle relaxation. Tense without straining. Never if it hurts." },
      { atSeconds: 12, text: "Hands: make fists for five seconds." },
      { atSeconds: 17, text: "Drop. Notice the difference." },
      { atSeconds: 32, text: "Biceps: curl gently, five seconds." },
      { atSeconds: 37, text: "Drop." },
      { atSeconds: 55, text: "Shoulders: shrug toward the ears. Five." },
      { atSeconds: 60, text: "Drop. Let them hang." },
      { atSeconds: 80, text: "Face: squeeze eyes and jaw lightly. Three seconds only." },
      { atSeconds: 83, text: "Release. Smooth." },
      { atSeconds: 110, text: "Chest and back: a small stretch, not a gym set. Five." },
      { atSeconds: 115, text: "Release." },
      { atSeconds: 145, text: "Belly: draw in gently. Five." },
      { atSeconds: 150, text: "Let it go." },
      { atSeconds: 180, text: "Thighs: press them down into the bed. Five." },
      { atSeconds: 185, text: "Release." },
      { atSeconds: 220, text: "Calves and feet: point, then flex, then stop." },
      { atSeconds: 250, text: "Whole body heavy. No more tensing." },
      { atSeconds: 300, text: "Rest in the after-feel. That warmth is the point." },
      { atSeconds: 345, text: "Done. Dim and boring from here." },
    ],
  },
];

export function meditationById(id: MeditationId): MeditationScript {
  return MEDITATIONS.find((m) => m.id === id) ?? MEDITATIONS[0];
}

export function beatAt(script: MeditationScript, elapsed: number): MeditationBeat {
  let current = script.beats[0];
  for (const beat of script.beats) {
    if (elapsed >= beat.atSeconds) current = beat;
  }
  return current;
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.82;
  utterance.pitch = 0.92;
  utterance.volume = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en-GB|en-US/i.test(v.lang) && /female|samantha|google us/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

export function hushVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
