"use client";

import { useMemo, useState } from "react";
import { BrandStage } from "@/components/brand-stage";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ensureNotificationPermission } from "@/lib/notifications";
import {
  formatClock,
  screenOffClock,
  sleepFromWake,
  sleepNeedHours,
  targetDurationMinutes,
} from "@/lib/time";
import type { Profile, Struggle } from "@/lib/types";
import { normalizeClock } from "@/lib/windows";
import { useCircadia } from "@/context/circadia-store";

type Phase = "earlier" | "neither" | "later";
type Problem = "falling" | "staying" | "both";

const PHASE_WAKE: Record<Phase, string> = {
  earlier: "06:30",
  neither: "07:00",
  later: "08:30",
};

const PROBLEMS: { id: Problem; title: string; body: string }[] = [
  {
    id: "falling",
    title: "Falling asleep",
    body: "Latency. The first hour is the problem.",
  },
  {
    id: "staying",
    title: "Staying asleep",
    body: "Middle-of-the-night wakes. Second half of the night.",
  },
  {
    id: "both",
    title: "Both",
    body: "Onset and maintenance. We treat them as different problems.",
  },
];

const PHASES: { id: Phase; title: string; body: string }[] = [
  {
    id: "earlier",
    title: "Earlier",
    body: "Alert in the morning. Evenings feel like a fight.",
  },
  {
    id: "neither",
    title: "Neither",
    body: "No strong pull either way.",
  },
  {
    id: "later",
    title: "Later",
    body: "The night is when you come online. Mornings cost you.",
  },
];

const INTAKE = [
  { kicker: "01", title: "The problem" },
  { kicker: "02", title: "Age" },
  { kicker: "03", title: "Wake time" },
  { kicker: "04", title: "What you take" },
  { kicker: "05", title: "Alerts" },
] as const;

