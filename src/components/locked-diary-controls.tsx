"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DIARY_PACK_ERRORS,
  LOCKED_DIARY_FILENAME,
  readLockedDiaryFile,
  serializeLockedDiary,
} from "@/lib/diary-pack";
import { isPhoneNative } from "@/lib/phone-native";
import { fetchPackedDiary } from "@/lib/packed-diary";
import { SESSION_HEADER } from "@/lib/session-token-shared";
import { flushVaultWrites, installLockedVault, isVaultEmpty, snapshotDisk } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { DiskVault } from "@/lib/vault";

function desktopHeaders(): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = typeof window !== "undefined" ? window.circadiaDesktop?.token : undefined;
  if (typeof token === "string" && token.length > 0) headers[SESSION_HEADER] = token;
  return headers;
}

async function offerLockedCopy(): Promise<"share" | "downloads" | "file" | "aborted"> {
  await flushVaultWrites();
  const pack = serializeLockedDiary(snapshotDisk());
  const json = JSON.stringify(pack);
  const blob = new Blob([json], { type: "application/json" });
  const file = new File([blob], LOCKED_DIARY_FILENAME, { type: "application/json" });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (isPhoneNative() && typeof nav.share === "function") {
    try {
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "Circadia locked diary" });
        return "share";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "aborted";
    }
  }

  try {
    const res = await fetch("/api/locked-diary", {
      method: "POST",
      headers: desktopHeaders(),
      body: json,
    });
    if (res.ok) return "downloads";
  } catch {
    /* phone static pack has no API */
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = LOCKED_DIARY_FILENAME;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "file";
}

const SAVE_MSG: Record<"share" | "downloads" | "file", string> = {
  share: "Locked copy sent.",
  downloads:
    "Locked copy is in Downloads as circadia-locked.circadia. AirDrop it, then bring it on the other Circadia.",
  file: "Locked copy saved as circadia-locked.circadia.",
};

export function SaveLockedCopyButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <span className="block">
      <button
        type="button"
        disabled={busy}
        className={cn("cursor-pointer disabled:opacity-50", className)}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          setMsg(null);
          void offerLockedCopy()
            .then((how) => {
              if (how === "aborted") return;
              setMsg(SAVE_MSG[how]);
            })
            .catch(() => {
              setMsg("Could not save a locked copy on this device.");
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Saving a locked copy…" : "Save a locked copy"}
      </button>
      {msg ? <p className="mt-2 max-w-[52ch] text-[12px] leading-relaxed text-zinc-500">{msg}</p> : null}
    </span>
  );
}

export function BringLockedDiaryButton({
  onInstalled,
  className,
  alwaysConfirm = false,
}: {
  onInstalled: () => void;
  className?: string;
  alwaysConfirm?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DiskVault | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function apply(vault: DiskVault) {
    setBusy(true);
    const result = await installLockedVault(vault);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onInstalled();
  }

  return (
    <span className="block">
      {/*
        iOS WKWebView often ignores input.click() on a display:none file control.
        The tap has to land on the <input> itself — opacity-0 over a <label>.
      */}
      <label
        className={cn(
          "relative inline-flex cursor-pointer items-center overflow-hidden",
          busy && "pointer-events-none opacity-50",
          className,
        )}
      >
        <input
          type="file"
          disabled={busy}
          aria-label="Bring a locked diary"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || busy) return;
            setBusy(true);
            setError(null);
            void readLockedDiaryFile(file)
              .then(async (vault) => {
                if (alwaysConfirm || !isVaultEmpty()) {
                  setPending(vault);
                  setConfirmOpen(true);
                  return;
                }
                await apply(vault);
              })
              .catch(() => {
                setError(DIARY_PACK_ERRORS.notDiary);
              })
              .finally(() => setBusy(false));
          }}
        />
        <span className="pointer-events-none">
          {busy ? "Opening…" : "Bring a locked diary"}
        </span>
      </label>
      {error ? <p className="mt-2 text-[13px] text-amber-200/90">{error}</p> : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPending(null);
        }}
        title="Replace the diary on this device?"
        description="The diary already here will be replaced by the locked copy. You will log in again with the same email or phone and password. Stay-signed-in does not travel."
        confirmLabel="Replace diary"
        destructive
        onConfirm={() => {
          const vault = pending;
          setPending(null);
          if (vault) void apply(vault);
        }}
        />
    </span>
  );
}

export function UsePackedDiaryButton({
  onInstalled,
  className,
}: {
  onInstalled: () => void;
  className?: string;
}) {
  const [vault, setVault] = useState<DiskVault | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    void fetchPackedDiary().then((packed) => {
      if (packed) setVault(packed);
    });
  }, []);

  if (!vault) return null;

  async function apply() {
    if (!vault) return;
    setBusy(true);
    const result = await installLockedVault(vault);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onInstalled();
  }

  return (
    <span className="block">
      <button
        type="button"
        disabled={busy}
        className={cn("cursor-pointer disabled:opacity-50", className)}
        onClick={() => {
          if (busy) return;
          if (!isVaultEmpty()) {
            setConfirmOpen(true);
            return;
          }
          void apply();
        }}
      >
        {busy ? "Opening…" : "Use the packed diary"}
      </button>
      {error ? <p className="mt-2 text-[13px] text-amber-200/90">{error}</p> : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace the diary on this device?"
        description="The diary already here will be replaced by the locked copy packed in this app. You will log in again with the same email or phone and password."
        confirmLabel="Replace diary"
        destructive
        onConfirm={() => void apply()}
      />
    </span>
  );
}
