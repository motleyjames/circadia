import { existsSync, readFileSync } from "node:fs";
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
  it("speaks every visual beat so the eyes can close", () => {
    for (const script of MEDITATIONS) {
      for (const beat of script.beats) {
        expect(spokenLine(script.id, beat.atSeconds), `${script.id} @${beat.atSeconds}`).toBeTruthy();
      }
    }
  });

  it("only speaks on a real visual beat, in full phrases, never a barked cue", () => {
    for (const script of MEDITATIONS) {
      const visual = new Set(script.beats.map((b) => b.atSeconds));
      const byAt = new Map(script.beats.map((b) => [b.atSeconds, b]));
      for (const row of spokenBeats(script.id)) {
        expect(visual.has(row.atSeconds), `${script.id} spoken @${row.atSeconds} has no orb beat`).toBe(
          true,
        );
        const breath = byAt.get(row.atSeconds)?.breath;
        const minWords = breath === "in" || breath === "hold" || breath === "out" ? 4 : 6;
        expect(row.say.split(/\s+/).length, `${script.id} @${row.atSeconds}`).toBeGreaterThanOrEqual(
          minWords,
        );
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
    expect(existsSync("public/voice/silence.wav")).toBe(true);
    for (const script of MEDITATIONS) {
      for (const row of spokenBeats(script.id)) {
        const path = `public/voice/${script.id}/${row.atSeconds}.wav`;
        expect(existsSync(path), path).toBe(true);
      }
    }
  });

  it("ships mono 16-bit PCM WebKit does not have to decode", () => {
    // Read the RIFF header rather than shelling out to ffprobe. The old version
    // failed on any machine without ffmpeg installed, with probe.status null —
    // an absent binary read as a broken audio file. The header carries exactly
    // the four facts this test is about, and every machine can read it.
    const wav = readFileSync("public/voice/478/0.wav");
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");

    // Walk the chunk list; "fmt " is not always the first chunk after the header.
    let offset = 12;
    let fmt: Buffer | null = null;
    while (offset + 8 <= wav.length) {
      const id = wav.subarray(offset, offset + 4).toString("ascii");
      const size = wav.readUInt32LE(offset + 4);
      if (id === "fmt ") {
        fmt = wav.subarray(offset + 8, offset + 8 + size);
        break;
      }
      offset += 8 + size + (size % 2);
    }
    expect(fmt, "no fmt chunk in public/voice/478/0.wav").not.toBeNull();

    expect(fmt!.readUInt16LE(0)).toBe(1); // 1 = uncompressed PCM
    expect(fmt!.readUInt16LE(2)).toBe(1); // mono
    expect(fmt!.readUInt32LE(4)).toBe(22050);
    expect(fmt!.readUInt16LE(14)).toBe(16); // bits per sample
  });

  it("advances the orb through the script", () => {
    const script = MEDITATIONS[0];
    expect(beatAt(script, 0).text).toMatch(/Settle/i);
    expect(beatAt(script, 16).breath).toBe("hold");
    expect(beatAt(script, 23).breath).toBe("out");
  });
});
