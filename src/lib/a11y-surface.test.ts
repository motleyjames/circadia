import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONFIRM_SITES = [
  "src/components/you-view.tsx",
  "src/components/check-in-flow.tsx",
  "src/components/study-panel.tsx",
  "src/components/insights-view.tsx",
];

describe("touch targets, confirms, and fault screens", () => {
  it("removes window.confirm from the five diary sites", () => {
    for (const file of CONFIRM_SITES) {
      expect(readFileSync(file, "utf8"), file).not.toContain("window.confirm");
      expect(readFileSync(file, "utf8"), file).toContain("ConfirmDialog");
    }
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("confirmWord");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("ERASE_CONFIRM_WORD");
    expect(readFileSync("src/components/bubbles.tsx", "utf8")).not.toContain("ConfirmDialog");
  });

  it("sets 44px min targets on coarse pointers and honors reduced motion", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("touch-action: manipulation");
    expect(css).toContain("cursor: default");
    expect(css).toContain("-webkit-overflow-scrolling: touch");
    expect(css).toContain("phone-page-y");
    expect(css).toContain("circadia-sheet");
    expect(css).toContain('nav[aria-label="Diary"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms");
    expect(css).toContain("brand-open-mark");
    expect(css).toContain("brand-open-ring");
    expect(css).toContain("brand-open-exit");
    expect(css).toContain("countdown-orb");
    expect(css).toContain("countdown-orb-svg");
    expect(css).toContain("clip-path: circle(50%)");
    expect(css).toContain("-webkit-clip-path: circle(50%)");
    expect(css).toMatch(/\.countdown-orb \{[^}]*overflow: hidden/);
    expect(css).toMatch(/\.countdown-orb \{[^}]*box-shadow: none/);
    expect(css).not.toMatch(/@keyframes countdown-orb-debut \{[^}]*transform:/);
    expect(css).not.toContain("countdown-orb-glow");
    expect(css).not.toContain("feGaussianBlur");
    expect(css).toContain("circadia-enter");
    expect(css).toContain("brand-open-fade");
    expect(css).toContain("html.circadia-phone .brand-open-mark");
  });

  it("ships generic fault screens with retry only", () => {
    expect(existsSync("src/app/error.tsx")).toBe(true);
    expect(existsSync("src/app/global-error.tsx")).toBe(true);
    for (const file of ["src/app/error.tsx", "src/app/global-error.tsx", "src/components/fault-screen.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/error\.message|error\.stack|JSON\.stringify\(\s*error/);
      expect(src, file).not.toMatch(/\{error\}/);
    }
    expect(readFileSync("src/components/fault-screen.tsx", "utf8")).toContain("Try again");
    expect(readFileSync("src/components/fault-screen.tsx", "utf8")).not.toContain("window.confirm");
    expect(readFileSync("src/app/global-error.tsx", "utf8")).toContain("<html");
  });

  it("names wind-down controls and exposes pause state", () => {
    const wind = readFileSync("src/components/wind-down.tsx", "utf8");
    expect(wind).toContain("aria-pressed");
    expect(wind).toContain("aria-label");
    expect(wind).toContain('role="region"');
    expect(wind).toContain("usePrefersReducedMotion");
    expect(wind).not.toContain("speakBedside");
  });

  it("keeps in-app diary views off the notch", () => {
    for (const file of [
      "src/components/tonight-view.tsx",
      "src/components/you-view.tsx",
      "src/components/insights-view.tsx",
      "src/components/library-view.tsx",
      "src/components/check-in-flow.tsx",
      "src/components/morning-file.tsx",
      "src/components/study-gate.tsx",
      "src/components/fault-screen.tsx",
      "src/components/auth-gate.tsx",
      "src/components/onboarding.tsx",
      "src/components/bottom-nav.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/safe-area-inset-(top|bottom)/);
    }
  });

  it("names the fold path so a night can cross devices without a cloud", () => {
    const you = readFileSync("src/components/you-view.tsx", "utf8");
    const morning = readFileSync("src/components/check-in-flow.tsx", "utf8");
    const notes = readFileSync("src/components/insights-view.tsx", "utf8");
    expect(you).toContain("FoldLockedDiaryButton");
    expect(you).toContain("There is no cloud account");
    expect(readFileSync("src/components/locked-diary-controls.tsx", "utf8")).toContain(
      "Fold nights from a locked copy",
    );
    expect(morning).toContain("Fold a locked copy in You");
    expect(notes).toContain("Fold nights in");
    expect(you).not.toMatch(/this computer|this laptop|this Mac/);
  });
});
