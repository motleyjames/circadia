"use client";

import { useCallback, useEffect, useState } from "react";
import { OperatorChrome } from "@/components/operator-chrome";
import { OperatorGate } from "@/components/operator-gate";
import { readOperatorKey, writeOperatorKey } from "@/lib/operator-session";

export default function ExportsPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);

  const load = useCallback(async (secret: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/moderator", { headers: { "x-circadia-mod": secret } });
      if (res.status === 401) {
        setKey("");
        writeOperatorKey("");
        setError("That passphrase is not the operator key.");
        return;
      }
      if (!res.ok) {
        setError("Could not read the inbox.");
        return;
      }
      setKey(secret);
      writeOperatorKey(secret);
    } catch {
      setError("Could not reach the inbox on this machine.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = readOperatorKey();
    if (stored) void load(stored);
    setBooted(true);
  }, [load]);

  if (!booted) return null;
  if (!key) {
    return <OperatorGate error={error} loading={loading} onOpen={(secret) => void load(secret)} />;
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
