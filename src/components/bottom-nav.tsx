"use client";

import { DiaryTabLink } from "@/components/diary-tab-link";
import { useCircadia } from "@/context/circadia-store";
import { hapticSelect } from "@/lib/haptics";
import { TABS } from "@/lib/nav";
import { morningFileDue } from "@/lib/morning-file";
import { tabIsActive, useDiaryPath } from "@/lib/diary-route";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const path = useDiaryPath();
  const { state } = useCircadia();
  const morningDue = morningFileDue(state.reports, new Date(), state.profile?.targetWake);

  return (
    <nav
      className="grid grid-cols-5 border-t border-white/[0.08] bg-[#0b0914]/80 px-1 pt-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden"
      aria-label="Diary"
    >
      {TABS.map((tab) => {
        const active = tabIsActive(tab.href, path);
        const Icon = tab.icon;
        return (
          <DiaryTabLink
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              void hapticSelect();
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10px] font-medium",
              active ? "text-sky-300" : "text-zinc-500",
            )}
          >
            <span className="relative">
              <Icon
                className="size-[25px]"
                strokeWidth={active ? 2.1 : 1.6}
                fill={active ? "currentColor" : "none"}
              />
              {tab.href === "/check-in" && morningDue ? (
                <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-sky-300" aria-hidden />
              ) : null}
            </span>
            {tab.label}
          </DiaryTabLink>
        );
      })}
    </nav>
  );
}
