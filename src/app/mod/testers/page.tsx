"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OperatorChrome } from "@/components/operator-chrome";
import { OperatorGate } from "@/components/operator-gate";
import { buildConsoleModel, restoreOrphan, type ConsoleArrival, type ConsoleReject } from "@/lib/console-model";
import { readInviteBook, type OperatorInvite } from "@/lib/invite";
import { shortParticipantId } from "@/lib/moderator";
import { readOperatorKey, writeOperatorKey } from "@/lib/operator-session";
import { cn } from "@/lib/utils";

const TABLE_COLS = "grid grid-cols-[minmax(0,1fr)_160px_120px_140px_120px] gap-6";

type InboxBody = {
  ok?: boolean;
  error?: string;
  packs?: ConsoleArrival[];
  rejects?: ConsoleReject[];
};

export default function AllTestersPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InboxBody | null>(null);
  const [book, setBook] = useState<OperatorInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);

  const load = useCallback(async (secret: string) => {
    setLoading(true);
    setError(null);
    try {
      const [inboxRes, bookRes] = await Promise.all([
        fetch("/api/moderator", { headers: { "x-circadia-mod": secret } }),
        fetch("/api/moderator/book", { headers: { "x-circadia-mod": secret } }),
      ]);
      if (inboxRes.status === 401 || bookRes.status === 401) {
        setData(null);
        setKey("");
        writeOperatorKey("");
        setError("That passphrase is not the operator key.");
        return;
      }
      const body = (await inboxRes.json()) as InboxBody;
      if (!inboxRes.ok || !body.ok) {
        setError(body.error ?? "Could not read the inbox.");
        return;
      }
      setData(body);
      setKey(secret);
      writeOperatorKey(secret);
      try {
        const bookBody = (await bookRes.json()) as { ok?: boolean; invites?: unknown };
        if (bookRes.ok && bookBody.ok) setBook(readInviteBook(bookBody.invites));
      } catch {
        setBook([]);
      }
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

  function persistBook(next: OperatorInvite[]) {
    setBook(next);
    void fetch("/api/moderator/book", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-circadia-mod": key },
      body: JSON.stringify({ invites: next }),
    });
  }

  const view = useMemo(
    () =>
      buildConsoleModel({
        arrivals: data?.packs ?? [],
        book,
        rejects: data?.rejects ?? [],
        now: new Date(),
      }),
    [data, book],
  );

  if (!booted) return null;
  if (!key) {
    return <OperatorGate error={error} loading={loading} onOpen={(secret) => void load(secret)} />;
  }

  return (
    <OperatorChrome active="testers">
      <div className="flex flex-col gap-6 px-12 py-9">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-[36px] leading-[1.1] font-normal tracking-[-0.02em] text-op-ink">
            All testers
          </h1>
          <p className="max-w-[46ch] text-[15px] leading-relaxed text-op-body">
            Everyone the inbox has seen — named, orphaned or dismissed.
          </p>
        </div>
        {error ? <p className="text-[14px] text-op-safety">{error}</p> : null}
        <div className="overflow-hidden rounded-xl border border-op-line bg-op-surface">
          <div className={cn(TABLE_COLS, "border-b border-op-line px-6 py-3 text-[13px] text-op-muted")}>
            <div>Tester</div>
            <div>State</div>
            <div>Nights</div>
            <div>Last sync</div>
            <div />
          </div>
          {view.allTesters.length ? (
            view.allTesters.map((row) => (
              <div
                key={row.participantId}
                className={cn(TABLE_COLS, "items-center border-b border-op-line-soft px-6 py-3.5")}
              >
                <div className="truncate text-[16px] font-semibold tabular-nums text-op-ink">
                  {row.name ?? shortParticipantId(row.participantId)}
                </div>
                <div className="text-[14px] text-op-body">{row.state}</div>
                <div className="text-[14px] tabular-nums text-op-ink">{row.nightCount}</div>
                <div className="text-[14px] text-op-muted">{row.lastSync}</div>
                <div>
                  {row.dismissed ? (
                    <button
                      type="button"
                      onClick={() => persistBook(restoreOrphan(book, row.participantId))}
                      className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="px-6 py-10 text-[15px] leading-relaxed text-op-body">
              No testers have sent a pack yet.
            </p>
          )}
        </div>
      </div>
    </OperatorChrome>
  );
}
