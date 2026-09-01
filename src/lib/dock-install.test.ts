import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLEEP_AID_QUESTION } from "./intake";
import { APP_VERSION } from "./version";

const install = readFileSync("electron/install-mac.cjs", "utf8");
const launcher = readFileSync("electron/launcher.swift", "utf8");
const main = readFileSync("electron/main.cjs", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");
const onboarding = readFileSync("src/components/onboarding.tsx", "utf8");
const authGate = readFileSync("src/components/auth-gate.tsx", "utf8");
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
    expect(launcher).toContain("WKWebView");
    expect(launcher).toContain("guard let self else { return }");
    expect(launcher).toContain("self.operatorApp");
    expect(launcher).toContain("43148");
    expect(launcher).toContain("serve-dock.cjs");
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain("Circadia Operator.app");
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain("43149");
    expect(readFileSync("electron/install-both-native.cjs", "utf8")).toContain("launcher.swift");
    expect(readFileSync("electron/install-both-native.cjs", "utf8")).not.toContain("Electron.app");
    expect(launcher).not.toContain('"dev"');
    expect(serve).toContain("next");
    expect(serve).toContain("start");
    expect(existsSync("src/middleware.ts")).toBe(false);
    expect(readFileSync("src/proxy.ts", "utf8")).toContain("export function proxy");
    expect(readFileSync("src/proxy.ts", "utf8")).toContain("voice/");
    expect(readFileSync("src/components/wind-down.tsx", "utf8")).toContain("startBreathBed");
    expect(readFileSync("src/components/wind-down.tsx", "utf8")).toContain("startGuideFromTap");
    expect(readFileSync("src/components/wind-down.tsx", "utf8")).toContain("primeGuide");
    expect(readFileSync("src/components/wind-down.tsx", "utf8")).toContain("aria-pressed");
    expect(readFileSync("src/components/wind-down.tsx", "utf8")).not.toContain("speakBedside");
    expect(launcher).toContain("websiteDataStore");
    expect(launcher).not.toMatch(/config\.allowsInlineMediaPlayback/);
    expect(launcher).not.toContain("?v=");
    expect(existsSync("src/app/api/vault/route.ts")).toBe(true);
    expect(existsSync("src/app/api/session-key/route.ts")).toBe(true);
    expect(nextConfig).toContain("/((?!api/).*)");
    expect(nextConfig).toMatch(/\.\.\.\(packStatic\s*\?/);
    expect(serve).toContain("needsBuild");
    expect(serve).toContain("rebuildIfStale");
    expect(serve).toContain('path.join(root, "public")');
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

  it("does not prefetch routes from login or sleep intake", () => {
    expect(onboarding).not.toContain("useRouter");
    expect(authGate).not.toContain("useRouter");
    expect(authGate).toContain("Sign up");
    expect(authGate).toContain("Log in");
    expect(authGate).toContain('type={show ? "text" : "password"}');
    expect(authGate).toContain("Confirm password");
    expect(authGate).not.toContain("There is no password");
    expect(authGate).toContain("stays signed in");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("SESSION_UNLOCK_KEY");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("restorePersistedSession");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("/api/session-key");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("SESSION_HEADER");
    expect(readFileSync("src/lib/session-token-shared.ts", "utf8")).toContain("x-circadia-session");
    expect(readFileSync("src/lib/storage.ts", "utf8")).not.toMatch(
      /localStorage\.setItem\(\s*SESSION_UNLOCK_KEY/,
    );
    expect(readFileSync("src/lib/keychain.ts", "utf8")).toContain("add-generic-password");
    expect(readFileSync("src/app/api/session-key/route.ts", "utf8")).toContain("isLocalRequest");
    expect(readFileSync("src/app/api/session-key/route.ts", "utf8")).toContain("sessionTokenOk");
    expect(readFileSync("electron/launcher.swift", "utf8")).toContain("CIRCADIA_SESSION_TOKEN");
    expect(readFileSync("electron/launcher.swift", "utf8")).toContain("circadiaDesktop");
    expect(readFileSync("electron/launcher.swift", "utf8")).toContain("SecRandomCopyBytes");
    expect(readFileSync("electron/launcher.swift", "utf8")).not.toMatch(/logLine\([^)]*sessionToken/);
    expect(onboarding).not.toContain("James can reach");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("Closing the app does not log you out");
    expect(readFileSync("README.md", "utf8")).toContain("stays signed in");
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
    const mw = readFileSync("src/proxy.ts", "utf8");
    expect(mw).toContain('CIRCADIA_SURFACE === "mod"');
    expect(mw).toContain("/api/moderator");
    expect(mw).toContain("/api/session-key");
    expect(mw).toContain("NextResponse.redirect");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("isOperatorSurface");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).not.toContain("operatorPage");
    expect(readFileSync("src/app/page.tsx", "utf8")).not.toContain('from "./mod/page"');
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain("isOperatorSurface");
    expect(readFileSync("src/app/mod/page.tsx", "utf8")).toContain("ModeratorPage");
    expect(readFileSync("src/app/layout.tsx", "utf8")).not.toContain("force-dynamic");
    expect(readFileSync("src/app/layout.tsx", "utf8")).not.toContain("LayoutProps");
    expect(readFileSync("src/lib/nav.ts", "utf8")).not.toContain("/mod");
    expect(readFileSync("src/components/sidebar-nav.tsx", "utf8")).not.toContain("/mod");
    expect(pkg.scripts.dock).toBe("node electron/install-both-native.cjs");
    expect(pkg.scripts["dock:mod"]).toBe("node electron/install-both-native.cjs --operator");
    expect(pkg.scripts["dock:diary"]).toBe("node electron/install-both-native.cjs --diary");
    expect(pkg.scripts["put-on-dock"]).toBe("bash scripts/put-on-dock.sh");
    expect(readFileSync("scripts/put-on-dock.sh", "utf8")).toContain("0.6.5");
    expect(readFileSync("scripts/put-on-dock.sh", "utf8")).toContain("deps-missing.cjs");
    expect(readFileSync("scripts/put-on-dock.sh", "utf8")).toContain("npm run dock");
    expect(readFileSync("electron/install-both-native.cjs", "utf8")).toContain("Drag these onto the Dock");
    expect(pkg.scripts["fix-mac"]).toBe("node electron/fix-mac.cjs");
    expect(pkg.scripts.repair).toBe("node electron/fix-mac.cjs");
    expect(pkg.scripts["reveal:mod"]).toBe("node electron/install-mac.cjs --operator --reveal");
    expect(install).toContain("aliasOnDesktop");
    expect(install).not.toMatch(/function aliasOnDesktop[\s\S]{0,80}if \(!operator\) return/);
    expect(install).toContain("--operator");
    expect(install).toContain("Circadia Operator.app");
    expect(install).toContain("app.circadia.operator");
    expect(install).toContain("operator-icon.png");
    expect(existsSync("electron/operator-icon.png")).toBe(true);
    expect(existsSync("electron/icon.png")).toBe(true);
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
    expect(checkIn).toContain("File this morning");
    expect(readFileSync("src/components/morning-file.tsx", "utf8")).toContain("Notes for this morning");
    expect(readFileSync("src/components/morning-file.tsx", "utf8")).not.toContain("The interview is closed");
    expect(APP_VERSION).toBe("0.8.6");
  });

  it("does not run diary views while compiling the operator", () => {
    for (const file of [
      "src/app/page.tsx",
      "src/app/check-in/page.tsx",
      "src/app/insights/page.tsx",
      "src/app/you/page.tsx",
      "src/app/library/page.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("DiaryPage");
      expect(readFileSync(file, "utf8")).not.toContain('"use client"');
    }
    expect(readFileSync("src/components/diary-page.tsx", "utf8")).toContain("isOperatorSurface");
    expect(readFileSync("src/components/diary-page.tsx", "utf8")).not.toContain('"use client"');
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).toContain("CircadiaSafeTree");
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).toContain("return NOOP_VALUE");
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).not.toMatch(
      /const ctx = useContext\(CircadiaContext\);\s*if \(!ctx\) throw new Error\("useCircadia must be used inside CircadiaProvider"\)/,
    );
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("CircadiaSafeTree");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("CircadiaSafeTree");
    expect(nextConfig).toContain("CIRCADIA_PACK_STATIC");
    expect(nextConfig).toContain("nextOutput");
    expect(install).toContain("delete env.CIRCADIA_PACK_STATIC");
    expect(install).toContain("delete env.CIRCADIA_ELECTRON");
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("CIRCADIA_PACK_STATIC");
    expect(readFileSync("electron/serve-dock.cjs", "utf8")).toContain("CIRCADIA_PACK_STATIC");
  });
});

describe("put-on-dock script", () => {
  it("refuses Linux and prints the 0.6.5 version gate", () => {
    const run = spawnSync("bash", ["scripts/put-on-dock.sh"], { encoding: "utf8" });
    expect(run.stdout).toContain("0.6.5");
    if (process.platform === "darwin") {
      expect([0, 5]).toContain(run.status);
    } else {
      expect(run.status).toBe(4);
      expect(run.stdout).toContain("macOS");
    }
  });
});
