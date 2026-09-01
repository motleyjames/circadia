"use client";

import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";
import { hapticLight } from "@/lib/haptics";

export function StudyGate() {
  const { joinStudy, declineStudy } = useCircadia();

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Mark className="size-7" />
      <p className="mt-10 text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
        Optional study
      </p>
      <h1 className="font-heading mt-3 max-w-[16ch] text-[2.4rem] leading-[1.05] tracking-tight text-zinc-50">
        Yes is the only send.
      </h1>
      <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        If you join, this device starts a pipeline. You will not press Send. After each morning, a
        stripped night log leaves on its own. If the app faults, that leaves too.
      </p>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        James also gets a roster card once: a random participant number, your sleep window, and
        whether falling or staying asleep is the problem. Not your name. Not a phone number. Not a
        way to message you. Circadia will not email or text you. It is not a backup of your dreams.
      </p>
      <ul className="mt-8 max-w-[42ch] space-y-2 text-[13px] leading-relaxed text-zinc-500">
        <li>Night packs never carry dream text, chat, or the bottle you typed — only a class.</li>
        <li>A random participant number stitches nights if you pause. Erase this device starts a new one.</li>
        <li>Keep everything here and the app is unchanged. Nothing is sent.</li>
      </ul>
      <div className="mt-auto flex flex-col gap-3 pt-10">
        <button
          type="button"
          onClick={() => {
            void hapticLight();
            joinStudy();
          }}
          className="h-14 rounded-full bg-zinc-50 text-[17px] font-semibold text-zinc-950"
        >
          Join the study
        </button>
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
