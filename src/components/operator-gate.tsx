import { useState, type FormEvent } from "react";
import { OPERATOR_PRODUCT_NAME } from "@/lib/product";

export function OperatorGate({
  error,
  loading,
  onOpen,
}: {
  error: string | null;
  loading: boolean;
  onOpen: (secret: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const secret = draft.trim();
    if (secret) onOpen(secret);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 text-op-ink">
      <p className="text-[12px] font-semibold tracking-[0.18em] text-op-muted uppercase">Shakedown</p>
      <h1 className="font-heading mt-3 text-[2.2rem] leading-none tracking-tight text-op-ink">
        {OPERATOR_PRODUCT_NAME}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-op-body">
        This is the console, not the diary.
        {!process.env.CIRCADIA_MOD_KEY?.trim()
          ? " Set a passphrase before anyone else uses this computer."
          : null}
      </p>
      <form className="mt-8" onSubmit={submit}>
        <label htmlFor="operator-key" className="text-[14px] font-semibold text-op-ink">
          Passphrase
        </label>
        <input
          id="operator-key"
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          autoFocus
          className="mt-2 h-12 w-full rounded-lg border border-op-input bg-op-surface px-3 text-[15px] text-op-ink"
        />
        {error ? <p className="mt-3 text-[13px] text-op-safety">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="mt-4 h-12 w-full cursor-pointer rounded-lg bg-op-violet text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Opening…" : "Open the console"}
        </button>
      </form>
    </div>
  );
}
