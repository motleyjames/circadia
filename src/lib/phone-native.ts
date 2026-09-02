/**
 * Phone native = Capacitor WKWebView. Desktop Next, `next dev`, and tests are not native.
 * The custom scheme is live before the Capacitor global; read it on first paint.
 */
export const PHONE_CLASS_BOOT =
  '(function(){try{var p=(location.protocol||"").toLowerCase();var q=location.search||"";var cap=window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform();if(cap||p==="circadia:"||p==="capacitor:"||p==="ionic:"||/(?:^|[?&])circadia-phone=1(?:&|$)/.test(q))document.documentElement.classList.add("circadia-phone")}catch(e){}})();';

function protocolIsPhone(w: Window): boolean {
  const protocol = (w.location?.protocol ?? "").toLowerCase();
  return protocol === "circadia:" || protocol === "capacitor:" || protocol === "ionic:";
}

/** Packed Capacitor binary and live Capacitor — not `?circadia-phone=1` in a browser. */
export function skipWebOpenCover(): boolean {
  if (process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK === "1") return true;
  return isPhoneNative();
}

export function isPhoneNative(): boolean {
  const w =
    typeof globalThis === "object"
      ? (globalThis as { window?: Window & { Capacitor?: { isNativePlatform?: () => boolean } } }).window
      : undefined;
  if (!w) return false;
  try {
    if (w.Capacitor?.isNativePlatform?.() === true) return true;
  } catch {
    /* bridge missing */
  }
  try {
    return protocolIsPhone(w);
  } catch {
    return false;
  }
}
