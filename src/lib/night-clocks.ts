import { clockToMinutes, minutesToClock } from "@/lib/time";

export const CLOCK_STEP_MINUTES = 15;

export type NightClocks = {
  inBedAt: string;
  triedToSleepAt: string;
  wokeAt: string;
  outOfBedAt: string;
};

export const NIGHT_HANDLE_ORDER = ["inBedAt", "triedToSleepAt", "wokeAt", "outOfBedAt"] as const;
export type NightHandle = (typeof NIGHT_HANDLE_ORDER)[number];

export function snapClock(clock: string): string {
  const minutes = clockToMinutes(clock);
  const snapped = Math.round(minutes / CLOCK_STEP_MINUTES) * CLOCK_STEP_MINUTES;
  return minutesToClock(((snapped % 1440) + 1440) % 1440);
}

/** Offsets from into-bed, forward through the night. */
export function nightOffsets(clocks: NightClocks): [number, number, number, number] {
  const origin = clockToMinutes(clocks.inBedAt);
  const offset = (clock: string) => (clockToMinutes(clock) - origin + 1440) % 1440;
  return [0, offset(clocks.triedToSleepAt), offset(clocks.wokeAt), offset(clocks.outOfBedAt)];
}

export function clocksInOrder(clocks: NightClocks): boolean {
  const [, tried, woke, out] = nightOffsets(clocks);
  return tried <= woke && woke <= out && out > 0;
}

function clockFromOrigin(origin: string, offset: number): string {
  return minutesToClock((clockToMinutes(origin) + offset + 1440) % 1440);
}

/**
 * Move one handle by ±15 minutes. Neighbours do not move. The handle stops at
 * the next one rather than crossing it.
 */
export function nudgeNightHandle(clocks: NightClocks, handle: NightHandle, delta: -15 | 15): NightClocks {
  const origin = clocks.inBedAt;
  let [inBed, tried, woke, out] = nightOffsets(clocks);
  const maxOut = 23 * 60;

  if (handle === "inBedAt") {
    const nextOrigin = minutesToClock((clockToMinutes(origin) + delta + 1440) % 1440);
    const shifted: NightClocks = {
      inBedAt: nextOrigin,
      triedToSleepAt: clocks.triedToSleepAt,
      wokeAt: clocks.wokeAt,
      outOfBedAt: clocks.outOfBedAt,
    };
    const next = nightOffsets(shifted);
    if (next[1] > next[2] || next[2] > next[3] || next[3] <= 0 || next[3] > maxOut) {
      return clocks;
    }
    return shifted;
  }

  if (handle === "triedToSleepAt") {
    tried = Math.max(0, Math.min(woke, tried + delta));
  } else if (handle === "wokeAt") {
    woke = Math.max(tried, Math.min(out, woke + delta));
  } else {
    out = Math.max(woke, Math.min(maxOut, out + delta));
  }

  return {
    inBedAt: origin,
    triedToSleepAt: clockFromOrigin(origin, tried),
    wokeAt: clockFromOrigin(origin, woke),
    outOfBedAt: clockFromOrigin(origin, out),
  };
}

export function setNightHandle(clocks: NightClocks, handle: NightHandle, clock: string): NightClocks {
  const next = { ...clocks, [handle]: snapClock(clock) };
  return clocksInOrder(next) ? next : clocks;
}

export function usualNightClocks(targetSleep: string, targetWake: string): NightClocks {
  const inBedAt = snapClock(targetSleep);
  const wokeAt = snapClock(targetWake);
  const outOfBedAt = wokeAt;
  const clocks: NightClocks = {
    inBedAt,
    triedToSleepAt: inBedAt,
    wokeAt,
    outOfBedAt,
  };
  if (clocksInOrder(clocks)) return clocks;
  return {
    inBedAt: "23:00",
    triedToSleepAt: "23:00",
    wokeAt: "07:00",
    outOfBedAt: "07:00",
  };
}
