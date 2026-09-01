import { afterEach, describe, expect, it } from "vitest";
import {
  consumeOpenHold,
  diaryShellPhase,
  isOpenHoldConsumed,
  resetOpenHoldForTests,
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
