import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";
import { OPEN_COVER_MS, OPEN_HOLD_MS, OPEN_HOLD_REDUCED_MS, OPEN_IDENTITY_MS } from "./diary-shell";
import { weakSelfViolations } from "./swift-weak-self";

describe("iPhone UIKit open", () => {
  const scene = readFileSync("phone/ios/App/App/SceneDelegate.swift", "utf8");
  const launch = readFileSync("phone/ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8");
  const mark = readFileSync("phone/ios/App/App/CircadiaMarkView.swift", "utf8");
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

  it("draws the clock natively, then recedes on the same beat as Dock", () => {
    expect(scene).toContain("CircadiaMarkView(size: 84)");
    expect(scene).toContain("mark.play()");
    expect(scene).toContain("mark.settle()");
    expect(scene).toContain("CircadiaMarkView.playDuration");
    expect(scene).toContain("isReduceMotionEnabled");
    // LaunchScreen has no mark: the first overlay frame must match it, then the mark appears.
    expect(scene).toContain("mark.alpha = 0");
    expect(scene).toContain("mark.bottomAnchor.constraint(equalTo: identity.topAnchor, constant: -40)");
    expect(scene).toContain("0.28");
    expect(scene).toContain("1.4");
    expect(scene).toContain("settleBeat: TimeInterval = 0.6");
    expect(scene).toContain("recede(force: true)");
    expect(OPEN_HOLD_MS).toBe(600);
    expect(OPEN_HOLD_REDUCED_MS).toBe(280);
    expect(OPEN_COVER_MS).toBe(1400);
  });

  it("mirrors the SVG mark in Core Animation and is wired into the Xcode target", () => {
    expect(mark).toContain("final class CircadiaMarkView: UIView");
    expect(mark).toContain("static let playDuration: TimeInterval = 3.1");
    expect(mark).toContain("CAShapeLayer");
    expect(mark).toContain("strokeEnd");
    expect(mark).toContain("transform.rotation.z");
    expect(mark).toContain("CGFloat(60) * .pi / 180");
    expect(mark).toContain("CGFloat(-55) * .pi / 180");
    expect(mark).toContain("anchorPoint = CGPoint(x: 0.5, y: 32.0 / 35.0)");
    expect(mark).toContain("anchorPoint = CGPoint(x: 0.5, y: 23.0 / 26.0)");
    expect(mark).toContain("fillMode = .backwards");
    // Transformed layers take bounds + position; frame is undefined under a transform.
    expect(mark).not.toMatch(/ring\.frame\s*=/);
    expect(mark).not.toMatch(/tick\.frame\s*=/);
    expect(weakSelfViolations(mark)).toEqual([]);
    let depth = 0;
    for (const ch of mark) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    const pbx = readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8");
    expect(pbx).toContain("CircadiaMarkView.swift in Sources");
    expect(pbx).toContain("path = CircadiaMarkView.swift");
  });

  it("draws the same clock in CSS for the Dock cover", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const svg = readFileSync("src/components/mark.tsx", "utf8");
    expect(svg).toContain('className="mark-hand mark-hand-minute"');
    expect(svg).toContain('className="mark-hand mark-hand-hour"');
    expect(svg).toContain('className="mark-ring-seat"');
    // Rotation lives in CSS so the open can animate it; a CSS transform would override an attribute.
    expect(svg).not.toMatch(/mark-hand-minute"[^>]*transform=/);
    expect(css).toContain(".mark-hand-minute {\n  transform: rotate(60deg);");
    expect(css).toContain(".mark-hand-hour {\n  transform: rotate(-55deg);");
    expect(css).toContain("@keyframes mark-ring-draw");
    expect(css).toContain("@keyframes mark-sweep-minute");
    expect(css).toContain("@keyframes mark-sweep-hour");
    expect(css).toContain("@keyframes mark-moon-rise");
    expect(css).toContain("@keyframes mark-halo-breathe");
    expect(css).toContain(".brand-open-cover.brand-open-play .mark-ring {");
    // The cover itself is never transformed — that is the WKWebView bitmap trap.
    expect(css).not.toMatch(/\.brand-open-cover\s*\{[^}]*transform/);
    expect(css).not.toContain(".brand-open-mark .mark-ticks {\n  animation: none;\n  transform: none;");
    expect(OPEN_IDENTITY_MS).toBe(3100);
    // Slow enough to read: no draw beat under 0.4s, hands sweep for well over a second.
    expect(css).toContain("mark-ring-draw 1.4s");
    expect(css).toContain("mark-sweep-minute 1.8s");
  });

  it("keeps SceneDelegate braces balanced so Xcode can compile", () => {
    let depth = 0;
    for (const ch of scene) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    expect(scene).toMatch(/if state == "complete" \|\| state == "interactive" \{\s*self\?\.recede\(\)\s*\} else \{/);
  });

  it("skips the CSS OpenCover on the packed phone binary", () => {
    expect(shell).toContain("skipWebOpenCover");
    expect(shell).toContain("useLayoutEffect");
    expect(readFileSync("src/lib/phone-native.ts", "utf8")).toContain("return isPhoneNative()");
    expect(readFileSync("src/lib/phone-native.ts", "utf8")).not.toMatch(
      /skipWebOpenCover[\s\S]*NEXT_PUBLIC_CIRCADIA_PHONE_PACK ===/,
    );
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("stashDiaryServer");
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("restoreDiaryServer");
    expect(readFileSync("electron/build-ui.cjs", "utf8")).not.toMatch(/rmSync\(path\.join\(root, "\.next"\)/);
    expect(scene).toContain("makeKeyAndVisible");
    expect(scene).toContain("applicationState == .active");
  });
});
