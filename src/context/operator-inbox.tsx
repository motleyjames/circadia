"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readInviteBook, type OperatorInvite } from "@/lib/invite";
import type { ConsoleArrival, ConsoleReject } from "@/lib/console-model";
import type { ModeratorSnapshot } from "@/lib/moderator";
import { readOperatorKey, writeOperatorKey } from "@/lib/operator-session";

export type OperatorInboxBody = ModeratorSnapshot & {
  ok?: boolean;
  error?: string;
  packs?: ConsoleArrival[];
  rejects?: ConsoleReject[];
  fingerprint?: string | null;
  workerUnreachable?: boolean;
  withdrawn?: string[];
};

type OperatorInboxValue = {
  key: string;
  error: string | null;
  loading: boolean;
  booted: boolean;
  data: OperatorInboxBody | null;
  book: OperatorInvite[];
  setBook: (next: OperatorInvite[]) => void;
  open: (secret: string) => Promise<void>;
  refresh: () => void;
  eraseStudyData: (confirmation: string) => Promise<true | string>;
  deleteTesterNights: (participantId: string, confirmation: string) => Promise<true | string>;
};

const OperatorInboxContext = createContext<OperatorInboxValue | null>(null);

const NOOP: OperatorInboxValue = {
  key: "",
  error: null,
  loading: false,
  booted: false,
  data: null,
  book: [],
  setBook: () => {},
  open: async () => {},
  refresh: () => {},
  eraseStudyData: async () => "Not signed in.",
  deleteTesterNights: async () => "Not signed in.",
};

async function readDisk(secret: string): Promise<
  | { ok: true; data: OperatorInboxBody; book: OperatorInvite[] }
  | { ok: false; status: number; error: string }
> {
  const [inboxRes, bookRes] = await Promise.all([
    fetch("/api/moderator", { headers: { "x-circadia-mod": secret } }),
    fetch("/api/moderator/book", { headers: { "x-circadia-mod": secret } }),
  ]);
  if (inboxRes.status === 401 || bookRes.status === 401) {
    return { ok: false, status: 401, error: "That passphrase is not the operator key." };
  }
  const body = (await inboxRes.json()) as OperatorInboxBody;
  if (!inboxRes.ok || !body.ok) {
    return { ok: false, status: inboxRes.status, error: body.error ?? "Could not read the inbox." };
  }
  let book: OperatorInvite[] = [];
  try {
    const bookBody = (await bookRes.json()) as { ok?: boolean; invites?: unknown };
    if (bookRes.ok && bookBody.ok) book = readInviteBook(bookBody.invites);
  } catch {
    book = [];
  }
  return { ok: true, data: body, book };
}

async function pullWorker(secret: string): Promise<OperatorInboxBody | null> {
  try {
    const res = await fetch("/api/moderator", {
      method: "POST",
      headers: { "x-circadia-mod": secret },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as OperatorInboxBody;
    return body.ok ? body : null;
  } catch {
    return null;
  }
}

export function OperatorInboxProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OperatorInboxBody | null>(null);
  const [book, setBook] = useState<OperatorInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);

  const applyDisk = useCallback(async (secret: string, gate: boolean) => {
    if (gate) setLoading(true);
    setError(null);
    try {
      const result = await readDisk(secret);
      if (!result.ok) {
        if (result.status === 401) {
          setData(null);
          setKey("");
          writeOperatorKey("");
        }
        setError(result.error);
        return false;
      }
      setData(result.data);
      setBook(result.book);
      setKey(secret);
      writeOperatorKey(secret);
      return true;
    } catch {
      setError("Could not reach the inbox on this machine.");
      return false;
    } finally {
      if (gate) setLoading(false);
    }
  }, []);

  const open = useCallback(
    async (secret: string) => {
      const ok = await applyDisk(secret, true);
      if (!ok) return;
      void pullWorker(secret).then((pulled) => {
        if (pulled) setData(pulled);
      });
    },
    [applyDisk],
  );

  const eraseStudyData = useCallback(
    async (confirmation: string) => {
      if (!key) return "Not signed in.";
      try {
        const res = await fetch("/api/moderator/erase", {
          method: "POST",
          headers: { "content-type": "application/json", "x-circadia-mod": key },
          body: JSON.stringify({ confirmation }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) return body.error ?? "Could not delete study data.";
        setBook([]);
        await applyDisk(key, false);
        return true;
      } catch {
        return "Could not delete study data.";
      }
    },
    [applyDisk, key],
  );

  const deleteTesterNights = useCallback(
    async (participantId: string, confirmation: string) => {
      if (!key) return "Not signed in.";
      try {
        const res = await fetch("/api/moderator/nights", {
          method: "POST",
          headers: { "content-type": "application/json", "x-circadia-mod": key },
          body: JSON.stringify({ participantId, confirmation }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) return body.error ?? "Could not delete this tester's nights.";
        await applyDisk(key, false);
        return true;
      } catch {
        return "Could not delete this tester's nights.";
      }
    },
    [applyDisk, key],
  );

  const refresh = useCallback(() => {
    if (!key) return;
    void (async () => {
      await applyDisk(key, false);
      const pulled = await pullWorker(key);
      if (pulled) setData(pulled);
    })();
  }, [applyDisk, key]);

  useEffect(() => {
    const stored = readOperatorKey();
    if (stored) void open(stored);
    setBooted(true);
  }, [open]);

  useEffect(() => {
    if (!key) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const pulled = await pullWorker(key);
        if (pulled) setData(pulled);
      })();
    }, 3 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [key]);

  return (
    <OperatorInboxContext.Provider
      value={{
        key,
        error,
        loading,
        booted,
        data,
        book,
        setBook,
        open,
        refresh,
        eraseStudyData,
        deleteTesterNights,
      }}
    >
      {children}
    </OperatorInboxContext.Provider>
  );
}

export function useOperatorInbox(): OperatorInboxValue {
  const ctx = useContext(OperatorInboxContext);
  if (ctx) return ctx;
  return NOOP;
}
