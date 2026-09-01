import { afterEach, describe, expect, it } from "vitest";
import { hapticLight, hapticSelect } from "./haptics";

describe("haptics", () => {
  const g = globalThis as { window?: { Capacitor?: { isNativePlatform: () => boolean } } };
  const previous = g.window;

  afterEach(() => {
    if (previous) g.window = previous;
    else delete g.window;
  });

  it("no-ops when Capacitor is missing and does not throw", async () => {
    delete g.window;
    await expect(hapticSelect()).resolves.toBeUndefined();
    await expect(hapticLight()).resolves.toBeUndefined();
  });

  it("no-ops when Capacitor says this is not a native platform", async () => {
    g.window = { Capacitor: { isNativePlatform: () => false } };
    await expect(hapticSelect()).resolves.toBeUndefined();
  });
});
