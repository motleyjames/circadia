"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import {
  startBreathBed,
  startSoundscape,
  stopAllSoundscapes,
  stopBreathBed,
  unlockAudio,
  type SoundscapeId,
} from "@/lib/audio";
import {
  beatAt,
  hushVoice,
  MEDITATIONS,
  meditationById,
  playGuide,
  prefetchGuide,
} from "@/lib/meditations";
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

  function logSession(session: Parameters<typeof addSession>[0]) {
    addSession(session);
    setMode("pick");
  }

  useEffect(
    () => () => {
      hushVoice();
      stopBreathBed();
      stopAllSoundscapes();
    },
    [],
  );

  if (mode === "meditate") {
    return (
      <MeditationPlayer
        id={meditationId}
        onExit={(elapsed, completed) => {
          logSession({
            startedAt: new Date().toISOString(),
            kind: "meditation",
            meditationId,
            durationSeconds: elapsed,
            completed,
          });
        }}
      />
    );
  }

  if (mode === "sound") {
    return (
      <SoundPlayer
        id={soundId}
        onExit={(elapsed) => {
          logSession({
            startedAt: new Date().toISOString(),
            kind: "soundscape",
            soundscapeId: soundId,
            durationSeconds: elapsed,
            completed: elapsed >= 60,
          });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] tracking-[0.22em] text-sky-300/80 uppercase">Guided meditations</p>
        <p className="mt-1 text-xs text-zinc-500">
          A quiet recorded guide over a low tone. Close your eyes — you do not have to read the
          orb.
        </p>
        <div className="mt-3 grid gap-2">
          {MEDITATIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                void unlockAudio();
                prefetchGuide(m.id);
                setMeditationId(m.id);
                setMode("meditate");
              }}
              className="rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/8 active:bg-white/10"
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
                void unlockAudio();
                setSoundId(s.id);
                setMode("sound");
              }}
              className="rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/8 active:bg-white/10"
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
  const [running, setRunning] = useState(true);
  const elapsedRef = useRef(0);
  const logged = useRef(false);
  const spokenAt = useRef<number | null>(null);
  const bedRef = useRef<ReturnType<typeof startBreathBed> | null>(null);
  const beat = useMemo(() => beatAt(script, elapsed), [script, elapsed]);
  const done = elapsed >= script.durationSeconds;

  function finish(fromUnmount = false) {
    if (logged.current) return;
    if (fromUnmount && elapsedRef.current < 5) return;
    logged.current = true;
    hushVoice();
    bedRef.current?.stop();
    bedRef.current = null;
    onExit(elapsedRef.current, elapsedRef.current >= script.durationSeconds);
  }

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    const bed = startBreathBed();
    bedRef.current = bed;
    spokenAt.current = 0;
    void playGuide(id, 0);
    return () => {
      hushVoice();
      bed.stop();
      if (bedRef.current === bed) bedRef.current = null;
      finish(true);
    };
    // unmount-only logging; id change remounts this player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!running || done) {
      hushVoice();
      spokenAt.current = null;
      bedRef.current?.setPhase("rest");
      return;
    }
    bedRef.current?.setPhase(beat.breath ?? "rest");
    if (spokenAt.current === beat.atSeconds) return;
    spokenAt.current = beat.atSeconds;
    void playGuide(id, beat.atSeconds);
  }, [beat.atSeconds, beat.breath, running, done, id]);

  useEffect(() => {
    if (!running || done) return;
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, done]);

  const scale =
    beat.breath === "in" ? 1.22 : beat.breath === "hold" ? 1.22 : beat.breath === "out" ? 0.84 : 1;

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "relative mb-8 flex aspect-square w-full max-w-72 items-center justify-center rounded-full border border-violet-300/30 bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.4),rgba(14,12,28,0.15)_68%)] shadow-[0_0_80px_-10px_rgba(125,211,252,0.45)] transition-transform duration-[4000ms] ease-in-out",
        )}
        style={{ transform: `scale(${scale})` }}
      >
        <div className="absolute inset-8 rounded-full border border-sky-300/15" />
        <p className="relative px-8 text-center text-sm leading-relaxed text-zinc-100">{beat.text}</p>
      </div>
      <p className="text-xs text-zinc-500">
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} /{" "}
        {Math.floor(script.durationSeconds / 60)}:{String(script.durationSeconds % 60).padStart(2, "0")}
        {done ? " · done" : " · eyes can close"}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/15"
          onClick={() => setRunning((r) => !r)}
        >
          {running && !done ? "Pause" : "Resume"}
        </Button>
        <Button
          type="button"
          className="rounded-full bg-violet-400 text-zinc-950 hover:bg-violet-300"
          onClick={() => finish()}
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
  const elapsedRef = useRef(0);
  const logged = useRef(false);

  function finish(fromUnmount = false) {
    if (logged.current) return;
    if (fromUnmount && elapsedRef.current < 5) return;
    logged.current = true;
    stopAllSoundscapes();
    onExit(elapsedRef.current);
  }

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    const handle = startSoundscape(id);
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      handle.stop();
      window.clearInterval(timer);
      finish(true);
    };
    // unmount-only logging; id change remounts this player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="flex flex-col items-center py-6">
      <div className="mb-6 size-44 animate-pulse rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.4),transparent_70%)]" />
      <p className="text-sm text-zinc-200">{SOUNDSCAPES.find((s) => s.id === id)?.title}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · keep the phone face down
      </p>
      <Button
        type="button"
        className="mt-6 rounded-full bg-sky-300 text-zinc-950 hover:bg-sky-200"
        onClick={() => finish()}
      >
        Stop
      </Button>
    </div>
  );
}
