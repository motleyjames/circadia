import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";
import { OPEN_COVER_MS, OPEN_HOLD_MS, OPEN_HOLD_REDUCED_MS } from "./diary-shell";

describe("iPhone UIKit open", () => {
  const scene = readFileSync("phone/ios/App/App/SceneDelegate.swift", "utf8");
  const launch = readFileSync("phone/ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  it("plays the fade on a dedicated UIWindow, not inside WKWebView", () => {
    expect(scene).toContain("final class CircadiaOpenWindow");
    expect(scene).toContain("UIWindow.Level.alert");
    expect(scene).toContain("UIView.animate");
    expect(scene).toContain("identity.alpha = 1");
    expect(scene).toContain("CFBundleShortVersionString");
    expect(scene).toContain("For falling asleep. For staying asleep. For a clock that holds.");
    expect(scene).toContain("sceneDidBecomeActive");
    expect(scene).toContain("CircadiaOpenWindow.install");
    expect(scene).toContain("CircadiaOpenWindow.arm");
    expect(scene).toContain("waitForDiaryThenRecede");
    expect(scene).toContain("document.readyState");
    expect(scene).not.toContain("startHandshake");
    expect(scene).not.toContain("revealAndPing");
    expect(scene).not.toContain("__CIRCADIA_OPEN_READY__");
    expect(scene).not.toContain("translateZ");
    expect(scene).not.toContain("CGAffineTransform");
    expect(scene).not.toContain("nightCover");
  });

  it("matches LaunchScreen to the overlay so splash cannot hide the wordmark", () => {
    expect(launch).toContain("Circadia");
    expect(launch).toContain("For falling asleep. For staying asleep. For a clock that holds.");
    expect(launch).toContain(APP_VERSION);
    expect(launch).toContain("Georgia");
    expect(launch).toContain("0.019607843137254902");
  });

  it("holds then recedes on the same beat as Dock", () => {
    expect(scene).toContain("0.4");
    expect(scene).toContain("0.28");
    expect(scene).toContain("1.1");
    expect(OPEN_HOLD_MS).toBe(400);
    expect(OPEN_HOLD_REDUCED_MS).toBe(280);
    expect(OPEN_COVER_MS).toBe(1100);
  });

  it("skips the CSS OpenCover on the packed phone binary", () => {
    expect(shell).toContain("skipWebOpenCover");
    expect(readFileSync("src/lib/phone-native.ts", "utf8")).toContain(
      'process.env.NEXT_PUBLIC_CIRCADIA_PHONE_PACK === "1"',
    );
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("NEXT_PUBLIC_CIRCADIA_PHONE_PACK");
  });
});
