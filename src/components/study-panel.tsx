"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCircadia } from "@/context/circadia-store";
import { anonymityViolations, buildStudyPack } from "@/lib/study";

export function StudyPanel() {
  const { state, joinStudy, leaveStudy, sendStudyNow } = useCircadia();
  const study = state.study;
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    if (!study.consented || !study.participantId || !state.profile) return null;
    try {
      const pack = buildStudyPack(state);
      const leaks = anonymityViolations(pack, state);
      return { pack, leaks, error: null as string | null };
    } catch (err) {
      return { pack: null, leaks: [] as string[], error: err instanceof Error ? err.message : "Could not build pack." };
    }
  }, [state, study.consented, study.participantId]);

  async function send() {
    setBusy(true);
    await sendStudyNow();
    setBusy(false);
  }

  function download() {
    if (!preview?.pack) return;
    const blob = new Blob([JSON.stringify(preview.pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "circadia-study-pack.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mt-10">
      <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">Study</p>
      <h2 className="font-heading mt-1 text-xl text-zinc-50">What can leave</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
        Never sent: name, dream text, chat, medication names, height, weight, calendar dates.
        Payment for testers happens outside this app.
      </p>

      {!study.consented ? (
        <div className="mt-4">
          <p className="text-[13px] text-zinc-400">
            {study.asked
              ? "You kept the diary on this computer. You can join from here if that changes."
              : "You have not been asked yet."}
          </p>
          <Button
            type="button"
            className="mt-3 rounded-full bg-violet-400/90 text-zinc-950 hover:bg-violet-300"
            onClick={joinStudy}
          >
            Join the study
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] leading-relaxed text-zinc-500">
            Participant {study.participantId?.slice(0, 8)} ·{" "}
            {study.lastStatus === "sent" && study.lastSentAt
              ? `last sent ${new Date(study.lastSentAt).toLocaleString()}`
              : study.lastStatus === "blocked"
                ? "blocked — anonymity check"
                : study.lastStatus === "error"
                  ? "last send failed"
                  : "nothing sent yet"}
          </p>
          {study.lastError ? <p className="text-[12px] text-red-300">{study.lastError}</p> : null}
          {preview?.leaks.length ? (
            <p className="text-[12px] text-red-300">This pack would leak: {preview.leaks.join(", ")}. It will not send.</p>
          ) : null}
          {preview?.error ? <p className="text-[12px] text-red-300">{preview.error}</p> : null}
          {preview?.pack ? (
            <pre className="max-h-64 overflow-auto rounded-2xl border border-white/8 bg-black/40 p-3 text-[10px] leading-relaxed text-zinc-400">
              {JSON.stringify(preview.pack, null, 2)}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full bg-violet-400/90 text-zinc-950 hover:bg-violet-300"
              disabled={busy || !preview?.pack || Boolean(preview.leaks.length)}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send now"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/15"
              disabled={!preview?.pack}
              onClick={download}
            >
              Download JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/15"
              onClick={() => {
                if (window.confirm("Stop sending nights? The diary stays here. The participant number stays unless you erase this device.")) {
                  leaveStudy();
                }
              }}
            >
              Leave study
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
