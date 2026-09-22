"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { OperatorChrome } from "@/components/operator-chrome";
import { OperatorGate } from "@/components/operator-gate";
import { SendInviteCode } from "@/components/send-invite-code";
import { buildInviteBook, invitePrivacySentence, type ConsoleArrival } from "@/lib/console-model";
import { generateInvite, readInviteBook, type Cohort, type MintedInvite, type OperatorInvite } from "@/lib/invite";
import { readOperatorKey, writeOperatorKey } from "@/lib/operator-session";
import { cn } from "@/lib/utils";

const INVITE_BOOK_KEY = "circadia-operator-invites";

const COHORTS: { id: Cohort; label: string; hint: string }[] = [
  { id: "friend", label: "Friend", hint: "Someone you know personally" },
  { id: "stranger", label: "Stranger", hint: "Recruited, with no prior connection" },
  { id: "lab", label: "Sleep lab", hint: "Enrolled through a research study" },
];

export default function InvitePage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);
  const [invites, setInvites] = useState<OperatorInvite[]>([]);
  const [arrivals, setArrivals] = useState<ConsoleArrival[]>([]);
  const [name, setName] = useState("");
  const [cohort, setCohort] = useState<Cohort>("stranger");
  const [created, setCreated] = useState<MintedInvite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (secret: string) => {
    setLoading(true);
    setError(null);
    try {
      const [bookRes, inboxRes] = await Promise.all([
        fetch("/api/moderator/book", { headers: { "x-circadia-mod": secret } }),
        fetch("/api/moderator", { headers: { "x-circadia-mod": secret } }),
      ]);
      if (bookRes.status === 401 || inboxRes.status === 401) {
        setKey("");
        writeOperatorKey("");
        setError("That passphrase is not the operator key.");
        return;
      }
      setKey(secret);
      writeOperatorKey(secret);
      try {
        const bookBody = (await bookRes.json()) as { ok?: boolean; invites?: unknown };
        if (bookRes.ok && bookBody.ok) {
          const fromDisk = readInviteBook(bookBody.invites);
          if (fromDisk.length) {
            setInvites(fromDisk);
          } else {
            setInvites(readInviteBook(JSON.parse(localStorage.getItem(INVITE_BOOK_KEY) ?? "[]")));
          }
        }
      } catch {
        setInvites([]);
      }
      try {
        const inbox = (await inboxRes.json()) as { ok?: boolean; packs?: ConsoleArrival[] };
        if (inboxRes.ok && inbox.ok) setArrivals(inbox.packs ?? []);
      } catch {
        setArrivals([]);
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

  function persist(next: OperatorInvite[]) {
    setInvites(next);
    localStorage.setItem(INVITE_BOOK_KEY, JSON.stringify(next));
    void fetch("/api/moderator/book", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-circadia-mod": key },
      body: JSON.stringify({ invites: next }),
    });
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    try {
      const invite = await generateInvite(name, cohort);
      persist([invite, ...invites]);
      setCreated(invite);
      setCopied(null);
      setName("");
    } catch {
      setError("An invite needs a name on this Mac.");
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      setCopied(null);
    }
  }

  const book = useMemo(() => buildInviteBook(invites, arrivals, new Date()), [invites, arrivals]);

  if (!booted) return null;
  if (!key) {
    return <OperatorGate error={error} loading={loading} onOpen={(secret) => void load(secret)} />;
  }

  const trimmed = name.trim();
  const displayName = created?.name ?? (trimmed || "a new tester");
  const privacy = invitePrivacySentence(created?.name ?? trimmed);

  return (
    <OperatorChrome active="invite">
      <div className="flex items-start gap-7 px-12 py-9">
        <section
          aria-labelledby="invite-title"
          className="flex w-[500px] shrink-0 flex-col gap-[22px] rounded-xl border border-op-line bg-op-surface p-7"
        >
          <div className="flex flex-col gap-2">
            <h1
              id="invite-title"
              className="font-heading text-[32px] leading-[1.1] font-normal tracking-[-0.02em] text-op-ink"
            >
              Invite a tester
            </h1>
            <p className="text-[15px] leading-normal text-op-body">
              Each tester gets a code of their own. Their name and how you found them stay on this Mac. Only
              the code reaches their phone.
            </p>
          </div>

          {error ? <p className="text-[14px] text-op-safety">{error}</p> : null}

          {created ? (
            <div className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <div className="text-[14px] text-op-muted">Invite for {displayName}</div>
                <div className="font-heading text-[46px] font-normal tracking-[0.04em] tabular-nums text-op-ink">
                  {created.code}
                </div>
              </div>
              <p className="text-[15px] leading-[1.55] text-op-body">{privacy}</p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => void copyCode(created.code)}
                  className="h-[46px] cursor-pointer rounded-lg bg-op-violet px-5 text-[15px] font-semibold text-white"
                >
                  {copied === created.code ? "Copied" : "Copy code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreated(null);
                    setCopied(null);
                    setError(null);
                  }}
                  className="min-h-11 cursor-pointer border-0 bg-transparent text-[15px] font-semibold text-op-violet"
                >
                  Invite someone else
                </button>
              </div>
              <SendInviteCode code={created.code} />
            </div>
          ) : (
            <form className="flex flex-col gap-[22px]" onSubmit={(event) => void createInvite(event)}>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tester-name" className="text-[14px] font-semibold text-op-ink">
                  Their name
                </label>
                <input
                  id="tester-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="First name and last initial"
                  className="h-[46px] rounded-lg border border-op-input bg-op-surface px-3 text-[15px] text-op-ink"
                />
              </div>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="pb-1.5 text-[14px] font-semibold text-op-ink">How you found them</legend>
                {COHORTS.map((option) => {
                  const on = cohort === option.id;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3",
                        on ? "border-op-violet-ring bg-op-violet-wash" : "border-op-line bg-op-surface",
                      )}
                    >
                      <input
                        type="radio"
                        name="cohort"
                        value={option.id}
                        checked={on}
                        onChange={() => setCohort(option.id)}
                        className="mt-[3px] h-4 w-4 accent-op-violet"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-op-ink">{option.label}</span>
                        <span className="text-[13px] text-op-muted">{option.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <button
                type="submit"
                className="h-12 cursor-pointer rounded-lg bg-op-violet text-[15px] font-semibold text-white"
              >
                Create invite
              </button>
            </form>
          )}
        </section>

        <section
          aria-labelledby="book-title"
          className="min-w-0 flex-1 rounded-xl border border-op-line bg-op-surface"
        >
          <h2
            id="book-title"
            className="font-heading px-6 pt-[22px] pb-3.5 text-[22px] font-medium tracking-[-0.01em] text-op-ink"
          >
            Your invites
          </h2>
          <div className="grid grid-cols-[minmax(0,1fr)_9.5rem_8rem_8rem] gap-x-6 border-y border-op-line px-6 py-2.5 text-[13px] text-op-muted">
            <div>Name</div>
            <div>Code</div>
            <div>Found through</div>
            <div>Status</div>
          </div>
          {book.filter((row) => row.name).length ? (
            book.filter((row) => row.name).map((row) => (
              <div
                key={row.participantId}
                className="border-b border-op-line-soft px-6 py-3.5"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_9.5rem_8rem_8rem] items-start gap-x-6">
                  <div className="min-w-0 truncate text-[15px] font-semibold text-op-ink">{row.name}</div>
                  <div className="min-w-0">
                    <div className="font-heading text-[16px] tracking-[0.04em] tabular-nums text-op-ink">
                      {row.code ?? "—"}
                    </div>
                    {row.code ? (
                      <button
                        type="button"
                        onClick={() => void copyCode(row.code!)}
                        className="min-h-11 w-fit cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-op-violet"
                      >
                        {copied === row.code ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </div>
                  <div className="text-[14px] text-op-body">{row.cohortLabel}</div>
                  <div className={cn("text-[14px]", row.joined ? "text-op-ink" : "text-op-amber")}>{row.status}</div>
                </div>
                {row.code ? (
                  <div className="mt-1 min-w-0">
                    <SendInviteCode code={row.code} />
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="px-6 py-10 text-[15px] leading-relaxed text-op-body">
              No invites yet. The first name you add stays on this Mac.
            </p>
          )}
        </section>
      </div>
    </OperatorChrome>
  );
}
