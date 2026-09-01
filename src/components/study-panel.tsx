"use client";

import { useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { STUDY_HELD_ERROR } from "@/lib/study-client";

export function StudyPanel() {
  const { state, joinStudy, leaveStudy, sendStudyNow } = useCircadia();
  const study = state.study;
  const [leaveOpen, setLeaveOpen] = useState(false);

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
      <p className="text-[10px] font-medium tracking-[0.22em] text-zinc-500 uppercase">Study</p>
      {!study.consented ? (
        <>
          <h2 className="font-heading mt-1 text-[1.35rem] leading-tight text-zinc-50">
            Diary stays on this device
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            Join and nights, roster, and app faults leave on their own. Dreams and chat do not.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5 h-11 rounded-full border-white/15 px-4 text-[15px]"
            onClick={joinStudy}
          >
            Join the study
          </Button>
        </>
      ) : (
        <>
          <h2 className="font-heading mt-1 text-[1.35rem] leading-tight text-zinc-50">
            {study.lastStatus === "held" ? "Pipeline waiting" : "Pipeline on"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            {study.lastStatus === "held"
              ? STUDY_HELD_ERROR
              : "Nights and faults leave after each morning. No Send button. Dreams and chat stay here."}
          </p>
          <p className="mt-3 text-[12px] text-zinc-600">
            {study.lastStatus === "sent" && study.lastSentAt
              ? `Last reached James ${new Date(study.lastSentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : study.lastStatus === "blocked"
                ? "Blocked — anonymity check. Nothing left."
                : study.lastStatus === "error"
                  ? "Last send did not land. Circadia will try again after the next morning."
                  : study.lastStatus === "held"
                    ? "Nothing has left this phone."
                    : "Waiting on the first morning."}
          </p>
          {study.lastError && study.lastStatus === "error" ? (
            <p className="mt-1 text-[12px] text-red-300">{study.lastError}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {study.lastStatus === "error" || study.lastStatus === "blocked" ? (
              <Button
                type="button"
                className="h-10 cursor-pointer rounded-full bg-zinc-50 px-4 text-zinc-950"
                onClick={() => void sendStudyNow()}
              >
                Try again
              </Button>
            ) : null}
            <button
              type="button"
              className="h-10 px-1 text-[13px] text-zinc-500 hover:text-zinc-300"
              onClick={() => setLeaveOpen(true)}
            >
              Leave the study
            </button>
          </div>
          <ConfirmDialog
            open={leaveOpen}
            onOpenChange={setLeaveOpen}
            title="Leave the study"
            description="Stop sending nights. The diary stays here. The participant number stays unless you erase this device."
            confirmLabel="Leave"
            destructive
            onConfirm={leaveStudy}
          />
        </>
      )}
    </section>
  );
}
