"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCircadia } from "@/context/circadia-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { buildSleepNotes } from "@/lib/advisor";
import { readDream } from "@/lib/dreams";
import { weekBreakdown } from "@/lib/metrics";
import { researchById } from "@/lib/research";
import { socialJetLagCopyFromReports, socialJetLagSleepNote } from "@/lib/social-jetlag-copy";
import { formatClock, formatDuration, minutesToClock } from "@/lib/time";
import type { SleepNote } from "@/lib/types";
import { MorningReadingCard } from "@/components/morning-reading";
import { suggestMorningReadingForLogs } from "@/lib/morning-reading";
import { buildWeekReview, formatMorningDate, lastSevenReports } from "@/lib/week-review";

export function InsightsView() {
  const { state, loadSampleWeek } = useCircadia();
  const [sampleOpen, setSampleOpen] = useState(false);
  const profile = state.profile;
  const windowReports = useMemo(() => lastSevenReports(state.reports), [state.reports]);
  const notes = useMemo(
    () => (profile ? buildSleepNotes(profile, state.reports) : []),
    [profile, state.reports],
  );
  const sjlNote = useMemo(
    () =>
      profile
        ? socialJetLagSleepNote(
            socialJetLagCopyFromReports(state.reports, profile.scheduledDays, new Date()),
          )
        : null,
    [profile, state.reports],
  );
  const week = useMemo(() => weekBreakdown(windowReports), [windowReports]);
  const review = useMemo(
    () => (profile ? buildWeekReview(profile, state.reports) : null),
    [profile, state.reports],
  );
  const reading = useMemo(
    () => (profile ? suggestMorningReadingForLogs(profile, state.reports) : null),
    [profile, state.reports],
  );
  const dreamReports = state.reports.filter((r) => r.dream?.text);
  if (!profile) return null;

  const empty = state.reports.length === 0;

  return (
    <div className="phone-page-y min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Notes</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">The week.</h1>
      <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-zinc-400">
        The better nights, the worse ones, and what I would try next. After each morning I hand you
        one page to read — the one that night earned. If the page from last night would fire again, I
        hand the next still-justified note instead of recycling it.
      </p>

      {state.demoWeek ? (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Sample mornings. The overview uses the last seven. It is not your sleep. Log a real morning
          to replace it.
        </p>
      ) : null}

      {sjlNote ? (
        <section className="mt-8 space-y-3">
          <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">Last 4 weeks</p>
          <NoteCard note={sjlNote} />
        </section>
      ) : null}

      {empty ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/4 p-4">
          <p className="text-sm text-zinc-200">No mornings yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Log tonight tomorrow. The week read starts on night one — honest, and labeled as a
            sketch until there are a few mornings. Load a sample student week if you want to see
            the shape first. It is clearly fake data.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/check-in"
              className="inline-flex items-center rounded-full bg-sky-300 px-4 py-2 text-sm text-zinc-950"
            >
              Morning interview
            </Link>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-[15px] text-zinc-200"
              onClick={() => {
                if (state.reports.length > 0) {
                  setSampleOpen(true);
                  return;
                }
                loadSampleWeek();
              }}
            >
              Load sample week
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Stat label="mean sleep" value={formatDuration(week.meanDurationMinutes)} />
            <Stat label="rating" value={week.meanRating ? week.meanRating.toFixed(1) : "—"} />
            <Stat
              label="nights"
              value={
                state.reports.length > week.nights.length
                  ? `${week.nights.length} of ${state.reports.length}`
                  : String(week.nights.length)
              }
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-max items-end gap-2 pt-4 pb-2">
              {week.nights.map((n) => (
                <div key={n.reportId} className="flex w-12 flex-col items-center gap-1">
                  <div
                    className="w-6 rounded-full bg-gradient-to-t from-sky-900 to-sky-300"
                    style={{ height: `${Math.min(96, (n.durationMinutes / 600) * 96)}px` }}
                    title={`${formatMorningDate(n.morningDate)} ${formatDuration(n.durationMinutes)}`}
                  />
                  <span className="text-[9px] text-zinc-500">{formatMorningDate(n.morningDate)}</span>
                </div>
              ))}
            </div>
          </div>

          {reading ? <MorningReadingCard reading={reading} className="mt-10" /> : null}
        </>
      )}

      {review && review.nightsLogged > 0 ? (
        <section className="mt-10">
          <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">This week</p>
          <h2 className="font-heading mt-1 text-[1.65rem] leading-tight text-zinc-50">{review.headline}</h2>
          <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-zinc-500">{review.kicker}</p>

          <div className="mt-6 border-l border-sky-300/35 pl-4">
            <p className="text-[10px] tracking-[0.2em] text-zinc-600 uppercase">What I see</p>
            <div className="mt-2 max-w-[52ch] space-y-3">
              {review.read.split("\n\n").map((para) => (
                <p key={para.slice(0, 48)} className="text-[15px] leading-relaxed text-zinc-200">
                  {para}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-8 space-y-7">
            {review.worked.length > 0 ? (
              <WeekColumn kicker="Better nights" items={review.worked} tone="worked" />
            ) : null}
            {review.hurt.length > 0 ? (
              <WeekColumn kicker="Worse nights" items={review.hurt} tone="hurt" />
            ) : null}
            <WeekColumn kicker="What I would try" items={review.doThis} tone="advice" numbered />
          </div>

          <Link
            href="/"
            className="mt-8 inline-flex min-h-11 items-center text-[17px] font-medium text-sky-300"
          >
            Open wind-down
          </Link>
        </section>
      ) : null}

      {empty ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm text-zinc-200">Before the first morning</h2>
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </section>
      ) : null}

      {dreamReports.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm text-zinc-200">Dreams</h2>
          {dreamReports
            .slice()
            .reverse()
            .map((r) => {
              const read = r.dream?.wantMeaning ? readDream(r.dream.text, r, profile) : null;
              return (
                <article key={r.id} className="rounded-3xl border border-white/8 bg-black/20 p-4">
                  <p className="text-[11px] text-zinc-500">
                    {formatMorningDate(r.morningDate)} · asleep {formatClock(r.fellAsleepAt, profile.units)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-200">{r.dream?.text}</p>
                  {read ? (
                    <div className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-400">
                      <p>{read.physiology}</p>
                      <p>{read.meaning}</p>
                      <p className="text-zinc-600">{read.caution}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-zinc-600">Stored only. Meaning was off.</p>
                  )}
                </article>
              );
            })}
        </section>
      ) : null}

      {week.nights.length > 0 ? (
        <p className="mt-8 text-[11px] text-zinc-600">
          Mid-sleep average ~{formatClock(minutesToClock(week.meanMidpointMinutes), profile.units)}. Wake
          spread ~{Math.round(week.wakeSpreadMinutes)} min.
        </p>
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
      ? "border-sky-300/30"
      : tone === "hurt"
        ? "border-zinc-500/45"
        : "border-zinc-100/20";
  return (
    <div className={`border-l ${rule} pl-4`}>
      <p className="text-[10px] tracking-[0.2em] text-zinc-600 uppercase">{kicker}</p>
      <ul className="mt-2 space-y-2.5">
        {items.map((item, i) => (
          <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-300">
            <span className="mt-px w-4 shrink-0 text-[11px] text-zinc-600">
              {numbered ? String(i + 1) : "·"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/4 px-3 py-3">
      <p className="text-[10px] tracking-[0.16em] text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-lg text-zinc-50">{value}</p>
    </div>
  );
}

function NoteCard({ note }: { note: SleepNote }) {
  return (
    <article className="rounded-3xl border border-white/8 bg-white/4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] tracking-[0.16em] text-zinc-500 uppercase">{note.kind}</p>
        <p className="text-[10px] text-zinc-600">{note.confidence}</p>
      </div>
      <h3 className="mt-1 text-sm text-zinc-50">{note.title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{note.body}</p>
      {note.sourceIds.length > 0 ? (
        <p className="mt-2 text-[10px] text-zinc-600">
          {note.sourceIds
            .map((id) => researchById(id)?.title)
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </article>
  );
}
