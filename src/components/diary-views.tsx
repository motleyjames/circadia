"use client";

import { CheckInFlow } from "@/components/check-in-flow";
import { InsightsView } from "@/components/insights-view";
import { LibraryView } from "@/components/library-view";
import { TonightView } from "@/components/tonight-view";
import { YouView } from "@/components/you-view";
import { diaryPathname } from "@/lib/diary-route";

/** Same five views on Circadia.app and the iPhone. Only the chrome around them changes. */
export function DiaryViews({ path }: { path: string }) {
  const p = diaryPathname(path);
  if (p === "/check-in" || p.startsWith("/check-in/")) return <CheckInFlow />;
  if (p === "/insights" || p.startsWith("/insights/")) return <InsightsView />;
  if (p === "/library" || p.startsWith("/library/")) return <LibraryView />;
  if (p === "/you" || p.startsWith("/you/")) return <YouView />;
  return <TonightView />;
}
