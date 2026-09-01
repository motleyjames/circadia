"use client";

import { useEffect } from "react";
import { diaryClickTarget } from "@/lib/diary-nav";
import { listenDiaryHistory, navigateDiary } from "@/lib/diary-route";

/** Capture-phase: cancel the document load, then stay in this JS lifetime. */
export function DiaryNavLock() {
  useEffect(() => {
    const stopHistory = listenDiaryHistory();
    const onClick = (event: MouseEvent) => {
      const path = diaryClickTarget(event);
      if (!path) return;
      event.preventDefault();
      navigateDiary(path);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      stopHistory();
    };
  }, []);

  return null;
}
