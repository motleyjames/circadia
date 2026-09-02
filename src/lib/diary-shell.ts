export type DiaryShellPhase = "opening" | "gate" | "app";

/** Wordmark fade-in. Must match the identity opacity transition. */
export const OPEN_IDENTITY_MS = 800;
/** Fully-opaque identity beat after the fade-in. Boot time already spent in play counts; leftover can be 0. */
export const OPEN_HOLD_MS = 400;
/** Static identity beat when the system asked for no motion. Still an open, not a skip. */
export const OPEN_HOLD_REDUCED_MS = 280;
/** Scrim + identity recede into the diary. Must match the recede opacity transition. */
export const OPEN_COVER_MS = 1100;
/** Do not hang a dark wait if visibility never fires. */
export const OPEN_SURFACE_WAIT_MS = 800;
/** Phone: native night cover lifts, then pings. Longer than the native handshake fallback. */
export const OPEN_PHONE_SURFACE_WAIT_MS = 4000;

export type OpenSurfaceWindow = Window & {
  __CIRCADIA_SURFACE__?: boolean;
  __CIRCADIA_OPEN_READY__?: boolean;
  Capacitor?: { isNativePlatform?: () => boolean };
};

export type OpenSurfaceHost = {
  window: OpenSurfaceWindow;
  document: Pick<Document, "visibilityState" | "readyState" | "addEventListener" | "removeEventListener">;
};

function nextPaint(w: OpenSurfaceWindow): Promise<void> {
  return new Promise((resolve) => {
    const raf = w.requestAnimationFrame?.bind(w);
    if (typeof raf === "function") {
      raf(() => raf(() => resolve()));
      return;
    }
    resolve();
  });
}

function isPhoneOpenSurface(w: Window): boolean {
  try {
    const protocol = (w.location?.protocol ?? "").toLowerCase();
    if (protocol === "circadia:" || protocol === "capacitor:" || protocol === "ionic:") return true;
    return (w as OpenSurfaceWindow).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * Native launch screen is a dark empty field. Clock the open from a painted
 * visible frame — not `window.load`, which waits for every asset and freezes
 * the wait frame. If the CSS open runs under the splash, the user only sees
 * the last keyframe.
 *
 * Phone WKWebView reports visibilityState visible while LaunchScreen still
 * covers it. Raise `__CIRCADIA_OPEN_READY__` after the wait frame is painted
 * so native can lift its night cover, then wait for `circadia-surface`.
 * A ping in capacitorDidLoad is wiped — that hook runs before loadWebView.
 */
export function waitForOpenSurface(host?: OpenSurfaceHost): Promise<void> {
  const w = (host?.window ?? (typeof window !== "undefined" ? window : undefined)) as
    | OpenSurfaceWindow
    | undefined;
  const doc = host?.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!w || !doc) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      w.clearTimeout(watchdog);
      void nextPaint(w).then(resolve);
    };
    const phone = isPhoneOpenSurface(w);
    const watchdog = w.setTimeout(
      finish,
      phone ? OPEN_PHONE_SURFACE_WAIT_MS : OPEN_SURFACE_WAIT_MS,
    );
    const start = () => {
      if (doc.visibilityState === "hidden") {
        doc.addEventListener("visibilitychange", function onVis() {
          if (doc.visibilityState !== "hidden") {
            doc.removeEventListener("visibilitychange", onVis);
            start();
          }
        });
        return;
      }
      if (phone) {
        w.__CIRCADIA_OPEN_READY__ = true;
        if (w.__CIRCADIA_SURFACE__) {
          finish();
          return;
        }
        w.addEventListener("circadia-surface", finish, { once: true });
        return;
      }
      finish();
    };
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", start, { once: true });
      return;
    }
    start();
  });
}

/**
 * Once per JS lifetime. A tab remount of ShellInner must not replay the mark
 * animation, and must not unmount the signed-in tree to do it.
 */
let openHoldConsumed = false;
let skyDebut = true;
const holdListeners = new Set<() => void>();

export function isOpenHoldConsumed(): boolean {
  return openHoldConsumed;
}

export function consumeOpenHold(): void {
  if (openHoldConsumed) return;
  openHoldConsumed = true;
  holdListeners.forEach((listener) => listener());
}

export function subscribeOpenHold(listener: () => void): () => void {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}

export function resetOpenHoldForTests(): void {
  openHoldConsumed = false;
  skyDebut = true;
}

/** First Tonight in this JS lifetime. Tab switches must not replay the orb draw. */
export function takeSkyDebut(): boolean {
  if (!skyDebut) return false;
  skyDebut = false;
  return true;
}

/**
 * Splash is first launch of this JS context. A live unlock never becomes the
 * password gate — that was the 0.8.4 tab-switch hole: hold reset, session
 * briefly null, AuthGate.
 */
export function diaryShellPhase(input: {
  ready: boolean;
  session: string | null;
  reducedMotion: boolean;
  holdConsumed: boolean;
}): DiaryShellPhase {
  if (!input.ready) return "opening";
  if (!input.holdConsumed) return "opening";
  if (input.session) return "app";
  return "gate";
}
