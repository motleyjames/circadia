"use client";

import { useId, useState } from "react";
import {
  midpointOffset,
  midpointSpread,
  type MidpointSpread,
  type ScoredNight,
} from "@/lib/sleep-metrics";
import { clockToMinutes, formatClock, formatDuration, minutesToClock } from "@/lib/time";
import type { Profile } from "@/lib/types";

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
 *
 * ## The axis
 *
 * Times are laid out as minutes since 3pm rather than on a fixed 9pm-to-noon
 * window. Two earlier versions each clipped a real person off the chart: splitting
 * the day at noon sent a 12:10 lie-in to minus 530 and drew that night off the left
 * edge, and splitting at 9pm sent a 7:45pm bedtime off the right. 3pm is the hour
 * nobody in this diary is in bed, so every night lands in order after it, and the
 * visible window is then measured from the nights themselves — the chart adapts to
 * the person instead of the person having to fit the chart.
 */

/** The hour the plotted day starts. Nobody in this diary is asleep at 3pm. */
const DAY_BOUNDARY_MINUTES = 15 * 60;
const MINUTES_PER_DAY = 24 * 60;

const W = 660;
const L = 46;
const R = 16;
const TOP = 28;
const ROW_H = 34;
const BAR_H = 16;

/** Colour is one hue at two lightnesses. The two brand accents fail CVD as a pair. */
const ASLEEP = "#c4b5fd";
const IN_BED = "#6d5da8";

