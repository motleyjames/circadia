"use client";

import { useState } from "react";
import { DELETE_TESTER_NIGHTS_CONFIRM } from "@/lib/confirm-word";

export function DeleteTesterNights({
  participantId,
  onDelete,
}: {
  participantId: string;
  onDelete: (participantId: string, confirmation: string) => Promise<true | string>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void onDelete(participantId, typed).then((result) => {
              setBusy(false);
              if (result === true) {
                setOpen(false);
                setTyped("");
                setError(null);
                return;
              }
              setError(result);
            });
          }}
        >
          <label className="text-[13px] text-op-muted">
            Type {DELETE_TESTER_NIGHTS_CONFIRM}
            <input
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setError(null);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-1 h-11 w-full rounded-lg border border-op-input bg-op-surface px-3 text-[14px] text-op-ink"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 cursor-pointer rounded-lg bg-op-safety px-3 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              Delete this tester&apos;s nights
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
            >
              Cancel
            </button>
          </div>
          {error ? <p className="text-[13px] text-op-safety">{error}</p> : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
        >
          Delete this tester&apos;s nights
        </button>
      )}
    </div>
  );
}
