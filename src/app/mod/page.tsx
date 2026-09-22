"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { OperatorChrome } from "@/components/operator-chrome";
import { OperatorGate } from "@/components/operator-gate";
import {
  buildConsoleModel,
  dismissOrphan,
  nameOrphan,
  type ConsoleArrival,
  type ConsoleReject,
  type ConsoleTester,
  type NightSlot,
} from "@/lib/console-model";
import { isCohort, readInviteBook, type Cohort, type OperatorInvite } from "@/lib/invite";
import {
  formatInboxReceived,
  groupNightsByParticipant,
  shortParticipantId,
  type ModeratorFault,
  type ModeratorNightPerson,
  type ModeratorPerson,
  type ModeratorSnapshot,
} from "@/lib/moderator";
import { readOperatorKey, writeOperatorKey } from "@/lib/operator-session";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

const NIGHT_COLS =
  "grid grid-cols-[7.25rem_3.5rem_3.25rem_3.75rem_minmax(0,1fr)_3rem_1rem] gap-x-3";
const SIGNUP_COLS =
  "grid grid-cols-[7.25rem_4.25rem_3.5rem_3.5rem_minmax(0,1fr)_4rem_1rem] gap-x-3";
const FAULT_COLS = "grid grid-cols-[7.25rem_3.5rem_minmax(0,1fr)_1rem] gap-x-3";
const PACK_COLS =
  "grid grid-cols-[9.5rem_4.25rem_3.5rem_3.25rem_3.75rem_minmax(0,1fr)] gap-x-3";
const TABLE_COLS =
  "grid grid-cols-[200px_124px_180px_116px_minmax(0,1fr)_120px] gap-6";

type InboxBody = ModeratorSnapshot & {
  ok?: boolean;
  error?: string;
  packs?: ConsoleArrival[];
  rejects?: ConsoleReject[];
};

const SECTION_COLOR: Record<string, string> = {
  safety: "text-op-safety",
  "not-filing": "text-op-amber",
  "in-baseline": "text-op-ink",
  "baseline-complete": "text-op-violet",
  "not-enrolled": "text-op-muted",
};

const COHORTS: { id: Cohort; label: string }[] = [
  { id: "friend", label: "Friend" },
  { id: "stranger", label: "Stranger" },
  { id: "lab", label: "Sleep lab" },
];

