/**
 * Phone native = Capacitor WKWebView. Desktop Next, `next dev`, and tests are not native.
 */
export function isPhoneNative(): boolean {
  const w =
    typeof globalThis === "object"
      ? (globalThis as { window?: Window & { Capacitor?: { isNativePlatform?: () => boolean } } }).window
      : undefined;
  if (!w) return false;
  try {
    return w.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}
