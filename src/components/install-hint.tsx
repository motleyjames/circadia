"use client";

import { useState, useSyncExternalStore } from "react";

function standalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

const KEY = "circadia:install-hint";

function subscribe() {
  return () => undefined;
}

function clientEligible(): boolean {
  if (standalone()) return false;
  return window.sessionStorage.getItem(KEY) !== "1";
}

export function InstallHint() {
  const eligible = useSyncExternalStore(subscribe, clientEligible, () => false);
  const [dismissed, setDismissed] = useState(false);

  if (!eligible || dismissed) return null;

  return (
    <div className="mt-6 hidden border-t border-white/8 pt-5 md:block">
      <p className="text-[13px] leading-relaxed text-zinc-400">
        Bookmark this window if you want it in the browser. Circadia.app on the Mac is the same diary.
      </p>
      <button
        type="button"
        className="mt-2 text-[11px] font-medium tracking-[0.16em] text-zinc-400 uppercase"
        onClick={() => {
          window.sessionStorage.setItem(KEY, "1");
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
