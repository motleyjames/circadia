import type { ReactNode } from "react";
import { DiarySurface } from "@/components/diary-surface";
import { isOperatorSurface } from "@/lib/surface";

/**
 * Server Component. Reads CIRCADIA_SURFACE at compile time.
 * DiarySurface is a client component — its NEXT_PUBLIC inline can miss the
 * operator flag, which is how /check-in used to run during Operator export.
 */
export function DiaryPage({ children }: { children: ReactNode }) {
  if (isOperatorSurface()) return null;
  return <DiarySurface>{children}</DiarySurface>;
}
