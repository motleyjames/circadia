"use client";

import { DiarySurface } from "@/components/diary-surface";
import { TonightView } from "@/components/tonight-view";

export default function TonightPage() {
  return (
    <DiarySurface>
      <TonightView />
    </DiarySurface>
  );
}
