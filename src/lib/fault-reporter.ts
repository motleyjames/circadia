export type FaultSink = (
  message: string,
  extra?: { stack?: string | null; href?: string | null },
) => void;

const MAX_FAULTS = 10;
const seen = new Set<string>();
let count = 0;

function hrefNow(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname.slice(0, 120) || "/";
}

export function installFaultReporter(sink: FaultSink, consented: () => boolean): () => void {
  const report = (message: string, stack?: string | null) => {
    if (!consented()) return;
    const key = message.trim().slice(0, 120);
    if (!key || seen.has(key) || count >= MAX_FAULTS) return;
    seen.add(key);
    count += 1;
    sink(key, { stack: stack ?? null, href: hrefNow() });
  };

  const onError = (event: ErrorEvent) => {
    report(event.message || "window error", event.error instanceof Error ? event.error.stack : null);
  };
  const onReject = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
    const stack = reason instanceof Error ? reason.stack : null;
    report(message, stack);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
  };
}
