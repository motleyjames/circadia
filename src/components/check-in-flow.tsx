"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup, YesNo } from "@/components/bubbles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  LatencyBucket,
  MorningReport,
  NightWakingDuration,
  ScreenOffMinutes,
  SleepRating,
  SupplementKind,
  WindDownHelp,
} from "@/lib/types";
import { clockFromDate, formatClock, todayIsoDate } from "@/lib/time";

const SLEEP_TIMES = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"];
const WAKE_TIMES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "11:00", "12:00"];

export function CheckInFlow() {
  const router = useRouter();
  const { state, addReport } = useCircadia();
  const today = todayIsoDate();
  const existing = state.reports.find((r) => r.morningDate === today);
  const usedWindDown = state.sessions.some((s) => s.startedAt.slice(0, 10) === previousIso(today) || s.startedAt.slice(0, 10) === today);

  const [step, setStep] = useState(0);
  const [wokeAt, setWokeAt] = useState(existing?.wokeAt ?? clockFromDate(new Date()));
  const [fellAsleepAt, setFellAsleepAt] = useState(existing?.fellAsleepAt ?? state.profile?.targetSleep ?? "23:30");
  const [rating, setRating] = useState<SleepRating | undefined>(existing?.rating);
  const [drank, setDrank] = useState<boolean | undefined>(existing?.drank);
  const [drinkCount, setDrinkCount] = useState(existing?.drinkCount ?? 2);
  const [spins, setSpins] = useState<boolean | undefined>(existing?.spins);
  const [screenOffMinutes, setScreenOffMinutes] = useState<ScreenOffMinutes | undefined>(existing?.screenOffMinutes);
  const [sleepLatencyMinutes, setSleepLatencyMinutes] = useState<LatencyBucket | undefined>(existing?.sleepLatencyMinutes);
  const [wokeInNight, setWokeInNight] = useState<boolean | undefined>(existing?.wokeInNight);
  const [nightWakingMinutes, setNightWakingMinutes] = useState<NightWakingDuration>(existing?.nightWakingMinutes ?? 25);
  const [usedSupplement, setUsedSupplement] = useState<boolean | undefined>(existing?.usedSupplement);
  const [supplementKind, setSupplementKind] = useState<SupplementKind>(existing?.supplementKind ?? "melatonin");
  const [windDownHelped, setWindDownHelped] = useState<WindDownHelp | undefined>(
    existing?.windDownHelped ?? (usedWindDown ? undefined : "did_not_use"),
  );
  const [includeDream, setIncludeDream] = useState(Boolean(existing?.dream));
  const [dreamText, setDreamText] = useState(existing?.dream?.text ?? "");
  const [wantMeaning, setWantMeaning] = useState(existing?.dream?.wantMeaning ?? false);

  const units = state.profile?.units ?? "imperial";

  const steps = useMemo(() => {
    const list = ["wake", "asleep", "rating", "drink", "screens", "latency", "stay", "supp", "wind", "dream"] as const;
    return list;
  }, []);

  const current = steps[step];

  function canAdvance(): boolean {
    switch (current) {
      case "wake":
        return Boolean(wokeAt);
      case "asleep":
        return Boolean(fellAsleepAt);
      case "rating":
        return rating !== undefined;
      case "drink":
        if (drank === undefined) return false;
        if (drank && spins === undefined) return false;
        return true;
      case "screens":
        return screenOffMinutes !== undefined;
      case "latency":
        return sleepLatencyMinutes !== undefined;
      case "stay":
        return wokeInNight !== undefined;
      case "supp":
        return usedSupplement !== undefined;
      case "wind":
        return windDownHelped !== undefined;
      case "dream":
        return true;
    }
  }

  function save() {
    if (
      rating === undefined ||
      drank === undefined ||
      screenOffMinutes === undefined ||
      sleepLatencyMinutes === undefined ||
      wokeInNight === undefined ||
      usedSupplement === undefined ||
      windDownHelped === undefined
    ) {
      return;
    }
    const payload: Omit<MorningReport, "id" | "createdAt"> = {
      morningDate: today,
      wokeAt,
      fellAsleepAt,
      rating,
      drank,
      screenOffMinutes,
      sleepLatencyMinutes,
      wokeInNight,
      nightWakingMinutes: wokeInNight ? nightWakingMinutes : 0,
      usedSupplement,
      windDownHelped,
    };
    if (drank) {
      payload.drinkCount = drinkCount;
      payload.spins = spins;
    }
    if (usedSupplement) payload.supplementKind = supplementKind;
    if (includeDream && dreamText.trim()) {
      payload.dream = { text: dreamText.trim(), wantMeaning };
    }
    addReport(payload);
    router.push("/insights");
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-8 pb-6">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Morning interview</p>
      <h1 className="font-heading mt-1 text-2xl text-zinc-50">Forty seconds. Honest bubbles.</h1>
      <p className="mt-1 text-xs text-zinc-500">
        {today}
        {existing ? " · you can overwrite today’s log" : ""}
      </p>

      <div className="mt-6 mb-4 flex gap-1">
        {steps.map((key, i) => (
          <span
            key={key}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-violet-300/80" : "bg-white/10"}`}
          />
        ))}
      </div>

      <div className="flex-1">
        {current === "wake" ? (
          <Block title="When did you wake up?" hint="About is fine.">
            <BubbleGroup
              value={wokeAt}
              onChange={setWokeAt}
              columns={3}
              options={WAKE_TIMES.map((t) => ({ value: t, label: formatClock(t, units) }))}
            />
          </Block>
        ) : null}

        {current === "asleep" ? (
          <Block title="About when did you fall asleep?" hint="Not when you got into bed — when you actually dropped.">
            <BubbleGroup
              value={fellAsleepAt}
              onChange={setFellAsleepAt}
              columns={3}
              options={SLEEP_TIMES.map((t) => ({ value: t, label: formatClock(t, units) }))}
            />
          </Block>
        ) : null}

        {current === "rating" ? (
          <Block title="How did the night feel?" hint="1 wrecked · 5 restored">
            <BubbleGroup
              value={rating}
              onChange={setRating}
              columns={5}
              options={[1, 2, 3, 4, 5].map((n) => ({
                value: n as SleepRating,
                label: String(n),
              }))}
            />
          </Block>
        ) : null}

        {current === "drink" ? (
          <Block title="Did you drink last night?" hint="Alcohol. Not water.">
            <YesNo value={drank} onChange={setDrank} />
            {drank ? (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-zinc-400">How many?</p>
                <BubbleGroup
                  value={drinkCount}
                  onChange={setDrinkCount}
                  columns={5}
                  options={[1, 2, 3, 4, 5].map((n) => ({
                    value: n,
                    label: n === 5 ? "5+" : String(n),
                  }))}
                />
                <p className="text-xs text-zinc-400">Spins?</p>
                <YesNo value={spins} onChange={setSpins} />
              </div>
            ) : null}
          </Block>
        ) : null}

        {current === "screens" ? (
          <Block title="How long were you off screens before bed?" hint="About.">
            <BubbleGroup
              value={screenOffMinutes}
              onChange={setScreenOffMinutes}
              options={[
                { value: 0 as ScreenOffMinutes, label: "None", hint: "in bed with it" },
                { value: 15 as ScreenOffMinutes, label: "~15m" },
                { value: 30 as ScreenOffMinutes, label: "~30m" },
                { value: 45 as ScreenOffMinutes, label: "~45m" },
                { value: 60 as ScreenOffMinutes, label: "1h+" },
              ]}
            />
          </Block>
        ) : null}

        {current === "latency" ? (
          <Block title="How long did you lie awake before sleeping?" hint="About.">
            <BubbleGroup
              value={sleepLatencyMinutes}
              onChange={setSleepLatencyMinutes}
              options={[
                { value: 5 as LatencyBucket, label: "<10m" },
                { value: 15 as LatencyBucket, label: "10–20" },
                { value: 30 as LatencyBucket, label: "20–40" },
                { value: 50 as LatencyBucket, label: "40–60" },
                { value: 75 as LatencyBucket, label: "60+" },
              ]}
            />
          </Block>
        ) : null}

        {current === "stay" ? (
          <Block title="Did you wake in the night and struggle to fall back?" hint="Staying asleep, not a bathroom trip that was easy.">
            <YesNo value={wokeInNight} onChange={setWokeInNight} />
            {wokeInNight ? (
              <div className="mt-5">
                <p className="mb-2 text-xs text-zinc-400">About how long were you up?</p>
                <BubbleGroup
                  value={nightWakingMinutes}
                  onChange={setNightWakingMinutes}
                  options={[
                    { value: 10 as NightWakingDuration, label: "~10m" },
                    { value: 25 as NightWakingDuration, label: "~25m" },
                    { value: 45 as NightWakingDuration, label: "~45m" },
                    { value: 70 as NightWakingDuration, label: "1h+" },
                  ]}
                />
              </div>
            ) : null}
          </Block>
        ) : null}

        {current === "supp" ? (
          <Block title="Melatonin or magnesium last night?" hint="Only if you took it for this night.">
            <YesNo value={usedSupplement} onChange={setUsedSupplement} />
            {usedSupplement ? (
              <div className="mt-5">
                <p className="mb-2 text-xs text-zinc-400">Which?</p>
                <BubbleGroup
                  value={supplementKind}
                  onChange={setSupplementKind}
                  options={[
                    { value: "melatonin" as SupplementKind, label: "Melatonin" },
                    { value: "magnesium" as SupplementKind, label: "Magnesium" },
                    { value: "both" as SupplementKind, label: "Both" },
                    { value: "other" as SupplementKind, label: "Other" },
                  ]}
                />
              </div>
            ) : null}
          </Block>
        ) : null}

        {current === "wind" ? (
          <Block title="Did last night’s wind-down help?" hint="Meditation, noise, or neither.">
            <BubbleGroup
              value={windDownHelped}
              onChange={setWindDownHelped}
              options={[
                { value: "yes" as WindDownHelp, label: "Yes" },
                { value: "a_bit" as WindDownHelp, label: "A bit" },
                { value: "no" as WindDownHelp, label: "No" },
                { value: "did_not_use" as WindDownHelp, label: "Didn’t use" },
              ]}
            />
          </Block>
        ) : null}

        {current === "dream" ? (
          <Block title="Dream report — optional" hint="Skip if you do not care. Toggle meaning only if you want Circadia to look.">
            <YesNo value={includeDream} onChange={setIncludeDream} yesLabel="Add a dream" noLabel="Skip" />
            {includeDream ? (
              <div className="mt-4 space-y-3">
                <Textarea
                  value={dreamText}
                  onChange={(e) => setDreamText(e.target.value)}
                  placeholder="Whatever you remember. Fragments are enough."
                  className="min-h-28 rounded-2xl border-white/10 bg-white/5"
                />
                <div>
                  <p className="mb-2 text-xs text-zinc-400">Any meaning behind it?</p>
                  <YesNo value={wantMeaning} onChange={setWantMeaning} yesLabel="Look" noLabel="Just store it" />
                </div>
              </div>
            ) : null}
          </Block>
        ) : null}
      </div>

      <div className="mt-6 flex justify-between">
        <Button
          variant="ghost"
          className="rounded-full text-zinc-400"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button
            className="rounded-full bg-sky-300 px-5 text-zinc-950 hover:bg-sky-200"
            disabled={!canAdvance()}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : (
          <Button className="rounded-full bg-sky-300 px-5 text-zinc-950 hover:bg-sky-200" onClick={save}>
            Save night
          </Button>
        )}
      </div>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg text-zinc-50">{title}</h2>
      {hint ? <p className="mt-1 mb-4 text-xs text-zinc-500">{hint}</p> : <div className="mb-4" />}
      {children}
    </div>
  );
}

function previousIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
