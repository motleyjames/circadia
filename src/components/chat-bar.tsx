"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { CrisisLine } from "@/components/crisis-line";
import { useCircadia } from "@/context/circadia-store";
import { CLINIC_STARTERS } from "@/lib/chat";
import {
  consultDayLabel,
  formatConsultTime,
  groupConsultsByDay,
  localDayKey,
} from "@/lib/consult-threads";
import { researchById } from "@/lib/research";
import type { ConsultThread } from "@/lib/types";
import { cn } from "@/lib/utils";

function LibraryCite({ ids }: { ids: string[] }) {
  const notes = ids
    .map((id) => researchById(id))
    .filter((article): article is NonNullable<typeof article> => Boolean(article));
  if (notes.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[10px] tracking-[0.2em] text-zinc-600 uppercase">From the library</p>
      <ul className="mt-1 space-y-0.5">
        {notes.map((note) => (
          <li key={note.id}>
            <Link
              href={`/library#${note.id}`}
              prefetch={false}
              className="text-[11px] text-sky-300/80 transition-colors hover:text-sky-200"
              onClick={() => {
                if (window.location.pathname === "/library") {
                  queueMicrotask(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
                }
              }}
            >
              {note.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryList({
  groups,
  activeId,
  pendingDelete,
  onOpen,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  groups: ReturnType<typeof groupConsultsByDay>;
  activeId: string | null;
  pendingDelete: string | null;
  onOpen: (id: string) => void;
  onAskDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] tracking-[0.22em] text-zinc-600 uppercase">History</p>
      <div className="mt-3 space-y-5">
        {groups.map((group) => (
          <section key={group.key}>
            <p className="text-[11px] text-zinc-500">{group.label}</p>
            <ul className="mt-1 divide-y divide-white/8 border-y border-white/8">
              {group.threads.map((thread) => (
                <HistoryRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeId}
                  pending={pendingDelete === thread.id}
                  onOpen={() => onOpen(thread.id)}
                  onAskDelete={() => onAskDelete(thread.id)}
                  onConfirmDelete={() => onConfirmDelete(thread.id)}
                  onCancelDelete={onCancelDelete}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function HistoryRow({
  thread,
  active,
  pending,
  onOpen,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  thread: ConsultThread;
  active: boolean;
  pending: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <li className={cn("flex items-start gap-2 py-2.5", active && "bg-white/[0.03]")}>
      {pending ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <p className="truncate text-[13px] text-zinc-400">Delete this consult?</p>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              className="text-[11px] text-red-300/90 hover:text-red-200"
              onClick={onConfirmDelete}
            >
              Delete
            </button>
            <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300" onClick={onCancelDelete}>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
            <p className="truncate text-[13px] text-zinc-100">{thread.title}</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">{formatConsultTime(thread.updatedAt)}</p>
          </button>
          <button
            type="button"
            aria-label={`Delete ${thread.title}`}
            className="mt-0.5 shrink-0 text-[11px] text-zinc-600 hover:text-zinc-300"
            onClick={onAskDelete}
          >
            Delete
          </button>
        </>
      )}
    </li>
  );
}

export function ChatBar({
  variant,
  open: openProp = false,
  onClose,
}: {
  variant: "rail" | "sheet";
  open?: boolean;
  onClose?: () => void;
}) {
  const { state, sendChat, newConsult, openConsult, deleteConsult } = useCircadia();
  const [pane, setPane] = useState<"desk" | "files">("desk");
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rail = variant === "rail";
  const sheet = variant === "sheet";
  const open = rail || (sheet && openProp);
  const live = state.chat;
  const empty = live.length === 0;
  const groups = useMemo(
    () => groupConsultsByDay(state.consultHistory),
    [state.consultHistory],
  );
  const continuing =
    !empty && state.activeConsultId
      ? state.consultHistory.find((thread) => thread.id === state.activeConsultId)
      : undefined;
  const showStarters = empty && pane === "desk";
  const showThread = !empty && pane === "desk";

  useEffect(() => {
    if (!open || pane !== "desk") return;
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [live.length, open, pane]);

  useEffect(() => {
    if (!sheet || !openProp) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [sheet, openProp, onClose]);

  function submit(text = draft) {
    const next = text.trim();
    if (!next) return;
    sendChat(next);
    setDraft("");
    setPane("desk");
    inputRef.current?.focus();
  }

  function startNew() {
    newConsult();
    setPane("desk");
    setPendingDelete(null);
    setDraft("");
  }

  function resume(id: string) {
    openConsult(id);
    setPane("desk");
    setPendingDelete(null);
  }

  const files = (
    <HistoryList
      groups={groups}
      activeId={state.activeConsultId}
      pendingDelete={pendingDelete}
      onOpen={resume}
      onAskDelete={setPendingDelete}
      onConfirmDelete={(id) => {
        deleteConsult(id);
        setPendingDelete(null);
        if (state.activeConsultId === id) setPane("desk");
      }}
      onCancelDelete={() => setPendingDelete(null)}
    />
  );

  const body = (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        rail ? "px-1" : "px-5",
      )}
    >
      {showStarters ? (
        <div>
          <p className="max-w-[36ch] text-[13px] leading-[1.55] text-zinc-400">
            Ask the actual problem. I answer from your diary and the library. If I do not have a
            note, I say so — I will not invent a diagnosis.
          </p>
          <ul className="mt-5 divide-y divide-white/8 border-y border-white/8">
            {CLINIC_STARTERS.map((starter) => (
              <li key={starter.q}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                  onClick={() => submit(starter.q)}
                >
                  <span className="text-[13px] text-zinc-100">{starter.q}</span>
                  <span className="text-[12px] leading-snug text-zinc-500">{starter.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          {groups.length > 0 ? <div className="mt-8">{files}</div> : null}
        </div>
      ) : null}

      {showThread ? (
        <div className="flex flex-col gap-5 py-1">
          {live.map((msg) =>
            msg.role === "you" ? (
              <p
                key={msg.id}
                className="ml-auto max-w-[28ch] text-right text-[12px] leading-relaxed text-sky-200/75"
              >
                {msg.text}
              </p>
            ) : (
              <div key={msg.id} className="border-l border-sky-300/25 pl-3">
                <p className="max-w-[36ch] text-[13px] leading-[1.55] whitespace-pre-wrap text-zinc-200">
                  {msg.text}
                </p>
                {msg.citations && msg.citations.length > 0 ? (
                  <LibraryCite ids={msg.citations} />
                ) : null}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      ) : null}

      {pane === "files" && !empty ? files : null}
    </div>
  );

  const composer =
    pane === "files" && !empty ? null : (
      <div className="shrink-0">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Falling asleep, 3 a.m., a bottle on the aisle…"
            aria-label="Ask Circadia"
            className="h-11 min-w-0 flex-1 border border-white/12 bg-white/[0.04] px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-300/40"
          />
          <button
            type="submit"
            aria-label="Send"
            className="inline-flex size-11 shrink-0 items-center justify-center border border-sky-300/30 bg-sky-300 text-zinc-950 transition-colors hover:bg-sky-200"
          >
            <ArrowUp className="size-4" strokeWidth={2.25} />
          </button>
        </form>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          Diary plus the library. Not a prescription.
        </p>
      </div>
    );

  const crisis = <CrisisLine className="mt-2 shrink-0" />;

  const controls = (
    <div className="flex shrink-0 items-center gap-3">
      {empty && pane === "desk" ? null : (
        <button
          type="button"
          className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          onClick={startNew}
        >
          New
        </button>
      )}
      {!empty && pane === "desk" && groups.length > 0 ? (
        <button
          type="button"
          className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          onClick={() => setPane("files")}
        >
          History
        </button>
      ) : null}
    </div>
  );

  const continuingLabel = continuing
    ? localDayKey(continuing.updatedAt) === localDayKey(new Date().toISOString())
      ? "Continuing · today"
      : `Continuing · ${consultDayLabel(localDayKey(continuing.updatedAt))}`
    : null;

  if (rail) {
    return (
      <aside className="relative z-20 hidden w-[23.5rem] shrink-0 flex-col border-l border-sky-300/10 bg-[#07080f]/95 px-5 pt-6 pb-4 xl:flex">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-[1.65rem] leading-none text-zinc-50">Consult</h2>
            <p className="mt-2 max-w-[28ch] text-[12px] leading-snug text-zinc-500">
              {pane === "files"
                ? "Filed by day. Open one to continue."
                : continuingLabel ?? "Ranked answers. Named sources. Silence when the note does not exist."}
            </p>
          </div>
          {controls}
        </header>
        {body}
        <div className="mt-4">{composer}</div>
        {crisis}
      </aside>
    );
  }

  if (!openProp) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overscroll-none bg-[#07060f] xl:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consult-sheet-title"
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div>
          <h2 id="consult-sheet-title" className="font-heading text-[1.85rem] leading-none text-zinc-50">
            Consult
          </h2>
          <p className="mt-2 max-w-[28ch] text-[13px] leading-snug text-zinc-500">
            {pane === "files"
              ? "Filed by day. Open one to continue."
              : continuingLabel ?? "Ask the actual problem. Silence when the note does not exist."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {controls}
          <button
            type="button"
            className="inline-flex h-11 items-center text-[13px] text-zinc-400"
            onClick={() => onClose?.()}
          >
            Close
          </button>
        </div>
      </header>
      {body}
      <div className="px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {composer}
        {crisis}
      </div>
    </div>
  );
}
