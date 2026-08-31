"use client";

export function FaultScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="night-sky flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">Circadia</p>
      <h1 className="font-heading mt-3 text-3xl tracking-tight text-zinc-50">Something went wrong</h1>
      <p className="mt-3 max-w-[40ch] text-center text-[15px] leading-relaxed text-zinc-400">
        This screen hit a fault. Your mornings are still on this device.
      </p>
      <button
        type="button"
        className="mt-8 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-zinc-50 px-6 text-[15px] font-medium text-zinc-950"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
