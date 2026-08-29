import type { MeditationId } from "./types";
import {
  audioNow,
  loadWavUrl,
  peekDecoded,
  scheduleBufferAt,
  stopSample,
  stopScheduledBuffers,
  unlockAudioSync,
} from "./audio";
import VOICE_LINES from "./voice-lines.json";

type VoiceBook = Record<string, Record<string, string>>;
const LINES = VOICE_LINES as VoiceBook;

/** Spoken bedside line for this beat, or null to keep the room quiet. */
export function spokenLine(id: MeditationId, atSeconds: number): string | null {
  const line = LINES[id]?.[String(atSeconds)];
  if (typeof line !== "string") return null;
  const trimmed = line.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function spokenBeats(id: MeditationId): Array<{ atSeconds: number; say: string }> {
  const book = LINES[id] ?? {};
  return Object.keys(book)
    .map((key) => ({ atSeconds: Number(key), say: book[key].trim() }))
    .filter((row) => Number.isFinite(row.atSeconds) && row.say.length > 0)
    .sort((a, b) => a.atSeconds - b.atSeconds);
}

/** Voices that turn a dark room into a haunted house. Never pick these. */
const REJECT =
  /zarvox|deranged|trinoids|whisper|boing|bells|cellos|hysterical|bad news|good news|pipe organ|albert|bahh|wobble|bubbles|junior|ralph|\bfred\b|espeak|pico|festival|dummy|compact|novelty|robot|superstar|\borgan\b/i;

const PREFER =
  /samantha|nicky|zoe|ava\b|allison|susan|karen|moira|tessa|sonia|libby|jenny|serena|fiona|martha|victoria|siri|premium|enhanced|neural|wavenet|google uk|google us english|natural/i;

const MALE_NEWS =
  /david|daniel|arthur|aaron|james|mark|guy|eric|alex\b|tom\b|ravi|george|thomas|diego/i;

export type VoiceLike = {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
  voiceURI?: string;
};

export const BEDSIDE = {
  rate: 0.97,
  pitch: 1.03,
  volume: 0.56,
};

const BEDSIDE_RATE = BEDSIDE.rate;
const BEDSIDE_PITCH = BEDSIDE.pitch;
const BEDSIDE_VOLUME = BEDSIDE.volume;

let voicesReady = false;

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

export function scoreBedsideVoice(voice: VoiceLike): number {
  const blob = `${voice.name} ${voice.lang} ${voice.voiceURI ?? ""}`;
  if (REJECT.test(blob)) return -100;
  if (!/^en\b/i.test(voice.lang) && !/^en-/i.test(voice.lang)) return -50;
  let score = 0;
  if (PREFER.test(blob)) score += 8;
  if (/en-GB|en-AU|en-IE|en-ZA/i.test(voice.lang)) score += 2;
  if (/en-US/i.test(voice.lang)) score += 1;
  if (MALE_NEWS.test(voice.name) && !PREFER.test(voice.name)) score -= 3;
  if (voice.localService) score += 1;
  return score;
}

export function pickBedsideVoice(voices: VoiceLike[]): VoiceLike | null {
  const ranked = voices
    .map((voice) => ({ voice, score: scoreBedsideVoice(voice) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.voice ?? null;
}

export function hasBedsideVoice(): boolean {
  const s = synth();
  if (!s) return false;
  return pickBedsideVoice(s.getVoices()) !== null;
}

export function guideClipUrl(id: MeditationId, atSeconds: number): string {
  return `/voice/${id}/${atSeconds}.wav`;
}

export function hushVoice() {
  stopScheduledBuffers();
  stopSample();
  synth()?.cancel();
}

export async function prefetchGuide(id: MeditationId): Promise<void> {
  await Promise.all(spokenBeats(id).map((row) => loadWavUrl(guideClipUrl(id, row.atSeconds))));
}

export async function warmGuides(): Promise<void> {
  await Promise.all((Object.keys(LINES) as MeditationId[]).map((id) => prefetchGuide(id)));
}

export function guideIsWarm(id: MeditationId, fromSeconds = 0): boolean {
  return remainingBeats(id, fromSeconds).every((row) => peekDecoded(guideClipUrl(id, row.atSeconds)));
}

export function primeGuide() {
  unlockAudioSync();
}

function remainingBeats(id: MeditationId, fromSeconds: number) {
  return spokenBeats(id).filter((row) => row.atSeconds + 0.05 >= fromSeconds);
}

/**
 * Call only from a click. Never from useEffect. Never await.
 * Clips must already be AudioBuffers (warmGuides). This function only
 * BufferSource.start()s on the same graph as the breath pad.
 */
export function startGuideFromTap(id: MeditationId, fromSeconds = 0): boolean {
  unlockAudioSync();
  hushVoice();
  const needed = remainingBeats(id, fromSeconds);
  if (needed.length === 0) return true;
  if (!needed.every((row) => peekDecoded(guideClipUrl(id, row.atSeconds)))) {
    return false;
  }
  const t0 = audioNow() + 0.05;
  for (const row of needed) {
    const buffer = peekDecoded(guideClipUrl(id, row.atSeconds));
    if (!buffer) return false;
    scheduleBufferAt(buffer, t0 + Math.max(0, row.atSeconds - fromSeconds), 1);
  }
  return true;
}

/** @deprecated kept so older call sites compile; the tap uses startGuideFromTap. */
export async function playGuide(id: MeditationId, atSeconds: number) {
  startGuideFromTap(id, atSeconds);
}

export function speak(text: string) {
  speakBedside(text);
}

function speakBedside(text: string) {
  const s = synth();
  if (!s) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  if (s.speaking) return;
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = BEDSIDE_RATE;
  utterance.pitch = BEDSIDE_PITCH;
  utterance.volume = BEDSIDE_VOLUME;
  const preferred = pickBedsideVoice(s.getVoices());
  if (preferred) {
    const match = s.getVoices().find((v) => v.voiceURI === preferred.voiceURI || v.name === preferred.name);
    if (match) utterance.voice = match;
  }
  s.speak(utterance);
}

export function unlockVoice() {
  const s = synth();
  if (!s) return;
  const unlock = new SpeechSynthesisUtterance(" ");
  unlock.volume = 0;
  s.speak(unlock);
  s.cancel();
  if (!voicesReady) {
    const mark = () => {
      voicesReady = s.getVoices().length > 0;
    };
    mark();
    s.addEventListener("voiceschanged", mark);
  }
}
