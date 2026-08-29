"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup, YesNo } from "@/components/bubbles";
import { MorningFile } from "@/components/morning-file";
import { Input } from "@/components/ui/input";
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
import { reportForMorning } from "@/lib/morning-file";
import { formatMorningDate, shiftIsoDate } from "@/lib/schedule";
import { clockFromDate, formatClock, todayIsoDate } from "@/lib/time";
import { SLEEP_AID_QUESTION } from "@/lib/intake";

const SLEEP_TIMES = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"];
const WAKE_TIMES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "11:00", "12:00"];

export function CheckInFlow() {
  const { state, withdrawMorning } = useCircadia();
  const today = todayIsoDate();
  const existing = reportForMorning(state.reports, today);
  const [revising, setRevising] = useState(false);

  if (existing && !revising) {
    return (
      <MorningFile
        report={existing}
        units={state.profile?.units ?? "imperial"}
        demoWeek={state.demoWeek}
        onCorrect={() => setRevising(true)}
        onWithdraw={() => {
          if (
            !window.confirm(
              "Withdraw this morning’s page? You can file it again today. Other mornings stay.",
            )
          ) {
            return;
          }
          withdrawMorning(today);
        }}
      />
    );
  }

  return (
    <MorningInterview
      key={existing ? `revise-${existing.id}` : "fresh"}
      existing={existing}
      onCancel={existing ? () => setRevising(false) : undefined}
    />
  );
}

