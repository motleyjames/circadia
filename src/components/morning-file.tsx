"use client";

import { DiaryLink } from "@/components/diary-tab-link";
import type { MorningReport, SleepRating, Units } from "@/lib/types";
import { filedNight } from "@/lib/morning-file";
import { cn } from "@/lib/utils";

export function MorningFile({
  report,
  units,
  demoWeek,
  onCorrect,
  onWithdraw,
}: {
  report: MorningReport;
  units: Units;
  demoWeek: boolean;
  onCorrect: () => void;
  onWithdraw: () => void;
}) {
  const night = filedNight(report, units);

  return (
    <div className="phone-page-y flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-12 md:pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-[22rem]">
        <p className="text-center text-[12px] text-zinc-500">{night.dateLabel}</p>
        <p className="font-heading mt-4 text-center text-[3.4rem] leading-none tracking-tight text-zinc-50">
          {night.durationLabel}
        </p>
        <p className="mt-3 text-center text-[14px] text-zinc-400">
          {night.asleepLabel}
          <span className="mx-2 text-zinc-400">→</span>
          {night.wakeLabel}
        </p>

        <div className="mt-8">
          <div className="relative h-[6px] rounded-full bg-white/[0.07]">
            <div
              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-violet-300 to-sky-300"
              style={{ left: `${night.spanStartPercent}%`, width: `${night.spanWidthPercent}%` }}
            />
          </div>
        </div>

        <RatingMarks rating={night.rating} word={night.ratingWord} />

        {demoWeek ? (
          <p className="mt-6 text-center text-[12px] leading-relaxed text-amber-100/80">
            Sample week. A real morning replaces this page.
          </p>
        ) : null}

        <dl className="mt-10 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {night.facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline justify-between gap-6 py-[0.8rem]">
              <dt className="text-[12px] text-zinc-500">{fact.label}</dt>
              <dd className={cn("text-[13px] tabular-nums text-zinc-100", fact.warn && "text-amber-100/90")}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        {night.dream ? (
          <p className="mt-6 text-[13px] leading-relaxed text-zinc-400">
            <span className="text-zinc-400">Dream · </span>
            {night.dream}
          </p>
        ) : null}

        <div className="mt-10 text-center">
          <DiaryLink
            href="/insights"
            className="inline-flex min-h-11 items-center text-[17px] font-medium text-sky-300"
          >
            Notes for this morning
          </DiaryLink>
          <div className="mt-1 flex justify-center gap-x-4 text-[15px] text-zinc-500">
            <button type="button" className="min-h-11" onClick={onCorrect}>
              Change an answer
            </button>
            <button type="button" className="min-h-11" onClick={onWithdraw}>
              Withdraw
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RatingMarks({ rating, word }: { rating: SleepRating; word: string }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <div className="flex gap-[5px]">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <span
            key={n}
            className={cn("h-[5px] w-5 rounded-full", n <= rating ? "bg-sky-300/85" : "bg-white/10")}
          />
        ))}
      </div>
      <span className="text-[12px] text-zinc-500">{word}</span>
    </div>
  );
}
