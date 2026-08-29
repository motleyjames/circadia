import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sleep audio graph", () => {
  it("unlocks the mixer with a buffer tick — same path as brown noise", () => {
    const src = readFileSync("src/lib/audio.ts", "utf8");
    expect(src).toContain("createBufferSource");
    expect(src).toContain("decodeAudioData");
    expect(src).toContain("decodeUrl");
    expect(src).toMatch(/src\.start\(\)/);
  });

  it("walks meditations with a recorded guide over the breath pad", () => {
    const src = readFileSync("src/lib/audio.ts", "utf8");
    expect(src).toContain("export function startBreathBed");
    expect(src).toContain("duckBreathBed");
    expect(src).toContain("createOscillator");
    expect(src).toMatch(/void ctx\.resume\(\)/);
    expect(src).toContain("await ctx.resume()");
    expect(src).not.toMatch(/new Audio\(/);

    const wind = readFileSync("src/components/wind-down.tsx", "utf8");
    expect(wind).toContain("startBreathBed");
    expect(wind).toContain("playGuide");
    expect(wind).toContain("prefetchGuide");
    expect(wind).toContain("primeGuide");
    expect(wind).toContain("hushVoice");
    expect(wind).toContain("unlockAudio");
    expect(wind).not.toContain("speechSynthesis");
    expect(wind).not.toContain("speakBedside");
    expect(wind).not.toMatch(/Voice \{/);
    expect(wind).not.toMatch(/new Audio\(/);
  });

  it("does not fall guide clips back to a computer voice", () => {
    const voice = readFileSync("src/lib/voice.ts", "utf8");
    const playGuide = voice.slice(voice.indexOf("export async function playGuide"));
    const untilSpeak = playGuide.slice(0, playGuide.indexOf("export function speak"));
    expect(untilSpeak).toContain("el.play(");
    expect(untilSpeak).toContain("playSample");
    expect(untilSpeak).not.toContain("speakBedside");
    expect(untilSpeak).not.toContain("speechSynthesis");
    expect(voice).toContain("new Audio");
    expect(voice).toContain("/voice/silence.mp3");
    expect(voice).toContain('setAttribute("playsinline"');
  });
});
