import { BookOpen, MoonStar, Sparkles, SunMedium, User, type LucideIcon } from "lucide-react";

export const TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Tonight", icon: MoonStar },
  { href: "/check-in", label: "Morning", icon: SunMedium },
  { href: "/insights", label: "Notes", icon: Sparkles },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/you", label: "You", icon: User },
];
