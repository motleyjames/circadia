"use client";

import { useEffect, useRef, useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RESEARCH, type ResearchArticle } from "@/lib/research";
import { exportState } from "@/lib/storage";

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
  const { state, setResearchNotes, importJson } = useCircadia();
  const [openId, setOpenId] = useState<string | null>(() => hashId() || RESEARCH[0]?.id || null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyOpenFromHash(setOpenId);
    const onHash = () => applyOpenFromHash(setOpenId);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function download() {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "circadia-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJson(String(reader.result));
        setError("");
      } catch {
        setError("That file is not a Circadia JSON export.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-8">
      <p className="text-[11px] tracking-[0.28em] text-sky-300/80 uppercase">Library</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">What we are willing to say.</h1>
      <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-zinc-400">
        Conservative sleep science, written twice: first in plain language, then the note with
        sources. A stable wake time and “bed is for sleep” outrank aisle supplements. Upload your
        own notes or a Circadia JSON export — stays on this device, not a cloud.
      </p>

      <div className="mt-6 space-y-2">
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

      <section className="mt-8 space-y-2">
        <h2 className="text-sm text-zinc-200">Sleep data</h2>
        <p className="text-xs text-zinc-500">
          Export everything on this computer. Import a previous Circadia file. No account.
        </p>
        <div className="flex gap-2">
          <Button className="rounded-full bg-white/10 text-zinc-100" onClick={download}>
            Export JSON
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-white/15"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </div>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
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
      </button>
      {open ? (
        <div className="border-t border-white/8 px-4 py-3">
          <p className="text-[13px] leading-[1.55] text-zinc-200">{article.say ?? article.summary}</p>
          <p className="mt-4 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">The note</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{article.body}</p>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">{article.source}</p>
        </div>
      ) : null}
    </article>
  );
}
