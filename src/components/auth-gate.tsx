"use client";

import { useState } from "react";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { useCircadia } from "@/context/circadia-store";
import { hasOrphanLocalFile } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

type Mode = "create" | "login";

export function AuthGate() {
  const { signUp, logIn } = useCircadia();
  const [mode, setMode] = useState<Mode>("create");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orphan] = useState(() => hasOrphanLocalFile());

  function submit() {
    setError(null);
    if (mode === "create") {
      const result = signUp({ firstName, lastName, contact });
      if (!result.ok) setError(result.error);
      return;
    }
    const result = logIn(contact);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <Mark className="size-8" />
        <h1 className="font-heading mt-8 text-[2.55rem] leading-none tracking-tight text-zinc-50">
          Circadia
        </h1>
        <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
          {orphan
            ? "This computer already has a diary. First and last name, then an email or phone, keeps it — and is how you open it again. Circadia will not contact you."
            : "A sleep file on this computer. Email or phone is how you open it again — not a way for anyone to reach you."}
        </p>

        <div className="mt-8 grid grid-cols-2 rounded-full border border-white/12 p-1">
          <ModeTab active={mode === "create"} onClick={() => { setMode("create"); setError(null); }}>
            Create file
          </ModeTab>
          <ModeTab active={mode === "login"} onClick={() => { setMode("login"); setError(null); }}>
            Log in
          </ModeTab>
        </div>

        <form
          className="mt-8 flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {mode === "create" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                First name
                <Input
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.slice(0, 40))}
                  placeholder="Ada"
                  className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-[15px] text-zinc-50"
                />
              </label>
              <label className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Last name
                <Input
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.slice(0, 40))}
                  placeholder="Lovelace"
                  className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-[15px] text-zinc-50"
                />
              </label>
            </div>
          ) : null}

          <label className={cn("block text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase", mode === "create" ? "mt-4" : "mt-0")}>
            Email or phone
            <Input
              autoComplete={mode === "login" ? "username" : "email"}
              inputMode="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@school.edu or a phone number"
              className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-[15px] text-zinc-50"
            />
          </label>
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
            {mode === "create"
              ? orphan
                ? "Create file claims the diary already on this computer. It does not start you over."
                : "This identifier opens your file on this computer. Circadia will not email or text you."
              : "Same email or phone you used when you created the file."}
          </p>

          {error ? <p className="mt-4 text-[13px] text-amber-200/90">{error}</p> : null}

          <button
            type="submit"
            className="mt-8 h-14 w-full cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950 transition-opacity hover:opacity-90"
          >
            {mode === "create" ? "Create file" : "Log in"}
          </button>
        </form>

        <p className="mt-auto pt-10 text-[12px] leading-relaxed text-zinc-600">
          There is no password and no cloud account. Anyone at this computer who knows the email or
          phone can open the file.
        </p>
        <p className="mt-3 text-[11px] tracking-[0.18em] text-zinc-700 uppercase">{APP_VERSION}</p>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 cursor-pointer rounded-full text-[13px] font-medium transition-colors",
        active ? "bg-zinc-50 text-zinc-950" : "text-zinc-400 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}
