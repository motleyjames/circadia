import { DiaryPage } from "@/components/diary-page";
import { TonightView } from "@/components/tonight-view";
import { isOperatorSurface } from "@/lib/surface";

/**
 * Do not import `./mod/page` from here. Static pack parks `src/app/mod` so the
 * Capacitor export cannot emit Operator HTML or the default passphrase.
 * Operator `/` still redirects to `/mod` at runtime (middleware).
 */
export default function RootPage() {
  if (isOperatorSurface()) return null;
  return (
    <DiaryPage>
      <TonightView />
    </DiaryPage>
  );
}
