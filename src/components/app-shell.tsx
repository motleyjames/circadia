"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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
  OPEN_IDENTITY_MS,
  OPEN_SURFACE_EVENT,
  consumeOpenHold,
  diaryShellPhase,
  isOpenHoldConsumed,
  subscribeOpenHold,
  waitForOpenSurface,
} from "@/lib/diary-shell";
import { diaryPathname, useDiaryPath } from "@/lib/diary-route";
import { hapticLight } from "@/lib/haptics";
import { skipWebOpenCover } from "@/lib/phone-native";
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
  arriving = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  cover?: React.ReactNode;
  /** The diary rises into place while the open recedes. Class is removed once it has landed. */
  arriving?: boolean;
}) {
  return (
    <div className="night-sky relative flex h-full max-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 glow-veil" />
      <div className="native-drag relative z-50" aria-hidden />
      <div className={cn("relative z-10 flex min-h-0 min-w-0 flex-1", arriving && "brand-arrive")}>
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

type OpenCoverPhase = "wait" | "play" | "hold" | "recede";

function OpenCover({ phase, onSkip }: { phase: OpenCoverPhase; onSkip: () => void }) {
  return (
    <div
      // Someone who opened this app at 3 a.m. wants the wind-down button, not a
      // logo. The open is worth watching once; after that a tap ends it.
      onPointerDown={phase === "recede" ? undefined : onSkip}
      className={cn(
        "brand-open-cover absolute inset-0 z-40 flex flex-col",
        phase === "wait" && "brand-open-wait",
        phase === "play" && "brand-open-play",
        phase === "hold" && "brand-open-hold",
        phase === "recede" && "brand-open-recede",
        phase === "recede" ? "pointer-events-none" : "pointer-events-auto",
      )}
      aria-hidden={phase === "recede"}
    >
      <div className="brand-open-scrim" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <BrandStage />
      </div>
    </div>
  );
}

function PhoneAsk({ onAsk }: { onAsk: () => void }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+2.75rem)] items-end justify-between bg-gradient-to-b from-[#05040a]/85 to-transparent px-[max(0.35rem,env(safe-area-inset-left))] pr-[max(0.35rem,env(safe-area-inset-right))] xl:hidden">
      <DiaryTabLink
        href="/"
        // The sidebar already shows the mark and wordmark from `md` up. Without
        // this, every window between 768 and 1280px drew Circadia twice.
        className="pointer-events-auto inline-flex h-11 items-center gap-2.5 px-3 md:hidden"
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
  const [openPhase, setOpenPhase] = useState<OpenCoverPhase | "gone">(() =>
    isOpenHoldConsumed() ? "gone" : "wait",
  );
  const [surfaceReady, setSurfaceReady] = useState(() => isOpenHoldConsumed());
  const [appPainted, setAppPainted] = useState(() => isOpenHoldConsumed());
  const [arriving, setArriving] = useState(false);
  const identityUpAt = useRef(0);
  const consultOpen = consultPath === pathname;
  void diaryShellPhase({
    ready,
    session,
    reducedMotion,
    holdConsumed,
  });
  const signedIn = Boolean(session);
  const appChrome = Boolean(signedIn && state.profile?.onboardingComplete && state.study.asked);

  useLayoutEffect(() => {
    if (!skipWebOpenCover()) return;
    consumeOpenHold();
    // Host detection, not a derived render. Must run before paint or the
    // phone shows a CSS cover WKWebView cannot fade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenPhase("gone");
    setSurfaceReady(true);
    setAppPainted(true);
  }, []);

  // Phone: the UIKit open window pings when its recede starts. The diary rises
  // into place under the thinning native scrim, same beats as the Dock.
  useEffect(() => {
    if (!skipWebOpenCover()) return;
    const w = window as Window & { __CIRCADIA_SURFACE__?: boolean };
    if (w.__CIRCADIA_SURFACE__) return; // already on screen — never re-run the arrival
    let landed = 0;
    const onSurface = () => {
      setArriving(true);
      landed = window.setTimeout(() => setArriving(false), OPEN_COVER_MS);
    };
    window.addEventListener(OPEN_SURFACE_EVENT, onSurface, { once: true });
    return () => {
      window.removeEventListener(OPEN_SURFACE_EVENT, onSurface);
      window.clearTimeout(landed);
    };
  }, []);

  useEffect(() => {
    if (isOpenHoldConsumed() || skipWebOpenCover()) return;
    let cancelled = false;
    void waitForOpenSurface().then(() => {
      if (!cancelled) setSurfaceReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!surfaceReady || openPhase !== "wait") return;
    const id = window.requestAnimationFrame(() => {
      if (reducedMotion) identityUpAt.current = Date.now();
      setOpenPhase(reducedMotion ? "hold" : "play");
    });
    return () => window.cancelAnimationFrame(id);
  }, [surfaceReady, openPhase, reducedMotion]);

  useEffect(() => {
    if (openPhase !== "play") return;
    const id = window.setTimeout(() => {
      identityUpAt.current = Date.now();
      setOpenPhase("hold");
    }, OPEN_IDENTITY_MS);
    return () => window.clearTimeout(id);
  }, [openPhase]);

  useEffect(() => {
    if (!ready || appPainted) return;
    let cancelled = false;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        if (!cancelled) setAppPainted(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [ready, appPainted]);

  useEffect(() => {
    if (openPhase !== "hold") return;
    if (!ready || !appPainted) return;
    const holdMs = reducedMotion ? OPEN_HOLD_REDUCED_MS : OPEN_HOLD_MS;
    const elapsed = identityUpAt.current ? Date.now() - identityUpAt.current : 0;
    const remaining = Math.max(0, holdMs - elapsed);
    const id = window.setTimeout(() => {
      setOpenPhase("recede");
      consumeOpenHold();
    }, remaining);
    return () => window.clearTimeout(id);
  }, [openPhase, ready, appPainted, reducedMotion]);

  useEffect(() => {
    if (openPhase !== "recede") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArriving(true);
    const cover = window.setTimeout(() => {
      setOpenPhase("gone");
      setArriving(false);
    }, OPEN_COVER_MS);
    return () => window.clearTimeout(cover);
  }, [openPhase]);

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
      arriving={arriving}
      cover={
        openPhase === "gone" ? null : (
          <OpenCover
            phase={openPhase}
            onSkip={() => {
              consumeOpenHold();
              setArriving(true);
              setOpenPhase("recede");
            }}
          />
        )
      }
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
