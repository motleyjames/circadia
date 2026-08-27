"use client";

import { cn } from "@/lib/utils";

type BubbleOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

export function BubbleGroup<T extends string | number>({
  value,
  onChange,
  options,
  columns = 2,
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  options: BubbleOption<T>[];
  columns?: 2 | 3 | 4 | 5;
}) {
  const col =
    columns === 5
      ? "grid-cols-5"
      : columns === 4
        ? "grid-cols-4"
        : columns === 3
          ? "grid-cols-3"
          : "grid-cols-2";

  return (
    <div className={cn("grid gap-2", col)}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 cursor-pointer rounded-full border px-3 py-3 text-sm transition-all",
              selected
                ? "border-violet-300/70 bg-violet-400/20 text-violet-50 shadow-[0_0_24px_-8px_rgba(167,139,250,0.9)]"
                : "border-white/10 bg-white/4 text-zinc-300 hover:border-white/20 hover:bg-white/8",
            )}
          >
            <span className="block font-medium">{option.label}</span>
            {option.hint ? (
              <span className="mt-0.5 block text-[11px] text-zinc-400">{option.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function YesNo({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <BubbleGroup
      value={value === undefined ? undefined : value ? "yes" : "no"}
      onChange={(v) => onChange(v === "yes")}
      options={[
        { value: "yes", label: yesLabel },
        { value: "no", label: noLabel },
      ]}
    />
  );
}
