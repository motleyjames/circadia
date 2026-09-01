import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRiffWav, parseWavPcm } from "./audio";

function encodeS16Wav(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf).set(new Uint8Array(samples.buffer, samples.byteOffset, dataSize), 44);
  return buf;
}

describe("sleep audio graph", () => {
  it("unlocks the mixer with a buffer tick — same path as brown noise", () => {
    const src = readFileSync("src/lib/audio.ts", "utf8");
    expect(src).toContain("createBufferSource");
    expect(src).toContain("parseWavPcm");
    expect(src).toContain("loadWavUrl");
    expect(src).toContain("loadWavPcm");
    expect(src).toContain("pcmCache");
    expect(src).toContain("resolveAppHrefs");
    expect(src).toContain("isRiffWav");
    expect(src).toContain("WKURLSchemeHandler");
    expect(src).toContain("peekPcm");
    expect(src).toContain("scheduleBufferAt");
    expect(src).toMatch(/src\.start\(\)/);
    expect(src).not.toContain("73.88");
    expect(src).not.toMatch(/new Audio\(/);
  });

  it("walks meditations from the tap, not from a useEffect", () => {
    const src = readFileSync("src/lib/audio.ts", "utf8");
    expect(src).toContain("export function startBreathBed");
    expect(src).toContain("duckBreathBed");
    expect(src).toContain("createOscillator");
    expect(src).toMatch(/void ctx\.resume\(\)/);

    const wind = readFileSync("src/components/wind-down.tsx", "utf8");
    expect(wind).toContain("startBreathBed");
    expect(wind).toContain("startGuideFromTap");
    expect(wind).toContain("primeGuide");
    expect(wind).toContain("warmGuides");
    expect(wind).toContain("prefetchGuide");
    expect(wind).toContain("guidePcmWarm");
    expect(wind).toContain("hushVoice");
    expect(wind).toContain("unlockAudio");
    expect(wind).toContain("Preparing the guide");
    expect(wind).toContain("beginGuide");
    expect(wind).not.toContain('disabled={guides !== "ready"}');
    expect(wind).not.toContain("speechSynthesis");
    expect(wind).not.toContain("speakBedside");
    expect(wind).not.toMatch(/void playGuide/);
    expect(wind).not.toMatch(/Voice \{/);
    expect(wind).not.toContain("circadia-guide");
    expect(wind).not.toContain("<audio");

    const player = wind.slice(wind.indexOf("function MeditationPlayer"));
    expect(player).not.toContain("startGuideFromTap(id, 0)");
    expect(player).not.toContain("playGuide");
  });

  it("does not fall guide clips back to a computer voice or HTML audio", () => {
    const voice = readFileSync("src/lib/voice.ts", "utf8");
    expect(voice).toContain("startGuideFromTap");
    expect(voice).toContain("scheduleBufferAt");
    expect(voice).toContain("loadWavPcm");
    expect(voice).toContain(".wav");
    expect(voice).not.toMatch(/new Audio\(/);
    expect(voice).not.toContain("el.play(");
    expect(voice).not.toContain("appendChild");
    expect(voice).not.toMatch(/speakBedside\(line\)/);
    const start = voice.slice(voice.indexOf("export function startGuideFromTap"));
    const untilSpeak = start.slice(0, start.indexOf("export function speak"));
    expect(untilSpeak).not.toContain("speakBedside");
    expect(untilSpeak).not.toContain("speechSynthesis");
    expect(untilSpeak).not.toContain("await ");
    expect(untilSpeak).not.toContain("setTimeout");
  });

  it("round-trips a tiny PCM WAV without a browser decoder", () => {
    const clip = parseWavPcm(encodeS16Wav(new Int16Array([0, 16384, -16384, 0]), 22050));
    expect(clip.sampleRate).toBe(22050);
    expect(clip.samples.length).toBe(4);
    expect(clip.samples[1]).toBeCloseTo(0.5, 2);
    expect(clip.samples[2]).toBeCloseTo(-0.5, 2);
  });

  it("rejects HTML and empty buffers as WAV", () => {
    const html = new TextEncoder().encode("<!doctype html>").buffer;
    expect(isRiffWav(html)).toBe(false);
    expect(isRiffWav(new ArrayBuffer(0))).toBe(false);
    expect(isRiffWav(encodeS16Wav(new Int16Array([1, 2, 3, 4]), 22050))).toBe(true);
  });

  it("parses the shipped opening line as real PCM, not silence", () => {
    const bytes = readFileSync("public/voice/478/0.wav");
    const clip = parseWavPcm(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(clip.sampleRate).toBe(22050);
    expect(clip.samples.length).toBeGreaterThan(22050);
    let peak = 0;
    for (let i = 0; i < clip.samples.length; i++) {
      const a = Math.abs(clip.samples[i]);
      if (a > peak) peak = a;
    }
    expect(peak).toBeGreaterThan(0.1);
  });

  it("does not ship the fade-out-from-zero bug that muted the old MP3s", () => {
    const script = readFileSync("scripts/render-voice.py", "utf8");
    const af = script.match(/"-af",\s*"([^"]+)"/);
    expect(af?.[1]).toContain("areverse");
    expect(af?.[1]).not.toContain("afade=t=out");
    expect(af?.[1]).not.toContain("loudnorm");
  });
});
