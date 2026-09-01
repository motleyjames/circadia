import { DiaryPage } from "@/components/diary-page";
import { isOperatorSurface } from "@/lib/surface";

/**
 * Do not import `./mod/page` from here. Static pack parks `src/app/mod` so the
 * Capacitor export cannot emit Operator HTML or the default passphrase.
 * Operator `/` still redirects to `/mod` at runtime (proxy).
 * Signed-in chrome renders the five views in AppShell. This page is the HTML
 * entry — a tab must not become a new WKWebView document.
 */
export default function RootPage() {
  if (isOperatorSurface()) return null;
  return <DiaryPage>{null}</DiaryPage>;
}
