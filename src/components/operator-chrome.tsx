"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/product";
import { cn } from "@/lib/utils";

export type OperatorNavId = "week" | "testers" | "invite" | "exports";

const NAV: { id: OperatorNavId; href: string; label: string; icon: ReactNode }[] = [
  {
    id: "week",
    href: "/mod",
    label: "This week",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
      </svg>
    ),
  },
  {
    id: "testers",
    href: "/mod/testers",
    label: "All testers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-3-1.9-5.2-4.5-5.8" />
      </svg>
    ),
  },
  {
    id: "invite",
    href: "/mod/invite",
    label: "Invite a tester",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    id: "exports",
    href: "/mod/exports",
    label: "Diary exports",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
    ),
  },
];

export function OperatorChrome({
  active,
  weekLabel,
  attentionCount = 0,
  fingerprint,
  onRefresh,
  children,
}: {
  active: OperatorNavId;
  weekLabel?: string;
  attentionCount?: number;
  fingerprint?: string | null;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();

  function go(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    router.push(href);
  }

  return (
    <div className="flex min-h-full flex-col bg-op-paper text-op-ink">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-op-line bg-op-surface px-8">
        <div className="flex items-center gap-5">
          <div className="font-heading text-[23px] font-medium tracking-[-0.02em] text-op-ink">{PRODUCT_NAME}</div>
          <div className="h-[22px] w-px bg-op-line" aria-hidden />
          <div className="text-[14px] text-op-muted">Shakedown</div>
          {fingerprint ? (
            <div className="font-heading text-[14px] tracking-[0.04em] tabular-nums text-op-muted">Key {fingerprint}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {weekLabel ? <div className="text-[14px] text-op-muted">{weekLabel}</div> : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
            >
              Refresh
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">
        <nav aria-label="Primary" className="flex w-[232px] shrink-0 flex-col gap-1 border-r border-op-line bg-op-surface px-4 py-6">
          {NAV.map((item) => {
            const current = item.id === active;
            return (
              <a
                key={item.id}
                href={item.href}
                onClick={(event) => go(event, item.href)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center justify-between rounded-lg px-3 text-[15px] no-underline",
                  current ? "bg-op-violet-soft font-semibold text-op-violet" : "text-op-body hover:text-op-ink",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                {item.id === "week" && attentionCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-op-violet px-1.5 text-[12px] font-semibold text-white">
                    {attentionCount}
                  </span>
                ) : null}
              </a>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