function MorningInterview({
  existing,
  onCancel,
}: {
  existing: MorningReport | null;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { state, addReport } = useCircadia();
  const today = todayIsoDate();
  const priorNight = shiftIsoDate(today, -1);
  const usedWindDown = state.sessions.some(
    (s) => s.startedAt.slice(0, 10) === priorNight || s.startedAt.slice(0, 10) === today,
  );

  const [step, setStep] = useState(0);
  const [wokeAt, setWokeAt] = useState(existing?.wokeAt ?? clockFromDate(new Date()));
  const [fellAsleepAt, setFellAsleepAt] = useState(existing?.fellAsleepAt ?? state.profile?.targetSleep ?? "23:30");
  const [rating, setRating] = useState<SleepRating | undefined>(existing?.rating);
  const [drank, setDrank] = useState<boolean | undefined>(existing?.drank);
  const [drinkCount, setDrinkCount] = useState<number | undefined>(existing?.drinkCount);
  const [spins, setSpins] = useState<boolean | undefined>(existing?.spins);
  const [screenOffMinutes, setScreenOffMinutes] = useState<ScreenOffMinutes | undefined>(existing?.screenOffMinutes);
  const [sleepLatencyMinutes, setSleepLatencyMinutes] = useState<LatencyBucket | undefined>(existing?.sleepLatencyMinutes);
  const [wokeInNight, setWokeInNight] = useState<boolean | undefined>(existing?.wokeInNight);
  const [nightWakingMinutes, setNightWakingMinutes] = useState<NightWakingDuration>(existing?.nightWakingMinutes ?? 25);
  const [usedSupplement, setUsedSupplement] = useState<boolean | undefined>(existing?.usedSupplement);
  const [supplementKind, setSupplementKind] = useState<SupplementKind | undefined>(existing?.supplementKind);
  const [supplementNote, setSupplementNote] = useState(existing?.supplementNote ?? "");
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
        if (drank && (spins === undefined || drinkCount === undefined)) return false;
        return true;
      case "screens":
        return screenOffMinutes !== undefined;
      case "latency":
        return sleepLatencyMinutes !== undefined;
      case "stay":
        return wokeInNight !== undefined;
      case "supp":
        if (usedSupplement === undefined) return false;
        if (!usedSupplement) return true;
        if (!supplementKind) return false;
        if (supplementKind === "other" && !supplementNote.trim()) return false;
        return true;
      case "wind":
        return windDownHelped !== undefined;
      case "dream":
        return true;
    }
  }

  function advance() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function save() {
    if (
      rating === undefined ||
      drank === undefined ||
      screenOffMinutes === undefined ||
      sleepLatencyMinutes === undefined ||
      wokeInNight === undefined ||
      usedSupplement === undefined ||
      (usedSupplement && !supplementKind) ||
      (usedSupplement && supplementKind === "other" && !supplementNote.trim()) ||
      windDownHelped === undefined ||
      (drank && (drinkCount === undefined || spins === undefined))
    ) {
      return;
    }
    // A fresh interview cannot write if today already has a page.
    // Revision is the only second pass, and it replaces — it does not append.
    if (!existing && reportForMorning(state.reports, today)) {
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
    if (usedSupplement && supplementKind === "other" && supplementNote.trim()) {
      payload.supplementNote = supplementNote.trim().slice(0, 80);
    }
    if (includeDream && dreamText.trim()) {
      payload.dream = { text: dreamText.trim(), wantMeaning };
    }
    addReport(payload);
    router.push("/insights");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-8 pb-3">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">
        {existing ? "Correcting this morning" : "Morning interview"}
      </p>
      <h1 className="font-heading mt-1 text-2xl text-zinc-50">
        {existing ? "Same date. New answers." : "Forty seconds. Honest bubbles."}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        {existing
          ? `${formatMorningDate(today)} · same page, new answers.`
          : `${formatMorningDate(today)} · one page.`}
      </p>

      <div className="mt-6 mb-4 flex gap-1">
        {steps.map((key, i) => (
          <span
            key={key}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-violet-300/80" : "bg-white/10"}`}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {current === "wake" ? (
          <Block title="When did you wake up?" hint="About is fine.">
            <BubbleGroup
              value={wokeAt}
              onChange={(v) => {
                setWokeAt(v);
                advance();
              }}
              columns={3}
              options={WAKE_TIMES.map((t) => ({ value: t, label: formatClock(t, units) }))}
            />
          </Block>
        ) : null}

        {current === "asleep" ? (
          <Block title="About when did you fall asleep?" hint="Not when you got into bed — when you actually dropped.">
            <BubbleGroup
              value={fellAsleepAt}
              onChange={(v) => {
                setFellAsleepAt(v);
                advance();
              }}
              columns={3}
              options={SLEEP_TIMES.map((t) => ({ value: t, label: formatClock(t, units) }))}
            />
          </Block>
        ) : null}

        {current === "rating" ? (
          <Block title="How did the night feel?" hint="1 wrecked · 5 restored">
            <BubbleGroup
              value={rating}
              onChange={(v) => {
                setRating(v);
                advance();
              }}
              columns={5}
              options={[1, 2, 3, 4, 5].map((n) => ({
                value: n as SleepRating,
                label: String(n),
              }))}
            />
          </Block>
        ) : null}

        {current === "drink" ? (
          <Block title="Did you drink last night?" hint="Alcohol. Not water. Follow-ups only if yes.">
            <YesNo
              value={drank}
              onChange={(v) => {
                setDrank(v);
                if (!v) {
                  setSpins(undefined);
                  advance();
                }
              }}
            />
            {drank ? (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-zinc-400">How many?</p>
                <BubbleGroup
                  value={drinkCount}
                  onChange={(n) => {
                    setDrinkCount(n);
                    if (spins !== undefined) advance();
                  }}
                  columns={5}
                  options={[1, 2, 3, 4, 5].map((n) => ({
                    value: n,
                    label: n === 5 ? "5+" : String(n),
                  }))}
                />
                <p className="text-xs text-zinc-400">Spins?</p>
                <YesNo
                  value={spins}
                  onChange={(v) => {
                    setSpins(v);
                    if (drinkCount !== undefined) advance();
                  }}
                />
              </div>
            ) : null}
          </Block>
        ) : null}

        {current === "screens" ? (
          <Block title="How long were you off screens before bed?" hint="About.">
            <BubbleGroup
              value={screenOffMinutes}
              onChange={(v) => {
                setScreenOffMinutes(v);
                advance();
              }}
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
              onChange={(v) => {
                setSleepLatencyMinutes(v);
                advance();
              }}
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
            <YesNo
              value={wokeInNight}
              onChange={(v) => {
                setWokeInNight(v);
                if (!v) advance();
              }}
            />
            {wokeInNight ? (
              <div className="mt-5">
                <p className="mb-2 text-xs text-zinc-400">About how long were you up?</p>
                <BubbleGroup
                  value={nightWakingMinutes}
                  onChange={(v) => {
                    setNightWakingMinutes(v);
                    advance();
                  }}
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
          <Block
            title={SLEEP_AID_QUESTION}
            hint="Anything you took for this night — a gummy, magnesium, Unisom. Not a daytime vitamin."
          >
            <YesNo
              value={usedSupplement}
              onChange={(v) => {
                setUsedSupplement(v);
                if (!v) {
                  setSupplementKind(undefined);
                  setSupplementNote("");
                  advance();
                }
              }}
            />
            {usedSupplement ? (
              <div className="mt-5">
                <p className="mb-2 text-xs text-zinc-400">Which?</p>
                <BubbleGroup
                  value={supplementKind}
                  onChange={(v) => {
                    setSupplementKind(v);
                    if (v !== "other") {
                      setSupplementNote("");
                      advance();
                    }
                  }}
                  options={[
                    { value: "melatonin" as SupplementKind, label: "Melatonin" },
                    { value: "magnesium" as SupplementKind, label: "Magnesium" },
                    { value: "both" as SupplementKind, label: "Both of those" },
                    { value: "antihistamine" as SupplementKind, label: "Unisom-type" },
                    { value: "other" as SupplementKind, label: "Something else" },
                  ]}
                />
                {supplementKind === "other" ? (
                  <label className="mt-4 block">
                    <span className="text-xs text-zinc-400">What was it?</span>
                    <Input
                      value={supplementNote}
                      onChange={(e) => setSupplementNote(e.target.value.slice(0, 80))}
                      placeholder="Name is fine. Stays on this computer."
                      className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-zinc-50"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
          </Block>
        ) : null}

        {current === "wind" ? (
          <Block title="Did last night’s wind-down help?" hint="Meditation, noise, or neither.">
            <BubbleGroup
              value={windDownHelped}
              onChange={(v) => {
                setWindDownHelped(v);
                advance();
              }}
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

      <div className="flex shrink-0 items-center justify-between border-t border-white/5 pt-3">
        <button
          type="button"
          className="rounded-full px-4 py-2 text-sm text-zinc-400 disabled:opacity-30"
          disabled={step === 0 && !onCancel}
          onClick={() => {
            if (step === 0 && onCancel) {
              onCancel();
              return;
            }
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          {step === 0 && onCancel ? "Cancel" : "Back"}
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="rounded-full bg-sky-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-40"
            disabled={!canAdvance()}
            onClick={advance}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="rounded-full bg-sky-300 px-5 py-2.5 text-sm font-medium text-zinc-950"
            onClick={save}
          >
            {existing ? "Save this page" : "File this morning"}
          </button>
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
