import { CRISIS_LIFELINE_NUMBER, CRISIS_LINE } from "@/lib/safety-copy";
import { cn } from "@/lib/utils";

/**
 * Quiet, always-on crisis line. Not a banner. Not keyword-gated.
 *
 * It used to render at 10px in the dimmest grey in the palette — about 2.6:1
 * against the night sky, roughly half the legibility floor — for the one piece of
 * copy in the app that someone might need at their worst. Quiet is not the same
 * as unreadable. The number is a real `tel:` link because
 * `formatDetection.telephone: false` stops iOS from linking it itself.
 */
export function CrisisLine({ className }: { className?: string }) {
  const [before, after] = CRISIS_LINE.split(CRISIS_LIFELINE_NUMBER);
  return (
    <p className={cn("text-[13px] leading-relaxed text-zinc-400", className)}>
      {before}
      <a
        href={`tel:${CRISIS_LIFELINE_NUMBER}`}
        className="inline-flex min-h-11 items-center font-medium text-violet-200 underline decoration-violet-200/40 underline-offset-2 hover:decoration-violet-200"
      >
        {CRISIS_LIFELINE_NUMBER}
      </a>
      {after}
    </p>
  );
}
