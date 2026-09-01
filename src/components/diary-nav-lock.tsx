"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { diaryClickTarget } from "@/lib/diary-nav";

/** Capture-phase: cancel the document load before WKWebView follows href. */
export function DiaryNavLock() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const path = diaryClickTarget(event);
      if (!path) return;
      event.preventDefault();
      router.push(path);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
