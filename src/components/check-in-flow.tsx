"use client";

import { useMemo, useState } from "react";
import { DiaryLink } from "@/components/diary-tab-link";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup, YesNo } from "@/components/bubbles";
import { MorningFile } from "@/components/morning-file";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AwakeningCount,
  LatencyBucket,
  MorningReport,
  NapMinutes,
  NightWakingDuration,
  ScreenOffMinutes,
  SleepRating,
  SupplementKind,
  WindDownHelp,
} from "@/lib/types";
import { reportForMorning } from "@/lib/morning-file";
import { formatMorningDate, shiftIsoDate } from "@/lib/schedule";
import { addMinutesToClock, clockFromDate, formatClock, overnightDuration, todayIsoDate } from "@/lib/time";
import { SLEEP_AID_QUESTION } from "@/lib/intake";
import { hapticLight, hapticSelect } from "@/lib/haptics";
import { navigateDiary } from "@/lib/diary-route";

const SLEEP_TIMES = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"];
const WAKE_TIMES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "11:00", "12:00"];
const BED_TIMES = ["21:00", "21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "02:30"];
/** Minutes after the final awakening. "Straight away" is the common answer. */
const GET_UP_DELAYS = [0, 10, 20, 45, 90] as const;

export function CheckInFlow() {
  const { state, withdrawMorning } = useCircadia();
  // Captured once. This was `todayIsoDate()` evaluated on every render, so an
  // interview begun before midnight and finished after it was written to the next
  // day — mis-attributing the night and permanently blocking the real morning.
  const [today] = useState(() => todayIsoDate());
  const existing = reportForMorning(state.reports, today);
  const [revising, setRevising] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  return (
    <>
      {existing && !revising ? (
        <MorningFile
          report={existing}
          units={state.profile?.units ?? "imperial"}
          demoWeek={state.demoWeek}
          onCorrect={() => setRevising(true)}
          onWithdraw={() => setWithdrawOpen(true)}
        />
      ) : (
        <MorningInterview
          key={existing ? `revise-${existing.id}` : "fresh"}
          existing={existing}
          onCancel={existing ? () => setRevising(false) : undefined}
        />
      )}
      <ConfirmDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        title="Withdraw this morning"
        description="You can file it again today. Other mornings stay."
        confirmLabel="Withdraw"
        destructive
        onConfirm={() => withdrawMorning(today)}
      />
    </>
  );
}

function MorningInterview({
  existing,
  onCancel,
}: {
  existing: MorningReport | null;
  onCancel?: () => void;
}) {
  const { state, addReport } = useCircadia();
  const today = todayIsoDate();
  const priorNight = shiftIsoDate(today, -1);
  const usedWindDown = state.sessions.some(
    (s) => s.startedAt.slice(0, 10) === priorNight || s.startedAt.slice(0, 10) === today,
  );

  // Bedtime barely moves for most people, so last night's answer is offered as the
  // default rather than asked cold. Confirm-or-correct is the whole tap budget.
  const lastNight = useMemo(
    () => [...state.reports].sort((a, b) => a.morningDate.localeCompare(b.morningDate)).at(-1),
    [state.reports],
  );

  const [step, setStep] = useState(0);
  const [wokeAt, setWokeAt] = useState(existing?.wokeAt ?? clockFromDate(new Date()));
  // Consensus Sleep Diary geometry. `fellAsleepAt` is no longer asked — nobody can
  // report the clock time they fell asleep, and asking teaches clock-watching. It
  // is derived from lights-out plus latency at save time.
  const [inBedAt, setInBedAt] = useState(existing?.inBedAt ?? lastNight?.inBedAt ?? state.profile?.targetSleep ?? "23:00");
  const [lightsOutSame, setLightsOutSame] = useState(
    existing ? (existing.triedToSleepAt ?? existing.inBedAt) === existing.inBedAt : true,
  );
  const [triedToSleepAt, setTriedToSleepAt] = useState(existing?.triedToSleepAt ?? existing?.inBedAt ?? state.profile?.targetSleep ?? "23:00");
  const [getUpDelay, setGetUpDelay] = useState<number | undefined>(
    existing?.outOfBedAt ? overnightDuration(existing.wokeAt, existing.outOfBedAt) : undefined,
  );
  const [awakeningCount, setAwakeningCount] = useState<AwakeningCount | undefined>(existing?.awakeningCount);
  const [napMinutes, setNapMinutes] = useState<NapMinutes | undefined>(existing?.napMinutes);
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
    // In the order the night happened — recall is markedly better that way than
    // jumping around the clock.
    const list = ["bed", "latency", "stay", "wake", "up", "rating", "nap", "drink", "screens", "supp", "wind", "dream"] as const;
    return list;
  }, []);

  const current = steps[step];

  function canAdvance(): boolean {
    switch (current) {
      case "wake":
        return Boolean(wokeAt);
      case "bed":
        return Boolean(inBedAt) && (lightsOutSame || Boolean(triedToSleepAt));
      case "up":
        return getUpDelay !== undefined;
      case "nap":
        return napMinutes !== undefined;
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
        if (wokeInNight === undefined) return false;
        // Count and duration are different clinical facts: one 90-minute waking is
        // not five 18-minute ones. Only asked when there was a waking.
        if (wokeInNight && awakeningCount === undefined) return false;
        return true;
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

  const [saveError, setSaveError] = useState<string | null>(null);

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
      getUpDelay === undefined ||
      napMinutes === undefined ||
      (wokeInNight && awakeningCount === undefined) ||
      (drank && (drinkCount === undefined || spins === undefined))
    ) {
      setSaveError("Something above is still blank. Step back and finish it, then file.");
      return;
    }
    // A fresh interview cannot write if today already has a page.
    // Revision is the only second pass, and it replaces — it does not append.
    if (!existing && reportForMorning(state.reports, today)) {
      setSaveError("This morning is already filed. Open it from Notes to change an answer.");
      return;
    }
    setSaveError(null);
    const lightsOut = lightsOutSame ? inBedAt : triedToSleepAt;
    const payload: Omit<MorningReport, "id" | "createdAt"> = {
      morningDate: today,
      wokeAt,
      // Derived, not asked. Lights-out plus how long it took.
      fellAsleepAt: addMinutesToClock(lightsOut, sleepLatencyMinutes),
      inBedAt,
      triedToSleepAt: lightsOut,
      outOfBedAt: addMinutesToClock(wokeAt, getUpDelay),
      awakeningCount: wokeInNight ? awakeningCount : 0,
      napMinutes,
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
    void hapticLight();
    navigateDiary("/insights");
  }

  return (
    <div className="phone-page-y flex min-h-0 flex-1 flex-col px-5 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">
        {existing ? "Correcting this morning" : "Morning interview"}
      </p>
      <h1 className="font-heading mt-1 text-2xl text-zinc-50">
        {existing ? "Same date. New answers." : "About forty seconds. Rough answers are fine — close beats exact."}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        {existing
          ? `${formatMorningDate(today)} · same page, new answers.`
          : `${formatMorningDate(today)} · one page.`}
      </p>
      {!existing && state.reports.length === 0 ? (
        <p className="mt-3 max-w-[44ch] text-[12px] leading-relaxed text-zinc-500">
          Already filed on the other Circadia?{" "}
          <DiaryLink href="/you" className="text-zinc-300">
            Fold a locked copy in You
          </DiaryLink>
          . This file does not see the other one by itself.
        </p>
      ) : null}

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

        {current === "bed" ? (
          <Block
            title="What time did you get into bed?"
            hint={lastNight?.inBedAt ? `Last night you said ${formatClock(lastNight.inBedAt, units)}. Tap to keep it or pick another.` : "Getting in — not falling asleep."}
          >
            <div className="space-y-4">
              <BubbleGroup
                value={inBedAt}
                onChange={(v) => {
                  setInBedAt(v);
                  if (lightsOutSame) setTriedToSleepAt(v);
                }}
                columns={3}
                options={BED_TIMES.map((t) => ({ value: t, label: formatClock(t, units) }))}
              />
              <p className="text-xs text-zinc-400">Did you try to sleep straight away?</p>
              <YesNo
                value={lightsOutSame}
                onChange={(v) => {
                  setLightsOutSame(v);
                  if (v) {
                    setTriedToSleepAt(inBedAt);
                    advance();
                  }
                }}
                yesLabel="Straight away"
                noLabel="Read or watched first"
              />
              {lightsOutSame ? null : (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Lights out at?</p>
                  <BubbleGroup
                    value={triedToSleepAt}
                    onChange={(v) => {
                      setTriedToSleepAt(v);
                      advance();
                    }}
                    columns={3}
                    options={SLEEP_TIMES.map((t) => ({ value: t, label: formatClock(t, units) }))}
                  />
                </div>
              )}
            </div>
          </Block>
        ) : null}

        {current === "up" ? (
          <Block
            title="And when did you get out of bed?"
            hint="Time lying there after waking counts against you, so it is worth being honest."
          >
            <BubbleGroup
              value={getUpDelay}
              onChange={(v) => {
                setGetUpDelay(v);
                advance();
              }}
              columns={2}
              options={GET_UP_DELAYS.map((m) => ({
                value: m as number,
                label: m === 0 ? "Straight away" : `${m} min later`,
                hint: formatClock(addMinutesToClock(wokeAt, m), units),
              }))}
            />
          </Block>
        ) : null}

        {current === "nap" ? (
          <Block title="Did you nap yesterday?" hint="Naps change how much sleep pressure you brought to the night.">
            <BubbleGroup
              value={napMinutes}
              onChange={(v) => {
                setNapMinutes(v);
                advance();
              }}
              columns={2}
              options={[
                { value: 0 as NapMinutes, label: "No nap" },
                { value: 20 as NapMinutes, label: "About 20 min" },
                { value: 45 as NapMinutes, label: "About 45 min" },
                { value: 90 as NapMinutes, label: "An hour or more" },
              ]}
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
              <div className="mt-5 space-y-5">
                <div>
                  {/* Count and duration are separate facts. One long waking and five
                      short ones are different nights, and only the count says which. */}
                  <p className="mb-2 text-xs text-zinc-400">How many times?</p>
                  <BubbleGroup
                    value={awakeningCount}
                    onChange={setAwakeningCount}
                    columns={4}
                    options={[
                      { value: 1 as AwakeningCount, label: "Once" },
                      { value: 2 as AwakeningCount, label: "Twice" },
                      { value: 3 as AwakeningCount, label: "3" },
                      { value: 4 as AwakeningCount, label: "4+" },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs text-zinc-400">Awake for how long in total?</p>
                  <BubbleGroup
                    value={nightWakingMinutes}
                    onChange={(v) => {
                      setNightWakingMinutes(v);
                      if (awakeningCount !== undefined) advance();
                    }}
                    options={[
                      { value: 10 as NightWakingDuration, label: "~10m" },
                      { value: 25 as NightWakingDuration, label: "~25m" },
                      { value: 45 as NightWakingDuration, label: "~45m" },
                      { value: 70 as NightWakingDuration, label: "1h+" },
                    ]}
                  />
                </div>
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
                      placeholder="Name is fine. Stays on this device."
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

      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-[#0b0914]/70 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-2xl">
        <button
          type="button"
          className="rounded-full px-4 py-2 text-[17px] text-sky-300 disabled:opacity-30"
          disabled={step === 0 && !onCancel}
          onClick={() => {
            void hapticSelect();
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
            className="rounded-full bg-sky-300 px-5 py-2.5 text-[17px] font-semibold text-zinc-950 disabled:opacity-40"
            disabled={!canAdvance()}
            onClick={() => {
              void hapticSelect();
              advance();
            }}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="rounded-full btn-primary px-5 py-2.5 text-[17px] font-semibold"
            onClick={save}
          >
            {existing ? "Save this page" : "File this morning"}
          </button>
        )}
      </div>
      {saveError ? (
        <p role="alert" className="mt-3 px-1 text-[13px] leading-relaxed text-amber-200">
          {saveError}
        </p>
      ) : null}
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