export default function ModeratorPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InboxBody | null>(null);
  const [book, setBook] = useState<OperatorInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState<number | null>(null);

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

  const nightPeople = useMemo(
    () => (data ? groupNightsByParticipant(data.nights) : []),
    [data],
  );
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
    <OperatorChrome active="week" weekLabel={view.weekLabel} attentionCount={view.attentionCount}>
      <div className="flex flex-col gap-6 px-12 py-9">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-[36px] leading-[1.1] font-normal tracking-[-0.02em] text-op-ink">
            Your testers this week
          </h1>
          {view.completion ? (
            <p className="max-w-[820px] text-[15px] leading-normal text-op-body">
              Completion so far is{" "}
              <strong className="font-semibold text-op-ink">{view.completion.percentLabel}</strong>{" "}
              {view.completion.sentence.replace(/^Completion so far is \d+% /, "")}
            </p>
          ) : (
            <p className="max-w-[820px] text-[15px] leading-normal text-op-body">
              Completion appears here once you have named testers in a baseline.
            </p>
          )}
        </div>

        {error ? <p className="text-[14px] text-op-safety">{error}</p> : null}

        {view.health ? (
          <section
            aria-labelledby="health-title"
            className="overflow-hidden rounded-xl border border-op-line bg-op-surface"
          >
            <h2 id="health-title" className="px-6 pt-3.5 pb-2.5 text-[14px] font-semibold text-op-ink">
              Data health
            </h2>
            {view.health.map((item, index) => (
              <div
                key={`${item.kind}-${item.participantId ?? index}`}
                className="flex items-start gap-3.5 border-t border-op-line-soft px-6 py-3"
              >
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-op-amber" aria-hidden />
                <div className="min-w-0 flex-1 text-[14px] leading-snug text-op-ink">
                  {item.message}
                  {item.detail ? (
                    <span className="mt-1 block text-[13px] text-op-muted">{item.detail}</span>
                  ) : null}
                  {item.kind === "unreadable" && whyOpen === index && item.files.length ? (
                    <ul className="mt-1.5 list-none space-y-0.5 p-0 text-[13px] text-op-muted">
                      {item.files.map((file) => (
                        <li key={file} className="break-all">
                          {file}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {item.actions.map((action) => {
                    if (action.id === "why") {
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setWhyOpen(whyOpen === index ? null : index)}
                          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
                        >
                          {action.label}
                        </button>
                      );
                    }
                    if (action.id === "name" && item.participantId) {
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setNamingId(item.participantId)}
                          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
                        >
                          {action.label}
                        </button>
                      );
                    }
                    if (action.id === "dismiss" && item.participantId) {
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => persistBook(dismissOrphan(book, item.participantId!))}
                          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
                        >
                          {action.label}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {view.empty ? (
          <section className="rounded-xl border border-op-line bg-op-surface px-6 py-10">
            <p className="text-[16px] font-semibold text-op-ink">No testers have sent a pack yet.</p>
            <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-op-body">
              Invite the first one. Their name stays on this Mac; only the code reaches their phone.
            </p>
            <a
              href="/mod/invite"
              className="mt-5 inline-flex h-12 items-center rounded-lg bg-op-violet px-5 text-[15px] font-semibold text-white no-underline"
            >
              Invite a tester
            </a>
          </section>
        ) : (
          <div className="overflow-hidden rounded-xl border border-op-line bg-op-surface">
            <div
              className={cn(
                TABLE_COLS,
                "border-b border-op-line px-6 py-3 text-[13px] text-op-muted",
              )}
            >
              <div>Tester</div>
              <div>Baseline</div>
              <div>14 nights</div>
              <div>Sleep efficiency</div>
              <div>Why it is here</div>
              <div>Last sync</div>
            </div>
            {view.sections.map((section) => (
              <div key={section.id}>
                <div className="flex items-baseline gap-2.5 border-b border-op-line-soft bg-[#fafafb] px-6 py-3">
                  <div className={cn("text-[14px] font-semibold", SECTION_COLOR[section.id])}>
                    {section.title}
                  </div>
                  <div className="text-[13px] text-op-muted tabular-nums">{section.testers.length}</div>
                </div>
                {section.testers.map((tester) => (
                  <TesterRow
                    key={tester.participantId}
                    tester={tester}
                    nightPerson={nightPeople.find((row) => row.participantId === tester.participantId)}
                    person={data?.people.find((row) => row.participantId === tester.participantId)}
                    naming={namingId === tester.participantId}
                    onName={() => setNamingId(tester.participantId)}
                    onCancelName={() => setNamingId(null)}
                    onSaveName={(name, cohort) => {
                      persistBook(nameOrphan(book, tester.participantId, name, cohort));
                      setNamingId(null);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </OperatorChrome>
  );
}

function TesterRow({
  tester,
  nightPerson,
  person,
  naming,
  onName,
  onCancelName,
  onSaveName,
}: {
  tester: ConsoleTester;
  nightPerson?: ModeratorNightPerson;
  person?: ModeratorPerson;
  naming: boolean;
  onName: () => void;
  onCancelName: () => void;
  onSaveName: (name: string, cohort: Cohort) => void;
}) {
  const [open, setOpen] = useState(false);
  const histId = `tester-hist-${tester.participantId}`;
  const elapsed = tester.nightsElapsed;
  const stripLabel =
    elapsed !== null
      ? `${tester.nightsFiled} of ${elapsed} nights filed so far; bar height is sleep efficiency`
      : `${tester.nightsFiled} nights, outside any baseline`;
  return (
    <div className="border-b border-op-line-soft">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((value) => !value))}
        className={cn(TABLE_COLS, "w-full cursor-pointer items-center px-6 py-3.5 text-left")}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate text-[16px] font-semibold tabular-nums text-op-ink">
            {tester.name ?? shortParticipantId(tester.participantId)}
          </div>
          <div className={cn("text-[13px]", tester.inBook ? "text-op-muted" : "text-op-amber")}>
            {tester.cohortLabel}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] tabular-nums text-op-ink">{tester.progressLabel}</div>
          <div className="text-[13px] text-op-muted tabular-nums">{tester.filedLabel}</div>
        </div>
        {tester.slots.length ? <NightStrip slots={tester.slots} label={stripLabel} /> : <div />}
        <div className="text-[20px] font-semibold tabular-nums text-op-ink">
          {tester.sleepEfficiencyPct !== null ? `${tester.sleepEfficiencyPct}%` : "—"}
        </div>
        <div className="flex flex-col items-start gap-1">
          <div
            className={cn(
              "text-[14px] leading-snug",
              tester.section === "safety"
                ? "text-op-safety"
                : tester.section === "not-filing"
                  ? "text-op-amber"
                  : "text-op-ink",
            )}
          >
            {tester.reason}
          </div>
          {tester.action === "name" ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onName();
              }}
              className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
            >
              Add a name
            </button>
          ) : null}
          {tester.action === "export" ? (
            <a
              href="/mod/exports"
              onClick={(event) => event.stopPropagation()}
              className="text-[14px] font-semibold text-op-violet no-underline hover:text-op-violet-deep"
            >
              Export diary
            </a>
          ) : null}
        </div>
        <div className="text-[14px] text-op-muted">{tester.lastSync}</div>
      </div>
      {naming ? (
        <NameOrphanForm
          onCancel={onCancelName}
          onSave={onSaveName}
        />
      ) : null}
      {open ? (
        <div id={histId} className="border-t border-op-line-soft bg-[#fafafb] px-6 py-3">
          {nightPerson ? <NightRow person={nightPerson} /> : null}
          {person ? <SignupRow person={person} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function NameOrphanForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (name: string, cohort: Cohort) => void;
}) {
  const [name, setName] = useState("");
  const [cohort, setCohort] = useState<Cohort>("friend");
  return (
    <form
      className="border-t border-op-line-soft bg-[#fafafb] px-6 py-4"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || !isCohort(cohort)) return;
        onSave(trimmed, cohort);
      }}
    >
      <div className="flex max-w-[28rem] flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-op-ink">Their name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="First name and last initial"
            className="h-11 rounded-lg border border-op-input bg-op-surface px-3 text-[15px] text-op-ink"
          />
        </label>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="text-[14px] font-semibold text-op-ink">How you found them</legend>
          {COHORTS.map((option) => (
            <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] text-op-ink">
              <input
                type="radio"
                name="orphan-cohort"
                value={option.id}
                checked={cohort === option.id}
                onChange={() => setCohort(option.id)}
                className="h-4 w-4 accent-op-violet"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="h-11 cursor-pointer rounded-lg bg-op-violet px-4 text-[14px] font-semibold text-white"
          >
            Save name
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function NightStrip({ slots, label }: { slots: NightSlot[]; label: string }) {
  return (
    <div className="flex h-[30px] items-end gap-[3px]" role="img" aria-label={label}>
      {slots.map((slot, index) => (
        <div
          key={index}
          className={cn(
            "relative h-[30px] w-2.5 overflow-hidden rounded-[2px] box-border",
            slot.kind === "bar" && "border border-solid border-op-violet-edge bg-op-violet-track",
            slot.kind === "outline" && "border border-solid border-op-slot-edge bg-transparent",
            slot.kind === "dashed" && "border border-dashed border-op-slot-edge bg-transparent",
            slot.kind === "empty" && "border border-solid border-op-slot bg-op-slot",
          )}
        >
          {slot.kind === "bar" && slot.efficiencyPct !== null ? (
            <div
              className="absolute right-0 bottom-0 left-0 bg-op-violet"
              style={{ height: `${Math.max(0, Math.min(100, slot.efficiencyPct))}%` }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function NightLedger({ people }: { people: ModeratorNightPerson[] }) {
  return (
    <div>
      <div
        className={cn(
          NIGHT_COLS,
          "h-8 items-center border-b border-op-line px-1 text-[10px] font-medium tracking-[0.16em] text-op-muted uppercase",
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
    <div className={cn("border-b border-op-line-soft", open && "bg-op-violet-wash")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((v) => !v))}
        className={cn(NIGHT_COLS, "h-11 w-full cursor-pointer items-center px-1 text-left")}
      >
        <span className="truncate text-[13px] font-medium tracking-[0.04em] text-op-ink">{id}</span>
        <span className="text-right text-[13px] text-op-ink">{latest.nightCount}</span>
        <span className="text-right text-[13px] text-op-body">
          {latest.meanRating != null ? latest.meanRating.toFixed(1) : "—"}
        </span>
        <span className="text-right text-[13px] text-op-body">
          {latest.lastDurationMinutes != null ? formatDuration(latest.lastDurationMinutes) : "—"}
        </span>
        <span className="truncate text-[10px] tracking-[0.14em] text-op-muted uppercase" title={flagText}>
          {flagText}
        </span>
        <span className="text-right text-[13px] text-op-muted">{person.packs.length}</span>
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 text-op-muted transition-transform", open && "rotate-90")}
        />
      </div>
      {open ? (
        <div id={histId} className="px-1 pt-1 pb-3 pl-[7.25rem] max-md:pl-1">
          <div
            className={cn(
              PACK_COLS,
              "h-6 items-center text-[10px] font-medium tracking-[0.16em] text-op-muted uppercase",
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
            <div key={`${pack.receivedAt}-${i}`} className={cn(PACK_COLS, "h-8 items-center text-[12px] text-op-body")}>
              <span className="text-op-muted">{formatInboxReceived(pack.receivedAt)}</span>
              <span className="text-op-ink">v{pack.appVersion}</span>
              <span className="text-right">{pack.nightCount}</span>
              <span className="text-right">{pack.meanRating != null ? pack.meanRating.toFixed(1) : "—"}</span>
              <span className="text-right">
                {pack.lastDurationMinutes != null ? formatDuration(pack.lastDurationMinutes) : "—"}
              </span>
              <span className="truncate text-[10px] tracking-[0.12em] text-op-muted uppercase">
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
          "h-8 items-center border-b border-op-line px-1 text-[10px] font-medium tracking-[0.16em] text-op-muted uppercase",
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
    <div className={cn("border-b border-op-line-soft", open && "bg-op-violet-wash")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((v) => !v))}
        className={cn(SIGNUP_COLS, "h-11 w-full cursor-pointer items-center px-1 text-left")}
      >
        <span className="truncate text-[13px] font-medium tracking-[0.04em] text-op-ink">{id}</span>
        <span className="text-[12px] text-op-muted">{person.ageBand ?? "—"}</span>
        <span className="text-right text-[13px] text-op-ink">{person.nightsLogged}</span>
        <span className="text-right text-[13px] text-op-muted">{person.faultCount}</span>
        <span className="truncate text-[12px] text-op-muted">{windowLabel}</span>
        <span className="text-right text-[12px] text-op-muted">
          {person.lastAppVersion ? `v${person.lastAppVersion}` : "—"}
        </span>
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 text-op-muted transition-transform", open && "rotate-90")}
        />
      </div>
      {open ? (
        <div className="grid gap-x-8 gap-y-2 px-1 pt-1 pb-4 pl-[7.25rem] text-[12px] max-md:pl-1 sm:grid-cols-2" id={histId}>
          <Fact label="Mean rating" value={person.meanRating != null ? person.meanRating.toFixed(1) : "—"} />
          <Fact
            label="Last sleep"
            value={person.lastDurationMinutes != null ? formatDuration(person.lastDurationMinutes) : "—"}
          />
          <Fact label="Struggles" value={person.struggles.length ? person.struggles.join(" + ") : "—"} />
          <Fact label="Flags" value={person.flags.length ? person.flags.join(" · ") : "—"} />
          {person.lastFault ? (
            <p className="text-[12px] text-op-amber sm:col-span-2">Last fault: {person.lastFault}</p>
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
          "h-8 items-center border-b border-op-line px-1 text-[10px] font-medium tracking-[0.16em] text-op-muted uppercase",
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
    <div className={cn("border-b border-op-line-soft", open && "bg-op-violet-wash")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={histId}
        {...onActivate(() => setOpen((v) => !v))}
        className={cn(FAULT_COLS, "h-11 w-full cursor-pointer items-center px-1 text-left")}
      >
        <span className="truncate text-[13px] font-medium tracking-[0.04em] text-op-ink">{id}</span>
        <span className="text-right text-[13px] text-op-ink">{person.faults.length}</span>
        <span className="truncate text-[13px] text-op-muted">{latest.message}</span>
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 text-op-muted transition-transform", open && "rotate-90")}
        />
      </div>
      {open ? (
        <ol id={histId} className="space-y-3 px-1 pt-1 pb-4 pl-[7.25rem] max-md:pl-1">
          {person.faults.map((fault, i) => (
            <li key={`${fault.at}-${i}`}>
              <p className="text-[11px] text-op-muted">
                {new Date(fault.at).toLocaleString()}
                {fault.href ? ` · ${fault.href}` : ""}
                {` · v${fault.appVersion}`}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-op-ink">{fault.message}</p>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.16em] text-op-muted uppercase">{label}</p>
      <p className="mt-0.5 text-op-body">{value}</p>
    </div>
  );
}
