"use client";

import { useId, useState } from "react";
import { nightGeometry, sleepOnsetClock } from "@/lib/sleep-metrics";
import { clockToMinutes, formatClock, formatDuration, overnightDuration } from "@/lib/time";
import type { MorningReport, Profile } from "@/lib/types";

/**
 * The sleep raster — the picture a clinician reads first.
 *
 * One row per night on a clock axis. Pale is time in bed; solid is the sleep
 * period. Regularity, duration and efficiency all fall out of the shape without
 * a single number being read.
 *
 * Deliberately no gaps punched inside the solid bar. The diary records how LONG
 * someone was awake, never WHEN, so a timed gap would be drawing data that was
 * never collected. Only true geometry is plotted: latency at the front, sleep
 * period, and the time lying there afterwards. Wake counts live in the table.
 */

const AXIS_START = 21 * 60; // 9pm
const AXIS_END = 36 * 60; // noon the next day
const W = 660;
const L = 46;
const R = 16;
const TOP = 28;
const ROW_H = 34;
const BAR_H = 16;

/**
 * Minutes since 9pm, unwrapped so after-midnight clocks sit to the right.
 *
 * Anything at or after 21:00 is this evening; everything else is the next day.
 * The earlier version split on noon, which sent a 12:10 lie-in to minus 530 and
 * drew that night's bar off the left edge of the chart.
 */
function axisMinutes(clock: string): number {
  const m = clockToMinutes(clock);
  return m >= AXIS_START ? m - AXIS_START : m + 1440 - AXIS_START;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Weekday for a YYYY-MM-DD morning. Noon avoids any timezone rollover. */
export function weekdayLabel(morningDate: string): string {
  const d = new Date(`${morningDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? morningDate.slice(5) : WEEKDAYS[d.getDay()]!;
}

function tickLabel(minutesFromStart: number, units: Profile["units"]): string {
  const total = (AXIS_START + minutesFromStart) % 1440;
  return formatClock(
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
    units,
  );
}

export type RasterNight = {
  report: MorningReport;
  label: string;
};

export function WeekRaster({ nights, units }: { nights: RasterNight[]; units: Profile["units"] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const plotted = nights
    .map(({ report, label }) => {
      const geometry = nightGeometry(report);
      const onset = sleepOnsetClock(report);
      if (!geometry || !onset || !report.inBedAt || !report.outOfBedAt) return null;
      return { report, label, geometry, onset };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (plotted.length === 0) return null;

  const span = AXIS_END - AXIS_START;
  const plotW = W - L - R;
  const x = (minutes: number) => L + (minutes / span) * plotW;
  const plotH = TOP + plotted.length * ROW_H;
  const open = openIndex === null ? null : plotted[openIndex];

  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-3 pt-4 pb-3">
      <svg
        viewBox={`0 0 ${W} ${plotH + 14}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Sleep for ${plotted.length} night${plotted.length === 1 ? "" : "s"}, plotted on a clock from 9pm to noon.`}
      >
        {[0, 180, 360, 540, 720, 900].map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={TOP - 8} y2={plotH + 2} stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
            <text
              x={x(m)}
              y={TOP - 13}
              fill="#71717a"
              fontSize="10.5"
              textAnchor={m === 0 ? "start" : m === 900 ? "end" : "middle"}
            >
              {tickLabel(m, units)}
            </text>
          </g>
        ))}

        {plotted.map((row, i) => {
          const y = TOP + i * ROW_H;
          const dim = openIndex !== null && openIndex !== i;
          const bedStart = axisMinutes(row.report.inBedAt!);
          const bedEnd = axisMinutes(row.report.outOfBedAt!);
          const sleepStart = axisMinutes(row.onset);
          const sleepEnd = axisMinutes(row.report.wokeAt);
          return (
            <g key={row.report.id} opacity={dim ? 0.38 : 1}>
              <text x={0} y={y + BAR_H / 2 + 4} fill="#a1a1aa" fontSize="11.5">
                {row.label}
              </text>
              <rect
                x={x(bedStart)}
                y={y}
                width={Math.max(2, x(bedEnd) - x(bedStart))}
                height={BAR_H}
                rx="4"
                fill="#6d5da8"
                opacity="0.55"
              />
              <rect
                x={x(sleepStart)}
                y={y}
                width={Math.max(2, x(sleepEnd) - x(sleepStart))}
                height={BAR_H}
                rx="4"
                fill="#c4b5fd"
              />
              <rect
                x={0}
                y={y - 6}
                width={W}
                height={ROW_H}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${row.label}: in bed ${formatClock(row.report.inBedAt!, units)}, asleep ${formatDuration(row.geometry.totalSleepMinutes)}, efficiency ${Math.round(row.geometry.efficiencyPct)} percent`}
                aria-describedby={`${uid}-detail`}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-300"
                onMouseEnter={() => setOpenIndex(i)}
                onMouseLeave={() => setOpenIndex(null)}
                onFocus={() => setOpenIndex(i)}
                onBlur={() => setOpenIndex(null)}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px] text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <span className="h-[9px] w-[22px] rounded-[3px] bg-[#c4b5fd]" aria-hidden />
          Asleep
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-[9px] w-[22px] rounded-[3px] bg-[#6d5da8] opacity-55" aria-hidden />
          In bed, awake
        </span>
      </div>

      <p id={`${uid}-detail`} className="mt-2 min-h-[2.5rem] px-1 text-[13px] leading-relaxed text-zinc-400">
        {open ? (
          <>
            <span className="text-zinc-100">{open.label}</span> — in bed{" "}
            {formatClock(open.report.inBedAt!, units)} to {formatClock(open.report.outOfBedAt!, units)},
            asleep {formatDuration(open.geometry.totalSleepMinutes)},{" "}
            {Math.round(open.geometry.efficiencyPct)}% efficiency
            {open.geometry.awakeningCount ? `, woke ${open.geometry.awakeningCount}×` : ""}.
          </>
        ) : (
          "Wake timing isn’t recorded — only how long. Hover or tap a night for its numbers."
        )}
      </p>
    </div>
  );
}

