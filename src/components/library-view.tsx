"use client";

import { useRef, useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RESEARCH } from "@/lib/research";
import { exportState } from "@/lib/storage";

export function LibraryView() {
  const { state, setResearchNotes, importJson } = useCircadia();
  const [openId, setOpenId] = useState<string | null>(RESEARCH[0]?.id ?? null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Conservative sleep science. A stable wake time and “bed is for sleep” outrank aisle
        supplements. Upload your own notes or a Circadia JSON export — stays on this device, not a
        cloud.
      </p>

      <div className="mt-6 space-y-2">
        {RESEARCH.map((article) => {
          const open = openId === article.id;
          return (
            <article key={article.id} className="rounded-3xl border border-white/8 bg-white/4">
              <button
                type="button"
                className="w-full px-4 py-3 text-left"
                onClick={() => setOpenId(open ? null : article.id)}
              >
                <p className="text-sm text-zinc-100">{article.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{article.summary}</p>
              </button>
              {open ? (
                <div className="border-t border-white/8 px-4 py-3">
                  <p className="text-xs leading-relaxed text-zinc-300">{article.body}</p>
                  <p className="mt-2 text-[10px] text-zinc-600">{article.source}</p>
                </div>
              ) : null}
            </article>
          );
        })}
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
