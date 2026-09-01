export type DiaryShellPhase = "opening" | "gate" | "app";

/** Long enough for the mark to draw and the wordmark to settle. */
export const OPEN_HOLD_MS = 2400; // phone + dock; BrandStage paused until surfaceReady, then plays in full.
/** Static mark beat when the system asked for no motion. Still an open, not a skip. */
export const OPEN_HOLD_REDUCED_MS = 900;
/** Cover stays opaque, then dissolves so the diary never dips to black. Must match `.brand-open-exit`. */
export const OPEN_COVER_MS = 800;
/** Do not hang the cover if splash/visibility never fires. */
export const OPEN_SURFACE_WAIT_MS = 1200;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return;
    }
    resolve();
  });
}

/**
 * Native launch screen covers WKWebView. CSS open that starts under the splash
 * is already finished when the user can see it. Clock the hold from a painted
 * frame after the document is visible.
 */
export function waitForOpenSurface(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      void nextPaint().then(resolve);
    };
    const watchdog = window.setTimeout(finish, OPEN_SURFACE_WAIT_MS);
    const start = () => {
      if (document.visibilityState === "hidden") {
        document.addEventListener("visibilitychange", function onVis() {
          if (document.visibilityState !== "hidden") {
            document.removeEventListener("visibilitychange", onVis);
            finish();
          }
        });
        return;
      }
      finish();
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
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
