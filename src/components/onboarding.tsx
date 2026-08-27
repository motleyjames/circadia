"use client";

import { useMemo, useState } from "react";
import { BrandStage } from "@/components/brand-stage";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hasContact, normalizeEmail, normalizePhone } from "@/lib/contact";
import { ensureNotificationPermission } from "@/lib/notifications";
import {
  DEFAULT_HEIGHT_CM,
  DEFAULT_WEIGHT_KG,
  feetInchesToCm,
  formatClock,
  lbToKg,
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
  { kicker: "01", title: "Your file" },
  { kicker: "02", title: "The problem" },
  { kicker: "03", title: "Wake time" },
  { kicker: "04", title: "What you take" },
  { kicker: "05", title: "Alerts" },
] as const;

export function Onboarding() {
  const { saveProfile } = useCircadia();
  const [cover, setCover] = useState(true);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("19");
  const [feet, setFeet] = useState("5");
  const [inches, setInches] = useState("10");
  const [pounds, setPounds] = useState("145");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fileHint, setFileHint] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem>("falling");
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
  const fileReady =
    name.trim().length >= 2 &&
    Number(age) >= 13 &&
    hasContact(email, phone);

  function pickPhase(next: Phase) {
    setPhase(next);
    setWakeTime(PHASE_WAKE[next]);
  }

  function heightCm(): number {
    const cm = feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
    return cm >= 100 ? cm : DEFAULT_HEIGHT_CM;
  }

  function weightKg(): number {
    const kg = lbToKg(Number(pounds) || 0);
    return kg >= 30 ? kg : DEFAULT_WEIGHT_KG;
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const granted = await ensureNotificationPermission();
    const struggles: Struggle[] = problem === "both" ? ["falling", "staying"] : [problem];
    const med = stimulant.trim();
    const profile: Profile = {
      name: name.trim(),
      age: ageNum,
      sex: "unspecified",
      heightCm: heightCm(),
      weightKg: weightKg(),
      email: normalizeEmail(email),
      phone: normalizePhone(phone),
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
            className="h-14 w-full cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium tracking-tight text-zinc-950 transition-opacity hover:opacity-90"
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
              className={cn("h-px flex-1 rounded-full", i <= step ? "bg-zinc-100" : "bg-white/12")}
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
            <h1 className="max-w-[16ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              A diary needs a name.
            </h1>
            <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-zinc-400">
              Nights live on this computer. Email or phone is so the file can be found if this
              machine is wiped — not a login, not a newsletter.
            </p>

            <label className="mt-8 block">
              <span className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Name
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                placeholder="What we should call you"
                className="mt-3 h-14 rounded-2xl border-white/10 bg-white/4 px-5 text-lg text-zinc-50"
              />
            </label>

            <div className="mt-5 grid grid-cols-4 gap-2">
              <FileField label="Age" value={age} onChange={(v) => setAge(v.replace(/[^\d]/g, "").slice(0, 2))} />
              <FileField label="ft" value={feet} onChange={(v) => setFeet(v.replace(/[^\d]/g, "").slice(0, 1))} />
              <FileField label="in" value={inches} onChange={(v) => setInches(v.replace(/[^\d]/g, "").slice(0, 2))} />
              <FileField
                label="lb"
                value={pounds}
                onChange={(v) => setPounds(v.replace(/[^\d]/g, "").slice(0, 3))}
              />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">{need.label}.</p>

            <label className="mt-6 block">
              <span className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Email
              </span>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="one of these is enough"
                className="mt-3 h-12 rounded-2xl border-white/10 bg-white/4 px-5 text-zinc-50"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Phone
              </span>
              <Input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="or a number James can reach"
                className="mt-3 h-12 rounded-2xl border-white/10 bg-white/4 px-5 text-zinc-50"
              />
            </label>
            {fileHint ? <p className="mt-4 text-[13px] text-amber-200/90">{fileHint}</p> : null}
          </section>
        )}

        {step === 1 && (
          <section className="mt-5">
            <h1 className="max-w-[18ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              What is actually broken.
            </h1>
            <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-zinc-400">
              Falling asleep and staying asleep are different problems. We do not treat them as one
              complaint.
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

        {step === 2 && (
          <section className="mt-5">
            <h1 className="max-w-[16ch] font-heading text-[1.85rem] leading-[1.12] font-medium tracking-tight text-zinc-50">
              The morning is the anchor.
            </h1>
            <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
              Not bedtime. The time you get up trains the clock — even after a bad night. Asleep-by
              is figured from that.
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
              Next you choose whether nights can leave this computer. The diary itself stays here
              either way.
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
          className="h-14 min-w-24 cursor-pointer rounded-full border border-white/12 px-6 text-[15px] font-medium text-zinc-200"
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 0 && !fileReady) {
                setFileHint("Name, age, and an email or a phone. Height and weight can wait.");
                return;
              }
              setFileHint(null);
              setStep((s) => s + 1);
            }}
            className="h-14 flex-1 cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950"
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
            className="h-14 flex-1 cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Opening…" : "Open Circadia"}
          </button>
        )}
      </footer>
    </div>
  );
}

function FileField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
      {label}
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-3 text-center font-heading text-xl text-zinc-50"
      />
    </label>
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
          "w-full cursor-pointer rounded-2xl border px-4 py-4 text-left transition-colors",
          selected ? "border-white/20 bg-white/6" : "border-transparent bg-white/[0.03]",
        )}
      >
        <p className="text-[15px] font-medium tracking-tight text-zinc-50">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{body}</p>
      </button>
    </li>
  );
}