/** Minutes since 3pm, so an evening bedtime and a late rise stay in order. */
function axisMinutes(clock: string): number {
  return (clockToMinutes(clock) - DAY_BOUNDARY_MINUTES + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Clock label for a position on the axis. */
function axisClock(minutesFromStart: number): string {
  return minutesToClock(DAY_BOUNDARY_MINUTES + minutesFromStart);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Weekday for a YYYY-MM-DD morning. Noon avoids any timezone rollover. */
export function weekdayLabel(morningDate: string): string {
  const d = new Date(`${morningDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? morningDate.slice(5) : WEEKDAYS[d.getDay()]!;
}

/**
 * Whether a night can be drawn in order on the axis.
 *
 * A "night" logged as a 2pm-to-4pm nap crosses the 3pm boundary and cannot be laid
 * out left to right. The view asks this before rendering the section, so the
 * heading is never left standing over an empty box.
 */
export function isPlottable(night: ScoredNight): boolean {
  const { inBedAt, outOfBedAt } = night.report;
  if (!inBedAt || !outOfBedAt) return false;
  const bedStart = axisMinutes(inBedAt);
  const bedEnd = axisMinutes(outOfBedAt);
  return (
    bedEnd >= bedStart &&
    axisMinutes(night.onsetClock) >= bedStart &&
    axisMinutes(night.report.wokeAt) <= bedEnd
  );
}

type PlottedNight = {
  night: ScoredNight;
  label: string;
  bedStart: number;
  bedEnd: number;
  sleepStart: number;
  sleepEnd: number;
};

/**
 * Lay the nights on the axis and find the window that holds all of them.
 *
 * A night that crosses 3pm cannot be drawn in order and is dropped rather than
 * plotted wrong — the caller reports how many nights are on the chart, so a
 * dropped one is visible as a smaller count rather than a silent omission.
 */
function layout(nights: ScoredNight[]): { rows: PlottedNight[]; from: number; to: number } | null {
  const rows: PlottedNight[] = [];
  for (const night of nights) {
    if (!isPlottable(night)) continue;
    const bedStart = axisMinutes(night.report.inBedAt!);
    const bedEnd = axisMinutes(night.report.outOfBedAt!);
    const sleepStart = axisMinutes(night.onsetClock);
    const sleepEnd = axisMinutes(night.report.wokeAt);
    rows.push({
      night,
      label: weekdayLabel(night.report.morningDate),
      bedStart,
      bedEnd,
      sleepStart,
      sleepEnd,
    });
  }
  if (rows.length === 0) return null;

  // Round out to whole hours so the ticks land on readable times, and never show a
  // window narrower than six hours or a single short night fills the whole chart.
  const earliest = Math.min(...rows.map((r) => r.bedStart));
  const latest = Math.max(...rows.map((r) => r.bedEnd));
  let from = Math.floor(earliest / 60) * 60;
  let to = Math.ceil(latest / 60) * 60;
  const MIN_SPAN = 6 * 60;
  if (to - from < MIN_SPAN) {
    const pad = Math.ceil((MIN_SPAN - (to - from)) / 2 / 60) * 60;
    from = Math.max(0, from - pad);
    to = Math.min(MINUTES_PER_DAY, to + pad);
  }
  return { rows, from, to };
}

/**
 * Three-hour ticks inside the window, plus the two ends.
 *
 * An end is dropped when it sits within `MIN_TICK_GAP` of an interior tick, because
 * two labels that close overlap and the reader gets "11pm 12am" as one smear. The
 * end is the one to lose: the interior ticks are on round hours.
 */
const TICK_STEP = 180;
const MIN_TICK_GAP = 70;

function ticksFor(from: number, to: number): number[] {
  const interior: number[] = [];
  for (let m = Math.ceil(from / TICK_STEP) * TICK_STEP; m <= to; m += TICK_STEP) {
    if (m > from && m < to) interior.push(m);
  }
  const clear = (edge: number) => interior.every((m) => Math.abs(m - edge) >= MIN_TICK_GAP);
  return [...(clear(from) ? [from] : []), ...interior, ...(clear(to) ? [to] : [])];
}

export function WeekRaster({
  nights,
  units,
}: {
  nights: ScoredNight[];
  units: Profile["units"];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const plot = layout(nights);
  if (!plot) return null;

  const { rows, from, to } = plot;
  const span = Math.max(60, to - from);
  const plotW = W - L - R;
  const x = (minutes: number) => L + ((minutes - from) / span) * plotW;
  const plotH = TOP + rows.length * ROW_H;
  const open = openIndex === null ? null : rows[openIndex];

  return (
    <figure className="m-0 rounded-3xl border border-white/8 bg-white/[0.03] px-3 pt-4 pb-3">
      <svg
        viewBox={`0 0 ${W} ${plotH + 14}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Sleep for ${rows.length} night${rows.length === 1 ? "" : "s"}, each row one night on a clock from ${formatClock(axisClock(from), units)} to ${formatClock(axisClock(to), units)}.`}
      >
        {ticksFor(from, to).map((m, i, all) => (
          <g key={m}>
            <line
              x1={x(m)}
              x2={x(m)}
              y1={TOP - 8}
              y2={plotH + 2}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />
            <text
              x={x(m)}
              y={TOP - 13}
              fill="#a1a1aa"
              fontSize="10.5"
              textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"}
            >
              {formatClock(axisClock(m), units)}
            </text>
          </g>
        ))}

        {rows.map((row, i) => {
          const y = TOP + i * ROW_H;
          const dim = openIndex !== null && openIndex !== i;
          return (
            <g key={row.night.report.id} opacity={dim ? 0.38 : 1}>
              <text x={0} y={y + BAR_H / 2 + 4} fill="#a1a1aa" fontSize="11.5">
                {row.label}
              </text>
              <rect
                x={x(row.bedStart)}
                y={y}
                width={Math.max(2, x(row.bedEnd) - x(row.bedStart))}
                height={BAR_H}
                rx="4"
                fill={IN_BED}
                opacity="0.55"
              />
              <rect
                x={x(row.sleepStart)}
                y={y}
                width={Math.max(2, x(row.sleepEnd) - x(row.sleepStart))}
                height={BAR_H}
                rx="4"
                fill={ASLEEP}
              />
              <rect
                x={0}
                y={y - 6}
                width={W}
                height={ROW_H}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${row.label}: in bed ${formatClock(row.night.report.inBedAt!, units)}, asleep ${formatDuration(row.night.geometry.totalSleepMinutes)}, efficiency ${Math.round(row.night.geometry.efficiencyPct)} percent`}
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

      <figcaption className="mt-3 space-y-2 px-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-[9px] w-[22px] rounded-[3px]"
              style={{ background: ASLEEP }}
              aria-hidden
            />
            Asleep
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-[9px] w-[22px] rounded-[3px] opacity-55"
              style={{ background: IN_BED }}
              aria-hidden
            />
            In bed, awake
          </span>
        </div>
        <p
          id={`${uid}-detail`}
          className="min-h-[2.5rem] text-[13px] leading-relaxed text-zinc-400"
          aria-live="polite"
        >
          {open ? (
            <>
              <span className="text-zinc-100">{open.label}</span> — in bed{" "}
              {formatClock(open.night.report.inBedAt!, units)} to{" "}
              {formatClock(open.night.report.outOfBedAt!, units)}, asleep{" "}
              {formatDuration(open.night.geometry.totalSleepMinutes)},{" "}
              {Math.round(open.night.geometry.efficiencyPct)}% efficiency
              {open.night.geometry.awakeningCount
                ? `, woke ${open.night.geometry.awakeningCount}×`
                : ""}
              .
            </>
          ) : (
            "Wake timing isn’t recorded — only how long. Totals are in the table below."
          )}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * Where the middles of the nights sat.
 *
 * The midpoint is the single number that says whether a clock is settled, and it
 * is the one a raster does not show at a glance. Plotted on the arc the nights
 * actually occupy rather than a fixed window, so two nights twenty minutes apart
 * read as twenty minutes even when they straddle midnight.
 */
export function MidpointStrip({
  nights,
  units,
  note,
}: {
  nights: ScoredNight[];
  units: Profile["units"];
  note?: string | null;
}) {
  const spread = midpointSpread(nights);
  if (!spread || spread.nights < 3) return null;

  const H = 92;
  const plotW = W - L - R;
  // Pad the arc so the outermost dots are not sitting on the frame.
  const pad = Math.max(30, Math.round(spread.spreadMinutes * 0.18));
  const from = -pad;
  const to = spread.spreadMinutes + pad;
  const x = (offset: number) => L + ((offset - from) / (to - from)) * plotW;
  const clockAt = (offset: number) =>
    formatClock(minutesToClock(spread.fromMinutes + offset), units);

  return (
    <figure className="m-0 rounded-3xl border border-white/8 bg-white/[0.03] px-3 pt-4 pb-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`The middle of each night across ${spread.nights} nights, spanning ${formatDuration(spread.spreadMinutes)} from ${clockAt(0)} to ${clockAt(spread.spreadMinutes)}.`}
      >
        <line
          x1={x(0)}
          x2={x(spread.spreadMinutes)}
          y1="20"
          y2="20"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        {[0, spread.spreadMinutes].map((m) => (
          <line
            key={m}
            x1={x(m)}
            x2={x(m)}
            y1="15"
            y2="25"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
          />
        ))}
        <text
          x={(x(0) + x(spread.spreadMinutes)) / 2}
          y="11"
          fill="#a1a1aa"
          fontSize="10.5"
          textAnchor="middle"
        >
          {formatDuration(spread.spreadMinutes)} between earliest and latest
        </text>

        <line
          x1={x(from)}
          x2={x(to)}
          y1="62"
          y2="62"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth="1"
        />
        {nights.map((night) => {
          const offset = midpointOffset(night.midpointMinutes, spread);
          return (
            <g key={night.report.id}>
              {/* A ring in the page ground so overlapping dots stay countable. */}
              <circle cx={x(offset)} cy="48" r="7.5" fill="#0b0914" />
              <circle cx={x(offset)} cy="48" r="5" fill={ASLEEP} />
            </g>
          );
        })}

        {[0, spread.spreadMinutes].map((m, i) => (
          <text
            key={m}
            x={x(m)}
            y="82"
            fill="#a1a1aa"
            fontSize="10.5"
            textAnchor={i === 0 ? "start" : "end"}
          >
            {clockAt(m)}
          </text>
        ))}
      </svg>
      {note ? (
        <figcaption className="mt-2 px-1 text-[13px] leading-relaxed text-zinc-400">
          {note}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Every night as numbers, for the person who wants to check the picture. */
export function NightTable({
  nights,
  units,
}: {
  nights: ScoredNight[];
  units: Profile["units"];
}) {
  if (nights.length === 0) return null;
  const cell = "px-2.5 py-2.5 whitespace-nowrap";
  return (
    // Efficiency and time asleep come first so the two figures that matter are
    // readable on a phone without scrolling. The rest scrolls, and the fade on the
    // right edge is what says so — a table that silently hides its best column is
    // worse than one that shows fewer.
    <div className="relative">
      <div className="overflow-x-auto rounded-3xl border border-white/8 bg-white/[0.03]">
        <table className="w-full min-w-[26rem] border-collapse text-[12.5px] tabular-nums">
          <caption className="sr-only">Every scored night, with its numbers.</caption>
          <thead>
            <tr className="text-left text-[10px] tracking-[0.1em] text-zinc-400 uppercase">
              <th scope="col" className={`${cell} font-normal`}>Night</th>
              <th scope="col" className={`${cell} font-normal`}>Eff.</th>
              <th scope="col" className={`${cell} font-normal`}>Asleep</th>
              <th scope="col" className={`${cell} font-normal`}>In bed</th>
              <th scope="col" className={`${cell} font-normal`}>Up</th>
              <th scope="col" className={`${cell} font-normal`}>Wakes</th>
            </tr>
          </thead>
          <tbody>
            {nights.map((night) => (
              <tr key={night.report.id} className="border-t border-white/6 text-zinc-300">
                <th scope="row" className={`${cell} text-left font-normal text-zinc-100`}>
                  {weekdayLabel(night.report.morningDate)}
                </th>
                <td className={`${cell} text-zinc-100`}>
                  {Math.round(night.geometry.efficiencyPct)}%
                </td>
                <td className={cell}>{formatDuration(night.geometry.totalSleepMinutes)}</td>
                <td className={cell}>{formatClock(night.report.inBedAt!, units)}</td>
                <td className={cell}>{formatClock(night.report.outOfBedAt!, units)}</td>
                <td className={cell}>
                  {night.geometry.awakeningCount === null ? "—" : night.geometry.awakeningCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-3xl bg-gradient-to-l from-[#0b0914] to-transparent"
      />
    </div>
  );
}

export type { MidpointSpread };
