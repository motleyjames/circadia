"use client";

import { useEffect } from "react";

export function NativeChrome() {
  useEffect(() => {
    if (window.circadiaDesktop?.native) {
      document.documentElement.classList.add("circadia-native");
    }
  }, []);
  return null;
}
