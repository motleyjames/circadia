"use client";

import type { MorningReport, Units } from "@/lib/types";
import { filedMorningKicker, filedMorningRows } from "@/lib/morning-file";

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
  const rows = filedMorningRows(report, units);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-8 pb-8">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">This morning</p>
      <h1 className="font-heading mt-1 text-2xl text-zinc-50">This morning is filed.</h1>
      <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-zinc-500">
        {filedMorningKicker(report.morningDate)} You can correct it. You cannot log it twice.
      </p>
      {demoWeek ? (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Sample week. Filing a real morning replaces this page. It does not add another night.
        </p>
      ) : null}

      <div className="mt-8 max-w-[46ch] space-y-6">
        {rows.map((row) => (
          <div key={row.kicker} className="border-l border-sky-300/30 pl-4">
            <p className="text-[10px] tracking-[0.2em] text-zinc-600 uppercase">{row.kicker}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-zinc-200">{row.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-start gap-3">
        <button
          type="button"
          className="rounded-full bg-sky-300 px-5 py-2.5 text-sm font-medium text-zinc-950"
          onClick={onCorrect}
        >
          Correct this morning
        </button>
        <button
          type="button"
          className="text-[13px] text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
          onClick={onWithdraw}
        >
          Withdraw this morning
        </button>
      </div>
    </div>
  );
}
