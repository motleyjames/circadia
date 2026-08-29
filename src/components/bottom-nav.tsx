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
  const morningDue = morningFileDue(state.reports);

  return (
    <nav className="grid grid-cols-5 border-t border-white/8 bg-[#0b0914]/90 px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl md:hidden">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] tracking-wide",
              active ? "text-violet-200" : "text-zinc-500",
            )}
          >
            <span className="relative">
              <Icon className={cn("size-5", active && "drop-shadow-[0_0_10px_rgba(196,181,253,0.8)]")} />
              {tab.href === "/check-in" && morningDue ? (
                <span
                  className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-sky-300"
                  aria-hidden
                />
              ) : null}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
