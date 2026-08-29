"use client";

import { useEffect, useState } from "react";
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
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-8">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Library</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">What we are willing to say.</h1>
      <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-zinc-400">
        Conservative sleep science, written twice: first in plain language, then the note with
        sources. Each note is stamped with the month a person last checked it against current
        guidelines. Tests fail if a stamp is more than a year old. This is not a live paper feed —
        Circadia does not scrape PubMed. After a morning I pin the one page that night actually
        earned. The rest of the shelf stays here to browse. Paste your own notes below if you want
        Circadia to remember them as yours — not as truth. Stays on this device, not a cloud.
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

      <section className="mt-8">
        <h2 className="text-sm text-zinc-200">Your notes / research</h2>
        <Textarea
          value={state.researchNotes}
          onChange={(e) => setResearchNotes(e.target.value)}
          placeholder="Paste a paper abstract, a clinician’s instruction, anything Circadia should remember as your note — not as truth."
          className="mt-2 min-h-32 rounded-3xl border-white/10 bg-white/5"
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
    <article id={article.id} className="scroll-mt-24 border border-white/8 bg-white/[0.03]">
      <button type="button" className="w-full px-4 py-3 text-left hover:bg-white/5" onClick={onToggle}>
        <p className="text-sm text-zinc-100">{article.title}</p>
        <p className="mt-1 text-xs text-zinc-500">{article.summary}</p>
        <p className="mt-2 text-[10px] tracking-[0.16em] text-zinc-600 uppercase">
          Reviewed through {formatReviewedThrough(article.reviewedThrough)}
          {article.confidence === "low" ? " · mixed evidence" : ""}
        </p>
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
