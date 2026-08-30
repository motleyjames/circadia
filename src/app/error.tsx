"use client";

import { FaultScreen } from "@/components/fault-screen";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <FaultScreen onRetry={() => reset()} />;
}
