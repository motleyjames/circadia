"use client";

import { useCircadia } from "@/context/circadia-store";
import { Button } from "@/components/ui/button";
import { hasContact } from "@/lib/contact";

export function StudyPanel() {
  const { state, joinStudy, leaveStudy, sendStudyNow } = useCircadia();
  const study = state.study;
  const profile = state.profile;
  const missingContact = Boolean(profile && !hasContact(profile.email, profile.phone));

  return (
    <section className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-5">
      <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">Study</p>
      {!study.consented ? (
        <>
          <p className="mt-2 text-[15px] text-zinc-200">Diary stays on this computer.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Join and nights, roster, and app faults leave on their own. Dreams and chat do not.
          </p>
          <Button
            type="button"
            className="mt-4 h-11 cursor-pointer rounded-full bg-zinc-50 px-5 text-zinc-950 hover:bg-zinc-200"
            onClick={joinStudy}
          >
            Join the study
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2 text-[15px] text-zinc-200">Pipeline on.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Nights and faults leave after each morning. No Send button. Dreams and chat stay here.
          </p>
          {missingContact ? (
            <p className="mt-2 text-[13px] text-amber-200/90">
              Add an email or phone above so this file can be found.
            </p>
          ) : null}
          <p className="mt-3 text-[12px] text-zinc-600">
            {study.lastStatus === "sent" && study.lastSentAt
              ? `Last reached James ${new Date(study.lastSentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : study.lastStatus === "blocked"
                ? "Blocked — anonymity check. Nothing left."
                : study.lastStatus === "error"
                  ? "Last send did not land. Circadia will try again after the next morning."
                  : "Waiting on the first morning."}
          </p>
          {study.lastError ? <p className="mt-1 text-[12px] text-red-300">{study.lastError}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {study.lastStatus === "error" || study.lastStatus === "blocked" ? (
              <Button
                type="button"
                className="h-10 cursor-pointer rounded-full bg-zinc-50 px-4 text-zinc-950"
                onClick={() => void sendStudyNow()}
              >
                Try again
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10 cursor-pointer rounded-full border-white/15"
              onClick={() => {
                if (
                  window.confirm(
                    "Stop sending nights? The diary stays here. The participant number stays unless you erase this device.",
                  )
                ) {
                  leaveStudy();
                }
              }}
            >
              Leave the study
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
