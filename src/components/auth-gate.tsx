"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { useCircadia } from "@/context/circadia-store";
import { hasOrphanLocalFile } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

type Mode = "signup" | "login";

export function AuthGate() {
  const { signUp, logIn } = useCircadia();
  const [mode, setMode] = useState<Mode>("signup");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orphan] = useState(() => hasOrphanLocalFile());

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await signUp({ firstName, lastName, contact, password, confirm });
        if (!result.ok) setError(result.error);
        return;
      }
      const result = await logIn(contact, password);
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
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
            ? "This computer already has a diary. Sign up to keep it. Email or phone plus a password is how you log back in. Circadia will not contact you."
            : "Sign up or log in. Email or phone plus a password opens Circadia on this computer — not a way for anyone to reach you."}
        </p>

        <div className="mt-8 grid grid-cols-2 rounded-full border border-white/12 p-1">
          <ModeTab
            active={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Sign up
          </ModeTab>
          <ModeTab
            active={mode === "login"}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Log in
          </ModeTab>
        </div>

        <form
          className="mt-8 flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                First name
                <Input
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.slice(0, 40))}
                  placeholder="First"
                  className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-[15px] text-zinc-50"
                />
              </label>
              <label className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Last name
                <Input
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.slice(0, 40))}
                  placeholder="Last"
                  className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-[15px] text-zinc-50"
                />
              </label>
            </div>
          ) : null}

          <label
            className={cn(
              "block text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase",
              mode === "signup" ? "mt-4" : "mt-0",
            )}
          >
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

          <SecretField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="mt-4"
          />

          {mode === "signup" ? (
            <SecretField
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              className="mt-4"
            />
          ) : null}

          <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
            {mode === "signup"
              ? orphan
                ? "This does not start you over. It attaches a login to the diary already here."
                : "At least 8 characters. Circadia will not email or text you."
              : "Circadia cannot email a reset. If you forget it, the diary on this computer stays locked."}
          </p>

          {error ? <p className="mt-4 text-[13px] text-amber-200/90">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-8 h-14 w-full cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (mode === "signup" ? "Signing up…" : "Logging in…") : mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>

        <p className="mt-auto pt-10 text-[12px] leading-relaxed text-zinc-600">
          The password is checked on this computer. It is not sent to the person who built Circadia.
        </p>
        <p className="mt-3 text-[11px] tracking-[0.18em] text-zinc-700 uppercase">{APP_VERSION}</p>
      </div>
    </div>
  );
}

function SecretField({
  label,
  value,
  onChange,
  autoComplete,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className={cn("block text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase", className)}>
      {label}
      <span className="relative mt-2 block">
        <Input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 128))}
          className="h-12 rounded-2xl border-white/10 bg-white/4 px-4 pr-12 text-[15px] text-zinc-50"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-zinc-500 hover:text-zinc-200"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
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
