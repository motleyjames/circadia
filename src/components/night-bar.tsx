"use client";

import { useId } from "react";
import {
  CLOCK_STEP_MINUTES,
  NIGHT_HANDLE_ORDER,
  nudgeNightHandle,
  type NightClocks,
  type NightHandle,
} from "@/lib/night-clocks";
import { clockToMinutes, formatClock } from "@/lib/time";
import { hapticSelect } from "@/lib/haptics";

const HANDLE_LABEL: Record<NightHandle, string> = {
  inBedAt: "Into bed",
  triedToSleepAt: "Tried to sleep",
  wokeAt: "Final wake",
  outOfBedAt: "Out of bed",
};

const ORIGIN_MINUTES = 20 * 60;
const WINDOW_MINUTES = 16 * 60;

function offsetOnBar(clock: string): number {
  return (clockToMinutes(clock) - ORIGIN_MINUTES + 1440) % 1440;
}

export function NightBar({
  clocks,
  units,
  onChange,
}: {
  clocks: NightClocks;
  units: "imperial" | "metric";
  onChange: (next: NightClocks) => void;
}) {
  const labelId = useId();

  function move(handle: NightHandle, delta: -15 | 15) {
    void hapticSelect();
    onChange(nudgeNightHandle(clocks, handle, delta));
  }

  return (
    <div>
      <div
        className="relative h-10 rounded-full bg-white/8"
        role="group"
        aria-labelledby={labelId}
      >
        <span id={labelId} className="sr-only">
          Your night
        </span>
        <div className="absolute inset-y-3 right-3 left-3 rounded-full bg-violet-300/25" />
        {NIGHT_HANDLE_ORDER.map((handle) => {
          const offset = offsetOnBar(clocks[handle]);
          const left = `${Math.max(0, Math.min(100, (offset / WINDOW_MINUTES) * 100))}%`;
          return (
            <span
              key={handle}
              className="absolute top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-200/80 bg-sky-300 shadow-[0_0_0_4px_rgba(125,211,252,0.18)]"
              style={{ left }}
              aria-hidden
            />
          );
        })}
      </div>
      <div className="mt-4 space-y-3">
        {NIGHT_HANDLE_ORDER.map((handle) => (
          <div key={handle} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] text-zinc-400">{HANDLE_LABEL[handle]}</p>
              <p className="text-[17px] text-zinc-50">{formatClock(clocks[handle], units)}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-white/12 px-3 py-2 text-[15px] text-zinc-100"
                aria-label={`15 minutes earlier for ${HANDLE_LABEL[handle]}`}
                onClick={() => move(handle, -CLOCK_STEP_MINUTES as -15)}
              >
                −15
              </button>
              <button
                type="button"
                className="rounded-full border border-white/12 px-3 py-2 text-[15px] text-zinc-100"
                aria-label={`15 minutes later for ${HANDLE_LABEL[handle]}`}
                onClick={() => move(handle, CLOCK_STEP_MINUTES as 15)}
              >
                +15
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
