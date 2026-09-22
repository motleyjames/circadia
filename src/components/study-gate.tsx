"use client";

import { useState } from "react";
import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";
import { hapticLight } from "@/lib/haptics";

export function StudyGate() {
  const { enrollSolo, declineStudy } = useCircadia();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Mark className="size-7" />
      <p className="mt-10 text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
        Optional study
      </p>
      <h1 className="font-heading mt-3 max-w-[16ch] text-[2.4rem] leading-[1.05] tracking-tight text-zinc-50">
        Nothing leaves this device unless you say yes.
      </h1>
      <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        If you join with an invite, this device starts a pipeline. You will not press Send. After
        each morning, a stripped night log leaves on its own. If the app faults, that leaves too.
      </p>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        James also gets a roster card once: the invite he already issued, your sleep window, and
        whether falling or staying asleep is the problem. Not your name. Not a phone number. Not a
        way to message you. Circadia will not email or text you. It is not a backup of your dreams.
      </p>
      <ul className="mt-8 max-w-[42ch] space-y-2 text-[13px] leading-relaxed text-zinc-500">
        <li>Night packs never carry dream text, chat, or the bottle you typed — only a class.</li>
        <li>The invite is a short code. Type the same one after a reinstall and nights stay joined.</li>
        <li>Keep everything here and the app is unchanged. Nothing is sent.</li>
      </ul>
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
            void enrollSolo(inviteCode).then((ok) => {
              setInviteError(ok ? null : "That is not an invite.");
            });
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
            declineStudy();
          }}
          className="h-14 rounded-full border border-white/12 text-[17px] font-medium text-zinc-200"
        >
          Keep everything on this device
        </button>
      </div>
    </div>
  );
}
