"use client";

import type { MouseEvent, ReactNode } from "react";
import { navigateDiary } from "@/lib/diary-route";

/**
 * In-app diary link. Must not use Next Link or the Next router — those become
 * a new document in the Mac and iPhone WKWebViews.
 */
export function DiaryLink({
  href,
  className,
  children,
  onClick,
  "aria-current": ariaCurrent,
  "aria-label": ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "aria-current"?: "page";
  "aria-label"?: string;
}) {
  function go(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onClick?.();
    navigateDiary(href);
  }

  return (
    <a href={href} aria-current={ariaCurrent} aria-label={ariaLabel} className={className} onClick={go}>
      {children}
    </a>
  );
}

export function DiaryTabLink(props: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "aria-current"?: "page";
  "aria-label"?: string;
}) {
  return <DiaryLink {...props} />;
}
