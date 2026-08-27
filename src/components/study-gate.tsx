"use client";

import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";

export function StudyGate() {
  const { joinStudy, declineStudy } = useCircadia();

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pt-16 pb-10">
      <Mark className="size-7" />
      <p className="mt-10 text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">Optional study</p>
      <h1 className="font-heading mt-3 max-w-[16ch] text-[2.4rem] leading-[1.05] tracking-tight text-zinc-50">
        Nights can come back. You do not.
      </h1>
      <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        Circadia is being rebuilt from real diaries. If you join, this computer sends a stripped night
        log after each morning — age band, clocks, ratings, medication <em>class</em>. Not your name.
        Not dream text. Not chat. Not the bottle you typed.
      </p>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        If you are being paid to use this, payment happens outside Circadia. We never ask who you are
        or how you get paid.
      </p>
      <ul className="mt-8 max-w-[42ch] space-y-2 text-[13px] leading-relaxed text-zinc-500">
        <li>You can read the exact JSON in You before or after it leaves.</li>
        <li>A random participant number stays here so nights stitch if you pause. Erase this device starts a new number.</li>
        <li>Keep everything on this computer and the app is unchanged. Nothing is sent.</li>
      </ul>
      <div className="mt-auto flex flex-col gap-3 pt-10">
        <button
          type="button"
          onClick={joinStudy}
          className="h-14 rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950"
        >
          Join the study
        </button>
        <button
          type="button"
          onClick={declineStudy}
          className="h-14 rounded-full border border-white/12 text-[15px] font-medium text-zinc-200"
        >
          Keep everything on this computer
        </button>
      </div>
    </div>
  );
}
