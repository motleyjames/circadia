import { afterEach, describe, expect, it } from "vitest";
import { isPhoneNative, skipWebOpenCover } from "./phone-native";

describe("isPhoneNative", () => {
  const g = globalThis as {
    window?: {
      Capacitor?: { isNativePlatform: () => boolean };
      location?: { protocol: string };
    };
  };
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

  it("is true on the Circadia custom scheme even without the Capacitor global", () => {
    g.window = { location: { protocol: "circadia:" } };
    expect(isPhoneNative()).toBe(true);
    g.window = { location: { protocol: "Circadia:" } };
    expect(isPhoneNative()).toBe(true);
    g.window = { location: { protocol: "capacitor:" } };
    expect(isPhoneNative()).toBe(true);
  });
});

describe("skipWebOpenCover", () => {
  const g = globalThis as {
    window?: {
      Capacitor?: { isNativePlatform: () => boolean };
      location?: { protocol: string };
    };
  };
  const previous = g.window;

  afterEach(() => {
    if (previous) g.window = previous;
    else delete g.window;
  });

  it("skips when Capacitor is the host", () => {
    g.window = { Capacitor: { isNativePlatform: () => true } };
    expect(skipWebOpenCover()).toBe(true);
  });

  it("does not skip when the phone-pack env leaked into a browser", () => {
    const previous = process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK;
    process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK = "1";
    try {
      g.window = { location: { protocol: "http:" } };
      expect(skipWebOpenCover()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK;
      else process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK = previous;
    }
  });
});
