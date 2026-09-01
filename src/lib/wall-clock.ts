"use client";

import { useSyncExternalStore } from "react";

let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: number | null = null;
let visHandler: (() => void) | null = null;
let focusHandler: (() => void) | null = null;
let pageHandler: (() => void) | null = null;

function emit() {
  nowMs = Date.now();
  listeners.forEach((listener) => listener());
}

function arm() {
  if (typeof window === "undefined") return;
  if (timer != null) window.clearTimeout(timer);
  const delay = Math.max(16, 1000 - (Date.now() % 1000));
  timer = window.setTimeout(() => {
    emit();
    arm();
  }, delay);
}

function onResume() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  emit();
  arm();
}

function subscribeWallClock(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    emit();
    arm();
    visHandler = () => {
      if (document.visibilityState === "visible") onResume();
    };
    focusHandler = () => onResume();
    pageHandler = () => onResume();
    document.addEventListener("visibilitychange", visHandler);
    window.addEventListener("focus", focusHandler);
    window.addEventListener("pageshow", pageHandler);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
      if (visHandler) {
        document.removeEventListener("visibilitychange", visHandler);
        visHandler = null;
      }
      if (focusHandler) {
        window.removeEventListener("focus", focusHandler);
        focusHandler = null;
      }
      if (pageHandler) {
        window.removeEventListener("pageshow", pageHandler);
        pageHandler = null;
      }
    }
  };
}

function readWallClockMs(): number {
  return nowMs;
}

/** Phone wall clock. Reads Date.now() on each second boundary; resyncs on resume. */
export function useWallClock(): Date {
  const ms = useSyncExternalStore(subscribeWallClock, readWallClockMs, readWallClockMs);
  return new Date(ms);
}
