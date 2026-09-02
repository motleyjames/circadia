"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CircadiaProvider, CircadiaSafeTree, useCircadia } from "@/context/circadia-store";
import { AuthGate } from "@/components/auth-gate";
import { BottomNav } from "@/components/bottom-nav";
import { BrandStage } from "@/components/brand-stage";
import { ChatBar } from "@/components/chat-bar";
import { DiaryNavLock } from "@/components/diary-nav-lock";
import { DiaryTabLink } from "@/components/diary-tab-link";
import { DiaryViews } from "@/components/diary-views";
import { Mark } from "@/components/mark";
import { NativeChrome } from "@/components/native-chrome";
import { Onboarding } from "@/components/onboarding";
import { SidebarNav } from "@/components/sidebar-nav";
import { StudyGate } from "@/components/study-gate";
import {
  OPEN_COVER_MS,
  OPEN_HOLD_MS,
  OPEN_HOLD_REDUCED_MS,
  consumeOpenHold,
  diaryShellPhase,
  isOpenHoldConsumed,
  subscribeOpenHold,
  waitForOpenSurface,
} from "@/lib/diary-shell";
import { diaryPathname, useDiaryPath } from "@/lib/diary-route";
import { hapticLight } from "@/lib/haptics";
import { isOperatorSurface } from "@/lib/surface";
import { cn } from "@/lib/utils";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function Stage({
  children,
  wide = false,
  cover = null,
}: {
  children: React.ReactNode;
  wide?: boolean;
  cover?: React.ReactNode;
}) {
  return (
    <div className="night-sky relative flex h-full max-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 glow-veil" />
      <div className="native-drag relative z-50" aria-hidden />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
        {wide ? (
          children
        ) : (
          <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">{children}</div>
        )}
      </div>
      {cover}
    </div>
  );
}

function OpenCover({ exiting, play }: { exiting: boolean; play: boolean }) {
  return (
    <div
      className={cn(
        "brand-open-cover absolute inset-0 z-40 flex flex-col",
        !play && "brand-open-wait",
        exiting ? "brand-open-exit pointer-events-none" : "pointer-events-auto",
      )}
      aria-hidden={exiting}
    >
      <div className="night-sky absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 glow-veil" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <BrandStage key={play ? "play" : "hold"} />
      </div>
    </div>
  );
}

function PhoneAsk({ onAsk }: { onAsk: () => void }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+2.75rem)] items-end justify-between bg-gradient-to-b from-[#05040a]/85 to-transparent px-[max(0.35rem,env(safe-area-inset-left))] pr-[max(0.35rem,env(safe-area-inset-right))] xl:hidden">
      <DiaryTabLink
        href="/"
        className="pointer-events-auto inline-flex h-11 items-center gap-2.5 px-3"
        aria-label="Circadia, Tonight"
        onClick={() => {
          void hapticLight();
        }}
      >
        <Mark className="size-7 shrink-0" />
        <span className="font-heading text-[17px] leading-none tracking-tight text-zinc-50" aria-hidden>Circadia</span>
      </DiaryTabLink>
      <button
        type="button"
        className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-end px-3 text-[15px] font-medium tracking-[0.04em] text-sky-300/90"
        onClick={onAsk}
        aria-haspopup="dialog"
      >
        Ask
      </button>
    </header>
  );
}

function useOpenHoldConsumed(): boolean {
  return useSyncExternalStore(subscribeOpenHold, isOpenHoldConsumed, () => false);
}

function ShellInner() {
  const { ready, state, session } = useCircadia();
  const path = useDiaryPath();
  const pathname = diaryPathname(path);
  const [consultPath, setConsultPath] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const holdConsumed = useOpenHoldConsumed();
  const [coverLingering, setCoverLingering] = useState(() => !isOpenHoldConsumed());
  const [surfaceReady, setSurfaceReady] = useState(() => isOpenHoldConsumed());
  const consultOpen = consultPath === pathname;
  const phase = diaryShellPhase({
    ready,
    session,
    reducedMotion,
    holdConsumed,
  });
  const showCover = phase === "opening" || coverLingering;
  const signedIn = Boolean(session);
  const appChrome = Boolean(signedIn && state.profile?.onboardingComplete && state.study.asked);

  useEffect(() => {
    if (isOpenHoldConsumed()) return;
    let cancelled = false;
    void waitForOpenSurface().then(() => {
      if (!cancelled) setSurfaceReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!surfaceReady) return;
    if (isOpenHoldConsumed()) return;
    const hold = window.setTimeout(
      () => consumeOpenHold(),
      reducedMotion ? OPEN_HOLD_REDUCED_MS : OPEN_HOLD_MS,
    );
    return () => window.clearTimeout(hold);
  }, [surfaceReady, reducedMotion]);

  useEffect(() => {
    if (!holdConsumed || !ready) return;
    const cover = window.setTimeout(() => setCoverLingering(false), OPEN_COVER_MS);
    return () => window.clearTimeout(cover);
  }, [holdConsumed, ready]);

  let destination: React.ReactNode = null;
  if (ready) {
    if (!signedIn) {
      destination = <AuthGate />;
    } else if (!state.profile?.onboardingComplete) {
      destination = <Onboarding />;
    } else if (!state.study.asked) {
      destination = <StudyGate />;
    } else {
      destination = (
        <>
          <SidebarNav />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {consultOpen ? null : (
              <PhoneAsk
                onAsk={() => {
                  void hapticLight();
                  setConsultPath(pathname);
                }}
              />
            )}
            <div className="flex min-h-0 flex-1">
              <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
                  <DiaryViews path={path} />
                </div>
              </main>
              <ChatBar variant="rail" />
            </div>
            <ChatBar variant="sheet" open={consultOpen} onClose={() => setConsultPath(null)} />
            {consultOpen ? null : <BottomNav />}
          </div>
        </>
      );
    }
  }

  return (
    <Stage
      wide={appChrome}
      cover={showCover ? <OpenCover exiting={phase !== "opening"} play={surfaceReady} /> : null}
    >
      {destination}
    </Stage>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  if (isOperatorSurface()) {
    return (
      <CircadiaSafeTree>
        <NativeChrome />
        <div className="operator-board min-h-dvh text-zinc-100">
          <div className="native-drag" aria-hidden />
          {children}
        </div>
      </CircadiaSafeTree>
    );
  }

  return (
    <CircadiaProvider>
      <NativeChrome />
      <DiaryNavLock />
      <ShellInner />
    </CircadiaProvider>
  );
}
