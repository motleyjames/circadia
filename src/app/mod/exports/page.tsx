"use client";

import { useState } from "react";
import { OperatorChrome } from "@/components/operator-chrome";
import { OperatorGate } from "@/components/operator-gate";
import { useOperatorInbox } from "@/context/operator-inbox";
import { DELETE_STUDY_CONFIRM } from "@/lib/confirm-word";

export default function ExportsPage() {
  const { key, error, loading, booted, open, eraseStudyData } = useOperatorInbox();
  const [typed, setTyped] = useState("");
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [erased, setErased] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!booted) return null;
  if (!key) {
    return <OperatorGate error={error} loading={loading} onOpen={(secret) => void open(secret)} />;
  }

  return (
    <OperatorChrome active="exports">
      <div className="px-12 py-9">
        <h1 className="font-heading text-[36px] leading-[1.1] font-normal tracking-[-0.02em] text-op-ink">
          Diary exports
        </h1>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-op-body">
          A tester&apos;s 14-night diary will export from here once the detail page ships. Nothing is ready to
          print yet.
        </p>

        <section className="mt-12 max-w-[46ch] rounded-xl border border-op-line bg-op-surface px-6 py-6">
          <h2 className="text-[18px] font-semibold text-op-ink">Delete all study data</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-op-body">
            When the shakedown ends, type {DELETE_STUDY_CONFIRM} to delete every pack, the reject log,
            and the invite book. Operator&apos;s key pair stays. You have 30 days after the test ends.
          </p>
          <label className="mt-4 block text-[13px] text-op-muted">
            Type {DELETE_STUDY_CONFIRM}
            <input
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setEraseError(null);
                setErased(false);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-1.5 h-11 w-full rounded-lg border border-op-input bg-op-surface px-3 text-[15px] text-op-ink"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void eraseStudyData(typed).then((result) => {
                setBusy(false);
                if (result === true) {
                  setErased(true);
                  setTyped("");
                  return;
                }
                setEraseError(result);
              });
            }}
            className="mt-4 h-11 cursor-pointer rounded-lg bg-op-safety px-4 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            Delete all study data
          </button>
          {eraseError ? <p className="mt-3 text-[14px] text-op-safety">{eraseError}</p> : null}
          {erased ? <p className="mt-3 text-[14px] text-op-body">Study data is gone. The key pair is still here.</p> : null}
        </section>
      </div>
    </OperatorChrome>
  );
}
