"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Diary tabs must stay in this JS lifetime. Next `<Link>` still renders `<a href>`,
 * and WKWebView will load that as a new document if preventDefault loses the race.
 */
export function DiaryTabLink({
  href,
  className,
  children,
  onClick,
  "aria-current": ariaCurrent,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "aria-current"?: "page";
}) {
  const router = useRouter();

  function go(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onClick?.();
    router.push(href);
  }

  return (
    <a href={href} aria-current={ariaCurrent} className={className} onClick={go}>
      {children}
    </a>
  );
}
