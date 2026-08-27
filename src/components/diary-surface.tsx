"use client";

import type { ReactNode } from "react";
import { isOperatorSurface } from "@/lib/surface";

/** Operator compiles the same App Router tree. Diary views must not run there. */
export function DiarySurface({ children }: { children: ReactNode }) {
  if (isOperatorSurface()) return null;
  return children;
}
