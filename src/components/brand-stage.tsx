"use client";

import type { ReactNode } from "react";
import { Mark } from "@/components/mark";

export function BrandStage({ cta }: { cta?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="brand-breathe">
          <Mark className="size-[5.25rem]" />
        </div>
        <h1 className="font-heading mt-10 text-[2.85rem] leading-none tracking-tight text-zinc-50">
          Circadia
        </h1>
        <p className="mt-5 max-w-[16.5rem] text-[15px] leading-relaxed text-zinc-400">
          For falling asleep. For staying asleep. For a clock that holds.
        </p>
      </div>
      <div className="flex h-14 w-full items-center">{cta ?? null}</div>
    </div>
  );
}
