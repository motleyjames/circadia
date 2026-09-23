"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DiaryLink } from "@/components/diary-tab-link";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup } from "@/components/bubbles";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NightBar } from "@/components/night-bar";
import { backfillableDates } from "@/lib/backfill";
import { episodeNightOf } from "@/lib/episode";
import {
  AWAKENING_CHIPS,
  AWAKENING_QUESTION,
  CLOCK_WATCHING_SENTENCE,
  CONTEXT_QUESTION,
  DURATION_CHIPS,
  DRINK_CHIPS,
  emptyMorningContext,
  fileMorningReport,
  LATENCY_QUESTION,
  NAP_CHIPS,
  RATING_CHIPS,
  RATING_QUESTION,
  SLEEP_AID_CHIPS,
  WASO_QUESTION,
  afterFileHeadline,
  afterFileNote,
  type MorningContext,
  type MorningContextChip,
} from "@/lib/morning-diary";
import { clocksInOrder, usualNightClocks, type NightClocks } from "@/lib/night-clocks";
import type {
  AwakeningCount,
  LatencyBucket,
  MorningDraft,
  NightWakingDuration,
  SleepRating,
} from "@/lib/types";
import { reportForMorning } from "@/lib/morning-file";
import { formatMorningDate } from "@/lib/schedule";
import { todayIsoDate } from "@/lib/time";
import { hapticLight, hapticSelect } from "@/lib/haptics";

const STEPS = ["night", "latency", "stay", "rating", "context"] as const;

