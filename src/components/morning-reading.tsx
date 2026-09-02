import { DiaryLink } from "@/components/diary-tab-link";
import type { MorningReading } from "@/lib/morning-reading";
import { cn } from "@/lib/utils";

export function MorningReadingCard({
  reading,
  kicker,
  onOpen,
  className,
}: {
  reading: MorningReading;
  kicker?: string;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-3xl border border-sky-300/18 bg-sky-300/[0.045] px-4 py-5",
        className,
      )}
    >
      <p className="text-[11px] tracking-[0.22em] text-sky-300/75 uppercase">{kicker ?? reading.kicker}</p>
      <h2 className="font-heading mt-2 max-w-[22ch] text-[1.55rem] leading-tight text-zinc-50">
        {reading.title}
      </h2>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-zinc-200">{reading.why}</p>
      <div className="mt-5 max-w-[46ch] border-l border-white/12 pl-4">
        <p className="text-[10px] tracking-[0.2em] text-zinc-400 uppercase">The page</p>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{reading.note}</p>
      </div>
      <DiaryLink
        href={`/library#${reading.articleId}`}
        onClick={onOpen}
        className="mt-5 inline-flex min-h-11 items-center text-[17px] font-medium text-sky-300"
      >
        Open the note
      </DiaryLink>
    </article>
  );
}
