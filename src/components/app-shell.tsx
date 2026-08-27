"use client";

import { CircadiaProvider, useCircadia } from "@/context/circadia-store";
import { BottomNav } from "@/components/bottom-nav";
import { ChatBar } from "@/components/chat-bar";
import { Onboarding } from "@/components/onboarding";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { ready, state } = useCircadia();

  return (
    <div className="night-sky flex min-h-dvh justify-center">
      <div className="relative flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden border-white/5 bg-[#07060f] shadow-[0_0_80px_-20px_rgba(88,70,180,0.55)] sm:my-6 sm:min-h-[min(860px,calc(100dvh-3rem))] sm:rounded-[2rem] sm:border">
        <div className="pointer-events-none absolute inset-0 glow-veil" />
        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!ready ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              Opening Circadia…
            </div>
          ) : !state.profile?.onboardingComplete ? (
            <Onboarding />
          ) : (
            children
          )}
        </main>
        {ready && state.profile?.onboardingComplete ? (
          <>
            <ChatBar />
            <BottomNav />
          </>
        ) : null}
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
