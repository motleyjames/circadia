"use client";

import { useState } from "react";
import { ConsentScreen } from "@/components/consent-screen";
import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";
import { hapticLight } from "@/lib/haptics";
import { normalizeInviteCode, normalizeInviteCodeV2 } from "@/lib/invite";

export function StudyGate({ onNotNow }: { onNotNow: () => void }) {
  const { enrollSolo } = useCircadia();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  if (pendingCode) {
    return <ConsentScreen inviteCode={pendingCode} onNotNow={onNotNow} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Mark className="size-7" />
      <h1 className="font-heading mt-10 max-w-[16ch] text-[2.4rem] leading-[1.05] tracking-tight text-zinc-50">
        Joining a test?
      </h1>
      <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        Enter the invite code you were sent. The next screen explains exactly what is shared.
      </p>
      <div className="mt-auto flex flex-col gap-3 pt-10">
        <label className="text-[12px] text-zinc-500">
          Invite code
          <input
            className="mt-1.5 h-14 w-full rounded-full border border-white/12 bg-transparent px-5 text-[17px] text-zinc-100"
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
        <button
          type="button"
          onClick={() => {
            void hapticLight();
            const code = inviteCode.trim();
            if (!normalizeInviteCodeV2(code) && !normalizeInviteCode(code)) {
              setInviteError("That is not an invite.");
              return;
            }
            void enrollSolo;
            setPendingCode(code);
          }}
          className="h-14 rounded-full btn-primary text-[17px] font-semibold"
        >
          Join with this invite
        </button>
        {inviteError ? <p className="text-center text-[13px] text-red-300">{inviteError}</p> : null}
        <button
          type="button"
          onClick={() => {
            void hapticLight();
            onNotNow();
          }}
          className="h-14 rounded-full border border-white/12 text-[17px] font-medium text-zinc-200"
        >
          Not joining — keep everything on this device
        </button>
      </div>
    </div>
  );
}
