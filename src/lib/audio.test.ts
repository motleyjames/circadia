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

  it("plays the bedside guide through that graph, not HTMLAudioElement", () => {
    const voice = readFileSync("src/lib/voice.ts", "utf8");
    expect(voice).toContain("decodeUrl");
    expect(voice).toContain("playSample");
    expect(voice).not.toMatch(/new Audio\(/);
    const wind = readFileSync("src/components/wind-down.tsx", "utf8");
    expect(wind).toContain("unlockAudio");
    expect(wind).toContain("prefetchGuide");
  });
});
