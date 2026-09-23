"use client";

import { useState } from "react";
import { ConsentCopy } from "@/components/consent-copy";
import {
  BASELINE_CLOCK,
  BASELINE_MISSED,
  BASELINE_WHY,
  baselineAfterReply,
  baselineChangeReply,
} from "@/lib/consult-baseline";
import { CONSENT_EMAIL } from "@/lib/consent";
import { useCircadia } from "@/context/circadia-store";

const HELP_WRONG =
  "If you've fallen asleep while driving, or someone has seen you stop breathing in your sleep, please see a doctor soon — don't wait for the end of the test. If you're thinking about harming yourself, call or text 988 in the US, or your local emergency number.";

export function HelpView() {
  const { state } = useCircadia();
  const solo = state.episode?.clinicianId === null;
  const [showConsent, setShowConsent] = useState(false);

  return (
    <div className="phone-page-y min-h-0 flex-1 overflow-y-auto px-5 pb-24 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-[34rem]">
        <h1 className="font-heading text-[2.35rem] leading-none tracking-tight text-zinc-50">Help</h1>

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
            About this diary
          </h2>
          <HelpItem title="Why fourteen nights" body={BASELINE_WHY} />
          <HelpItem title="Why not check the clock" body={BASELINE_CLOCK} />
          <HelpItem title="What happens after night 14" body={baselineAfterReply(solo)} />
          <HelpItem title="Missed a morning" body={BASELINE_MISSED} />
          <HelpItem title="Should I change anything" body={baselineChangeReply(solo)} />
        </section>

        <section className="mt-10">
          <h2 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
            What&apos;s shared
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            Each morning you file is the record your clinician reads. The consent you accepted lists
            every field that leaves this phone.
          </p>
          <button
            type="button"
            className="mt-3 text-[15px] font-medium text-zinc-200 underline decoration-white/20 underline-offset-2"
            onClick={() => setShowConsent((open) => !open)}
          >
            {showConsent ? "Hide the consent" : "Read the consent you accepted"}
          </button>
          {showConsent ? <ConsentCopy /> : null}
        </section>

        <section className="mt-10">
          <h2 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
            Leaving the test
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            You can leave from You → Leave the test. Nights already sent are deleted from the test
            records. The diary stays on this phone.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
            If something is wrong
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">{HELP_WRONG}</p>
        </section>

        <section className="mt-10">
          <h2 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
            Contact
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            <a
              href={`mailto:${CONSENT_EMAIL}`}
              className="font-medium text-zinc-200 underline decoration-white/20 underline-offset-2"
            >
              {CONSENT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}

function HelpItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5">
      <h3 className="text-[16px] font-medium text-zinc-100">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}
