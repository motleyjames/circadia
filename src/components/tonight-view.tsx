"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCircadia } from "@/context/circadia-store";
import { InstallHint } from "@/components/install-hint";
import { Mark } from "@/components/mark";
import { WindDown } from "@/components/wind-down";
import { buildSleepNotes } from "@/lib/advisor";
import { shouldBeOffScreens } from "@/lib/notifications";
import { morningPageStatus } from "@/lib/morning-file";
import {
  clockFromDate,
  formatClock,
  formatCountdown,
  formatDuration,
  minutesUntilClock,
  overnightDuration,
  screenOffClock,
} from "@/lib/time";

export function TonightView() {
  const { state } = useCircadia();
  const profile = state.profile;
  const [now, setNow] = useState(() => new Date());
  const firstOpen = state.reports.length === 0;
  const page = morningPageStatus(state.reports, now);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (!profile) return null;

  const offClock = screenOffClock(profile.targetSleep);
  const screensDown = shouldBeOffScreens(profile.targetSleep, now);
  const untilOff = minutesUntilClock(offClock, now);
  const untilSleep = minutesUntilClock(profile.targetSleep, now);
  const windowMin = overnightDuration(profile.targetSleep, profile.targetWake);
  const notes = firstOpen ? [] : buildSleepNotes(profile, state.reports);
  const headline = notes.find((n) => n.kind === "alert" || n.kind === "lever" || n.kind === "steady");
  const openingLine = openingCopy(profile.struggles, screensDown);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center justify-between">
        <Mark className="size-5 md:opacity-0" />
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
          {formatClock(clockFromDate(now), profile.units)}
        </p>
      </header>

      <CountdownHero
        screensDown={screensDown}
        untilOff={untilOff}
        untilSleep={untilSleep}
        offLabel={formatClock(offClock, profile.units)}
        sleepLabel={formatClock(profile.targetSleep, profile.units)}
        wakeLabel={formatClock(profile.targetWake, profile.units)}
        windowLabel={formatDuration(windowMin)}
        notificationsEnabled={profile.notificationsEnabled}
      />

      {firstOpen ? (
        <p className="mt-8 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">{openingLine}</p>
      ) : headline ? (
        <div className="mt-8">
          <p className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">From your logs</p>
          <p className="mt-2 text-[15px] leading-snug text-zinc-100">{headline.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{headline.body}</p>
        </div>
      ) : null}

      {page === "filed" ? (
        <Link
          href="/check-in"
          className="mt-6 block text-[13px] text-zinc-300 underline-offset-4 hover:underline"
        >
          This morning is filed
        </Link>
      ) : page === "unfiled-open" ? (
        <Link
          href="/check-in"
          className="mt-6 block text-[13px] text-zinc-300 underline-offset-4 hover:underline"
        >
          Morning interview is open
        </Link>
      ) : page === "unfiled-late" ? (
        <Link
          href="/check-in"
          className="mt-6 block text-[13px] text-zinc-300 underline-offset-4 hover:underline"
        >
          This morning is not filed
        </Link>
      ) : null}

      <div className="mt-10">
        <WindDown />
      </div>

      {firstOpen ? <InstallHint /> : null}
    </div>
  );
}

function openingCopy(struggles: Array<"falling" | "staying">, screensDown: boolean): string {
  if (screensDown) {
    return "This is the hour. Dim the room. The phone is a lamp, not a feed.";
  }
  const falling = struggles.includes("falling");
  const staying = struggles.includes("staying");
  if (falling && staying) {
    return "Onset and maintenance are different problems. Tonight we only hold the clock. Mornings will tell us which one is actually yours.";
  }
  if (staying) {
    return "Staying asleep is usually the second half of the night — alcohol, a drifting wake, or time in bed that is too long. We will not guess until you have mornings.";
  }
  return "Falling asleep is pressure plus clock, not a missing pill. Screens down is the first lever. The picture takes a few mornings.";
}

function CountdownHero({
  screensDown,
  untilOff,
  untilSleep,
  offLabel,
  sleepLabel,
  wakeLabel,
  windowLabel,
  notificationsEnabled,
}: {
  screensDown: boolean;
  untilOff: number;
  untilSleep: number;
  offLabel: string;
  sleepLabel: string;
  wakeLabel: string;
  windowLabel: string;
  notificationsEnabled: boolean;
}) {
  const horizon = 12 * 60;
  const t = screensDown ? 1 : Math.max(0.06, Math.min(1, 1 - untilOff / horizon));
  const degrees = t * 360;

  return (
    <div className="mt-10 flex flex-col items-center">
      <div className="relative size-[17.5rem] lg:size-[22rem]">
        <div
          className="absolute inset-0 rounded-full opacity-90"
          style={{
            background: `conic-gradient(from 180deg, rgba(196,181,253,0.88) ${degrees}deg, rgba(255,255,255,0.05) ${degrees}deg)`,
          }}
        />
        <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-[#07060f]">
          {screensDown ? (
            <>
              <p className="font-heading text-[2.4rem] leading-none tracking-tight text-zinc-50">
                Screens down
              </p>
              <p className="mt-3 text-[13px] text-zinc-500">Asleep-by in {formatCountdown(untilSleep)}</p>
            </>
          ) : (
            <>
              <p className="font-heading text-[3.35rem] leading-none tracking-tight text-zinc-50">
                {formatCountdown(untilOff)}
              </p>
              <p className="mt-3 text-[13px] tracking-wide text-zinc-500">to screens down</p>
            </>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-[13px] leading-relaxed text-zinc-500">
        {offLabel} ping · {sleepLabel}–{wakeLabel} ({windowLabel})
        {notificationsEnabled ? "" : " · pings off"}
      </p>
    </div>
  );
}
