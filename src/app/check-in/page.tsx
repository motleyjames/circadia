"use client";

import { CheckInFlow } from "@/components/check-in-flow";
import { DiarySurface } from "@/components/diary-surface";

export default function CheckInPage() {
  return (
    <DiarySurface>
      <CheckInFlow />
    </DiarySurface>
  );
}
