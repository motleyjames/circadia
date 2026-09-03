"use client";

import { useMemo, useState } from "react";
import { DiaryLink } from "@/components/diary-tab-link";
import { useCircadia } from "@/context/circadia-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { buildSleepNotes } from "@/lib/advisor";
import { readDream } from "@/lib/dreams";
import { researchById } from "@/lib/research";
import { socialJetLagCopyFromReports } from "@/lib/social-jetlag-copy";
import { formatClock, formatDuration } from "@/lib/time";
import type { MorningReport, Profile, SleepNote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MorningReadingCard } from "@/components/morning-reading";
import { suggestMorningReadingForLogs } from "@/lib/morning-reading";
import { buildWeekReview, formatMorningDate, lastSevenReports } from "@/lib/week-review";
import { MidpointStrip, NightTable, WeekRaster, isPlottable } from "@/components/week-raster";
import {
  bestAndWorst,
  efficiencyBand,
  scoreNights,
  weekDeltas,
  weekGeometry,
  type ScoredNight,
  type WeekDeltas,
  type WeekGeometry,
} from "@/lib/sleep-metrics";
import { standingOn, weekSentence } from "@/lib/week-sentence";

/** The note taxonomy is internal. Users were reading raw "LEVER" and "STEADY". */
const NOTE_KIND_LABEL: Record<string, string> = {
  alert: "Worth attention",
  lever: "Worth trying",
  steady: "Holding steady",
  context: "Background",
};

const WEEK = 7;

/**
 * The week, read in the order a clinician reads one: picture, then numbers, then
 * one sentence about what they mean, then the comparison that suggests an action.
 *
 * The previous version put every one of those things on the page as prose and let
 * the reader find them. It scrolled for three thousand pixels and the only figure
 * you could take in at a glance was a decorative bar chart of durations. Nothing
 * has been deleted here — the longer read, the night-by-night notes and the table
 * are all still on the page, behind disclosures, in the order someone would ask
 * for them.
 */
