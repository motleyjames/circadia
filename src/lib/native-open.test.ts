import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPEN_COVER_MS, OPEN_HOLD_MS, OPEN_HOLD_REDUCED_MS, OPEN_IDENTITY_MS } from "./diary-shell";
import { weakSelfViolations } from "./swift-weak-self";

describe("iPhone UIKit open", () => {
  const scene = readFileSync("phone/ios/App/App/SceneDelegate.swift", "utf8");
  const launch = readFileSync("phone/ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8");
  const mark = readFileSync("phone/ios/App/App/CircadiaMarkView.swift", "utf8");
  const sky = readFileSync("phone/ios/App/App/CircadiaSky.swift", "utf8");
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
    expect(scene).not.toContain("nightCover");
    // UIKit transforms are fine on the overlay's own labels; never on the webview.
    expect(scene).not.toMatch(/web(View)?\.transform/);
  });

  it("keeps LaunchScreen a dark wait so the overlay owns the whole open", () => {
    // The launch screen used to show the finished wordmark, which left the phone
    // nothing to play. It is now `brand-open-wait`: flat night, no type.
    expect(launch).toContain("0.019607843137254902");
    expect(launch).not.toContain("<label");
    expect(launch).not.toContain("For falling asleep.");
    expect(launch).not.toContain("Georgia");
    // The identity is built in UIKit instead, on the Dock's beats.
    expect(scene).toContain("private func arriveWords()");
    expect(scene).toContain("(title, 1.2, 1.8)");
    expect(scene).toContain("(line, 1.6, 1.6)");
    expect(scene).toContain("(build, 2.0, 1.4)");
  });

  it("wears the brand faces and the night sky, not Georgia on flat black", () => {
    // Fraunces and Outfit, pinned to the axis values the Dock renders and bundled
    // as static TTFs — iOS cannot load the woff2 the web build uses.
    expect(scene).toContain('UIFont(name: "CircadiaSerif-Regular"');
    expect(scene).toContain('UIFont(name: "CircadiaSans-Regular"');
    expect(scene).toContain("wordmarkSize: CGFloat = 45.6");
    expect(scene).toContain(".kern: -0.03 * Self.wordmarkSize");
    const plist = readFileSync("phone/ios/App/App/Info.plist", "utf8");
    for (const font of ["CircadiaSerif-Regular.ttf", "CircadiaSans-Regular.ttf"]) {
      expect(existsSync(`phone/ios/App/App/Fonts/${font}`)).toBe(true);
      expect(plist).toContain(`Fonts/${font}`);
    }
    // OFL requires the licence to travel with the font.
    expect(existsSync("phone/ios/App/App/Fonts/OFL-Fraunces.txt")).toBe(true);
    expect(existsSync("phone/ios/App/App/Fonts/OFL-Outfit.txt")).toBe(true);
    // The same three washes and five stars the Dock paints.
    expect(sky).toContain("final class CircadiaSky");
    expect(sky).toContain("type = .radial");
    expect(sky).toContain("func rise(duration: TimeInterval)");
    expect(scene).toContain("sky.rise(duration: 1.8)");
    expect(weakSelfViolations(sky)).toEqual([]);
    const pbx = readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8");
    expect(pbx).toContain("CircadiaSky.swift in Sources");
    expect(pbx).toContain("Fonts in Resources");
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
    expect(scene).toContain("settleBeat: TimeInterval = 0.8");
    expect(scene).toContain("recede(force: true)");
    expect(OPEN_HOLD_MS).toBe(800);
    expect(OPEN_HOLD_REDUCED_MS).toBe(280);
    expect(OPEN_COVER_MS).toBe(2200);
  });

  it("recedes in layers and lets the diary arrive under the scrim, on both shells", () => {
    // Native: ping fires at the start of the recede, not after it — the diary rises under the scrim.
    const pingAt = scene.indexOf("CircadiaSurface.ping()", scene.indexOf("receded = true"));
    const firstAnimate = scene.indexOf("UIView.animate", scene.indexOf("receded = true"));
    expect(pingAt).toBeGreaterThan(-1);
    expect(pingAt).toBeLessThan(firstAnimate);
    expect(scene).toContain("mark.lift(delay: 0.3, duration: 1.3)");
    expect(scene).toContain("CGAffineTransform(scaleX: 1.1, y: 1.1)");
    expect(scene).toContain("translationX: 0, y: -6");
    expect(scene).toContain("Self.night.withAlphaComponent(0)");
    expect(scene).toContain("deadline: .now() + 2.2");
    expect(scene).toContain("private func finishRecede()");
    expect(mark).toContain("func lift(delay: TimeInterval, duration: TimeInterval)");
    // Web: same beats, plus the arrival wrapper.
    const shellSrc = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shellSrc).toContain("brand-arrive");
    expect(shellSrc).toContain("OPEN_SURFACE_EVENT");
    expect(shellSrc).toContain("__CIRCADIA_SURFACE__");
    expect(shellSrc).toContain("arriving={arriving}");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("@keyframes diary-arrive");
    expect(css).toContain("@keyframes word-lift");
    expect(css).toContain("@keyframes mark-dissolve");
    expect(css).toContain("@keyframes halo-bloom");
    expect(css).toContain("@keyframes scrim-thin");
    expect(css).toContain(".brand-open-cover.brand-open-recede .brand-open-scrim {\n  animation: scrim-thin 1.6s");
    expect(css).toContain(".brand-arrive {\n  animation: diary-arrive 1.2s");
    expect(css).toContain("html.circadia-phone .brand-arrive");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain('OPEN_SURFACE_EVENT = "circadia-surface"');
  });

  it("mirrors the SVG mark in Core Animation and is wired into the Xcode target", () => {
    expect(mark).toContain("final class CircadiaMarkView: UIView");
    expect(mark).toContain("static let playDuration: TimeInterval = 3.6");
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
    expect(OPEN_IDENTITY_MS).toBe(3600);
    // Slow enough to read: the ring travels for 1.6s, the hands sweep for over two.
    expect(css).toContain("mark-ring-draw 1.6s");
    expect(css).toContain("mark-sweep-minute 2.1s");
    expect(css).toContain("@keyframes word-arrive");
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
