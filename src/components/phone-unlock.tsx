"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { BringLockedDiaryButton } from "@/components/locked-diary-controls";
import { Mark } from "@/components/mark";
import { Input } from "@/components/ui/input";
import { useCircadia } from "@/context/circadia-store";
import { defaultContactField, identitiesFromVaultKeys } from "@/lib/login";
import { packedDiaryStatus, readInlinePackedDiary } from "@/lib/packed-diary";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

function packedContact(): string {
  const packed = readInlinePackedDiary();
  if (!packed) return "";
  return defaultContactField(identitiesFromVaultKeys(Object.keys(packed.files)));
}

export function PhoneUnlock() {
  const { logIn } = useCircadia();
  const [contact, setContact] = useState(packedContact);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <GateShell>
      <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-zinc-400">
        A locked diary is in this app — packed from the Circadia that installed it. Log in with the same
        email or phone and password.
      </p>

      <form
        className="mt-10 flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setError(null);
          setBusy(true);
          void logIn(contact, password)
            .then((result) => {
              if (!result.ok) setError(result.error);
            })
            .catch(() => {
              setError("Could not check the password on this device. Try again.");
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">
          Email or phone
          <Input
            autoComplete="username"
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
          autoComplete="current-password"
          autoFocus={Boolean(contact)}
          className="mt-4"
        />

        <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
          The password is checked on this device. Circadia cannot email a reset.
        </p>

        {error ? <p className="mt-4 text-[13px] text-amber-200/90">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-8 h-14 w-full cursor-pointer rounded-full bg-zinc-50 text-[15px] font-medium text-zinc-950 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-auto pt-10 text-[12px] leading-relaxed text-zinc-600">
        Stay-signed-in is on this iPhone only. It does not travel in the pack.
      </p>
      <PackFooter packed />
    </GateShell>
  );
}

export function PhoneEmptyPack({
  onBrought,
  onStartNew,
}: {
  onBrought: () => void;
  onStartNew: () => void;
}) {
  return (
    <GateShell>
      <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-zinc-400">
        This app has no diary packed in it. Circadia is local — nights live on the device that wrote them,
        not in the cloud.
      </p>
      <ol className="mt-8 max-w-[40ch] list-decimal space-y-3 pl-5 text-[14px] leading-relaxed text-zinc-400">
        <li>Open Circadia on the computer that has your nights and log in.</li>
        <li>
          In that clone: <span className="text-zinc-200">npm run put-on-phone</span>
        </li>
        <li>Xcode destination this iPhone — not a simulator, not Any iOS Device. Run.</li>
        <li>
          This footer should read <span className="text-zinc-200">{APP_VERSION} · diary packed</span>, then
          log in with the same password.
        </li>
      </ol>

      <BringLockedDiaryButton
        className="mt-10 h-12 w-full justify-center rounded-full border border-white/12 text-[15px] font-medium text-zinc-200 hover:bg-white/4"
        onInstalled={onBrought}
      />

      <p className="mt-auto pt-10 text-[12px] leading-relaxed text-zinc-600">
        Bring a locked diary if you already saved one. Signing up here starts a second diary on this device.
      </p>
      <button
        type="button"
        onClick={onStartNew}
        className="mt-4 cursor-pointer text-left text-[13px] text-zinc-500 hover:text-zinc-300"
      >
        Start a new diary on this device
      </button>
      <PackFooter packed={false} />
    </GateShell>
  );
}

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <Mark className="size-8" />
        <h1 className="font-heading mt-8 text-[2.55rem] leading-none tracking-tight text-zinc-50">Circadia</h1>
        {children}
      </div>
    </div>
  );
}

function PackFooter({ packed }: { packed: boolean }) {
  const status = packedDiaryStatus();
  const label = packed || status === "packed" ? "diary packed" : "no diary packed";
  return (
    <p className="mt-3 text-[11px] tracking-[0.18em] text-zinc-700 uppercase">
      {APP_VERSION} · {label}
    </p>
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
          className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-zinc-500 hover:text-zinc-200"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );
}