export function InsightsView() {
  const { state, loadSampleWeek } = useCircadia();
  const [sampleOpen, setSampleOpen] = useState(false);
  const profile = state.profile;

  const windowReports = useMemo(() => lastSevenReports(state.reports), [state.reports]);
  const priorReports = useMemo(
    () => state.reports.slice(0, Math.max(0, state.reports.length - WEEK)).slice(-WEEK),
    [state.reports],
  );

  const scored = useMemo(() => scoreNights(windowReports), [windowReports]);
  const week = useMemo(() => weekGeometry(windowReports), [windowReports]);
  const deltas = useMemo(
    () => weekDeltas(week, weekGeometry(priorReports)),
    [week, priorReports],
  );
  const split = useMemo(() => bestAndWorst(scored), [scored]);
  // A night that crosses the chart's 3pm boundary — a nap logged as a night — has
  // real numbers but cannot be drawn in order. Ask before rendering the section, so
  // the heading is never left over an empty frame.
  const plottable = useMemo(() => scored.filter(isPlottable), [scored]);

  const jetLag = useMemo(
    () =>
      profile
        ? socialJetLagCopyFromReports(state.reports, profile.scheduledDays, new Date())
        : null,
    [profile, state.reports],
  );
  const notes = useMemo(
    () => (profile ? buildSleepNotes(profile, state.reports) : []),
    [profile, state.reports],
  );
  const review = useMemo(
    () => (profile ? buildWeekReview(profile, state.reports) : null),
    [profile, state.reports],
  );
  const reading = useMemo(
    () => (profile ? suggestMorningReadingForLogs(profile, state.reports) : null),
    [profile, state.reports],
  );

  if (!profile) return null;
  const units = profile.units;
  const empty = state.reports.length === 0;
  const dreamReports = state.reports.filter((r) => r.dream?.text);

  return (
    <div className="phone-page-y min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Notes</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">The week.</h1>
      <p className="mt-1.5 text-[13px] text-zinc-400">
        {dateRange(windowReports)}
      </p>
      <p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-zinc-400">
        {standingOn(windowReports.length, week?.nights ?? 0)}
      </p>

      {state.demoWeek ? (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Sample mornings. It is not your sleep. Log a real morning to replace it.
        </p>
      ) : null}

      {empty ? <EmptyWeek onSample={() => (state.reports.length > 0 ? setSampleOpen(true) : loadSampleWeek())} notes={notes} /> : null}

      {week && scored.length > 0 ? (
        <>
          {plottable.length > 0 ? (
            <Band title="Your nights">
              <WeekRaster nights={plottable} units={units} />
            </Band>
          ) : null}

          <Band title="The numbers">
            <Numbers week={week} deltas={deltas} />
          </Band>

          <Band
            title="Where your nights sat"
            blurb="The middle of each night. Clustered is a clock that has settled; scattered is one that has not."
          >
            <MidpointStrip
              nights={plottable}
              units={units}
              note={jetLag && !jetLag.withheld ? jetLag.body : null}
            />
          </Band>

          <Band title="What I read">
            <Sentence week={week} />
          </Band>

          {split ? (
            <Band title="Better and worse">
              <BetterAndWorse split={split} units={units} />
            </Band>
          ) : null}

          <Band title="Every night, in numbers">
            <NightTable nights={scored} units={units} />
          </Band>

          <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
            Efficiency is time asleep divided by time in bed. Sleep clinics generally treat 85% and
            up as healthy; under that usually means too much time in bed rather than too little
            sleep. Circadia will not set you a sleep window — that belongs with a clinician, and it
            is the one part of this that needs a person.
          </p>
        </>
      ) : null}

      {!empty && !week ? <AwaitingGeometry count={state.reports.length} /> : null}

      {reading ? <MorningReadingCard reading={reading} className="mt-10" /> : null}

      {review && review.nightsLogged > 0 ? (
        <Disclosure
          className="mt-8"
          summary="The longer read"
          hint={review.headline}
        >
          <div className="space-y-3">
            {review.read.split("\n\n").map((para) => (
              <p key={para.slice(0, 48)} className="text-[14px] leading-relaxed text-zinc-300">
                {para}
              </p>
            ))}
          </div>
          <div className="mt-6 space-y-6">
            {review.worked.length > 0 ? (
              <WeekColumn kicker="Better nights" items={review.worked} tone="worked" />
            ) : null}
            {review.hurt.length > 0 ? (
              <WeekColumn kicker="Worse nights" items={review.hurt} tone="hurt" />
            ) : null}
            <WeekColumn kicker="What I would try" items={review.doThis} tone="advice" numbered />
          </div>
          <DiaryLink
            href="/"
            className="mt-6 inline-flex min-h-11 items-center text-[16px] font-medium text-sky-300"
          >
            Open wind-down
          </DiaryLink>
        </Disclosure>
      ) : null}

      {dreamReports.length > 0 ? (
        <Disclosure
          className="mt-4"
          summary="Dreams"
          hint={`${dreamReports.length} recorded`}
        >
          <div className="space-y-3">
            {dreamReports
              .slice()
              .reverse()
              .map((r) => {
                const read = r.dream?.wantMeaning ? readDream(r.dream.text, r, profile) : null;
                return (
                  <article key={r.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-[11px] text-zinc-400">
                      {formatMorningDate(r.morningDate)} · asleep{" "}
                      {formatClock(r.fellAsleepAt, units)}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-200">{r.dream?.text}</p>
                    {read ? (
                      <div className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-400">
                        <p>{read.physiology}</p>
                        <p>{read.meaning}</p>
                        <p>{read.caution}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-zinc-400">Stored only. Meaning was off.</p>
                    )}
                  </article>
                );
              })}
          </div>
        </Disclosure>
      ) : null}

      <ConfirmDialog
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        title="Load a sample week"
        description="This replaces mornings already on this device with a labeled sample week. It is fake data."
        confirmLabel="Replace mornings"
        onConfirm={loadSampleWeek}
      />
    </div>
  );
}

/** The window the page is describing, in words rather than ISO stamps. */
function dateRange(reports: MorningReport[]): string {
  if (reports.length === 0) return "No mornings yet.";
  const first = reports[0]!.morningDate;
  const last = reports[reports.length - 1]!.morningDate;
  return first === last ? formatMorningDate(first) : `${formatMorningDate(first)} – ${formatMorningDate(last)}`;
}

function Band({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[11px] tracking-[0.22em] text-zinc-400 uppercase">{title}</h2>
      {blurb ? <p className="mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-zinc-400">{blurb}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Efficiency as the hero, then the four figures that explain it. */
function Numbers({ week, deltas }: { week: WeekGeometry; deltas: WeekDeltas | null }) {
  const band = efficiencyBand(week.meanEfficiencyPct);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile
        span
        label="Sleep efficiency"
        value={`${Math.round(week.meanEfficiencyPct)}%`}
        delta={deltas ? deltaLabel(deltas.efficiencyPct, "pts", true) : null}
        foot={band.label}
        tone={band.tone}
      />
      <Tile
        label="Asleep"
        value={formatDuration(week.meanTotalSleepMinutes)}
        delta={deltas ? deltaLabel(deltas.totalSleepMinutes, "min", true) : null}
      />
      <Tile
        label="In bed"
        value={formatDuration(week.meanTimeInBedMinutes)}
        delta={deltas ? deltaLabel(deltas.timeInBedMinutes, "min", null) : null}
      />
      <Tile
        label="To fall asleep"
        value={`${week.meanLatencyMinutes} min`}
        delta={deltas ? deltaLabel(deltas.latencyMinutes, "min", false) : null}
      />
      <Tile
        label="Awake in the night"
        value={`${week.meanWasoMinutes} min`}
        delta={deltas ? deltaLabel(deltas.wasoMinutes, "min", false) : null}
      />
    </div>
  );
}

type Delta = { text: string; good: boolean | null };

/**
 * Week-over-week movement.
 *
 * `upIsGood` is per-figure and not obvious: more sleep is good, more time in bed is
 * neither, and more minutes lying awake is not. Passing null means the arrow gets
 * no colour at all rather than being quietly scored the wrong way.
 */
function deltaLabel(value: number | null, unit: string, upIsGood: boolean | null): Delta | null {
  if (value === null) return null;
  const rounded = unit === "pts" ? Math.round(value * 10) / 10 : Math.round(value);
  if (rounded === 0) return { text: `level on last week`, good: null };
  const sign = rounded > 0 ? "+" : "−";
  const good = upIsGood === null ? null : rounded > 0 === upIsGood;
  return { text: `${sign}${Math.abs(rounded)} ${unit} on last week`, good };
}

function Tile({
  label,
  value,
  delta,
  foot,
  tone,
  span = false,
}: {
  label: string;
  value: string;
  delta?: Delta | null;
  foot?: string;
  tone?: "steady" | "watch";
  span?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3",
        span && "col-span-2",
      )}
    >
      <p className="text-[11px] tracking-[0.14em] text-zinc-400 uppercase">{label}</p>
      <p
        className={cn(
          "font-heading mt-0.5 tabular-nums text-zinc-50",
          span ? "text-[2.6rem] leading-none" : "text-[1.75rem] leading-tight",
        )}
      >
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            "mt-1 text-[11.5px] tabular-nums",
            delta.good === null ? "text-zinc-400" : delta.good ? "text-violet-200" : "text-amber-200",
          )}
        >
          {delta.text}
        </p>
      ) : null}
      {foot ? (
        <p
          className={cn(
            "mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11.5px]",
            tone === "watch"
              ? "border-amber-300/30 bg-amber-300/[0.07] text-amber-200"
              : "border-white/10 text-zinc-300",
          )}
        >
          {foot}
        </p>
      ) : null}
    </div>
  );
}

