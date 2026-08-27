"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Send } from "lucide-react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { CLINIC_PROMPTS } from "@/lib/chat";
import { researchById } from "@/lib/research";
import { cn } from "@/lib/utils";

export function ChatBar({ variant }: { variant: "dock" | "rail" }) {
  const { state, sendChat } = useCircadia();
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const rail = variant === "rail";
  const open = rail || openFor === pathname;

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.chat.length, open]);

  function submit(text = draft) {
    sendChat(text);
    setDraft("");
    setOpenFor(pathname);
  }

  const thread = (
    <div
      className={cn(
        "overflow-y-auto rounded-2xl border border-white/8 bg-black/30 p-3",
        rail ? "min-h-0 flex-1" : "mb-2 max-h-56",
      )}
    >
      {state.chat.length === 0 ? (
        <div>
          <p className="text-xs leading-relaxed text-zinc-400">
            Ask the actual problem — falling asleep, 3 a.m., a bottle on the aisle, the clock. I
            answer from your diary and the library. I will not invent a diagnosis.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CLINIC_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
                onClick={() => submit(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(rail ? state.chat : state.chat.slice(-12)).map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                msg.role === "you"
                  ? "ml-auto bg-violet-500/20 text-violet-50"
                  : "bg-white/6 text-zinc-200",
              )}
            >
              {msg.text}
              {msg.role === "circadia" && msg.citations && msg.citations.length > 0 ? (
                <p className="mt-1.5 text-[10px] tracking-wide text-zinc-500">
                  {msg.citations
                    .map((id) => researchById(id)?.title)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );

  const composer = (
    <>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {rail ? null : (
          <button
            type="button"
            className="text-[10px] tracking-[0.18em] text-zinc-500 uppercase"
            onClick={() => setOpenFor((current) => (current === pathname ? null : pathname))}
          >
            {open ? "Hide" : "Ask"}
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setOpenFor(pathname)}
          placeholder="Ask about sleep…"
          className="h-10 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-300/40"
        />
        <Button
          type="submit"
          size="icon"
          className="size-10 rounded-full bg-violet-400/90 text-zinc-950 hover:bg-violet-300"
        >
          <Send className="size-4" />
        </Button>
      </form>
      <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-zinc-600">
        From your diary and the sleep library. Not a prescription.
      </p>
    </>
  );

  if (rail) {
    return (
      <aside className="relative z-20 hidden w-[22rem] shrink-0 flex-col border-l border-white/8 bg-[#0d0b18]/95 px-4 pt-6 pb-4 xl:flex">
        <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">Consult</p>
        <h2 className="font-heading mt-1 mb-4 text-xl text-zinc-50">Ask Circadia</h2>
        {thread}
        <div className="mt-3">{composer}</div>
      </aside>
    );
  }

  return (
    <div className="border-t border-white/8 bg-[#0d0b18]/95 px-3 pt-2 pb-2 xl:hidden">
      {open ? thread : null}
      {composer}
    </div>
  );
}
