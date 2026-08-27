"use client";

import { CircadiaProvider, useCircadia } from "@/context/circadia-store";
import { BottomNav } from "@/components/bottom-nav";
import { BrandStage } from "@/components/brand-stage";
import { ChatBar } from "@/components/chat-bar";
import { Onboarding } from "@/components/onboarding";
import { SidebarNav } from "@/components/sidebar-nav";
import { StudyGate } from "@/components/study-gate";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { ready, state } = useCircadia();
  const onboarded = Boolean(ready && state.profile?.onboardingComplete);
  const inApp = onboarded && state.study.asked;

  if (!ready) {
    return (
      <div className="night-sky relative flex min-h-dvh">
        <div className="pointer-events-none absolute inset-0 glow-veil" />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col">
          <BrandStage />
        </div>
      </div>
    );
  }

  if (!state.profile?.onboardingComplete) {
    return (
      <div className="night-sky relative flex min-h-dvh">
        <div className="pointer-events-none absolute inset-0 glow-veil" />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col">
          <Onboarding />
        </div>
      </div>
    );
  }

  if (!state.study.asked) {
    return (
      <div className="night-sky relative flex min-h-dvh">
        <div className="pointer-events-none absolute inset-0 glow-veil" />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col">
          <StudyGate />
        </div>
      </div>
    );
  }

  return (
    <div className="night-sky flex min-h-dvh">
      <SidebarNav />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute inset-0 glow-veil" />
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          </main>
          {inApp ? <ChatBar variant="rail" /> : null}
        </div>
        {inApp ? <ChatBar variant="dock" /> : null}
        {inApp ? <BottomNav /> : null}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <CircadiaProvider>
      <ShellInner>{children}</ShellInner>
    </CircadiaProvider>
  );
}
