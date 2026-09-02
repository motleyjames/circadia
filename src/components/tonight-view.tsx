"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useCircadia } from "@/context/circadia-store";
import { DiaryLink } from "@/components/diary-tab-link";
import { InstallHint } from "@/components/install-hint";
import { WindDown } from "@/components/wind-down";
import { buildSleepNotes } from "@/lib/advisor";
import { isOpenHoldConsumed, subscribeOpenHold } from "@/lib/diary-shell";
import { shouldBeOffScreens } from "@/lib/notifications";
import { morningPageStatus } from "@/lib/morning-file";
import {
  formatClock,
  formatCountdownHms,
  formatDuration,
  formatWallClock,
  overnightDuration,
  screenOffClock,
  secondsUntilClock,
} from "@/lib/time";
import { useWallClock } from "@/lib/wall-clock";

const ORB_C = 2 * Math.PI * 46;

export function TonightView() {
  const { state } = useCircadia();
  const profile = state.profile;
  const now = useWallClock();
  const firstOpen = state.reports.length === 0;
  const page = morningPageStatus(state.reports, now, profile?.targetWake);

  if (!profile) return null;

  const offClock = screenOffClock(profile.targetSleep);
  const screensDown = shouldBeOffScreens(profile.targetSleep, now);
  const untilOff = secondsUntilClock(offClock, now);
  const untilSleep = secondsUntilClock(profile.targetSleep, now);
  const windowMin = overnightDuration(profile.targetSleep, profile.targetWake);
  const notes = firstOpen ? [] : buildSleepNotes(profile, state.reports);
  const headline = notes.find((n) => n.kind === "alert" || n.kind === "lever" || n.kind === "steady");
  const openingLine = openingCopy(profile.struggles, screensDown);

  return (
    <div className="phone-page-y flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-10">
      <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col sm:max-w-[26rem] lg:max-w-[28rem]">
        <div className="flex flex-1 flex-col items-center justify-center">
          <CountdownHero
            nowLabel={formatWallClock(now, profile.units)}
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
            <p className="mt-8 max-w-[34ch] text-center text-[15px] leading-relaxed text-zinc-400">
              {openingLine}
            </p>
          ) : headline ? (
            <section className="mt-8 max-w-[36ch] text-center">
              <p className="text-[16px] leading-snug font-medium text-zinc-50">{headline.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{headline.body}</p>
            </section>
          ) : null}

          {page === "filed" || page === "unfiled-open" || page === "unfiled-late" ? (
            <DiaryLink
              href="/check-in"
              className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-[15px] text-zinc-100 ring-1 ring-white/14"
            >
              {page === "filed"
                ? "This morning is filed"
                : page === "unfiled-open"
                  ? "Morning interview is open"
                  : "This morning is not filed"}
            </DiaryLink>
          ) : null}
        </div>

        <div className="mt-10 w-full shrink-0">
          <WindDown />
        </div>

        {firstOpen ? <InstallHint /> : null}
      </div>
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
  nowLabel,
  screensDown,
  untilOff,
  untilSleep,
  offLabel,
  sleepLabel,
  wakeLabel,
  windowLabel,
  notificationsEnabled,
}: {
  nowLabel: string;
  screensDown: boolean;
  untilOff: number;
  untilSleep: number;
  offLabel: string;
  sleepLabel: string;
  wakeLabel: string;
  windowLabel: string;
  notificationsEnabled: boolean;
}) {
  const horizon = 12 * 3600;
  const t = screensDown ? 1 : Math.max(0.06, Math.min(1, 1 - untilOff / horizon));
  const holdConsumed = useSyncExternalStore(subscribeOpenHold, isOpenHoldConsumed, () => false);
  const [drawn, setDrawn] = useState(() => isOpenHoldConsumed());
  const progress = drawn ? t : 0;
  const dashoffset = ORB_C * (1 - progress);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const bloomId = `orb-bloom-${uid}`;
  const arcId = `orb-arc-${uid}`;

  useEffect(() => {
    if (!holdConsumed) return;
    const frame = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(frame);
  }, [holdConsumed]);

  return (
    <div className="mt-3 flex w-full flex-col items-center md:mt-2">
      <p
        className="mb-5 text-[11px] tracking-[0.28em] text-zinc-500 uppercase tabular-nums"
        suppressHydrationWarning
      >
        {nowLabel}
      </p>
      <div className="countdown-orb relative size-[13.5rem] overflow-hidden rounded-full sm:size-[17.5rem] lg:size-[20rem]">
        <svg
          viewBox="0 0 128 128"
          fill="none"
          className="countdown-orb-svg pointer-events-none absolute inset-0 size-full"
          aria-hidden
        >
          <defs>
            <radialGradient id={bloomId} cx="50%" cy="42%" r="58%">
              <stop offset="0%" stopColor="rgba(168,150,230,0.34)" />
              <stop offset="46%" stopColor="rgba(110,90,190,0.12)" />
              <stop offset="78%" stopColor="rgba(80,60,150,0.04)" />
              <stop offset="100%" stopColor="rgba(5,4,10,0)" />
            </radialGradient>
            <linearGradient id={arcId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(196,181,253,0.95)" />
              <stop offset="100%" stopColor="rgba(125,211,252,0.85)" />
            </linearGradient>
          </defs>
          <circle className="countdown-orb-core" cx="64" cy="64" r="54" fill={`url(#${bloomId})`} />
          <circle cx="64" cy="64" r="46" stroke="rgba(255,255,255,0.08)" strokeWidth="1.65" />
          <circle
            className="countdown-orb-arc"
            cx="64"
            cy="64"
            r="46"
            stroke={`url(#${arcId})`}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeDasharray={ORB_C}
            strokeDashoffset={dashoffset}
            transform="rotate(180 64 64)"
          />
        </svg>
        <div className="absolute inset-[1.35rem] flex flex-col items-center justify-center px-5 text-center sm:inset-[1.55rem]">
          {screensDown ? (
            <>
              <p className="font-heading text-[1.55rem] leading-[1.08] tracking-tight text-zinc-50 sm:text-[1.85rem] lg:text-[2.05rem]">
                Screens
                <span className="block">down</span>
              </p>
              <p className="mt-3 text-[11px] leading-snug tracking-[0.12em] text-zinc-500">
                Asleep-by
                <span className="mt-0.5 block">{formatCountdownHms(untilSleep)}</span>
              </p>
            </>
          ) : (
            <>
              <p className="font-heading text-[2.05rem] leading-none tracking-tight text-zinc-50 tabular-nums sm:text-[2.55rem] lg:text-[2.85rem]" suppressHydrationWarning>
                {formatCountdownHms(untilOff)}
              </p>
              <p className="mt-3 text-[11px] leading-snug tracking-[0.12em] text-zinc-500">
                to screens
                <span className="mt-0.5 block">down</span>
              </p>
            </>
          )}
        </div>
      </div>
      <p className="mt-6 max-w-[28ch] text-center text-[12px] leading-relaxed tracking-wide text-zinc-500">
        {offLabel} ping · {sleepLabel}–{wakeLabel} ({windowLabel})
        {notificationsEnabled ? "" : " · pings off"}
      </p>
    </div>
  );
}