function Sentence({ week }: { week: WeekGeometry }) {
  const said = weekSentence(week);
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="font-heading text-[1.15rem] leading-snug text-zinc-50">{said.lead}</p>
      <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-zinc-300">{said.where}</p>
    </div>
  );
}

/** The two ends of the week, side by side, as facts rather than paragraphs. */
function BetterAndWorse({
  split,
  units,
}: {
  split: { best: ScoredNight[]; worst: ScoredNight[] };
  units: Profile["units"];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Column heading={`${split.best.length} best nights`} nights={split.best} units={units} good />
      <Column heading={`${split.worst.length} worst nights`} nights={split.worst} units={units} />
    </div>
  );
}

function Column({
  heading,
  nights,
  units,
  good = false,
}: {
  heading: string;
  nights: ScoredNight[];
  units: Profile["units"];
  good?: boolean;
}) {
  const effs = nights.map((n) => Math.round(n.geometry.efficiencyPct));
  const drinkNights = nights.filter((n) => n.report.drank).length;
  const beds = nights.map((n) => n.report.inBedAt!).sort();
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/[0.03] px-3.5 py-3",
        good ? "border-violet-300/25" : "border-white/8",
      )}
    >
      <p className="text-[11px] tracking-[0.14em] text-zinc-400 uppercase">{heading}</p>
      <p className="mt-1 text-[15px] text-zinc-50">
        {nights.map((n) => weekdayOf(n)).join(", ")}
      </p>
      <ul className="mt-2 space-y-1 text-[13px] text-zinc-300">
        <li>
          In bed {formatClock(beds[0]!, units)}
          {beds.length > 1 && beds[0] !== beds[beds.length - 1]
            ? `–${formatClock(beds[beds.length - 1]!, units)}`
            : ""}
        </li>
        <li className="tabular-nums">
          {Math.min(...effs)}
          {Math.min(...effs) === Math.max(...effs) ? "" : `–${Math.max(...effs)}`}% efficiency
        </li>
        <li>
          {drinkNights === 0
            ? "No alcohol on any"
            : drinkNights === nights.length
              ? "Alcohol on all"
              : `Alcohol on ${drinkNights}`}
        </li>
      </ul>
    </div>
  );
}

