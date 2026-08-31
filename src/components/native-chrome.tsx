"use client";

import { useEffect } from "react";
import { isPhoneNative } from "@/lib/phone-native";

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
    if (isPhoneNative()) {
      document.documentElement.classList.add("circadia-phone");
      void import("@capacitor/status-bar")
        .then(async ({ StatusBar, Style }) => {
          try {
            await StatusBar.setOverlaysWebView({ overlay: true });
          } catch {
            /* older webviews */
          }
          await StatusBar.setStyle({ style: Style.Dark });
          try {
            await StatusBar.setBackgroundColor({ color: "#05040a" });
          } catch {
            /* iOS ignores this when overlaying the webview */
          }
        })
        .catch(() => {
          /* web preview */
        });
    }
    disarmNextOverlay();
    const observer = new MutationObserver(disarmNextOverlay);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
