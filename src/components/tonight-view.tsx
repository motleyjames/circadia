"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCircadia } from "@/context/circadia-store";
import { WindDown } from "@/components/wind-down";
import { Button } from "@/components/ui/button";
import { buildSleepNotes } from "@/lib/advisor";
import { shouldBeOffScreens } from "@/lib/notifications";
import {
  clockFromDate,
  formatClock,
  formatCountdown,
  minutesUntilClock,
  overnightDuration,
  screenOffClock,
  todayIsoDate,
} from "@/lib/time";

export function TonightView() {
  const { state } = useCircadia();
  const profile = state.profile!;
  const [now, setNow] = useState(() => new Date());
  const today = todayIsoDate(now);
  const loggedToday = state.reports.some((r) => r.morningDate === today);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const offClock = screenOffClock(profile.targetSleep);
  const screensDown = shouldBeOffScreens(profile.targetSleep, now);
  const untilOff = minutesUntilClock(offClock, now);
  const untilSleep = minutesUntilClock(profile.targetSleep, now);
  const windowMin = overnightDuration(profile.targetSleep, profile.targetWake);
  const notes = buildSleepNotes(profile, state.reports);
  const headline = notes.find((n) => n.kind === "alert" || n.kind === "lever" || n.kind === "steady");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-6">
      <header className="mb-6">
        <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">Circadia</p>
        <h1 className="font-heading mt-1 text-3xl text-zinc-50">
          {screensDown ? "Screens down." : "Tonight."}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {formatClock(clockFromDate(now), profile.units)} · window {formatClock(profile.targetSleep, profile.units)}–
          {formatClock(profile.targetWake, profile.units)} ({Math.round(windowMin / 60)}h)
        </p>
      </header>

      <div
        className={`rounded-[1.75rem] border p-5 ${
          screensDown
            ? "border-violet-300/40 bg-violet-500/15 shadow-[0_0_40px_-12px_rgba(167,139,250,0.8)]"
            : "border-white/10 bg-white/4"
        }`}
      >
        <p className="text-[11px] tracking-[0.2em] text-zinc-400 uppercase">One hour off screens</p>
        {screensDown ? (
          <p className="font-heading mt-2 text-2xl text-violet-50">This is the hour. Phone is a lamp, not a feed.</p>
        ) : (
          <p className="font-heading mt-2 text-3xl text-zinc-50">
            {formatCountdown(untilOff)}
            <span className="ml-2 text-base font-sans text-zinc-400">to screens down</span>
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Ping at {formatClock(offClock, profile.units)}. Asleep-by in {formatCountdown(untilSleep)}.
          {profile.notificationsEnabled ? " Notifications armed for this device." : " Turn on pings in You."}
        </p>
      </div>

      {!loggedToday ? (
        <div className="mt-4 rounded-3xl border border-sky-300/20 bg-sky-400/10 px-4 py-3">
          <p className="text-sm text-sky-50">The morning interview is still open.</p>
          <Link href="/check-in" className="mt-1 inline-block text-xs text-sky-200 underline-offset-4 hover:underline">
            Log last night →
          </Link>
        </div>
      ) : null}

      {headline ? (
        <div className="mt-4 rounded-3xl border border-white/8 bg-black/20 p-4">
          <p className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">From your logs</p>
          <p className="mt-1 text-sm text-zinc-100">{headline.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{headline.body}</p>
        </div>
      ) : null}

      <div className="mt-8">
        <WindDown />
      </div>

      <div className="mt-8 flex gap-2">
        <Button render={<Link href="/check-in" />} className="flex-1 rounded-full bg-white/10 text-zinc-100 hover:bg-white/15">
          Morning interview
        </Button>
        <Button render={<Link href="/insights" />} variant="outline" className="flex-1 rounded-full border-white/15">
          Notes
        </Button>
      </div>
    </div>
  );
}
