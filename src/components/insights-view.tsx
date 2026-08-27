"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { buildSleepNotes } from "@/lib/advisor";
import { readDream } from "@/lib/dreams";
import { weekBreakdown } from "@/lib/metrics";
import { buildRecommendations } from "@/lib/recommendations";
import { researchById } from "@/lib/research";
import { formatClock, formatDuration, minutesToClock } from "@/lib/time";
import type { SleepNote } from "@/lib/types";

export function InsightsView() {
  const { state, loadSampleWeek, removeLatestReport } = useCircadia();
  const profile = state.profile!;
  const recs = useMemo(
    () => buildRecommendations(profile, state.reports),
    [profile, state.reports],
  );
  const notes = useMemo(() => buildSleepNotes(profile, state.reports), [profile, state.reports]);
  const week = useMemo(() => weekBreakdown(state.reports), [state.reports]);
  const dreamReports = state.reports.filter((r) => r.dream?.text);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-8">
      <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">Notes</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">The breakdown.</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Circadia reads your bubbles, your body stats, meds, and activity — then writes like a sleep
        scientist, not a horoscope. Confidence is labeled because guessing is how these apps get people hurt.
      </p>

      {state.demoWeek ? (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Sample week is loaded so you can see the seven-night gate. It is not your sleep. Log a real morning to replace it.
        </p>
      ) : null}

      {state.reports.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/4 p-4">
          <p className="text-sm text-zinc-200">No mornings yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Log tonight tomorrow. To see a full week of notes and the supplement gate, you can load a
            sample student week — it is clearly fake data.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/check-in"
              className="inline-flex items-center rounded-full bg-sky-300 px-4 py-2 text-sm text-zinc-950"
            >
              Morning interview
            </Link>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/15"
              onClick={() => {
                if (
                  state.reports.length > 0 &&
                  !window.confirm("Replace your mornings with a labeled sample week?")
                ) {
                  return;
                }
                loadSampleWeek();
              }}
            >
              Load sample week
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Stat label="mean sleep" value={formatDuration(week.meanDurationMinutes)} />
            <Stat label="rating" value={week.meanRating ? week.meanRating.toFixed(1) : "—"} />
            <Stat label="nights" value={String(state.reports.length)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-max items-end gap-2 pt-4 pb-2">
              {week.nights.map((n) => (
                <div key={n.reportId} className="flex w-10 flex-col items-center gap-1">
                  <div
                    className="w-6 rounded-full bg-gradient-to-t from-violet-700 to-sky-300"
                    style={{ height: `${Math.min(96, (n.durationMinutes / 600) * 96)}px` }}
                    title={`${n.morningDate} ${formatDuration(n.durationMinutes)}`}
                  />
                  <span className="text-[9px] text-zinc-500">{n.morningDate.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="mt-3 text-[13px] text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
            onClick={() => {
              if (!window.confirm("Erase the latest morning so you can fill it out again?")) return;
              removeLatestReport();
            }}
          >
            Erase the latest morning
          </button>
        </>
      )}

      <section className="mt-8">
        <h2 className="text-sm text-zinc-200">After enough data</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Melatonin / magnesium talk waits until {recs.nightsNeeded} mornings. You have {recs.nightsLogged}.
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-violet-400"
            style={{ width: `${Math.min(100, (recs.nightsLogged / recs.nightsNeeded) * 100)}%` }}
          />
        </div>
        {recs.ready ? (
          <div className="mt-4 space-y-3">
            {recs.supplements.map((s) => (
              <article key={s.id + s.title} className="rounded-3xl border border-violet-300/25 bg-violet-500/10 p-4">
                <p className="text-[10px] tracking-[0.18em] text-violet-200 uppercase">
                  {s.confidence} confidence
                </p>
                <h3 className="mt-1 text-sm text-zinc-50">{s.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-300">{s.body}</p>
                <p className="mt-2 text-[11px] text-zinc-500">{s.notFirstLine}</p>
              </article>
            ))}
            <div className="rounded-3xl border border-white/10 p-4">
              <p className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">Use tonight</p>
              {recs.suggestedSessions.map((s) => (
                <p key={`${s.kind}-${s.id}`} className="mt-2 text-xs text-zinc-300">
                  <span className="text-zinc-100">{labelSession(s.id)}</span> — {s.why}
                </p>
              ))}
              <Link
                href="/"
                className="mt-3 inline-flex rounded-full bg-white/10 px-4 py-2 text-xs text-zinc-100"
              >
                Open wind-down
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            Wind-down is available now. Supplement notes stay locked so we do not guess from two nights.
          </p>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm text-zinc-200">Advisor notes</h2>
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}
      </section>

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
                    {r.morningDate} · asleep {formatClock(r.fellAsleepAt, profile.units)}
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
          Mid-sleep average ~{formatClock(minutesToClock(week.meanMidpointMinutes), profile.units)}. Wake spread ~
          {Math.round(week.wakeSpreadMinutes)} min.
        </p>
      ) : null}
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

function labelSession(id: string) {
  const map: Record<string, string> = {
    "478": "4–7–8 breathing",
    "body-scan": "Body scan",
    pmr: "Muscle release",
    brown: "Brown noise",
    pink: "Pink noise",
    rain: "Rain bed",
    ocean: "Slow ocean",
  };
  return map[id] ?? id;
}
