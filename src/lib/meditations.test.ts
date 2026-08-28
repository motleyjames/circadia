import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEDITATIONS, beatAt, spokenBeats, spokenLine } from "./meditations";
import { BEDSIDE, pickBedsideVoice, scoreBedsideVoice, type VoiceLike } from "./voice";

const BAN = /aasm|cbt-i|\bscn\b/i;
const BARK = /^(in|hold|out|drop|stop|release)\.?$/i;

function voice(name: string, lang = "en-US"): VoiceLike {
  return { name, lang, localService: true, voiceURI: name };
}

describe("bedside voice picker", () => {
  it("refuses novelty and robot Mac voices", () => {
    expect(scoreBedsideVoice(voice("Zarvox"))).toBeLessThan(0);
    expect(scoreBedsideVoice(voice("Deranged"))).toBeLessThan(0);
    expect(scoreBedsideVoice(voice("Bad News"))).toBeLessThan(0);
    expect(scoreBedsideVoice(voice("Fred"))).toBeLessThan(0);
    expect(scoreBedsideVoice(voice("eSpeak NG", "en-GB"))).toBeLessThan(0);
    expect(pickBedsideVoice([voice("Zarvox"), voice("Fred")])).toBeNull();
  });

  it("prefers a calm named voice over the first English voice in the list", () => {
    const picked = pickBedsideVoice([voice("Fred"), voice("Alex"), voice("Samantha")]);
    expect(picked?.name).toBe("Samantha");
  });

  it("keeps pitch at or above 1 so the guide is not pitched into a villain", () => {
    expect(BEDSIDE.pitch).toBeGreaterThanOrEqual(1);
    expect(BEDSIDE.rate).toBeGreaterThanOrEqual(0.92);
    expect(BEDSIDE.volume).toBeLessThanOrEqual(0.7);
  });
});

describe("meditation guide copy", () => {
  it("does not speak the breath counts — the orb does that job", () => {
    for (const script of MEDITATIONS) {
      for (const beat of script.beats) {
        if (beat.breath === "in" || beat.breath === "hold" || beat.breath === "out") {
          expect(spokenLine(script.id, beat.atSeconds), `${script.id} @${beat.atSeconds}`).toBeNull();
        }
      }
    }
  });

  it("only speaks on a real visual beat, in full sentences, never a barked cue", () => {
    for (const script of MEDITATIONS) {
      const visual = new Set(script.beats.map((b) => b.atSeconds));
      for (const row of spokenBeats(script.id)) {
        expect(visual.has(row.atSeconds), `${script.id} spoken @${row.atSeconds} has no orb beat`).toBe(
          true,
        );
        expect(row.say.split(/\s+/).length).toBeGreaterThanOrEqual(6);
        expect(row.say).not.toMatch(BARK);
        expect(row.say).not.toMatch(BAN);
        expect(row.say).not.toMatch(/progressive muscle/i);
        expect(row.say).not.toMatch(/jaw unclench/i);
      }
    }
  });

  it("keeps on-screen copy free of engine jargon", () => {
    for (const script of MEDITATIONS) {
      for (const beat of script.beats) {
        expect(beat.text, script.id).not.toMatch(BAN);
      }
    }
  });

  it("ships a recorded clip for every spoken line", () => {
    expect(existsSync("public/voice/silence.mp3")).toBe(true);
    for (const script of MEDITATIONS) {
      for (const row of spokenBeats(script.id)) {
        const path = `public/voice/${script.id}/${row.atSeconds}.mp3`;
        expect(existsSync(path), path).toBe(true);
      }
    }
  });

  it("advances the orb through the script", () => {
    const script = MEDITATIONS[0];
    expect(beatAt(script, 0).text).toMatch(/Settle/i);
    expect(beatAt(script, 16).breath).toBe("hold");
    expect(beatAt(script, 23).breath).toBe("out");
  });
});
