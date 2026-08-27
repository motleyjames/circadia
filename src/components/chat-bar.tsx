"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatBar() {
  const { state, sendChat } = useCircadia();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chat.length, open]);

  function submit() {
    sendChat(draft);
    setDraft("");
    setOpen(true);
  }

  return (
    <div className="border-t border-white/8 bg-[#0d0b18]/95 px-3 pt-2 pb-2">
      {open ? (
        <div className="mb-2 max-h-56 overflow-y-auto rounded-2xl border border-white/8 bg-black/30 p-3">
          {state.chat.length === 0 ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              Ask about last night, melatonin, screens, dreams, or whether the week looks steady. I
              only use your logs, your profile, and Circadia&apos;s sleep library.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {state.chat.slice(-12).map((msg) => (
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
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      ) : null}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          className="text-[10px] tracking-[0.18em] text-zinc-500 uppercase"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Ask"}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Ask Circadia…"
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
    </div>
  );
}
