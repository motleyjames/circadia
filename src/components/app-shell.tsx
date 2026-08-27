"use client";

import { usePathname } from "next/navigation";
import { CircadiaProvider, useCircadia } from "@/context/circadia-store";
import { BottomNav } from "@/components/bottom-nav";
import { BrandStage } from "@/components/brand-stage";
import { ChatBar } from "@/components/chat-bar";
import { NativeChrome } from "@/components/native-chrome";
import { Onboarding } from "@/components/onboarding";
import { SidebarNav } from "@/components/sidebar-nav";
import { StudyGate } from "@/components/study-gate";
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

function ShellInner({ children }: { children: React.ReactNode }) {
  const { ready, state } = useCircadia();
  const onboarded = Boolean(ready && state.profile?.onboardingComplete);
  const inApp = onboarded && state.study.asked;

  if (!ready) {
    return (
      <Stage>
        <BrandStage />
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute inset-0 z-0 glow-veil" />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          </main>
          {inApp ? <ChatBar variant="rail" /> : null}
        </div>
        {inApp ? <ChatBar variant="dock" /> : null}
        {inApp ? <BottomNav /> : null}
      </div>
    </Stage>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isOperatorSurface()) {
    const operatorPage = pathname === "/mod" || pathname.startsWith("/mod/");
    return (
      <CircadiaProvider>
        <NativeChrome />
        <div className="night-sky min-h-dvh">
          <div className="native-drag" aria-hidden />
          {operatorPage ? children : null}
        </div>
      </CircadiaProvider>
    );
  }

  return (
    <CircadiaProvider>
      <NativeChrome />
      <ShellInner>{children}</ShellInner>
    </CircadiaProvider>
  );
}
