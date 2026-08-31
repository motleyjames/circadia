"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCircadia } from "@/context/circadia-store";
import { TABS } from "@/lib/nav";
import { morningFileDue } from "@/lib/morning-file";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { state } = useCircadia();
  const morningDue = morningFileDue(state.reports, new Date(), state.profile?.targetWake);

  return (
    <nav
      className="grid grid-cols-5 border-t border-white/[0.06] bg-[#0b0914]/92 px-2 pt-1.5 pb-[max(0.55rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      aria-label="Diary"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2 text-[11px] tracking-[0.01em]",
              active ? "text-zinc-50" : "text-zinc-500",
            )}
          >
            <span className="relative">
              <Icon className="size-[1.35rem]" strokeWidth={active ? 2 : 1.6} />
              {tab.href === "/check-in" && morningDue ? (
                <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-sky-300" aria-hidden />
              ) : null}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
