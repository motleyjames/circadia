import type { MeditationId } from "./types";

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
      { atSeconds: 0, text: "Settle in. Jaw soft.", breath: "rest" },
      { atSeconds: 12, text: "Breathe in", breath: "in" },
      { atSeconds: 16, text: "Hold", breath: "hold" },
      { atSeconds: 23, text: "A long, quiet out", breath: "out" },
      { atSeconds: 32, text: "Breathe in", breath: "in" },
      { atSeconds: 36, text: "Hold", breath: "hold" },
      { atSeconds: 43, text: "Long out", breath: "out" },
      { atSeconds: 55, text: "Out-breath longer than in. That is the whole trick.", breath: "rest" },
      { atSeconds: 80, text: "Breathe in", breath: "in" },
      { atSeconds: 84, text: "Hold", breath: "hold" },
      { atSeconds: 91, text: "Long out", breath: "out" },
      { atSeconds: 120, text: "Halfway. Not on command. Just slower.", breath: "rest" },
      { atSeconds: 150, text: "Breathe in", breath: "in" },
      { atSeconds: 154, text: "Hold", breath: "hold" },
      { atSeconds: 161, text: "Long out", breath: "out" },
      { atSeconds: 190, text: "A few more. Ordinary breath.", breath: "rest" },
      { atSeconds: 210, text: "Breathe in", breath: "in" },
      { atSeconds: 214, text: "Hold", breath: "hold" },
      { atSeconds: 221, text: "Long out", breath: "out" },
      { atSeconds: 235, text: "Stop counting. Dim from here.", breath: "rest" },
    ],
  },
  {
    id: "body-scan",
    title: "Body scan",
    durationSeconds: 8 * 60,
    blurb: "Attention down the body. Use this at night wakings instead of the clock.",
    beats: [
      { atSeconds: 0, text: "Lights low. Eyes can close." },
      { atSeconds: 22, text: "Feel the weight of your body. No need to change it." },
      { atSeconds: 50, text: "Forehead. Let it rest." },
      { atSeconds: 80, text: "Jaw. Space between the teeth." },
      { atSeconds: 115, text: "Neck and shoulders. Heavy." },
      { atSeconds: 155, text: "Arms, hands, fingers. Nothing to hold." },
      { atSeconds: 195, text: "Chest. Breath without managing it." },
      { atSeconds: 245, text: "Belly. Soft." },
      { atSeconds: 290, text: "Hips and low back. Into the bed." },
      { atSeconds: 340, text: "Thighs, knees, calves. Ordinary." },
      { atSeconds: 395, text: "Feet. Still." },
      { atSeconds: 435, text: "Whole body. Drifting is allowed." },
      { atSeconds: 470, text: "Enough. Sleepy — stay. Wired — get up, dim." },
    ],
  },
  {
    id: "pmr",
    title: "Muscle release",
    durationSeconds: 6 * 60,
    blurb: "Tighten a muscle group for a few seconds, then drop it. Contrast teaches release.",
    beats: [
      { atSeconds: 0, text: "Tighten, then let go. Never into pain." },
      { atSeconds: 14, text: "Hands — soft fists" },
      { atSeconds: 22, text: "Let go" },
      { atSeconds: 38, text: "Arms — a gentle curl" },
      { atSeconds: 46, text: "Let go" },
      { atSeconds: 62, text: "Shoulders — up, then hang" },
      { atSeconds: 70, text: "Let go" },
      { atSeconds: 88, text: "Face — a light squeeze" },
      { atSeconds: 96, text: "Smooth" },
      { atSeconds: 118, text: "Chest and back — a small stretch" },
      { atSeconds: 126, text: "Let go" },
      { atSeconds: 152, text: "Belly — draw in gently" },
      { atSeconds: 160, text: "Let go" },
      { atSeconds: 188, text: "Thighs — press into the bed" },
      { atSeconds: 196, text: "Let go" },
      { atSeconds: 228, text: "Calves and feet — point, flex" },
      { atSeconds: 238, text: "Stop" },
      { atSeconds: 258, text: "Whole body heavy. No more tensing." },
      { atSeconds: 305, text: "Rest in the after-feel." },
      { atSeconds: 345, text: "Done. Dim and quiet." },
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

export {
  hushVoice,
  playGuide,
  prefetchGuide,
  primeGuide,
  speak,
  spokenBeats,
  spokenLine,
  unlockVoice,
} from "./voice";
