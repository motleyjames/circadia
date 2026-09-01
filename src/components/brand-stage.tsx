"use client";

import type { ReactNode } from "react";
import { Mark } from "@/components/mark";

export function BrandStage({ cta }: { cta?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="brand-open-mark relative">
          <div className="brand-open-halo pointer-events-none absolute inset-[-1.35rem] rounded-full" aria-hidden />
          <Mark className="relative size-[5.25rem]" />
        </div>
        <h1 className="brand-open-title font-heading mt-10 text-[2.85rem] leading-none tracking-tight text-zinc-50">
          Circadia
        </h1>
        <p className="brand-open-line mt-5 max-w-[22rem] text-[15px] leading-relaxed text-zinc-400">
          For falling asleep. For staying asleep. For a clock that holds.
        </p>
      </div>
      <div className="flex h-14 w-full items-center">{cta ?? null}</div>
    </div>
  );
}
