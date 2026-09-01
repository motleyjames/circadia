"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { BringLockedDiaryButton, UsePackedDiaryButton } from "@/components/locked-diary-controls";
import { PhoneEmptyPack, PhoneUnlock } from "@/components/phone-unlock";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { useCircadia } from "@/context/circadia-store";
import { AUTH_ERRORS, defaultAuthMode, defaultContactField, identitiesFromVaultKeys } from "@/lib/login";
import { fetchPackedDiary, packedDiaryStatus, readInlinePackedDiary } from "@/lib/packed-diary";
import { isPhoneNative } from "@/lib/phone-native";
import { isVaultEmpty, listDiaryLogins } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { hapticSelect } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Mode = "signup" | "login";

function useClientLive() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AuthGate() {
  const live = useClientLive();
  const [rev, setRev] = useState(0);
  const [startNew, setStartNew] = useState(false);
  if (!live) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <Mark className="size-8" />
          <h1 className="font-heading mt-8 text-[2.55rem] leading-none tracking-tight text-zinc-50">Circadia</h1>
        </div>
      </div>
    );
  }
  void rev;
  if (!isVaultEmpty()) return <DesktopAuthGate />;
  if (!startNew && (packedDiaryStatus() === "packed" || readInlinePackedDiary())) return <PhoneUnlock />;
  if (!startNew && (isPhoneNative() || process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK === "1")) {
    return (
      <PhoneEmptyPack
        onBrought={() => setRev((n) => n + 1)}
        onStartNew={() => setStartNew(true)}
      />
    );
  }
  return <DesktopAuthGate />;
}

function DesktopAuthGate() {
  const { signUp, logIn } = useCircadia();
  const identities = listDiaryLogins();
  const named = identities.filter((row) => !row.orphan);
  const orphan = identities.some((row) => row.orphan);
  const [mode, setMode] = useState<Mode>(() => defaultAuthMode(identities));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState(() => defaultContactField(identities));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brought, setBrought] = useState(false);

  useEffect(() => {
    void fetchPackedDiary().then((packed) => {
      if (!packed || !isVaultEmpty()) return;
      const next = identitiesFromVaultKeys(Object.keys(packed.files));
      setMode("login");
      setContact(defaultContactField(next));
    });
  }, []);

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await signUp({ firstName, lastName, contact, password, confirm });
        if (!result.ok) {
          setError(result.error);
          if (result.error.includes("Log in instead")) setMode("login");
        }
        return;
      }
      const result = await logIn(contact, password);
      if (!result.ok) {
        setError(result.error);
        if (result.error === AUTH_ERRORS.orphan) setMode("signup");
      }
    } catch {
      setError("Could not check the password on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const empty = isVaultEmpty();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <Mark className="size-8" />
        <h1 className="font-heading mt-8 text-[2.55rem] leading-none tracking-tight text-zinc-50">
          Circadia
        </h1>
        <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
          {brought
            ? "The locked diary is on this device. Log in with the same email or phone and password."
            : orphan && !named.length
            ? "This device already has a diary. Sign up to keep it. Email or phone plus a password is how you log back in. The diary is encrypted here. Circadia will not contact you."
            : named.length
              ? "Log in to the diary on this device. After that, Circadia stays signed in here until you log out. The file is encrypted here — Circadia does not keep your password, and there is no reset email."
              : empty
                ? "There is no diary on this device yet. Circadia lives here, not in the cloud. If this app was packed from another Circadia, log in with that same email or phone and password. Otherwise sign up here, or bring a locked copy."
                : "Sign up or log in. Email or phone plus a password opens the encrypted diary on this device — not a way for anyone to reach you. Circadia stays signed in here until you log out."}
        </p>

        {named.length ? (
          <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">
            {named.length === 1
              ? `Diary on this device: ${named[0].display}`
              : `${named.length} diaries on this device`}
          </p>
        ) : null}

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
                  className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-base text-zinc-50"
                />
              </label>
              <label className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Last name
                <Input
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.slice(0, 40))}
                  placeholder="Last"
                  className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-base text-zinc-50"
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
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              name="username"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@school.edu or a phone number"
              className="mt-2 h-12 rounded-2xl border-white/10 bg-white/4 px-4 text-base text-zinc-50"
            />
          </label>

          <SecretField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            autoFocus={brought && mode === "login"}
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
              : "Circadia cannot email a reset. If you forget it, the diary on this device stays locked."}
          </p>

          {error ? <p className="mt-4 text-[13px] text-amber-200/90">{error}</p> : null}

          <div className="mt-auto pt-8">
            <button
              type="submit"
              disabled={busy}
              className="h-14 w-full rounded-full bg-zinc-50 text-[17px] font-semibold text-zinc-950 disabled:opacity-50"
            >
              {busy ? (mode === "signup" ? "Signing up…" : "Logging in…") : mode === "signup" ? "Sign up" : "Log in"}
            </button>
          </div>
        </form>

        <UsePackedDiaryButton
          className="mt-6 h-12 w-full justify-center rounded-full border border-white/12 text-[15px] font-medium text-zinc-200 hover:bg-white/4"
          onInstalled={() => {
            const next = listDiaryLogins();
            setMode("login");
            setContact(defaultContactField(next));
            setPassword("");
            setError(null);
            setBrought(true);
          }}
        />
        <BringLockedDiaryButton
          className="mt-6 h-12 w-full justify-center rounded-full border border-white/12 text-[15px] font-medium text-zinc-200 hover:bg-white/4"
          onInstalled={() => {
            const next = listDiaryLogins();
            setMode("login");
            setContact(defaultContactField(next));
            setPassword("");
            setError(null);
            setBrought(true);
          }}
        />

        <p className="mt-auto pt-10 text-[12px] leading-relaxed text-zinc-600">
          The password is checked on this device. It is not sent to the person who built Circadia.
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
  autoFocus,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
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
          autoFocus={autoFocus}
          name="password"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 128))}
          className="h-12 rounded-2xl border-white/10 bg-white/4 px-4 pr-12 text-base text-zinc-50"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute top-1/2 right-1 -translate-y-1/2 inline-flex size-11 items-center justify-center text-zinc-500"
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
      onClick={() => {
        void hapticSelect();
        onClick();
      }}
      className={cn(
        "h-11 cursor-pointer rounded-full text-[13px] font-medium transition-colors",
        active ? "bg-zinc-50 text-zinc-950" : "text-zinc-400 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}
