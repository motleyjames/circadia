import type { MeditationId } from "./types";
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

let clip: HTMLAudioElement | null = null;
let voicesReady = false;
let fadeTimer: number | null = null;

function ensureClip(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!clip) {
    clip = new Audio();
    clip.preload = "auto";
    clip.setAttribute("playsinline", "true");
    clip.setAttribute("webkit-playsinline", "true");
  }
  if (typeof document !== "undefined" && !clip.isConnected) {
    clip.setAttribute("hidden", "true");
    document.body.appendChild(clip);
  }
  return clip;
}

function clipMatches(el: HTMLAudioElement, url: string): boolean {
  const src = el.currentSrc || el.src;
  if (!src) return false;
  return src.endsWith(url) || src.includes(`${url}?`) || src.includes(url);
}

function stopFade() {
  if (fadeTimer != null) {
    window.clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

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
  return `/voice/${id}/${atSeconds}.mp3`;
}

function fadeStop(audio: HTMLAudioElement) {
  stopFade();
  const started = audio.volume;
  const steps = 8;
  let i = 0;
  fadeTimer = window.setInterval(() => {
    i += 1;
    audio.volume = Math.max(0, started * (1 - i / steps));
    if (i >= steps) {
      stopFade();
      audio.pause();
    }
  }, 30);
}

export function hushVoice() {
  if (clip) fadeStop(clip);
  synth()?.cancel();
}

/** Play a 250ms silence in the tap handler so later clips are allowed. */
export function primeGuide() {
  const a = ensureClip();
  if (!a) {
    unlockVoice();
    return;
  }
  a.src = "/voice/silence.mp3";
  a.volume = 0.01;
  void a.play().catch(() => {
    /* autoplay policy — unlockVoice still helps Speech fallback */
  });
  unlockVoice();
}

export function playGuide(id: MeditationId, atSeconds: number) {
  const line = spokenLine(id, atSeconds);
  if (!line) return;

  const url = guideClipUrl(id, atSeconds);
  const next = ensureClip();
  if (!next) {
    speakBedside(line);
    return;
  }

  stopFade();
  next.volume = 1;

  let fellBack = false;
  const fallback = (reason?: unknown) => {
    if (fellBack) return;
    const name =
      reason && typeof reason === "object" && "name" in reason ? String((reason as { name: string }).name) : "";
    if (name === "AbortError") return;
    fellBack = true;
    speakBedside(line);
  };

  const playNow = () => {
    next.volume = 1;
    void next.play().catch(fallback);
  };

  next.onerror = () => fallback();

  if (clipMatches(next, url)) {
    if (!next.paused && next.currentTime > 0.05) return;
    next.onloadeddata = playNow;
    playNow();
    return;
  }

  next.onloadeddata = playNow;
  next.src = url;
  next.load();
  if (next.readyState >= 2) playNow();
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
