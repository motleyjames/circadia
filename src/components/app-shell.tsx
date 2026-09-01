"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CircadiaProvider, CircadiaSafeTree, useCircadia } from "@/context/circadia-store";
import { AuthGate } from "@/components/auth-gate";
import { BottomNav } from "@/components/bottom-nav";
import { BrandStage } from "@/components/brand-stage";
import { ChatBar } from "@/components/chat-bar";
import { NativeChrome } from "@/components/native-chrome";
import { Onboarding } from "@/components/onboarding";
import { SidebarNav } from "@/components/sidebar-nav";
import { StudyGate } from "@/components/study-gate";
import { hapticLight } from "@/lib/haptics";
import { isOperatorSurface } from "@/lib/surface";

function Stage({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (wide) {
    return (
      <div className="night-sky flex min-h-dvh flex-col">
        <div className="native-drag" aria-hidden />
        <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="night-sky relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 glow-veil" />
      <div className="native-drag relative z-10" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">{children}</div>
    </div>
  );
}

function PhoneAsk({ onAsk }: { onAsk: () => void }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+2.75rem)] items-end justify-end bg-gradient-to-b from-[#05040a]/80 to-transparent px-1 xl:hidden">
      <button
        type="button"
        className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-end px-3 text-[17px] font-medium text-sky-300"
        onClick={onAsk}
        aria-haspopup="dialog"
      >
        Ask
      </button>
    </header>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { ready, state, session } = useCircadia();
  const pathname = usePathname();
  const [consultPath, setConsultPath] = useState<string | null>(null);
  const consultOpen = consultPath === pathname;

  if (!ready) {
    return (
      <Stage>
        <BrandStage />
      </Stage>
    );
  }

  if (!session) {
    return (
      <Stage>
        <AuthGate />
      </Stage>
    );
  }

  if (!state.profile?.onboardingComplete) {
    return (
      <Stage>
        <Onboarding />
      </Stage>
    );
  }

  if (!state.study.asked) {
    return (
      <Stage>
        <StudyGate />
      </Stage>
    );
  }

  return (
    <Stage wide>
      <SidebarNav />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {consultOpen ? null : <PhoneAsk onAsk={() => {
          void hapticLight();
          setConsultPath(pathname);
        }} />}
        <div className="flex min-h-0 flex-1">
          <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute inset-0 z-0 glow-veil" />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          </main>
          <ChatBar variant="rail" />
        </div>
        <ChatBar variant="sheet" open={consultOpen} onClose={() => setConsultPath(null)} />
        {consultOpen ? null : <BottomNav />}
      </div>
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
      <ShellInner>{children}</ShellInner>
    </CircadiaProvider>
  );
}
