import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLEEP_AID_QUESTION } from "./intake";
import { APP_VERSION } from "./version";

const install = readFileSync("electron/install-mac.cjs", "utf8");
const launcher = readFileSync("electron/launcher.swift", "utf8");
const main = readFileSync("electron/main.cjs", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");
const onboarding = readFileSync("src/components/onboarding.tsx", "utf8");
const checkIn = readFileSync("src/components/check-in-flow.tsx", "utf8");
const serve = readFileSync("electron/serve-dock.cjs", "utf8");

describe("Dock install invariants", () => {
  it("builds a native WKWebView launcher, not a renamed Electron binary", () => {
    expect(install).toContain("swiftc");
    expect(install).toContain("launcher.swift");
    expect(install).toContain("installElectronFallback");
    expect(install).not.toMatch(/renameSync\([^)]*Circadia/);
  });

  it("runs production Next via serve-dock, never turbopack in the Dock window", () => {
    expect(launcher).toContain("43148");
    expect(launcher).toContain("serve-dock.cjs");
    expect(launcher).not.toContain('"dev"');
    expect(serve).toContain("next");
    expect(serve).toContain("start");
    expect(serve).toContain("needsBuild");
    expect(main).toContain("serve-dock.cjs");
  });

  it("does not silently quit when a second Electron already exists", () => {
    expect(main).not.toContain("requestSingleInstanceLock");
  });

  it("sends CORS headers so Safari font fetches do not throw Load failed", () => {
    expect(nextConfig).toContain("Access-Control-Allow-Origin");
    expect(nextConfig).toContain("devIndicators: false");
  });

  it("does not let the Next.js overlay steal clicks", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toContain("nextjs-portal");
    expect(readFileSync("src/components/native-chrome.tsx", "utf8")).toContain("disarmNextOverlay");
  });

  it("does not prefetch routes from the cover screen", () => {
    expect(onboarding).not.toContain("useRouter");
  });

  it("runs the operator as a second app on its own port, not a page in the diary", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toContain("43147");
    expect(pkg.scripts.dev).not.toContain("CIRCADIA_SURFACE=mod");
    expect(pkg.scripts.mod).toBe("node electron/run-mod.cjs");
    const runMod = readFileSync("electron/run-mod.cjs", "utf8");
    expect(runMod).toContain("43149");
    expect(runMod).toContain('CIRCADIA_SURFACE = "mod"');
    expect(readFileSync("next.config.ts", "utf8")).toContain(".next-mod");
    const mw = readFileSync("src/middleware.ts", "utf8");
    expect(mw).toContain('CIRCADIA_SURFACE === "mod"');
    expect(mw).toContain("/api/moderator");
    expect(mw).toContain("NextResponse.redirect");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("isOperatorSurface");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).not.toContain("operatorPage");
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain("ModeratorPage");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('force-dynamic');
    expect(readFileSync("src/lib/nav.ts", "utf8")).not.toContain("/mod");
    expect(readFileSync("src/components/sidebar-nav.tsx", "utf8")).not.toContain("/mod");
    expect(pkg.scripts.dock).toContain("fix-mac.cjs");
    expect(pkg.scripts.dock).not.toContain("--operator");
    expect(pkg.scripts["dock:mod"]).toContain("--operator");
    expect(pkg.scripts["fix-mac"]).toBe("node electron/fix-mac.cjs");
    expect(pkg.scripts.repair).toBe("node electron/fix-mac.cjs");
    expect(pkg.scripts["reveal:mod"]).toBe("node electron/install-mac.cjs --operator --reveal");
    expect(install).toContain("aliasOnDesktop");
    expect(install).toContain("--operator");
    expect(install).toContain("Circadia Operator.app");
    expect(install).toContain("app.circadia.operator");
    expect(install).toContain("operator-icon.png");
    expect(install).toContain("CircadiaOperator");
    expect(launcher).toContain("let surface");
    expect(readFileSync("eslint.config.mjs", "utf8")).toContain(".next-mod");
  });

  it("does not put an absolute repo path in Electron's package.json main", () => {
    const pack = readFileSync("electron/pack-app.cjs", "utf8");
    expect(install).toContain("writePackagedApp");
    expect(install).toContain("fix-mac.cjs");
    expect(install).not.toMatch(/main:\s*path\.join\(root/);
    expect(pack).toContain('RELATIVE_MAIN = "main.cjs"');
    expect(pack).toContain("packagedMainPath");
    expect(pack).not.toMatch(/main:\s*path\.join/);
    expect(install).toContain("isNativeBundle");
    expect(readFileSync("electron/fix-mac.cjs", "utf8")).toContain("codesign");
    expect(readFileSync("electron/fix-mac.cjs", "utf8")).toContain("xattr");
    expect(readFileSync("electron/fix-mac.cjs", "utf8")).not.toContain("--deep");
    expect(install).toContain("electron-repaired");
    expect(install).toContain("Leaving the existing native app");
    expect(main).toContain("CIRCADIA_SURFACE");
    expect(main).toContain("NEXT_PUBLIC_CIRCADIA_SURFACE");
  });
});

describe("morning sleep-aid question", () => {
  it("asks about any sleep supplement, not only melatonin or magnesium", () => {
    expect(SLEEP_AID_QUESTION).toBe("Did you take any supplements last night to help you sleep?");
    expect(checkIn).toContain("SLEEP_AID_QUESTION");
    expect(checkIn).not.toContain("Melatonin or magnesium last night?");
    expect(checkIn).not.toContain("overwrite today's log");
    expect(APP_VERSION).toBe("0.5.4");
  });

  it("does not run diary views while compiling the operator", () => {
    for (const file of [
      "src/app/page.tsx",
      "src/app/check-in/page.tsx",
      "src/app/insights/page.tsx",
      "src/app/you/page.tsx",
      "src/app/library/page.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("DiarySurface");
    }
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).toContain('typeof window === "undefined"');
  });
});
