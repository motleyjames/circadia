import { afterEach, describe, expect, it } from "vitest";
import {
  OPEN_COVER_MS,
  OPEN_HOLD_MS,
  consumeOpenHold,
  diaryShellPhase,
  isOpenHoldConsumed,
  resetOpenHoldForTests,
  takeSkyDebut,
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

  it("skips the hold when the user asked for reduced motion", () => {
    expect(
      diaryShellPhase({
        ready: true,
        session: "email:ada@example.com",
        reducedMotion: true,
        holdConsumed: false,
      }),
    ).toBe("app");
    expect(
      diaryShellPhase({ ready: true, session: null, reducedMotion: true, holdConsumed: false }),
    ).toBe("gate");
  });

  it("holds the open long enough for the mark to draw", () => {
    expect(OPEN_HOLD_MS).toBeGreaterThanOrEqual(2400);
    expect(OPEN_COVER_MS).toBeGreaterThanOrEqual(700);
    expect(OPEN_COVER_MS).toBeLessThan(1200);
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
