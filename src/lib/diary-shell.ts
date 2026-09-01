export type DiaryShellPhase = "opening" | "gate" | "app";

/** Long enough for the mark to draw and the wordmark to settle. */
export const OPEN_HOLD_MS = 2800;
/** Cover stays opaque, then dissolves so the diary never dips to black. */
export const OPEN_COVER_MS = 880;

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
  const holdDone = input.reducedMotion || input.holdConsumed;
  if (!input.ready) return "opening";
  if (!holdDone) return "opening";
  if (input.session) return "app";
  return "gate";
}