/** Midpoint of each night, so drift is a measurement rather than an impression. */
export function MidpointStrip({ nights, units }: { nights: RasterNight[]; units: Profile["units"] }) {
  const points = nights
    .map(({ report, label }) => {
      const onset = sleepOnsetClock(report);
      if (!onset || !nightGeometry(report)) return null;
      const start = axisMinutes(onset);
      const mid = start + overnightDuration(onset, report.wokeAt) / 2;
      return { label, mid };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (points.length < 3) return null;

  const lo = Math.min(...points.map((p) => p.mid));
  const hi = Math.max(...points.map((p) => p.mid));
  const pad = 45;
  const from = lo - pad;
  const to = hi + pad;
  const plotW = W - L - R;
  const x = (m: number) => L + ((m - from) / Math.max(1, to - from)) * plotW;

  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-3 pt-4 pb-3">
      <svg viewBox={`0 0 ${W} 92`} className="block h-auto w-full" role="img"
        aria-label={`Middle of each night across ${points.length} nights, spanning ${formatDuration(Math.round(hi - lo))}.`}>
        <line x1={x(lo)} x2={x(hi)} y1="20" y2="20" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        {[lo, hi].map((m) => (
          <line key={m} x1={x(m)} x2={x(m)} y1="15" y2="25" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        ))}
        <text x={(x(lo) + x(hi)) / 2} y="11" fill="#a1a1aa" fontSize="10.5" textAnchor="middle">
          {formatDuration(Math.round(hi - lo))} of drift
        </text>
        <line x1={x(from)} x2={x(to)} y1="62" y2="62" stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.mid)} cy="48" r="7" fill="#0b0914" />
            <circle cx={x(p.mid)} cy="48" r="5" fill="#c4b5fd" />
          </g>
        ))}
        {[from, (from + to) / 2, to].map((m, i) => (
          <text key={i} x={x(m)} y="80" fill="#71717a" fontSize="10.5"
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>
            {tickLabel(Math.round(m), units)}
          </text>
        ))}
      </svg>
    </div>
  );
}
