import { CRISIS_LINE } from "@/lib/safety-copy";
import { cn } from "@/lib/utils";

/** Quiet, always-on crisis line. Not a banner. Not keyword-gated. */
export function CrisisLine({ className }: { className?: string }) {
  return (
    <p className={cn("text-[10px] leading-relaxed text-zinc-600", className)}>{CRISIS_LINE}</p>
  );
}
