"use client";

import { useEffect } from "react";

function disarmNextOverlay() {
  document.querySelectorAll("nextjs-portal").forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("pointer-events", "none", "important");
  });
}

export function NativeChrome() {
  useEffect(() => {
    if (window.circadiaDesktop?.native) {
      document.documentElement.classList.add("circadia-native");
    }
    disarmNextOverlay();
    const observer = new MutationObserver(disarmNextOverlay);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
