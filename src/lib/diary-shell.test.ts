import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  OPEN_COVER_MS,
  OPEN_HOLD_MS,
  OPEN_HOLD_REDUCED_MS,
  OPEN_IDENTITY_MS,
  OPEN_SURFACE_WAIT_MS,
  consumeOpenHold,
  diaryShellPhase,
  isOpenHoldConsumed,
  resetOpenHoldForTests,
  takeSkyDebut,
  waitForOpenSurface,
  type OpenSurfaceWindow,
} from "./diary-shell";

describe("diary shell phase", () => {
  afterEach(() => {
    resetOpenHoldForTests();
  });

  it("holds the mark on first launch until boot and the open hold finish", () => {
    expect(
      diaryShellPhase({ ready: false, session: null, reducedMotion: false, holdConsumed: false }),
    ).toBe("opening");
    expect(
      diaryShellPhase({
        ready: true,
        session: "email:ada@example.com",
        reducedMotion: false,
        holdConsumed: false,
      }),
    ).toBe("opening");
  });

  it("never sends a live session to the password gate after the hold is consumed", () => {
    expect(
      diaryShellPhase({
        ready: true,
        session: "email:ada@example.com",
        reducedMotion: false,
        holdConsumed: true,
      }),
    ).toBe("app");
    expect(
      diaryShellPhase({ ready: true, session: null, reducedMotion: false, holdConsumed: true }),
    ).toBe("gate");
  });

  it("still holds a static mark when the user asked for reduced motion", () => {
    expect(
      diaryShellPhase({
        ready: true,
        session: "email:ada@example.com",
        reducedMotion: true,
        holdConsumed: false,
      }),
    ).toBe("opening");
    expect(
      diaryShellPhase({
        ready: true,
        session: "email:ada@example.com",
        reducedMotion: true,
        holdConsumed: true,
      }),
    ).toBe("app");
  });

  it("keeps identity as a short beat and recedes unhurried into the diary", () => {
    // Long enough for the clock to draw, short enough that nobody waits on a logo.
    expect(OPEN_IDENTITY_MS).toBeGreaterThanOrEqual(2500);
    expect(OPEN_IDENTITY_MS).toBeLessThan(4000);
    expect(OPEN_HOLD_MS).toBeGreaterThanOrEqual(300);
    expect(OPEN_HOLD_MS).toBeLessThan(1200);
    expect(OPEN_HOLD_REDUCED_MS).toBeGreaterThanOrEqual(200);
    expect(OPEN_HOLD_REDUCED_MS).toBeLessThan(OPEN_HOLD_MS);
    expect(OPEN_COVER_MS).toBeGreaterThanOrEqual(1800);
    expect(OPEN_COVER_MS).toBeLessThan(2800);
    expect(OPEN_SURFACE_WAIT_MS).toBeGreaterThan(0);
  });

  it("clocks the Dock open from a visible paint, not window load", () => {
    const src = readFileSync("src/lib/diary-shell.ts", "utf8");
    expect(src).toContain("DOMContentLoaded");
    expect(src).not.toContain('addEventListener("load"');
    expect(src).toContain("readyState === \"loading\"");
    expect(src).not.toContain("__CIRCADIA_OPEN_READY__");
    expect(src).not.toContain("OPEN_PHONE_SURFACE_WAIT_MS");
    expect(src).toContain("CircadiaOpenWindow");
  });

  it("resolves the open-surface wait on a visible document", async () => {
    await expect(waitForOpenSurface()).resolves.toBeUndefined();
  });

  it("on a phone host finishes without waiting for a native surface ping", async () => {
    const hostWindow = {
      location: { protocol: "capacitor:" },
      __CIRCADIA_SURFACE__: false,
      addEventListener() {},
      setTimeout: setTimeout as unknown as Window["setTimeout"],
      clearTimeout: clearTimeout as unknown as Window["clearTimeout"],
    } as unknown as OpenSurfaceWindow;
    const hostDoc = {
      visibilityState: "visible" as Document["visibilityState"],
      readyState: "complete" as DocumentReadyState,
      addEventListener() {},
      removeEventListener() {},
    };
    await expect(waitForOpenSurface({ window: hostWindow, document: hostDoc })).resolves.toBeUndefined();
  });

  it("plays the Tonight debut once, then leaves tab switches still", () => {
    expect(takeSkyDebut()).toBe(true);
    expect(takeSkyDebut()).toBe(false);
  });

  it("consumes the open hold once per JS lifetime so a tab remount is not a new login", () => {
    expect(isOpenHoldConsumed()).toBe(false);
    consumeOpenHold();
    expect(isOpenHoldConsumed()).toBe(true);
    expect(
      diaryShellPhase({
        ready: true,
        session: "email:ada@example.com",
        reducedMotion: false,
        holdConsumed: isOpenHoldConsumed(),
      }),
    ).toBe("app");
  });
});
