import type { MeditationId } from "./types";
import {
  audioNow,
  decodeUrl,
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
let guideGen = 0;
let guideEl: HTMLAudioElement | null = null;
const htmlTimers: number[] = [];

function clearHtmlTimers() {
  for (const id of htmlTimers) window.clearTimeout(id);
  htmlTimers.length = 0;
}

/**
 * NEW: WebKit often will not play a detached Audio() node. Keep one in the document.
 */
function mountGuideElement(): HTMLAudioElement {
  if (typeof document !== "undefined") {
    const existing = document.getElementById("circadia-guide");
    if (existing instanceof HTMLAudioElement) {
      guideEl = existing;
      return existing;
    }
  }
  if (typeof Audio === "undefined") {
    throw new Error("HTML_AUDIO_UNAVAILABLE");
  }
  if (!guideEl) {
    guideEl = new Audio();
    guideEl.id = "circadia-guide";
    guideEl.preload = "auto";
    guideEl.setAttribute("playsinline", "true");
    guideEl.setAttribute("webkit-playsinline", "true");
    guideEl.setAttribute("aria-hidden", "true");
    guideEl.style.position = "fixed";
    guideEl.style.left = "0";
    guideEl.style.bottom = "0";
    guideEl.style.width = "8px";
    guideEl.style.height = "8px";
    guideEl.style.opacity = "0.02";
    guideEl.style.pointerEvents = "none";
  }
  if (typeof document !== "undefined" && guideEl.parentElement !== document.body) {
    document.body.appendChild(guideEl);
  }
  return guideEl;
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

export function hushVoice() {
  guideGen += 1;
  clearHtmlTimers();
  stopScheduledBuffers();
  stopSample();
  if (guideEl) {
    guideEl.onended = null;
    try {
      guideEl.pause();
    } catch {
      /* element not playing */
    }
  }
  synth()?.cancel();
}

export function prefetchGuide(id: MeditationId) {
  for (const row of spokenBeats(id)) {
    void decodeUrl(guideClipUrl(id, row.atSeconds)).catch(() => {
      /* tap still has an HTMLAudio fallback */
    });
  }
}

export function warmGuides() {
  for (const id of Object.keys(LINES) as MeditationId[]) {
    prefetchGuide(id);
  }
}

export function primeGuide() {
  unlockAudioSync();
  try {
    mountGuideElement();
  } catch {
    /* jsdom / SSR */
  }
  warmGuides();
}

function remainingBeats(id: MeditationId, fromSeconds: number) {
  return spokenBeats(id).filter((row) => row.atSeconds + 0.05 >= fromSeconds);
}

function playHtmlClip(el: HTMLAudioElement, url: string) {
  el.muted = false;
  el.volume = 1;
  el.src = url;
  const play = el.play();
  if (play && typeof play.catch === "function") {
    void play.catch(() => {
      /* later beats may still fire */
    });
  }
}

/**
 * Call only from a click. Never from useEffect.
 * Opening line: HTMLAudio.play() inside the gesture (WKWebView's HTML media gate).
 * Later lines: BufferSource.start(futureTime) issued in that same gesture, so a timer
 * never has to call start().
 */
export function startGuideFromTap(id: MeditationId, fromSeconds = 0) {
  unlockAudioSync();
  hushVoice();
  const mine = guideGen;
  const needed = remainingBeats(id, fromSeconds);
  const opening = needed[0];
  if (opening && opening.atSeconds <= fromSeconds + 0.05) {
    try {
      playHtmlClip(mountGuideElement(), guideClipUrl(id, opening.atSeconds));
    } catch {
      /* no Audio constructor */
    }
  }
  const later = needed.filter((row) => row.atSeconds > fromSeconds + 0.05);
  const laterReady = later.length > 0 && later.every((row) => peekDecoded(guideClipUrl(id, row.atSeconds)));
  if (laterReady) {
    const t0 = audioNow();
    for (const row of later) {
      const buffer = peekDecoded(guideClipUrl(id, row.atSeconds));
      if (!buffer) continue;
      scheduleBufferAt(buffer, t0 + Math.max(0, row.atSeconds - fromSeconds), 1);
    }
    return;
  }
  if (later.length === 0) return;
  try {
    for (const row of later) {
      const delay = Math.max(0, (row.atSeconds - fromSeconds) * 1000);
      htmlTimers.push(
        window.setTimeout(() => {
          if (mine !== guideGen) return;
          playHtmlClip(mountGuideElement(), guideClipUrl(id, row.atSeconds));
        }, delay),
      );
    }
  } catch {
    /* no Audio constructor */
  }
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
