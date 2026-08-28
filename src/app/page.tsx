import { DiaryPage } from "@/components/diary-page";
import { TonightView } from "@/components/tonight-view";
import { isOperatorSurface } from "@/lib/surface";
import ModeratorPage from "./mod/page";

export default function RootPage() {
  if (isOperatorSurface()) return <ModeratorPage />;
  return (
    <DiaryPage>
      <TonightView />
    </DiaryPage>
  );
}
