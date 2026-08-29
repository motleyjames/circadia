#!/usr/bin/env python3
"""Author-time bedside guide. Runtime is local PCM WAVs — the app does not call a TTS API.

Usage: python3 scripts/render-voice.py
Needs: edge-tts, ffmpeg
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path
from shutil import copy2

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
LINES = json.loads((ROOT / "src/lib/voice-lines.json").read_text())
OUT = ROOT / "public" / "voice"
VOICE = "en-GB-SoniaNeural"
RATE = "-15%"
PITCH = "-2Hz"
VOLUME = "+0%"


def ffmpeg(*args: str) -> None:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args]
    subprocess.run(cmd, check=True)


def duration_seconds(path: Path) -> float:
    probe = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return float(probe)


def peak_amplitude(path: Path) -> float:
    import struct
    import wave

    with wave.open(str(path), "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        count = len(frames) // 2
        if count == 0:
            return 0.0
        samples = struct.unpack_from("<" + "h" * count, frames)
        return max(abs(sample) for sample in samples) / 32768.0


def soften(src: Path, dest: Path) -> None:
    """Fade both ends without muting the line.

    A tail fade that omits its start time begins at t=0 and leaves a clip of
    near-silence — that is how the previous MP3s shipped. Reverse, fade in,
    reverse is a tail fade that does not need the duration in advance. Skip
    EBU loudness here: this ffmpeg build has been turning healthy Sonia takes
    into digital hush.
    """
    ffmpeg(
        "-i",
        str(src),
        "-af",
        "highpass=f=80,lowpass=f=6200,volume=-4dB,afade=t=in:d=0.12,areverse,afade=t=in:d=0.18,areverse",
        "-ar",
        "22050",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        str(dest),
    )


async def render_line(text: str, dest: Path) -> float:
    dest.parent.mkdir(parents=True, exist_ok=True)
    raw = dest.with_suffix(".raw.mp3")
    comm = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, volume=VOLUME)
    await comm.save(str(raw))
    soften(raw, dest)
    raw.unlink(missing_ok=True)
    return duration_seconds(dest)


def write_silence() -> None:
    dest = OUT / "silence.wav"
    dest.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg(
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=22050:cl=mono",
        "-t",
        "0.28",
        "-c:a",
        "pcm_s16le",
        str(dest),
    )


async def main() -> int:
    write_silence()
    overlaps: list[str] = []
    by_text: dict[str, Path] = {}
    for script_id, book in LINES.items():
        times = sorted(int(k) for k in book)
        durations: dict[int, float] = {}
        for at in times:
            dest = OUT / script_id / f"{at}.wav"
            text = book[str(at)]
            cached = by_text.get(text)
            if cached is not None:
                dest.parent.mkdir(parents=True, exist_ok=True)
                copy2(cached, dest)
                dur = duration_seconds(dest)
            else:
                dur = await render_line(text, dest)
                by_text[text] = dest
            peak = peak_amplitude(dest)
            if peak < 0.08:
                print(f"TOO QUIET {script_id}/{at}.wav peak={peak:.4f}", file=sys.stderr)
                return 1
            durations[at] = dur
            print(f"{script_id}/{at}.wav  {dur:.2f}s  peak={peak:.2f}  {text[:64]}")
        for prev, nxt in zip(times, times[1:]):
            gap = nxt - prev
            if durations[prev] > gap - 0.4:
                overlaps.append(
                    f"{script_id}: line at {prev}s ({durations[prev]:.2f}s) collides with {nxt}s"
                )
    if overlaps:
        print("OVERLAP:", *overlaps, sep="\n  ", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
