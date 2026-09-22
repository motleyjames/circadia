"use client";

import type { ReactNode } from "react";
import { OperatorInboxProvider } from "@/context/operator-inbox";

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return <OperatorInboxProvider>{children}</OperatorInboxProvider>;
}
