"use client";

import { FaultScreen } from "@/components/fault-screen";
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full bg-[#05040a] font-sans text-zinc-100">
        <FaultScreen onRetry={() => reset()} />
      </body>
    </html>
  );
}
