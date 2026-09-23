"use client";

import { useState } from "react";
import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";
import { AGE_REFUSAL, whatJamesReceives } from "@/lib/consent";
import { hapticLight } from "@/lib/haptics";
import { CRISIS_LIFELINE_NUMBER } from "@/lib/safety-copy";

export function ConsentScreen({
  inviteCode,
  onNotNow,
}: {
  inviteCode?: string;
  onNotNow: () => void;
}) {
  const { joinStudyWithConsent, acceptStudyConsent } = useCircadia();
  const [eighteen, setEighteen] = useState(false);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const receives = whatJamesReceives();

  async function join() {
    if (!eighteen || busy) return;
    void hapticLight();
    setBusy(true);
    const result = inviteCode
      ? await joinStudyWithConsent(inviteCode, eighteen)
      : acceptStudyConsent(eighteen);
    setBusy(false);
    if (result === "age") {
      setRefused(true);
      return;
    }
    if (result === "invite" || result === "box") return;
  }

  if (refused) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <Mark className="size-7" />
        <p className="mt-10 max-w-[42ch] text-[17px] leading-relaxed text-zinc-200">{AGE_REFUSAL}</p>
        <button
          type="button"
          onClick={() => {
            void hapticLight();
            onNotNow();
          }}
          className="mt-10 h-14 rounded-full border border-white/12 text-[17px] font-medium text-zinc-200"
        >
          Back to the diary
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Mark className="size-7" />
      <h1 className="font-heading mt-10 max-w-[16ch] text-[2.4rem] leading-[1.05] tracking-tight text-zinc-50">
        Before you join
      </h1>
      <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        You&apos;re joining a 14-night test of Somnadia, run by James Motley. Each morning you&apos;ll
        answer a few questions about last night. It takes about two minutes.
      </p>
      <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        What James receives
      </h2>
      <ul className="mt-3 max-w-[42ch] list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-zinc-400">
        {receives.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        What James never receives
      </h2>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        Your name, email or phone number. Dates. Anything you type in your own words. Anything you
        tell Somnadia about being in crisis.
      </p>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        James knows which answers are yours, because he gave you your invite. He keeps your name on
        his own computer, never in what your phone sends.
      </p>
      <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        How it travels
      </h2>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        Each morning is locked on your phone so only James&apos;s computer can open it. It passes
        through a storage service, Cloudflare, that cannot read it.
      </p>
      <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        Leaving
      </h2>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        You can leave any time, under You → Leave the study. Your nights are deleted from James&apos;s
        computer the next time it checks for updates, usually within minutes. Your diary stays on
        your phone.
      </p>
      <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        When the test ends
      </h2>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        James deletes everyone&apos;s study data within 30 days.
      </p>
      <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        Safety
      </h2>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        Nobody watches your answers as you file them. If you&apos;re in crisis, call or text{" "}
        <a
          href="tel:988"
          className="inline-flex min-h-11 items-center font-medium text-violet-200 underline decoration-violet-200/40 underline-offset-2 hover:decoration-violet-200"
        >
          {CRISIS_LIFELINE_NUMBER}
        </a>{" "}
        in the US, or your local emergency number.
      </p>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-zinc-400">
        Questions? Email James at motleyjames06@gmail.com.
      </p>
      <label className="mt-8 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-zinc-200">
        <input
          type="checkbox"
          checked={eighteen}
          onChange={(event) => setEighteen(event.target.checked)}
          className="size-5 accent-violet-300"
        />
        I&apos;m 18 or older.
      </label>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          disabled={!eighteen || busy}
          onClick={() => void join()}
          className="h-14 rounded-full btn-primary text-[17px] font-semibold disabled:opacity-40"
        >
          Join the test
        </button>
        <button
          type="button"
          onClick={() => {
            void hapticLight();
            onNotNow();
          }}
          className="h-14 rounded-full border border-white/12 text-[17px] font-medium text-zinc-200"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
