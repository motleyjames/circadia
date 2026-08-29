"use client";

import {
  WEEKDAY_FULL,
  WEEKDAY_SHORT,
  describeScheduledDays,
  toggleScheduledDay,
} from "@/lib/schedule";
import type { ScheduledDays } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ScheduledDaysPicker({
  value,
  onChange,
}: {
  value: ScheduledDays;
  onChange: (next: ScheduledDays) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_SHORT.map((label, index) => {
          const on = value[index];
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              aria-label={`${WEEKDAY_FULL[index]} — ${on ? "have to get up" : "free morning"}`}
              onClick={() => onChange(toggleScheduledDay(value, index))}
              className={cn(
                "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-2xl border text-[11px] font-medium tracking-wide transition-colors",
                on
                  ? "border-violet-300/70 bg-violet-400/20 text-violet-50"
                  : "border-white/10 bg-white/4 text-zinc-500 hover:border-white/20 hover:text-zinc-300",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">{describeScheduledDays(value)}</p>
    </div>
  );
}