function weekdayOf(night: ScoredNight): string {
  const d = new Date(`${night.report.morningDate}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? night.report.morningDate.slice(5)
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]!;
}

/** Filed mornings, but none of them carry the clocks the numbers are built from. */
function AwaitingGeometry({ count }: { count: number }) {
  return (
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/4 p-4">
      <p className="text-sm text-zinc-100">The week read starts with tomorrow morning.</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
        Your {count} filed morning{count === 1 ? "" : "s"} came from an older version of the
        interview, which never asked what time you got into bed or out of it. Without those two
        clocks there is no sleep efficiency, so nothing here is estimated from them. The next
        morning you file will draw the first night.
      </p>
      <DiaryLink
        href="/check-in"
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-sky-300 px-4 text-sm text-zinc-950"
      >
        Morning interview
      </DiaryLink>
    </div>
  );
}

function EmptyWeek({ onSample, notes }: { onSample: () => void; notes: SleepNote[] }) {
  return (
    <>
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/4 p-4">
        <p className="text-sm text-zinc-100">No mornings yet.</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
          File tomorrow morning and the first night appears here. Already filed on the other
          Circadia? Fold a locked copy in You — the two files do not update each other on their own.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <DiaryLink
            href="/check-in"
            className="inline-flex min-h-11 items-center rounded-full bg-sky-300 px-4 text-sm text-zinc-950"
          >
            Morning interview
          </DiaryLink>
          <DiaryLink
            href="/you"
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-[15px] text-zinc-200"
          >
            Fold nights in
          </DiaryLink>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-[15px] text-zinc-200"
            onClick={onSample}
          >
            Load sample week
          </button>
        </div>
      </div>
      {notes.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-[11px] tracking-[0.22em] text-zinc-400 uppercase">
            Before the first morning
          </h2>
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </section>
      ) : null}
    </>
  );
}

/**
 * A section the reader opens rather than scrolls past.
 *
 * Native `<details>` so it works before hydration, keeps its own keyboard and
 * screen-reader behaviour, and is findable by the browser's own find-in-page.
 */
function Disclosure({
  summary,
  hint,
  children,
  className,
}: {
  summary: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group rounded-3xl border border-white/8 bg-white/[0.03]", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-300">
        <span>
          {summary}
          {hint ? <span className="ml-2 text-[13px] text-zinc-400">{hint}</span> : null}
        </span>
        <span
          aria-hidden
          className="text-zinc-400 transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  );
}

function WeekColumn({
  kicker,
  items,
  tone,
  numbered = false,
}: {
  kicker: string;
  items: string[];
  tone: "worked" | "hurt" | "advice";
  numbered?: boolean;
}) {
  const rule =
    tone === "worked"
      ? "border-violet-300/30"
      : tone === "hurt"
        ? "border-zinc-500/45"
        : "border-zinc-100/20";
  return (
    <div className={`border-l ${rule} pl-4`}>
      <p className="text-[10px] tracking-[0.2em] text-zinc-400 uppercase">{kicker}</p>
      <ul className="mt-2 space-y-2.5">
        {items.map((item, i) => (
          <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-300">
            <span className="mt-px w-4 shrink-0 text-[11px] text-zinc-400">
              {numbered ? String(i + 1) : "·"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoteCard({ note }: { note: SleepNote }) {
  return (
    <article className="rounded-3xl border border-white/8 bg-white/4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] tracking-[0.16em] text-zinc-400 uppercase">
          {NOTE_KIND_LABEL[note.kind] ?? note.kind}
        </p>
        <p className="text-[10px] text-zinc-400">{note.confidence}</p>
      </div>
      <h3 className="mt-1 text-sm text-zinc-50">{note.title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{note.body}</p>
      {note.sourceIds.length > 0 ? (
        <p className="mt-2 text-[10px] text-zinc-400">
          {note.sourceIds
            .map((id) => researchById(id)?.title)
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </article>
  );
}
