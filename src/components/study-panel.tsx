"use client";

import { useEffect, useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { ConsentScreen } from "@/components/consent-screen";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { normalizeInviteCode, normalizeInviteCodeV2 } from "@/lib/invite";
import { isPhoneNative } from "@/lib/phone-native";
import { operatorPublicFingerprint } from "@/lib/operator-public";
import { tonightNight } from "@/lib/observation";
import { useWallClock } from "@/lib/wall-clock";

function lastSentLabel(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StudyPanel() {
  const { state, enrollSolo, leaveStudy, sendStudyNow } = useCircadia();
  const study = state.study;
  const now = useWallClock();
  const night = tonightNight(state.episode, state.reports, now);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const phone = isPhoneNative();

  useEffect(() => {
    void operatorPublicFingerprint().then(setFingerprint);
  }, []);

  if (pendingCode) {
    return (
      <ConsentScreen
        inviteCode={pendingCode}
        onNotNow={() => {
          setPendingCode(null);
        }}
      />
    );
  }

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
      <p className="text-[10px] font-medium tracking-[0.22em] text-zinc-500 uppercase">Study</p>
      {!study.consented ? (
        <>
          <h2 className="font-heading mt-1 text-[1.35rem] leading-tight text-zinc-50">
            Not in a test
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            Everything stays on this device. If you were sent an invite code, you can join here.
          </p>
          <label className="mt-5 block text-[12px] text-zinc-500">
            Invite code
            <input
              className="mt-1.5 h-11 w-full rounded-full border border-white/15 bg-transparent px-4 text-[15px] text-zinc-100"
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value);
                setInviteError(null);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11 rounded-full border-white/15 px-4 text-[15px]"
            onClick={() => {
              const code = inviteCode.trim();
              if (!normalizeInviteCodeV2(code) && !normalizeInviteCode(code)) {
                setInviteError("That is not an invite.");
                return;
              }
              void enrollSolo;
              setInviteError(null);
              setPendingCode(code);
            }}
          >
            Start the shakedown
          </Button>
          {inviteError ? <p className="mt-2 text-[12px] text-red-300">{inviteError}</p> : null}
        </>
      ) : (
        <>
          <h2 className="font-heading mt-1 text-[1.35rem] leading-tight text-zinc-50">In the test</h2>
          {night !== null ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">Night {night} of 14</p>
          ) : null}
          <p className="mt-3 text-[12px] text-zinc-400">
            {study.lastStatus === "held"
              ? "Waiting to send — it will go when you're online."
              : study.lastSentAt
                ? `Last sent ${lastSentLabel(study.lastSentAt)}`
                : study.lastStatus === "blocked"
                  ? "Blocked — anonymity check. Nothing left."
                  : study.lastStatus === "error"
                    ? "Last send did not land. Somnadia will try again after the next morning."
                    : "Waiting on the first morning."}
          </p>
          {study.lastError && study.lastStatus === "error" ? (
            <p className="mt-1 text-[12px] text-red-300">{study.lastError}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {!phone && (study.lastStatus === "error" || study.lastStatus === "blocked") ? (
              <Button
                type="button"
                className="h-10 cursor-pointer rounded-full btn-primary px-4"
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
              Leave the test
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
      {fingerprint ? (
        <p className="font-heading mt-4 text-[14px] tracking-[0.04em] tabular-nums text-zinc-500">
          Key {fingerprint}
        </p>
      ) : null}
    </section>
  );
}
