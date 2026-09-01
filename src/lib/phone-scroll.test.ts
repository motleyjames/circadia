import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCROLL_PANES = [
  "src/components/tonight-view.tsx",
  "src/components/you-view.tsx",
  "src/components/insights-view.tsx",
  "src/components/library-view.tsx",
  "src/components/check-in-flow.tsx",
  "src/components/morning-file.tsx",
  "src/components/auth-gate.tsx",
  "src/components/onboarding.tsx",
  "src/components/study-gate.tsx",
  "src/components/phone-unlock.tsx",
  "src/components/chat-bar.tsx",
];

describe("phone scrolling", () => {
  it("does not disable WKWebView scrolling — KeyboardPlugin would pin contentOffset to zero", () => {
    const cap = readFileSync("phone/capacitor.config.ts", "utf8");
    const json = JSON.parse(readFileSync("phone/ios/App/App/capacitor.config.json", "utf8")) as {
      ios?: { scrollEnabled?: boolean };
    };
    expect(cap).not.toMatch(/scrollEnabled:\s*false/);
    expect(cap).toContain("scrollEnabled: true");
    expect(json.ios?.scrollEnabled).toBe(true);
    expect(readFileSync("node_modules/@capacitor/keyboard/ios/Sources/KeyboardPlugin/Keyboard.m", "utf8")).toContain(
      "setContentOffset: CGPointZero",
    );
  });

  it("gives the diary a bounded height so inner overflow-y-auto can actually move", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toMatch(/html[^>]*h-full overflow-hidden/);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toMatch(/body className="h-full overflow-hidden/);
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain("h-full max-h-full flex-col overflow-hidden");
    expect(shell).not.toMatch(/night-sky[^"]*min-h-dvh/);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("touch-action: pan-y");
    expect(css).toContain("html.circadia-phone");
    expect(css).toContain("overflow: hidden");
  });

  it("keeps a real scroller on every diary surface", () => {
    for (const file of SCROLL_PANES) {
      expect(readFileSync(file, "utf8"), file).toContain("overflow-y-auto");
    }
  });
});
