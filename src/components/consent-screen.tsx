"use client";

import { useState } from "react";
import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";
import {
  AGE_REFUSAL,
  CONSENT_FAULT_DISCLOSURE,
  CONSENT_LEAVE_UNINSTALL,
  CONSENT_NOW_RECEIVES_LESS,
  DISCLOSURE_GROUP_HEADINGS,
  DISCLOSURE_GROUP_SUMMARIES,
  capDisclosureLine,
  disclosureGroupItems,
  isReturningConsentReader,
  returningConsentLines,
} from "@/lib/consent";
import { hapticLight } from "@/lib/haptics";
import { CRISIS_LIFELINE_NUMBER } from "@/lib/safety-copy";

const column = "mx-auto w-full max-w-[34rem]";
const shell =
  "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]";
const copy = "text-[15px] leading-relaxed text-zinc-400";

export function ConsentScreen({
  inviteCode,
  onNotNow,
}: {
  inviteCode?: string;
  onNotNow: () => void;
}) {
  const { state, joinStudyWithConsent, acceptStudyConsent } = useCircadia();
  const [eighteen, setEighteen] = useState(false);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const returning = isReturningConsentReader(state.study);
  const notes = returningConsentLines(state.study);
  const lessTitle =
    returning &&
    typeof state.study.consentVersion === "number" &&
    state.study.consentVersion < 3;

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
      <div className={shell}>
        <div className={column}>
          <Mark className="size-7" />
          <p className={`mt-10 ${copy} text-zinc-200`}>{AGE_REFUSAL}</p>
          <button
            type="button"
            onClick={() => {
              void hapticLight();
              onNotNow();
            }}
            className="mt-10 h-14 w-full rounded-full border border-white/12 text-[17px] font-medium text-zinc-200"
          >
            Back to the diary
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={column}>
        <Mark className="size-7" />
        <h1 className="font-heading mt-10 text-[2.4rem] leading-[1.05] tracking-tight text-zinc-50">
          {lessTitle ? CONSENT_NOW_RECEIVES_LESS : "Before you join"}
        </h1>
        {notes.map((line, index) => (
          <p key={line} className={`${index === 0 ? "mt-5" : "mt-3"} ${copy}`}>
            {line}
          </p>
        ))}
        <p className={`${notes.length ? "mt-4" : "mt-5"} ${copy}`}>
          You&apos;re joining a 14-night test of Somnadia. Each morning you&apos;ll answer a few
          questions about last night. It takes about a minute. The test is run by James Motley,
          who builds Somnadia.
        </p>
        <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
          What Somnadia receives
        </h2>
        <ul className={`mt-3 list-disc space-y-2 pl-5 ${copy}`}>
          {DISCLOSURE_GROUP_HEADINGS.map((heading) => (
            <li key={heading}>
              {heading}: {DISCLOSURE_GROUP_SUMMARIES[heading]}
            </li>
          ))}
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer text-[15px] font-medium text-zinc-200">
            See every item
          </summary>
          <div className="mt-4 space-y-5">
            {DISCLOSURE_GROUP_HEADINGS.map((heading) => (
              <div key={heading}>
                <h3 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
                  {heading}
                </h3>
                <ul className={`mt-2 space-y-1 ${copy}`}>
                  {disclosureGroupItems(heading).map(({ key, line }) => (
                    <li key={key}>{capDisclosureLine(line)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
        <p className={`mt-4 ${copy}`}>{CONSENT_FAULT_DISCLOSURE}</p>
        <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
          What Somnadia never receives
        </h2>
        <p className={`mt-3 ${copy}`}>
          Your name, email or phone number. The dates of your nights. Anything you type in your own
          words. Anything you tell Somnadia about being in crisis.
        </p>
        <p className={`mt-4 ${copy}`}>
          Your answers are linked to you only through your invite code. The list that matches codes to
          names stays on one computer and never travels with your answers.
        </p>
        <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
          How it travels
        </h2>
        <p className={`mt-3 ${copy}`}>
          Each morning is locked on your phone so only Somnadia&apos;s computer can open it. It passes
          through a storage service, Cloudflare, that cannot read it.
        </p>
        <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
          Leaving
        </h2>
        <p className={`mt-3 ${copy}`}>
          You can leave any time, under You → Leave the study. Your nights are deleted from
          Somnadia&apos;s records the next time its computer checks in, usually within minutes. Your
          diary stays on your phone. {CONSENT_LEAVE_UNINSTALL}
        </p>
        <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
          When the test ends
        </h2>
        <p className={`mt-3 ${copy}`}>All test data is deleted within 30 days.</p>
        <h2 className="mt-8 text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
          Safety
        </h2>
        <p className={`mt-3 ${copy}`}>
          Nobody watches your answers as you file them. If you&apos;re in crisis, call or text{" "}
          <a
            href="tel:988"
            className="inline-flex min-h-11 items-center font-medium text-violet-200 underline decoration-violet-200/40 underline-offset-2 hover:decoration-violet-200"
          >
            {CRISIS_LIFELINE_NUMBER}
          </a>{" "}
          in the US, or your local emergency number.
        </p>
        <p className={`mt-4 ${copy}`}>Questions? Email hello@somnadia.com.</p>
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
    </div>
  );
}
