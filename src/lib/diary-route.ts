/**
 * In-app diary routing. Next client navigation and raw `<a href>` become a new
 * WKWebView document on Circadia.app and the iPhone wrap — that kills the
 * in-memory master and is why every tab asked for the password.
 * History API only. Never the Next router.
 */

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

export function getDiaryPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

export function diaryPathname(path: string): string {
  const noHash = path.split("#")[0] ?? path;
  const noQuery = noHash.split("?")[0] ?? noHash;
  if (!noQuery || noQuery === "") return "/";
  return noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
}

export function normalizeDiaryPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("#")) {
    return `${diaryPathname(getDiaryPath())}${trimmed}`;
  }
  if (typeof window === "undefined") {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return getDiaryPath();
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}

export function tabIsActive(href: string, path: string): boolean {
  const p = diaryPathname(path);
  if (href === "/") return p === "/";
  return p === href || p.startsWith(`${href}/`);
}

export function subscribeDiaryPath(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitDiaryPath() {
  listeners.forEach((listener) => listener());
}

export function navigateDiary(path: string): void {
  if (typeof window === "undefined") return;
  const url = normalizeDiaryPath(path);
  const prev = getDiaryPath();
  if (url !== prev) {
    window.history.pushState({ circadiaDiary: true }, "", url);
  }
  emitDiaryPath();
  if (url.includes("#")) {
    queueMicrotask(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  }
}

export function listenDiaryHistory(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onPop = () => emitDiaryPath();
  window.addEventListener("popstate", onPop);
  window.addEventListener("hashchange", onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("hashchange", onPop);
  };
}

export function useDiaryPath(): string {
  return useSyncExternalStore(subscribeDiaryPath, getDiaryPath, () => "/");
}
