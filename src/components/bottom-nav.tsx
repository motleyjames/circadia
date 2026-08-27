"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, MoonStar, Sparkles, SunMedium, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Tonight", icon: MoonStar },
  { href: "/check-in", label: "Morning", icon: SunMedium },
  { href: "/insights", label: "Notes", icon: Sparkles },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/you", label: "You", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-5 border-t border-white/8 bg-[#0b0914]/90 px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] tracking-wide",
              active ? "text-violet-200" : "text-zinc-500",
            )}
          >
            <Icon className={cn("size-5", active && "drop-shadow-[0_0_10px_rgba(196,181,253,0.8)]")} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
