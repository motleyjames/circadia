"use client";

import { OperatorChrome } from "@/components/operator-chrome";
import { OperatorGate } from "@/components/operator-gate";
import { useOperatorInbox } from "@/context/operator-inbox";

export default function ExportsPage() {
  const { key, error, loading, booted, open } = useOperatorInbox();

  if (!booted) return null;
  if (!key) {
    return <OperatorGate error={error} loading={loading} onOpen={(secret) => void open(secret)} />;
  }

  return (
    <OperatorChrome active="exports">
      <div className="px-12 py-9">
        <h1 className="font-heading text-[36px] leading-[1.1] font-normal tracking-[-0.02em] text-op-ink">
          Diary exports
        </h1>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-op-body">
          A tester&apos;s 14-night diary will export from here once the detail page ships. Nothing is ready to
          print yet.
        </p>
      </div>
    </OperatorChrome>
  );
}
