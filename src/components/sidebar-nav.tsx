"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/mark";
import { useCircadia } from "@/context/circadia-store";
import { TABS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const pathname = usePathname();
  const { state } = useCircadia();
  const study = state.study;

  return (
    <aside className="relative hidden w-56 shrink-0 flex-col border-r border-white/8 bg-[#080712]/90 md:flex">
      <div className="flex items-center gap-3 px-5 pt-7 pb-8">
        <Mark className="size-6" />
        <div>
          <p className="font-heading text-lg leading-none text-zinc-50">Circadia</p>
          <p className="mt-1 text-[10px] tracking-[0.2em] text-zinc-600 uppercase">Desktop</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] tracking-wide",
                active ? "bg-white/7 text-violet-100" : "text-zinc-500 hover:bg-white/4 hover:text-zinc-300",
              )}
            >
              <Icon className={cn("size-4", active && "drop-shadow-[0_0_10px_rgba(196,181,253,0.8)]")} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <p className="px-5 pb-6 text-[11px] leading-relaxed text-zinc-600">
        {study.consented
          ? "Study on — nights leave without a name."
          : "Diary stays on this computer."}
      </p>
    </aside>
  );
}
