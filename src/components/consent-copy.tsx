"use client";

import {
  CONSENT_FAULT_DISCLOSURE,
  CONSENT_LEAVE_UNINSTALL,
  DISCLOSURE_GROUP_HEADINGS,
  DISCLOSURE_GROUP_SUMMARIES,
  capDisclosureLine,
  disclosureGroupItems,
} from "@/lib/consent";
import { CRISIS_LIFELINE_NUMBER } from "@/lib/safety-copy";

const copy = "text-[15px] leading-relaxed text-zinc-400";

/** The consent body already shown at join. Hidden until the reader asks. */
export function ConsentCopy() {
  return (
    <div className="mt-4 space-y-4">
      <h2 className="text-[13px] font-semibold tracking-[0.04em] text-zinc-200 uppercase">
        What Somnadia receives
      </h2>
      <ul className={`list-disc space-y-2 pl-5 ${copy}`}>
        {DISCLOSURE_GROUP_HEADINGS.map((heading) => (
          <li key={heading}>
            {heading}: {DISCLOSURE_GROUP_SUMMARIES[heading]}
          </li>
        ))}
      </ul>
      <details className="mt-2">
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
      <p className={copy}>{CONSENT_FAULT_DISCLOSURE}</p>
      <p className={copy}>
        Your name, email or phone number never leave this phone. {CONSENT_LEAVE_UNINSTALL}
      </p>
      <p className={copy}>
        If you&apos;re in crisis, call or text {CRISIS_LIFELINE_NUMBER} in the US, or your local
        emergency number.
      </p>
    </div>
  );
}
