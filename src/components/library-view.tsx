"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useCircadia } from "@/context/circadia-store";
import { Textarea } from "@/components/ui/textarea";
import { MorningReadingCard } from "@/components/morning-reading";
import { suggestMorningReadingForLogs } from "@/lib/morning-reading";
import {
  RESEARCH,
  formatReviewedThrough,
  researchSourceLine,
  type ResearchArticle,
} from "@/lib/research";

function hashId(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}

function applyOpenFromHash(setOpenId: (id: string) => void) {
  const id = hashId();
  if (!id) return;
  if (!RESEARCH.some((article) => article.id === id)) return;
  setOpenId(id);
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

export function LibraryView() {
  const { state, setResearchNotes } = useCircadia();
  const reading =
    state.profile && state.reports.length > 0
      ? suggestMorningReadingForLogs(state.profile, state.reports)
      : null;
  const [openId, setOpenId] = useState<string | null>(() => hashId() || RESEARCH[0]?.id || null);

  useEffect(() => {
    applyOpenFromHash(setOpenId);
    const onHash = () => applyOpenFromHash(setOpenId);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="phone-page-y min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Library</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">What we are willing to say.</h1>
      <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-zinc-400">
        The short version first. The longer note is underneath if you want it. After a morning I pin
        the one page that night actually earned. The rest of the shelf stays here to browse.
      </p>

      {reading ? (
        <MorningReadingCard
          reading={reading}
          kicker="Why this one, today"
          className="mt-8"
          onOpen={() => setOpenId(reading.articleId)}
        />
      ) : null}

      {reading ? (
        <p className="mt-8 text-[11px] tracking-[0.22em] text-zinc-500 uppercase">The rest of the shelf</p>
      ) : null}

      <div className={reading ? "mt-2 space-y-2" : "mt-6 space-y-2"}>
        {RESEARCH.map((article) => (
          <LibraryArticle
            key={article.id}
            article={article}
            open={openId === article.id}
            onToggle={() => setOpenId(openId === article.id ? null : article.id)}
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
    <article id={article.id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
      <button type="button" className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-white/[0.06]" onClick={onToggle}>
        <span className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug text-zinc-100">{article.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{article.summary}</p>
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
        <div className="border-t border-white/8 px-4 py-3">
          <p className="text-[13px] leading-[1.55] text-zinc-200">{article.say ?? article.summary}</p>
          <p className="mt-4 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">The note</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{article.body}</p>
          {article.confidence === "low" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-200/70">
              Evidence is mixed. Circadia will not overclaim this.
            </p>
          ) : null}
          <p className="mt-3 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">Sources</p>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">{researchSourceLine(article)}</p>
        </div>
      ) : null}
    </article>
  );
}
