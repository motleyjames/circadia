"use client";

import { useCallback, useState } from "react";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { DEFAULT_MOD_KEY } from "@/lib/mod-key-shared";
import type { ModeratorSnapshot } from "@/lib/moderator";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

type Tab = "people" | "nights" | "faults";

export default function ModeratorPage() {
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<Tab>("people");
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
          This is the reading room. Testers never see it. Local default is{" "}
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
            className="mt-4 h-14 w-full cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950 disabled:opacity-50"
          >
            {loading ? "Opening…" : "Open the inbox"}
          </button>
        </form>
      </div>
    );
  }

  const snapshot = data;

  return (
    <div className="min-h-dvh px-6 pt-8 pb-16 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Mark className="size-6" />
            <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
              Operator · v{APP_VERSION}
            </p>
          </div>
          <h1 className="font-heading mt-3 text-3xl tracking-tight text-zinc-50">Inbox</h1>
          <p className="mt-1 max-w-[46ch] text-[13px] leading-relaxed text-zinc-500">
            People who said yes. Nights that left on their own. Faults the diary caught. This page
            is not linked from the tester app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(key)}
          className="h-10 cursor-pointer rounded-full border border-white/12 px-4 text-[13px] text-zinc-300 hover:bg-white/5"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error ? <p className="mt-4 text-[13px] text-red-300">{error}</p> : null}

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="People" value={snapshot?.userCount ?? "—"} />
        <Stat label="Nights logged" value={snapshot?.nightCount ?? "—"} />
        <Stat label="Night packs" value={snapshot?.nightPackCount ?? "—"} />
        <Stat label="Faults" value={snapshot?.faultCount ?? "—"} />
      </div>

      <div className="mt-8 flex gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
        {(
          [
            ["people", "People"],
            ["nights", "Nights"],
            ["faults", "Faults"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-10 flex-1 cursor-pointer rounded-full text-[13px] font-medium",
              tab === id ? "bg-white/10 text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "people" ? (
        <ul className="mt-6 space-y-3">
          {!snapshot?.people.length ? (
            <Empty>No one has joined yet. When a tester says yes, they land here.</Empty>
          ) : (
            snapshot.people.map((person) => (
              <li
                key={person.participantId}
                className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-2xl text-zinc-50">{person.name ?? "Unnamed"}</h2>
                  <p className="font-mono text-[11px] text-zinc-600">
                    {person.participantId.slice(0, 8)}
                  </p>
                </div>
                <p className="mt-1 text-[13px] text-zinc-400">
                  {[person.email, person.phone].filter(Boolean).join(" · ") || "No contact yet"}
                </p>
                <p className="mt-2 text-[13px] text-zinc-500">
                  {person.age ?? "—"} yrs
                  {person.activity ? ` · ${person.activity}` : ""}
                  {person.nightsLogged ? ` · ${person.nightsLogged} night${person.nightsLogged === 1 ? "" : "s"}` : " · no mornings yet"}
                  {person.faultCount ? ` · ${person.faultCount} fault${person.faultCount === 1 ? "" : "s"}` : ""}
                </p>
                {person.targetSleep && person.targetWake ? (
                  <p className="mt-1 text-[12px] text-zinc-600">
                    Window {person.targetSleep}–{person.targetWake}
                    {person.struggles.length ? ` · ${person.struggles.join(" + ")}` : ""}
                  </p>
                ) : null}
                {person.lastFault ? (
                  <p className="mt-2 text-[12px] text-amber-200/80">Last fault: {person.lastFault}</p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "nights" ? (
        <ul className="mt-6 space-y-3">
          {!snapshot?.nights.length ? (
            <Empty>No night packs yet. They arrive after a real morning — not a sample week.</Empty>
          ) : (
            snapshot.nights.map((night, i) => (
              <li
                key={`${night.participantId}-${night.receivedAt}-${i}`}
                className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-xl text-zinc-50">{night.name ?? "Unnamed"}</h2>
                  <p className="text-[12px] text-zinc-600">{night.nightCount} nights in pack</p>
                </div>
                <p className="mt-1 font-mono text-[11px] text-zinc-600">
                  {night.participantId.slice(0, 8)} · v{night.appVersion}
                </p>
                <p className="mt-2 text-[13px] text-zinc-400">
                  {night.meanRating != null ? `Mean rating ${night.meanRating.toFixed(1)}` : "No ratings"}
                  {night.lastDurationMinutes != null
                    ? ` · last sleep ${Math.round(night.lastDurationMinutes / 60)}h ${night.lastDurationMinutes % 60}m`
                    : ""}
                </p>
                {night.flags.length ? (
                  <p className="mt-2 text-[12px] tracking-wide text-violet-200/70 uppercase">
                    {night.flags.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "faults" ? (
        <ul className="mt-6 space-y-3">
          {!snapshot?.faults.length ? (
            <Empty>No faults. That is the desired state.</Empty>
          ) : (
            snapshot.faults.map((fault, i) => (
              <li
                key={`${fault.participantId}-${fault.at}-${i}`}
                className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4"
              >
                <p className="text-[12px] text-zinc-500">
                  {fault.name ?? "Unnamed"} · {new Date(fault.at).toLocaleString()}
                  {fault.href ? ` · ${fault.href}` : ""}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-zinc-200">{fault.message}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-600">
                  {fault.participantId.slice(0, 8)} · v{fault.appVersion}
                </p>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">{label}</p>
      <p className="font-heading mt-2 text-3xl text-zinc-50">{value}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-white/10 px-5 py-8 text-[14px] text-zinc-500">{children}</p>;
}
