"use client";

import { DiarySurface } from "@/components/diary-surface";
import { TonightView } from "@/components/tonight-view";
import { isOperatorSurface } from "@/lib/surface";
import ModeratorPage from "./mod/page";

export default function RootPage() {
  if (isOperatorSurface()) return <ModeratorPage />;
  return (
    <DiarySurface>
      <TonightView />
    </DiarySurface>
  );
}