export function CheckInFlow() {
  const { state, withdrawMorning, saveMorningDraft } = useCircadia();
  const [today] = useState(() => todayIsoDate());
  const existing = reportForMorning(state.reports, today);
  const missed = backfillableDates(today, state.reports, state.episode);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [filingDate, setFilingDate] = useState<string | null>(null);
  const [interviewKey, setInterviewKey] = useState(0);
  const late = Boolean(filingDate);
  const interviewDate = filingDate ?? today;

  return (
    <>
      {existing && !late ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <AfterFile
            morningDate={today}
            onWithdraw={() => setWithdrawOpen(true)}
          />
          <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <MissedMornings dates={missed} onPick={setFilingDate} />
          </div>
        </div>
      ) : (
        <MorningInterview
          key={late ? `late-${interviewDate}-${interviewKey}` : `fresh-${interviewKey}`}
          morningDate={interviewDate}
          filedLate={late}
          missedDates={late ? [] : missed}
          onPickMissed={setFilingDate}
          onDiscardDraft={() => {
            saveMorningDraft(null);
            setFilingDate(null);
            setInterviewKey((n) => n + 1);
          }}
          onCancel={late ? () => setFilingDate(null) : undefined}
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
  morningDate,
  filedLate,
  missedDates,
  onPickMissed,
  onDiscardDraft,
  onCancel,
}: {
  morningDate: string;
  filedLate: boolean;
  missedDates: string[];
  onPickMissed: (date: string) => void;
  onDiscardDraft: () => void;
  onCancel?: () => void;
}) {
  const { state, addReport, saveMorningDraft } = useCircadia();
  const stored = state.morningDraft?.morningDate === morningDate ? state.morningDraft : null;
  const closed = useRef(false);
  const startedAt = useRef(stored?.morningStartedAt ?? Date.now());
  const usual = usualNightClocks(state.profile?.targetSleep ?? "23:00", state.profile?.targetWake ?? "07:00");

  const [step, setStep] = useState(stored?.step ?? 0);
  const [clocks, setClocks] = useState<NightClocks>(() => ({
    inBedAt: stored?.inBedAt ?? usual.inBedAt,
    triedToSleepAt: stored?.triedToSleepAt ?? usual.triedToSleepAt,
    wokeAt: stored?.wokeAt ?? usual.wokeAt,
    outOfBedAt: stored?.outOfBedAt ?? usual.outOfBedAt,
  }));
  const [sleepLatencyMinutes, setSleepLatencyMinutes] = useState<LatencyBucket | undefined>(
    stored?.sleepLatencyMinutes,
  );
  const [awakeningCount, setAwakeningCount] = useState<AwakeningCount | undefined>(
    stored?.awakeningCount,
  );
  const [nightWakingMinutes, setNightWakingMinutes] = useState<NightWakingDuration | undefined>(
    stored?.nightWakingMinutes,
  );
  const [rating, setRating] = useState<SleepRating | undefined>(stored?.rating);
  const [context, setContext] = useState<MorningContext>(() => ({
    ...emptyMorningContext(),
    napMinutes: stored?.napMinutes,
    drank: stored?.drank ?? false,
    drinkCount: stored?.drinkCount === 1 || stored?.drinkCount === 2 || stored?.drinkCount === 3 || stored?.drinkCount === 4
      ? stored.drinkCount
      : undefined,
    caffeineAfter2pm: stored?.caffeineAfter2pm,
    usedSupplement: stored?.usedSupplement ?? false,
    supplementKind: stored?.supplementKind,
  }));
  const [followUp, setFollowUp] = useState<MorningContextChip | null>(null);
  const pickingUp = Boolean(stored && (stored.step > 0 || stored.rating !== undefined || stored.inBedAt));
  const units = state.profile?.units ?? "imperial";
  const current = STEPS[Math.min(step, STEPS.length - 1)];

  useEffect(() => {
    if (closed.current) return;
    const draft: MorningDraft = { morningDate, step, morningStartedAt: startedAt.current };
    draft.inBedAt = clocks.inBedAt;
    draft.triedToSleepAt = clocks.triedToSleepAt;
    draft.wokeAt = clocks.wokeAt;
    draft.outOfBedAt = clocks.outOfBedAt;
    if (sleepLatencyMinutes !== undefined) draft.sleepLatencyMinutes = sleepLatencyMinutes;
    if (awakeningCount !== undefined) draft.awakeningCount = awakeningCount;
    if (nightWakingMinutes !== undefined) draft.nightWakingMinutes = nightWakingMinutes;
    if (rating !== undefined) draft.rating = rating;
    if (context.napMinutes !== undefined) draft.napMinutes = context.napMinutes;
    draft.drank = context.drank;
    if (context.drinkCount !== undefined) draft.drinkCount = context.drinkCount;
    if (context.caffeineAfter2pm !== undefined) draft.caffeineAfter2pm = context.caffeineAfter2pm;
    draft.usedSupplement = context.usedSupplement;
    if (context.supplementKind) draft.supplementKind = context.supplementKind;
    saveMorningDraft(draft);
  }, [
    awakeningCount,
    clocks.inBedAt,
    clocks.outOfBedAt,
    clocks.triedToSleepAt,
    clocks.wokeAt,
    context,
    morningDate,
    nightWakingMinutes,
    rating,
    saveMorningDraft,
    sleepLatencyMinutes,
    step,
  ]);

  function file(nextContext: MorningContext) {
    if (sleepLatencyMinutes === undefined || awakeningCount === undefined || rating === undefined) return;
    if (awakeningCount > 0 && nightWakingMinutes === undefined) return;
    if (!existingGuard()) return;
    closed.current = true;
    addReport(
      fileMorningReport({
        morningDate,
        clocks,
        sleepLatencyMinutes,
        awakeningCount,
        nightWakingMinutes,
        rating,
        context: nextContext,
        filedLate,
        morningSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      }),
    );
    void hapticLight();
  }

  function existingGuard(): boolean {
    if (reportForMorning(state.reports, morningDate)) {
      setSaveError("This morning is already filed.");
      return false;
    }
    return true;
  }

  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <div className="phone-page-y flex min-h-0 flex-1 flex-col px-5 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">
        {filedLate ? "Missed morning" : "Your night"}
      </p>
      <h1 className="font-heading mt-1 text-2xl text-zinc-50">
        {filedLate ? "From memory. Marked as late so the grid can tell." : "Your night."}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        {filedLate ? `${formatMorningDate(morningDate)} · filed late.` : formatMorningDate(morningDate)}
      </p>
      {pickingUp ? (
        <p className="mt-3 text-[13px] leading-relaxed text-sky-200/90">Picking up where you left off.</p>
      ) : null}
      {!filedLate ? <MissedMornings dates={missedDates} onPick={onPickMissed} /> : null}
      {!filedLate && state.reports.length === 0 ? (
        <p className="mt-3 max-w-[44ch] text-[12px] leading-relaxed text-zinc-500">
          Already filed on the other Somnadia?{" "}
          <DiaryLink href="/you" className="text-zinc-300">
            Fold a locked copy in You
          </DiaryLink>
          . This file does not see the other one by itself.
        </p>
      ) : null}

      <div className="mt-6 mb-4 flex gap-1">
        {STEPS.map((key, i) => (
          <span key={key} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-violet-300/80" : "bg-white/10"}`} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {current === "night" ? (
          <div>
            <NightBar clocks={clocks} units={units} onChange={setClocks} />
            <button
              type="button"
              className="mt-6 w-full rounded-full bg-sky-300 px-5 py-3 text-[17px] font-semibold text-zinc-950"
              onClick={() => {
                void hapticSelect();
                setClocks(usual);
                setStep(1);
              }}
            >
              Same as usual
            </button>
          </div>
        ) : null}

        {current === "latency" ? (
          <Block title={LATENCY_QUESTION} hint={CLOCK_WATCHING_SENTENCE}>
            <BubbleGroup
              value={sleepLatencyMinutes}
              onChange={(v) => {
                setSleepLatencyMinutes(v);
                setStep(2);
              }}
              options={DURATION_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
            />
          </Block>
        ) : null}

        {current === "stay" ? (
          <Block title={AWAKENING_QUESTION}>
            <BubbleGroup
              value={awakeningCount}
              onChange={(v) => {
                setAwakeningCount(v);
                if (v === 0) {
                  setNightWakingMinutes(0);
                  setStep(3);
                }
              }}
              columns={3}
              options={AWAKENING_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
            />
            {awakeningCount !== undefined && awakeningCount > 0 ? (
              <div className="mt-6">
                <h3 className="mb-3 text-lg text-zinc-50">{WASO_QUESTION}</h3>
                <BubbleGroup
                  value={nightWakingMinutes}
                  onChange={(v) => {
                    setNightWakingMinutes(v);
                    setStep(3);
                  }}
                  options={DURATION_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
                />
              </div>
            ) : null}
          </Block>
        ) : null}

        {current === "rating" ? (
          <Block title={RATING_QUESTION}>
            <BubbleGroup
              value={rating}
              onChange={(v) => {
                setRating(v);
                setStep(4);
              }}
              options={RATING_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
            />
          </Block>
        ) : null}

        {current === "context" ? (
          <Block title={CONTEXT_QUESTION}>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["nap", "Nap"],
                  ["alcohol", "Alcohol"],
                  ["caffeine", "Caffeine after 2 pm"],
                  ["aid", "Sleep aid"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-full border px-4 py-2 text-[15px] ${
                    followUp === id ? "border-sky-300 bg-sky-300/15 text-sky-100" : "border-white/12 text-zinc-100"
                  }`}
                  onClick={() => {
                    void hapticSelect();
                    setFollowUp(id);
                    if (id === "caffeine") {
                      setContext((prev) => ({ ...prev, caffeineAfter2pm: true }));
                    }
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="rounded-full border border-white/12 px-4 py-2 text-[15px] text-zinc-100"
                onClick={() => {
                  void hapticSelect();
                  file(emptyMorningContext());
                }}
              >
                Nothing
              </button>
            </div>
            {followUp === "nap" ? (
              <div className="mt-5">
                <BubbleGroup
                  value={context.napMinutes}
                  onChange={(v) => setContext((prev) => ({ ...prev, napMinutes: v }))}
                  options={NAP_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
                />
              </div>
            ) : null}
            {followUp === "alcohol" ? (
              <div className="mt-5">
                <BubbleGroup
                  value={context.drinkCount}
                  onChange={(v) => setContext((prev) => ({ ...prev, drank: true, drinkCount: v }))}
                  columns={4}
                  options={DRINK_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
                />
              </div>
            ) : null}
            {followUp === "aid" ? (
              <div className="mt-5">
                <BubbleGroup
                  value={context.supplementKind}
                  onChange={(v) => setContext((prev) => ({ ...prev, usedSupplement: true, supplementKind: v }))}
                  options={SLEEP_AID_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
                />
              </div>
            ) : null}
            {followUp ? (
              <button
                type="button"
                className="mt-6 w-full rounded-full bg-sky-300 px-5 py-3 text-[17px] font-semibold text-zinc-950"
                onClick={() => {
                  void hapticSelect();
                  file(context);
                }}
              >
                Done
              </button>
            ) : null}
          </Block>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-[#0b0914]/70 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-2xl">
        <button
          type="button"
          className="rounded-full px-4 py-2 text-[17px] text-sky-300 disabled:opacity-30"
          disabled={step === 0 && !onCancel && !pickingUp}
          onClick={() => {
            void hapticSelect();
            if (step === 0 && onCancel) {
              onCancel();
              return;
            }
            setFollowUp(null);
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          {step === 0 && onCancel ? "Cancel" : "Back"}
        </button>
        {pickingUp ? (
          <button
            type="button"
            className="rounded-full px-4 py-2 text-[15px] text-zinc-400"
            onClick={() => {
              void hapticSelect();
              closed.current = true;
              onDiscardDraft();
            }}
          >
            Discard draft
          </button>
        ) : null}
        {current === "night" ? (
          <button
            type="button"
            className="rounded-full bg-sky-300 px-5 py-2.5 text-[17px] font-semibold text-zinc-950 disabled:opacity-40"
            disabled={!clocksInOrder(clocks)}
            onClick={() => {
              void hapticSelect();
              setStep(1);
            }}
          >
            Next
          </button>
        ) : (
          <span />
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

function AfterFile({
  morningDate,
  onWithdraw,
}: {
  morningDate: string;
  onWithdraw: () => void;
}) {
  const { state } = useCircadia();
  const episodeNight = state.episode ? episodeNightOf(state.episode.enrolledAt, morningDate) : null;
  const headline = afterFileHeadline(episodeNight);
  const note = afterFileNote(episodeNight);
  const filled = useMemo(() => {
    const slots = Array.from({ length: 14 }, () => false);
    if (!state.episode) return slots;
    for (const report of state.reports) {
      const n = episodeNightOf(state.episode.enrolledAt, report.morningDate);
      if (n !== null && n >= 0 && n < 14) slots[n] = true;
    }
    return slots;
  }, [state.episode, state.reports]);

  return (
    <div className="phone-page-y flex min-h-0 flex-1 flex-col px-5 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Morning</p>
      <h1 className="font-heading mt-2 text-3xl text-zinc-50">{headline}</h1>
      {state.episode && episodeNight !== null && episodeNight >= 0 && episodeNight < 14 ? (
        <div className="mt-6 flex gap-1.5" aria-hidden>
          {filled.map((on, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${on ? "bg-sky-300/80" : "bg-white/10"}`} />
          ))}
        </div>
      ) : null}
      {note ? <p className="mt-5 text-[17px] leading-relaxed text-zinc-300">{note}</p> : null}
      <button
        type="button"
        className="mt-auto mb-[max(1rem,env(safe-area-inset-bottom))] self-start text-[13px] text-zinc-500"
        onClick={onWithdraw}
      >
        Withdraw this morning
      </button>
    </div>
  );
}

function MissedMornings({ dates, onPick }: { dates: string[]; onPick: (date: string) => void }) {
  if (dates.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-[12px] text-zinc-500">Missed a morning? File it from memory. It will be marked late.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            className="rounded-full border border-white/12 px-3 py-1.5 text-[13px] text-zinc-200"
            onClick={() => {
              void hapticSelect();
              onPick(date);
            }}
          >
            {formatMorningDate(date)}
          </button>
        ))}
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
