import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sleep audio graph", () => {
  it("unlocks the mixer with a buffer tick — same path as brown noise", () => {
    const src = readFileSync("src/lib/audio.ts", "utf8");
    expect(src).toContain("createBufferSource");
    expect(src).toContain("decodeAudioData");
    expect(src).toContain("decodeUrl");
    expect(src).toContain("scheduleBufferAt");
    expect(src).toMatch(/src\.start\(\)/);
  });

  it("walks meditations from the tap, not from a useEffect", () => {
    const src = readFileSync("src/lib/audio.ts", "utf8");
    expect(src).toContain("export function startBreathBed");
    expect(src).toContain("duckBreathBed");
    expect(src).toContain("createOscillator");
    expect(src).toMatch(/void ctx\.resume\(\)/);
    expect(src).not.toMatch(/new Audio\(/);

    const wind = readFileSync("src/components/wind-down.tsx", "utf8");
    expect(wind).toContain("startBreathBed");
    expect(wind).toContain("startGuideFromTap");
    expect(wind).toContain("prefetchGuide");
    expect(wind).toContain("primeGuide");
    expect(wind).toContain("warmGuides");
    expect(wind).toContain("hushVoice");
    expect(wind).toContain("unlockAudio");
    expect(wind).not.toContain("speechSynthesis");
    expect(wind).not.toContain("speakBedside");
    expect(wind).not.toMatch(/void playGuide/);
    expect(wind).not.toMatch(/Voice \{/);
    expect(wind).toContain('id="circadia-guide"');

    const player = wind.slice(wind.indexOf("function MeditationPlayer"));
    expect(player).not.toContain("startGuideFromTap(id, 0)");
    expect(player).not.toContain("playGuide");
  });

  it("does not fall guide clips back to a computer voice", () => {
    const voice = readFileSync("src/lib/voice.ts", "utf8");
    expect(voice).toContain("startGuideFromTap");
    expect(voice).toContain("scheduleBufferAt");
    expect(voice).toContain("el.play(");
    expect(voice).toContain("appendChild");
    expect(voice).toContain("new Audio");
    expect(voice).not.toMatch(/speakBedside\(line\)/);
    const start = voice.slice(voice.indexOf("export function startGuideFromTap"));
    const untilSpeak = start.slice(0, start.indexOf("export function speak"));
    expect(untilSpeak).not.toContain("speakBedside");
    expect(untilSpeak).not.toContain("speechSynthesis");
  });
});
