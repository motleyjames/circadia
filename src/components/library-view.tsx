"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { useCircadia } from "@/context/circadia-store";
import { Textarea } from "@/components/ui/textarea";
import { MorningReadingCard } from "@/components/morning-reading";
import { morningReadingHistory, orderLibraryArticles } from "@/lib/morning-reading";
import {
  RESEARCH,
  formatReviewedThrough,
  researchSourceLine,
  type ResearchArticle,
} from "@/lib/research";

function readHashId(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}

function useHashId(): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("hashchange", onChange);
      return () => window.removeEventListener("hashchange", onChange);
    },
    readHashId,
    () => "",
  );
}

export function LibraryView() {
  const { state, setResearchNotes } = useCircadia();
  const hash = useHashId();
  const history = useMemo(
    () =>
      state.profile && state.reports.length > 0
        ? morningReadingHistory(state.profile, state.reports)
        : [],
    [state.profile, state.reports],
  );
  const reading = history.at(-1) ?? null;
  const recentIds = useMemo(() => history.map((row) => row.articleId), [history]);
  const shelf = useMemo(
    () => orderLibraryArticles(RESEARCH, reading?.articleId ?? null, recentIds),
    [reading?.articleId, recentIds],
  );
  const [pickedId, setPickedId] = useState<string | null | undefined>(undefined);
  const [hashSeen, setHashSeen] = useState(hash);
  const hashedId = RESEARCH.some((article) => article.id === hash) ? hash : "";
  if (hash !== hashSeen) {
    setHashSeen(hash);
    if (hashedId) setPickedId(hashedId);
  }
  const openId = pickedId === undefined ? (reading?.articleId ?? null) : pickedId;

  useEffect(() => {
    if (!hashedId) return;
    requestAnimationFrame(() => {
      document.getElementById(hashedId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [hashedId]);

  return (
    <div className="phone-page-y min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Library</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">What we are willing to say.</h1>
      <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-zinc-400">
        The short version first. The longer note is underneath if you want it. After a morning I pin
        the one page that night actually earned — and I will not hand you yesterday&apos;s page again
        if another still-justified note is waiting.
      </p>

      {reading ? (
        <MorningReadingCard
          reading={reading}
          kicker="Why this one, today"
          className="mt-8"
          onOpen={() => setPickedId(reading.articleId)}
        />
      ) : null}

      {reading ? (
        <p className="mt-8 text-[11px] tracking-[0.22em] text-zinc-500 uppercase">The rest of the shelf</p>
      ) : null}

      <div className={reading ? "mt-2 space-y-2" : "mt-6 space-y-2"}>
        {shelf.map((article) => (
          <LibraryArticle
            key={article.id}
            article={article}
            open={openId === article.id}
            onToggle={() => setPickedId(openId === article.id ? null : article.id)}
          />
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm text-zinc-200">A line for yourself</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Something a clinician told you, or a sentence you want this diary to remember.
        </p>
        <Textarea
          value={state.researchNotes}
          onChange={(e) => setResearchNotes(e.target.value)}
          placeholder="Stays on this device."
          className="mt-2 min-h-24 rounded-3xl border-white/10 bg-white/5"
        />
      </section>
    </div>
  );
}

function LibraryArticle({
  article,
  open,
  onToggle,
}: {
  article: ResearchArticle;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article id={article.id} className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/8 bg-white/[0.03]">
      <button type="button" className="flex w-full items-start gap-3 px-4 py-4 text-left active:bg-white/[0.06]" onClick={onToggle}>
        <span className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug text-zinc-100">{article.title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{article.summary}</p>
          <p className="mt-2 text-[11px] text-zinc-600">
            Reviewed through {formatReviewedThrough(article.reviewedThrough)}
            {article.confidence === "low" ? " · mixed evidence" : ""}
          </p>
        </span>
        <ChevronRight
          className={`mt-0.5 size-5 shrink-0 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-white/8 px-4 py-4">
          <p className="text-[14px] leading-[1.55] text-zinc-200">{article.say ?? article.summary}</p>
          <p className="mt-5 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">The note</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{article.body}</p>
          {article.confidence === "low" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-200/70">
              Evidence is mixed. Circadia will not overclaim this.
            </p>
          ) : null}
          <p className="mt-4 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">Sources</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">{researchSourceLine(article)}</p>
        </div>
      ) : null}
    </article>
  );
}
