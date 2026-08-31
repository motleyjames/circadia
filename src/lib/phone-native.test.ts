import { afterEach, describe, expect, it } from "vitest";
import { isPhoneNative } from "./phone-native";

describe("isPhoneNative", () => {
  const g = globalThis as { window?: { Capacitor?: { isNativePlatform: () => boolean } } };
  const previous = g.window;

  afterEach(() => {
    if (previous) g.window = previous;
    else delete g.window;
  });

  it("is false when the bridge is missing", () => {
    delete g.window;
    expect(isPhoneNative()).toBe(false);
  });

  it("is true only when Capacitor reports a native platform", () => {
    g.window = { Capacitor: { isNativePlatform: () => true } };
    expect(isPhoneNative()).toBe(true);
    g.window = { Capacitor: { isNativePlatform: () => false } };
    expect(isPhoneNative()).toBe(false);
  });
});