export function Onboarding() {
  const { saveProfile } = useCircadia();
  const [cover, setCover] = useState(true);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<Problem>("falling");
  const [age, setAge] = useState("19");
  const [phase, setPhase] = useState<Phase>("neither");
  const [wakeTime, setWakeTime] = useState(PHASE_WAKE.neither);
  const [stimulant, setStimulant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageNum = Math.min(90, Math.max(13, Number(age) || 19));
  const duration = targetDurationMinutes(ageNum);
  const need = sleepNeedHours(ageNum);
  const targetSleep = useMemo(
    () => sleepFromWake(wakeTime || "07:00", duration),
    [wakeTime, duration],
  );
  const offClock = screenOffClock(targetSleep);

  function pickPhase(next: Phase) {
    setPhase(next);
    setWakeTime(PHASE_WAKE[next]);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const granted = await ensureNotificationPermission();
    const struggles: Struggle[] =
      problem === "both" ? ["falling", "staying"] : [problem];
    const med = stimulant.trim();
    const profile: Profile = {
      name: "you",
      age: ageNum,
      sex: "unspecified",
      heightCm: 175,
      weightKg: 70,
      activity: "light",
      medications: med ? [med] : [],
      supplements: [],
      struggles,
      targetSleep,
      targetWake: normalizeClock(wakeTime || "07:00"),
      units: "imperial",
      notificationsEnabled: granted,
      onboardingComplete: true,
    };
    saveProfile(profile);
  }

  if (cover) {
    return (
      <BrandStage
        cta={
          <button
            type="button"
            onClick={() => setCover(false)}
            className="h-14 w-full rounded-full bg-zinc-50 text-[15px] font-medium tracking-tight text-zinc-950"
          >
            Begin
          </button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
        <Mark className="size-5" />
        <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
          {INTAKE[step].kicker} / 05
        </p>
        <span className="size-5" aria-hidden />
      </header>

      <div className="px-6">
        <div className="flex gap-1.5">
          {INTAKE.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-px flex-1 rounded-full",
                i <= step ? "bg-zinc-100" : "bg-white/12",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-10 pb-4">
        <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
          {INTAKE[step].title}
        </p>

        {step === 0 && (
          <section className="mt-5">
            <h1 className="max-w-[18ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              What is actually broken.
            </h1>
            <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-zinc-400">
              Falling asleep and staying asleep are different physiology. We do not treat them as
              one complaint.
            </p>
            <ul className="mt-8 space-y-2">
              {PROBLEMS.map((s) => (
                <Choice
                  key={s.id}
                  selected={problem === s.id}
                  title={s.title}
                  body={s.body}
                  onSelect={() => setProblem(s.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {step === 1 && (
          <section className="mt-5">
            <h1 className="max-w-[16ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              Age sets the need band.
            </h1>
            <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
              Teens 8–10 hours. Young adults 7–9. Not a personality. Height and weight live in You
              if a note ever needs them.
            </p>
            <label className="mt-10 block">
              <span className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Age
              </span>
              <Input
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                className="mt-3 h-16 rounded-2xl border-white/10 bg-white/4 px-5 font-heading text-3xl text-zinc-50"
              />
            </label>
            <p className="mt-5 text-[13px] leading-relaxed text-zinc-500">{need.label}.</p>
          </section>
        )}

        {step === 2 && (
          <section className="mt-5">
            <h1 className="max-w-[16ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              The morning is the anchor.
            </h1>
            <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
              Not bedtime. AASM and CBT-I both start here: a wake time you protect even after a
              bad night. Asleep-by is computed from that.
            </p>
            <ul className="mt-8 space-y-2">
              {PHASES.map((c) => (
                <Choice
                  key={c.id}
                  selected={phase === c.id}
                  title={c.title}
                  body={c.body}
                  onSelect={() => pickPhase(c.id)}
                />
              ))}
            </ul>
            <label className="mt-8 block">
              <span className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Wake time
              </span>
              <Input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="mt-3 h-16 rounded-2xl border-white/10 bg-white/4 px-5 font-heading text-3xl text-zinc-50"
              />
            </label>
            <p className="mt-5 text-[13px] leading-relaxed text-zinc-500">
              Asleep-by {formatClock(targetSleep)}. Screens down {formatClock(offClock)}.{" "}
              {Math.round(duration / 60)}h window — you can move it in You.
            </p>
          </section>
        )}

        {step === 3 && (
          <section className="mt-5">
            <h1 className="max-w-[18ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              A stimulant is not a personality.
            </h1>
            <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
              If you take one, Circadia will never tell you to stop it. It becomes a constraint on
              bedtime and caffeine. Leave blank if none.
            </p>
            <Input
              value={stimulant}
              onChange={(e) => setStimulant(e.target.value)}
              placeholder="e.g. Adderall, Vyvanse — or blank"
              className="mt-10 h-14 rounded-2xl border-white/10 bg-white/4 px-5 text-zinc-50"
            />
          </section>
        )}

        {step === 4 && (
          <section className="mt-5">
            <h1 className="max-w-[16ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              One ping. One hour before bed.
            </h1>
            <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
              Circadia does not nag. The useful alert is screen-off. Allow it or skip — the
              countdown on Tonight still runs either way.
            </p>
            <p className="mt-8 border-t border-white/8 pt-6 text-[13px] leading-relaxed text-zinc-500">
              Local only. Nothing leaves this phone. After this: Safari or Chrome, Share, Add to
              Home Screen — if you want the chrome of an app. The product is already this.
            </p>
            {error ? <p className="mt-4 text-[13px] text-red-300">{error}</p> : null}
          </section>
        )}
      </div>

      <footer className="mt-auto flex gap-3 px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            if (step === 0) setCover(true);
            else setStep((s) => s - 1);
          }}
          className="h-14 min-w-24 rounded-full border border-white/12 px-6 text-[15px] font-medium text-zinc-200"
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="h-14 flex-1 rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              finish().catch(() => {
                setError("Could not finish setup. Try again.");
                setBusy(false);
              })
            }
            className="h-14 flex-1 rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Opening…" : "Open Circadia"}
          </button>
        )}
      </footer>
    </div>
  );
}

function Choice({
  selected,
  title,
  body,
  onSelect,
}: {
  selected: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
          selected ? "border-white/20 bg-white/6" : "border-transparent bg-white/[0.03]",
        )}
      >
        <p className="text-[15px] font-medium tracking-tight text-zinc-50">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{body}</p>
      </button>
    </li>
  );
}
