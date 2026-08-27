"use client";

import { useEffect, useMemo, useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { startSoundscape, type SoundscapeId } from "@/lib/audio";
import { beatAt, hushVoice, MEDITATIONS, meditationById, speak } from "@/lib/meditations";
import type { MeditationId } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOUNDSCAPES: Array<{ id: SoundscapeId; title: string; blurb: string }> = [
  { id: "brown", title: "Brown noise", blurb: "Low, heavy. Less hiss than white." },
  { id: "pink", title: "Pink noise", blurb: "Even, indoor, boring on purpose." },
  { id: "rain", title: "Rain bed", blurb: "High-end hush. Masks hallways." },
  { id: "ocean", title: "Slow ocean", blurb: "A tide, not a playlist." },
];

export function WindDown() {
  const { addSession } = useCircadia();
  const [mode, setMode] = useState<"pick" | "meditate" | "sound">("pick");
  const [meditationId, setMeditationId] = useState<MeditationId>("478");
  const [soundId, setSoundId] = useState<SoundscapeId>("brown");

  if (mode === "meditate") {
    return (
      <MeditationPlayer
        id={meditationId}
        onExit={(elapsed, completed) => {
          addSession({
            startedAt: new Date().toISOString(),
            kind: "meditation",
            meditationId,
            durationSeconds: elapsed,
            completed,
          });
          setMode("pick");
        }}
      />
    );
  }

  if (mode === "sound") {
    return (
      <SoundPlayer
        id={soundId}
        onExit={(elapsed) => {
          addSession({
            startedAt: new Date().toISOString(),
            kind: "soundscape",
            soundscapeId: soundId,
            durationSeconds: elapsed,
            completed: elapsed >= 60,
          });
          setMode("pick");
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] tracking-[0.22em] text-violet-300/80 uppercase">Video meditations</p>
        <p className="mt-1 text-xs text-zinc-500">
          A breathing field, not a YouTube tab. Voice is optional. Rate it in the morning interview.
        </p>
        <div className="mt-3 grid gap-2">
          {MEDITATIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMeditationId(m.id);
                setMode("meditate");
              }}
              className="rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-left"
            >
              <p className="text-sm text-zinc-100">{m.title}</p>
              <p className="text-xs text-zinc-500">
                {Math.round(m.durationSeconds / 60)} min · {m.blurb}
              </p>
            </button>
          ))}
        </div>
      </section>
      <section>
        <p className="text-[11px] tracking-[0.22em] text-sky-300/80 uppercase">Calm noise</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SOUNDSCAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSoundId(s.id);
                setMode("sound");
              }}
              className="rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-left"
            >
              <p className="text-sm text-zinc-100">{s.title}</p>
              <p className="text-xs text-zinc-500">{s.blurb}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MeditationPlayer({
  id,
  onExit,
}: {
  id: MeditationId;
  onExit: (elapsed: number, completed: boolean) => void;
}) {
  const script = meditationById(id);
  const [elapsed, setElapsed] = useState(0);
  const [voice, setVoice] = useState(true);
  const [running, setRunning] = useState(true);
  const beat = useMemo(() => beatAt(script, elapsed), [script, elapsed]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (voice && running) speak(beat.text);
  }, [beat.text, voice, running]);

  useEffect(() => () => hushVoice(), []);

  const done = elapsed >= script.durationSeconds;
  const scale =
    beat.breath === "in" ? 1.18 : beat.breath === "hold" ? 1.18 : beat.breath === "out" ? 0.86 : 1;

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "relative mb-8 flex size-52 items-center justify-center rounded-full border border-violet-300/30 bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.35),rgba(14,12,28,0.2)_70%)] transition-transform duration-[4000ms] ease-in-out",
        )}
        style={{ transform: `scale(${scale})` }}
      >
        <div className="absolute inset-6 rounded-full border border-sky-300/20" />
        <p className="px-8 text-center text-sm leading-relaxed text-zinc-100">{beat.text}</p>
      </div>
      <p className="text-xs text-zinc-500">
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} /{" "}
        {Math.floor(script.durationSeconds / 60)}:{String(script.durationSeconds % 60).padStart(2, "0")}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          variant="outline"
          className="rounded-full border-white/15"
          onClick={() => setVoice((v) => !v)}
        >
          Voice {voice ? "on" : "off"}
        </Button>
        <Button
          variant="outline"
          className="rounded-full border-white/15"
          onClick={() => {
            setRunning((r) => !r);
            if (running) hushVoice();
          }}
        >
          {running ? "Pause" : "Resume"}
        </Button>
        <Button
          className="rounded-full bg-violet-400 text-zinc-950 hover:bg-violet-300"
          onClick={() => {
            hushVoice();
            onExit(elapsed, done);
          }}
        >
          End
        </Button>
      </div>
    </div>
  );
}

function SoundPlayer({
  id,
  onExit,
}: {
  id: SoundscapeId;
  onExit: (elapsed: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const handle = startSoundscape(id);
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      handle.stop();
      window.clearInterval(timer);
    };
  }, [id]);

  return (
    <div className="flex flex-col items-center py-6">
      <div className="mb-6 size-40 animate-pulse rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.35),transparent_70%)]" />
      <p className="text-sm text-zinc-200">{SOUNDSCAPES.find((s) => s.id === id)?.title}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · keep the phone face down
      </p>
      <Button
        className="mt-6 rounded-full bg-sky-300 text-zinc-950 hover:bg-sky-200"
        onClick={() => onExit(elapsed)}
      >
        Stop
      </Button>
    </div>
  );
}
