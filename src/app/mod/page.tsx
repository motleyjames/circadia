"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { DEFAULT_MOD_KEY } from "@/lib/mod-key-shared";
import {
  formatInboxReceived,
  groupFaultsByParticipant,
  groupNightsByParticipant,
  shortParticipantId,
  type ModeratorFault,
  type ModeratorNightPerson,
  type ModeratorPerson,
  type ModeratorSnapshot,
} from "@/lib/moderator";
import { formatDuration } from "@/lib/time";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

type Tab = "people" | "nights" | "faults";

const NIGHT_COLS =
  "grid grid-cols-[7.25rem_3.5rem_3.25rem_3.75rem_minmax(0,1fr)_3rem_1rem] gap-x-3";
const SIGNUP_COLS =
  "grid grid-cols-[7.25rem_4.25rem_3.5rem_3.5rem_minmax(0,1fr)_4rem_1rem] gap-x-3";
const FAULT_COLS = "grid grid-cols-[7.25rem_3.5rem_minmax(0,1fr)_1rem] gap-x-3";
const PACK_COLS =
  "grid grid-cols-[9.5rem_4.25rem_3.5rem_3.25rem_3.75rem_minmax(0,1fr)] gap-x-3";

export default function ModeratorPage() {
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<Tab>("nights");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ModeratorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (secret: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/moderator", {
        headers: { "x-circadia-mod": secret },
      });
      if (res.status === 401) {
        setData(null);
        setError("That passphrase is not the operator key.");
        setKey("");
        return;
      }
      const body = (await res.json()) as ModeratorSnapshot & { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Could not read the inbox.");
        return;
      }
      setData(body);
      setKey(secret);
    } catch {
      setError("Could not reach the inbox on this machine.");
    } finally {
      setLoading(false);
    }
  }, []);

  const nightPeople = useMemo(
    () => (data ? groupNightsByParticipant(data.nights) : []),
    [data],
  );
  const faultPeople = useMemo(
    () => (data ? groupFaultsByParticipant(data.faults) : []),
    [data],
  );

  if (!key) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <Mark className="size-8" />
        <p className="mt-8 text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
          Operator
        </p>
        <h1 className="font-heading mt-3 text-[2.2rem] leading-none tracking-tight text-zinc-50">
          Circadia does not live here.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
          This is the operator. The diary is a different app, on a different port. Local default is{" "}
          <span className="text-zinc-200">{DEFAULT_MOD_KEY}</span> until you set{" "}
          <span className="text-zinc-200">CIRCADIA_MOD_KEY</span>.
        </p>
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            void load(draft.trim());
          }}
        >
          <Input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Passphrase"
            className="h-14 rounded-2xl border-white/10 bg-white/4 px-5 text-zinc-50"
            autoFocus
          />
          {error ? <p className="mt-3 text-[13px] text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !draft.trim()}
            className="mt-4 h-14 w-full cursor-pointer rounded-full btn-primary text-[15px] font-medium disabled:opacity-50"
          >
            {loading ? "Opening…" : "Open the inbox"}
          </button>
        </form>
      </div>
    );
  }

  const snapshot = data;

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-6 pt-5 pb-16 md:px-10">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Mark className="size-4" />
            <p className="text-[10px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
              Operator · {APP_VERSION}
            </p>
          </div>
          <h1 className="font-heading mt-2 text-[1.85rem] leading-none tracking-tight text-zinc-50">
            Inbox
          </h1>
          <p className="mt-2 max-w-[52ch] text-[12px] leading-relaxed text-zinc-500">
            Participant numbers only. No names, email, phone, or body measurements.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(key)}
          className="mt-1 cursor-pointer text-[12px] text-zinc-500 hover:text-zinc-200"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error ? <p className="mt-4 text-[13px] text-red-300">{error}</p> : null}

      <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-white/[0.08] pb-5">
        <Metric label="Signups" value={snapshot?.userCount ?? "—"} />
        <Metric label="Nights" value={snapshot?.nightCount ?? "—"} />
        <Metric label="Packs" value={snapshot?.nightPackCount ?? "—"} />
        <Metric label="Faults" value={snapshot?.faultCount ?? "—"} />
      </div>

      <div className="mt-6 flex gap-6 border-b border-white/[0.08]">
        {(
          [
            ["nights", "Nights", nightPeople.length],
            ["people", "Signups", snapshot?.userCount ?? 0],
            ["faults", "Faults", faultPeople.length],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px cursor-pointer border-b pb-2.5 text-[12px]",
              tab === id
                ? "border-[#c4a574] text-[#c4a574]"
                : "border-transparent text-zinc-500 hover:text-zinc-300",
            )}
          >
            {label}
            <span className="ml-2 text-zinc-400">{count}</span>
          </button>
        ))}
      </div>

      <div className="mt-1 overflow-x-auto">
        <div className="min-w-[44rem]">
          {tab === "nights" ? (
            !nightPeople.length ? (
              <Empty>No night packs yet. They arrive after a real morning — not a sample week.</Empty>
            ) : (
              <NightLedger people={nightPeople} />
            )
          ) : null}

          {tab === "people" ? (
            !snapshot?.people.length ? (
              <Empty>No signups yet. A join still counts as a user — without a name.</Empty>
            ) : (
              <SignupLedger people={snapshot.people} />
            )
          ) : null}

          {tab === "faults" ? (
            !faultPeople.length ? (
              <Empty>No faults. That is the desired state.</Empty>
            ) : (
              <FaultLedger people={faultPeople} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NightLedger({ people }: { people: ModeratorNightPerson[] }) {
  return (
    <div>
      <div
        className={cn(
          NIGHT_COLS,
          "h-8 items-center border-b border-white/[0.08] px-1 text-[10px] font-medium tracking-[0.16em] text-zinc-500 uppercase",
        )}
      >
        <span>Id</span>
        <span className="text-right">Nights</span>
        <span className="text-right">Mean</span>
        <span className="text-right">Last</span>
        <span>Flags</span>
        <span className="text-right">Packs</span>
        <span />
      </div>
      {people.map((person) => (
        <NightRow key={person.participantId} person={person} />
      ))}
    </div>
  );
}

function NightRow({ person }: { person: ModeratorNightPerson }) {
  const [open, setOpen] = useState(false);
  const latest = person.packs[0];
  if (!latest) return null;
  const id = shortParticipantId(person.participantId);
  const histId = `night-hist-${person.participantId}`;
  const flagText = latest.flags.length ? latest.flags.join(" · ") : "—";
  return (
    <div
      className={cn(
        "border-b border-white/[0.06]",
        open && "bg-white/[0.02] shadow-[inset_2px_0_0_0_#c4a574]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((v) => !v))}
        className={cn(NIGHT_COLS, "h-11 w-full cursor-pointer items-center px-1 text-left hover:bg-white/[0.03]")}
      >
        <span className="truncate text-[13px] font-medium tracking-[0.04em] text-zinc-100">{id}</span>
        <span className="text-right text-[13px] text-zinc-200">{latest.nightCount}</span>
        <span className="text-right text-[13px] text-zinc-300">
          {latest.meanRating != null ? latest.meanRating.toFixed(1) : "—"}
        </span>
        <span className="text-right text-[13px] text-zinc-300">
          {latest.lastDurationMinutes != null ? formatDuration(latest.lastDurationMinutes) : "—"}
        </span>
        <span className="truncate text-[10px] tracking-[0.14em] text-zinc-500 uppercase" title={flagText}>
          {flagText}
        </span>
        <span className="text-right text-[13px] text-zinc-500">{person.packs.length}</span>
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 text-zinc-400 transition-transform", open && "rotate-90")}
        />
      </div>
      {open ? (
        <div id={histId} className="px-1 pt-1 pb-3 pl-[7.25rem] max-md:pl-1">
          <div
            className={cn(
              PACK_COLS,
              "h-6 items-center text-[10px] font-medium tracking-[0.16em] text-zinc-400 uppercase",
            )}
          >
            <span>Received</span>
            <span>Ver</span>
            <span className="text-right">Nights</span>
            <span className="text-right">Mean</span>
            <span className="text-right">Last</span>
            <span>Flags</span>
          </div>
          {person.packs.map((pack, i) => (
            <div
              key={`${pack.receivedAt}-${i}`}
              className={cn(PACK_COLS, "h-8 items-center text-[12px] text-zinc-400")}
            >
              <span className="text-zinc-500">{formatInboxReceived(pack.receivedAt)}</span>
              <span className="text-zinc-300">v{pack.appVersion}</span>
              <span className="text-right">{pack.nightCount}</span>
              <span className="text-right">{pack.meanRating != null ? pack.meanRating.toFixed(1) : "—"}</span>
              <span className="text-right">
                {pack.lastDurationMinutes != null ? formatDuration(pack.lastDurationMinutes) : "—"}
              </span>
              <span className="truncate text-[10px] tracking-[0.12em] text-zinc-500 uppercase">
                {pack.flags.length ? pack.flags.join(" · ") : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SignupLedger({ people }: { people: ModeratorPerson[] }) {
  return (
    <div>
      <div
        className={cn(
          SIGNUP_COLS,
          "h-8 items-center border-b border-white/[0.08] px-1 text-[10px] font-medium tracking-[0.16em] text-zinc-500 uppercase",
        )}
      >
        <span>Id</span>
        <span>Band</span>
        <span className="text-right">Nights</span>
        <span className="text-right">Faults</span>
        <span>Window</span>
        <span className="text-right">Ver</span>
        <span />
      </div>
      {people.map((person) => (
        <SignupRow key={person.participantId} person={person} />
      ))}
    </div>
  );
}

function SignupRow({ person }: { person: ModeratorPerson }) {
  const [open, setOpen] = useState(false);
  const id = shortParticipantId(person.participantId);
  const histId = `signup-hist-${person.participantId}`;
  const windowLabel =
    person.targetSleep && person.targetWake ? `${person.targetSleep}–${person.targetWake}` : "—";
  return (
    <div
      className={cn(
        "border-b border-white/[0.06]",
        open && "bg-white/[0.02] shadow-[inset_2px_0_0_0_#c4a574]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((v) => !v))}
        className={cn(SIGNUP_COLS, "h-11 w-full cursor-pointer items-center px-1 text-left hover:bg-white/[0.03]")}
      >
        <span className="truncate text-[13px] font-medium tracking-[0.04em] text-zinc-100">{id}</span>
        <span className="text-[12px] text-zinc-400">{person.ageBand ?? "—"}</span>
        <span className="text-right text-[13px] text-zinc-200">{person.nightsLogged}</span>
        <span className="text-right text-[13px] text-zinc-400">{person.faultCount}</span>
        <span className="truncate text-[12px] text-zinc-400">{windowLabel}</span>
        <span className="text-right text-[12px] text-zinc-500">
          {person.lastAppVersion ? `v${person.lastAppVersion}` : "—"}
        </span>
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 text-zinc-400 transition-transform", open && "rotate-90")}
        />
      </div>
      {open ? (
        <div id={histId} className="grid gap-x-8 gap-y-2 px-1 pt-1 pb-4 pl-[7.25rem] text-[12px] max-md:pl-1 sm:grid-cols-2">
          <Fact label="Mean rating" value={person.meanRating != null ? person.meanRating.toFixed(1) : "—"} />
          <Fact
            label="Last sleep"
            value={person.lastDurationMinutes != null ? formatDuration(person.lastDurationMinutes) : "—"}
          />
          <Fact
            label="Struggles"
            value={person.struggles.length ? person.struggles.join(" + ") : "—"}
          />
          <Fact label="Flags" value={person.flags.length ? person.flags.join(" · ") : "—"} />
          {person.lastFault ? (
            <p className="sm:col-span-2 text-[12px] text-amber-200/80">Last fault: {person.lastFault}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FaultLedger({
  people,
}: {
  people: { participantId: string; faults: ModeratorFault[] }[];
}) {
  return (
    <div>
      <div
        className={cn(
          FAULT_COLS,
          "h-8 items-center border-b border-white/[0.08] px-1 text-[10px] font-medium tracking-[0.16em] text-zinc-500 uppercase",
        )}
      >
        <span>Id</span>
        <span className="text-right">Count</span>
        <span>Last</span>
        <span />
      </div>
      {people.map((person) => (
        <FaultRow key={person.participantId} person={person} />
      ))}
    </div>
  );
}

function FaultRow({
  person,
}: {
  person: { participantId: string; faults: ModeratorFault[] };
}) {
  const [open, setOpen] = useState(false);
  const latest = person.faults[0];
  if (!latest) return null;
  const id = shortParticipantId(person.participantId);
  const histId = `fault-hist-${person.participantId}`;
  return (
    <div
      className={cn(
        "border-b border-white/[0.06]",
        open && "bg-white/[0.02] shadow-[inset_2px_0_0_0_#c4a574]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((v) => !v))}
        className={cn(FAULT_COLS, "h-11 w-full cursor-pointer items-center px-1 text-left hover:bg-white/[0.03]")}
      >
        <span className="truncate text-[13px] font-medium tracking-[0.04em] text-zinc-100">{id}</span>
        <span className="text-right text-[13px] text-zinc-200">{person.faults.length}</span>
        <span className="truncate text-[13px] text-zinc-400">{latest.message}</span>
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 text-zinc-400 transition-transform", open && "rotate-90")}
        />
      </div>
      {open ? (
        <ol id={histId} className="space-y-3 px-1 pt-1 pb-4 pl-[7.25rem] max-md:pl-1">
          {person.faults.map((fault, i) => (
            <li key={`${fault.at}-${i}`}>
              <p className="text-[11px] text-zinc-500">
                {new Date(fault.at).toLocaleString()}
                {fault.href ? ` · ${fault.href}` : ""}
                {` · v${fault.appVersion}`}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-200">{fault.message}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function onActivate(fn: () => void) {
  return {
    onClick: fn,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fn();
      }
    },
  };
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="font-heading text-[1.65rem] leading-none text-zinc-50">{value}</p>
      <p className="mt-1.5 text-[10px] tracking-[0.18em] text-zinc-500 uppercase">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.16em] text-zinc-400 uppercase">{label}</p>
      <p className="mt-0.5 text-zinc-300">{value}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-10 text-[13px] text-zinc-500">{children}</p>;
}
