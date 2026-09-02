import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";
import { LOCAL_FILE_KEY } from "./login";
import { TABS } from "./nav";

describe("phone diary shell", () => {
  it("is version 0.8.15 and keeps the vault key local:this-computer", () => {
    expect(APP_VERSION).toBe("0.8.15");
    expect(JSON.parse(readFileSync("package.json", "utf8")).version).toBe("0.8.15");
    expect(LOCAL_FILE_KEY).toBe("local:this-computer");
  });

  it("keeps five diary tabs and never adds Consult as a sixth", () => {
    expect(TABS.map((tab) => tab.label)).toEqual(["Tonight", "Morning", "Notes", "Library", "You"]);
    expect(readFileSync("src/lib/nav.ts", "utf8")).not.toMatch(/Consult/);
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).toContain("grid-cols-5");
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).toContain("aria-current");
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).toContain("hapticSelect");
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).toContain("DiaryTabLink");
    expect(readFileSync("src/components/diary-tab-link.tsx", "utf8")).toContain("preventDefault");
    expect(readFileSync("src/components/diary-tab-link.tsx", "utf8")).toContain("navigateDiary");
    expect(readFileSync("src/components/diary-tab-link.tsx", "utf8")).not.toContain("useRouter");
    expect(readFileSync("src/components/diary-tab-link.tsx", "utf8")).not.toContain("router.push");
    expect(readFileSync("src/components/diary-nav-lock.tsx", "utf8")).toContain("diaryClickTarget");
    expect(readFileSync("src/components/diary-nav-lock.tsx", "utf8")).toContain('addEventListener("click", onClick, true)');
    expect(readFileSync("src/components/diary-nav-lock.tsx", "utf8")).not.toContain("useRouter");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("diaryShellPhase");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("consumeOpenHold");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("DiaryNavLock");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("<DiaryViews path={path} />");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("readPhoneSourceWithRetry");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("waitForDesktopToken");
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).toContain("if (!getSessionLogin())");
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).toContain("if (bootReady) return");
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).not.toContain("drop-shadow");
    for (const file of [
      "src/components/diary-tab-link.tsx",
      "src/components/diary-nav-lock.tsx",
      "src/components/diary-views.tsx",
      "src/components/app-shell.tsx",
      "src/components/bottom-nav.tsx",
      "src/components/sidebar-nav.tsx",
      "src/components/tonight-view.tsx",
      "src/components/insights-view.tsx",
      "src/components/check-in-flow.tsx",
      "src/components/morning-file.tsx",
      "src/components/morning-reading.tsx",
      "src/components/library-view.tsx",
      "src/components/you-view.tsx",
      "src/components/chat-bar.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/from ["']next\/link["']/);
      expect(src, file).not.toMatch(/from ["']next\/navigation["']/);
      expect(src, file).not.toContain("useRouter");
    }
  });

  it("uses a quiet Ask word and a full-screen sheet, not a consult dock", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    const chat = readFileSync("src/components/chat-bar.tsx", "utf8");
    expect(shell).toContain("PhoneAsk");
    expect(shell).toContain("Ask");
    expect(shell).toContain('variant="sheet"');
    expect(shell).toContain('variant="rail"');
    expect(shell).toContain("xl:hidden");
    expect(chat).toContain('variant: "rail" | "sheet"');
    expect(chat).not.toContain('variant="dock"');
    expect(chat).not.toContain('"dock"');
    expect(chat).toContain('role="dialog"');
    expect(chat).toContain("Done");
    expect(chat).toContain("Dismiss");
    expect(chat).toContain("circadia-sheet");
    expect(chat).toContain("rounded-t-[1.35rem]");
    expect(chat).toContain("xl:hidden");
    expect(chat).toContain("hidden w-[23.5rem]");
    expect(chat).toContain("xl:flex");
  });

  it("plays the open on a painted frame, warms guides as PCM, and holds the study pack on the phone", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    const audio = readFileSync("src/lib/audio.ts", "utf8");
    const voice = readFileSync("src/lib/voice.ts", "utf8");
    const study = readFileSync("src/lib/study-client.ts", "utf8");
    const panel = readFileSync("src/components/study-panel.tsx", "utf8");
    const store = readFileSync("src/context/circadia-store.tsx", "utf8");
    expect(shell).toContain("waitForOpenSurface");
    expect(shell).toContain("surfaceReady");
    expect(shell).toContain("appPainted");
    expect(shell).not.toContain("showCover = !reducedMotion");
    expect(shell).toContain("brand-open-wait");
    expect(shell).toContain("brand-open-play");
    expect(shell).toContain("brand-open-hold");
    expect(shell).toContain("brand-open-recede");
    expect(shell).toContain("brand-open-scrim");
    expect(shell).not.toContain('key={play ? "play" : "hold"}');
    expect(shell).not.toContain("brand-open-exit");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("DOMContentLoaded");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).not.toContain('addEventListener("load"');
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("circadia-surface");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("__CIRCADIA_SURFACE__");
    expect(shell).toContain('aria-label="Circadia, Tonight"');
    expect(shell).toContain("<Mark className=\"size-7 shrink-0\" />");
    expect(shell).toContain(">Circadia</span>");
    expect(audio).toContain("export async function loadWavPcm");
    expect(audio).toContain("pcmCache");
    expect(voice).toContain("loadWavPcm");
    expect(voice).toContain("guidePcmWarm");
    expect(voice).not.toContain("loadWavUrl");
    expect(study).toContain("held: true");
    expect(study).toContain("isPhoneNative");
    expect(study).toContain("STUDY_HELD_ERROR");
    expect(panel).toContain("Pipeline waiting");
    expect(panel).toContain("STUDY_HELD_ERROR");
    expect(store).toContain("result.held");
    expect(store).toContain("markHeld");
    expect(store).toContain("isPhoneNative()");
    expect(store).toContain("lastStatus !== \"error\"");
    expect(store).toContain("STUDY_HELD_ERROR");
    expect(readFileSync("src/lib/phone-native.ts", "utf8")).toContain("circadia:");
    expect(readFileSync("src/lib/phone-native.ts", "utf8")).toContain("PHONE_CLASS_BOOT");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("dangerouslySetInnerHTML");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("PHONE_CLASS_BOOT");
    expect(readFileSync("src/lib/study-client.ts", "utf8")).toContain("payload?.inbox === true");
    expect(audio).toContain("isRiffWav");
    expect(audio).toContain("data.byteLength >= 12");
    expect(audio).not.toMatch(/if \(res\.ok\) \{/);
    expect(audio).toContain("WKURLSchemeHandler");
    expect(store).toContain("markHeld");
    expect(readFileSync("src/lib/types.ts", "utf8")).toContain('"held"');
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain('s.lastStatus === "held"');
  });

  it("gives Tonight and the inner pages air under Ask, and hides the Mac install hint on a phone", () => {
    const tonight = readFileSync("src/components/tonight-view.tsx", "utf8");
    expect(tonight).toMatch(/safe-area-inset-(top|bottom)/);
    expect(tonight).toContain("phone-page-y");
    expect(tonight).toContain("size-[13.5rem]");
    expect(tonight).toContain("countdown-orb");
    expect(tonight).toContain("rounded-full");
    expect(tonight).toContain("useWallClock");
    expect(tonight).toContain("formatWallClock");
    expect(tonight).toContain("secondsUntilClock");
    expect(tonight).toContain("tabular-nums");
    expect(tonight).not.toContain("30_000");
    expect(tonight).toContain("<span className=\"block\">down</span>");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("OPEN_HOLD_MS");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("OPEN_HOLD_REDUCED_MS");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("OPEN_COVER_MS");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("OPEN_IDENTITY_MS");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("waitForOpenSurface");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("surfaceReady");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("appPainted");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("brand-open-recede");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("OpenCover");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("export const OPEN_HOLD_MS = 400");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("export const OPEN_COVER_MS = 1100");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("export const OPEN_IDENTITY_MS = 800");
    expect(readFileSync("src/lib/wall-clock.ts", "utf8")).toContain("pageshow");
    expect(readFileSync("src/lib/wall-clock.ts", "utf8")).toContain("1000 - (Date.now() % 1000)");
    expect(readFileSync("src/lib/diary-shell.ts", "utf8")).toContain("waitForOpenSurface");
    expect(tonight).toContain("countdown-orb-core");
    expect(tonight).toContain("countdown-orb-svg");
    expect(tonight).toContain("overflow-hidden");
    expect(tonight).toContain('fill="none"');
    expect(tonight).not.toContain("feGaussianBlur");
    expect(tonight).not.toContain("bg-[#05040a]");
    expect(tonight).not.toContain("countdown-orb-glow");
    expect(tonight).not.toContain("box-shadow");
    expect(tonight).toContain("isOpenHoldConsumed");
    expect(tonight).not.toContain("countdown-orb-debut");
    expect(tonight).not.toContain("takeSkyDebut");
    expect(readFileSync("src/components/install-hint.tsx", "utf8")).toContain("hidden");
    expect(readFileSync("src/components/install-hint.tsx", "utf8")).toContain("md:block");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("phone-page-y");
    expect(readFileSync("src/components/library-view.tsx", "utf8")).toContain("phone-page-y");
    expect(readFileSync("src/components/insights-view.tsx", "utf8")).toContain("phone-page-y");
    expect(readFileSync("src/components/check-in-flow.tsx", "utf8")).toContain("phone-page-y");
    expect(readFileSync("src/components/morning-file.tsx", "utf8")).toContain("phone-page-y");
  });

  it("ships an iPhone diary shell that is not the Operator", () => {
    const cap = readFileSync("phone/capacitor.config.ts", "utf8");
    const phonePkg = JSON.parse(readFileSync("phone/package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      description?: string;
    };
    const plugin = readFileSync(
      "phone/plugins/circadia-keychain/ios/Sources/CircadiaKeychainPlugin/CircadiaKeychainPlugin.swift",
      "utf8",
    );
    expect(cap).toContain('appId: "app.circadia.diary"');
    expect(cap).not.toMatch(/operator|audiospike/i);
    expect(cap).toContain('webDir: "../out"');
    expect(cap).toContain("scrollEnabled: true");
    expect(cap).toContain("allowsLinkPreview: false");
    expect(cap).toContain("@capacitor/haptics");
    expect(cap).not.toMatch(/server\s*:/);
    expect(JSON.parse(readFileSync("phone/ios/App/App/capacitor.config.json", "utf8"))).not.toHaveProperty("server");
    expect(JSON.parse(readFileSync("phone/ios/App/App/capacitor.config.json", "utf8")).ios).toMatchObject({
      scrollEnabled: true,
      allowsLinkPreview: false,
    });
    expect(JSON.parse(readFileSync("phone/ios/App/App/capacitor.config.json", "utf8")).plugins?.Keyboard?.resize).toBe(
      "native",
    );
    expect(phonePkg.description?.toLowerCase()).toMatch(/diary/);
    expect(phonePkg.description?.toLowerCase()).toMatch(/not the operator/);
    expect(phonePkg.dependencies?.["circadia-keychain"]).toBe("file:./plugins/circadia-keychain");
    expect(phonePkg.dependencies?.["@capacitor/haptics"]).toMatch(/^8\./);
    expect(plugin).toContain('jsName = "CircadiaKeychain"');
    expect(plugin).toContain('service = "Circadia"');
    expect(plugin).toContain("kSecAttrAccessibleWhenUnlockedThisDeviceOnly");
    expect(readFileSync("src/lib/circadia-keychain.ts", "utf8")).toContain('registerPlugin<CircadiaKeychainPlugin>("CircadiaKeychain"');
    expect(readFileSync("src/lib/phone-vault.ts", "utf8")).toContain("Directory.Data");
    expect(readFileSync("src/lib/storage.ts", "utf8")).toContain("phoneVaultActive");
    expect(readFileSync("phone/ios/App/App/Info.plist", "utf8")).toContain("UIBackgroundModes");
    expect(readFileSync("phone/ios/App/App/Info.plist", "utf8")).toContain("audio");
    expect(readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8")).toContain(
      "PRODUCT_BUNDLE_IDENTIFIER = app.circadia.diary",
    );
    expect(readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8")).toContain(
      'CODE_SIGN_IDENTITY = "Apple Development"',
    );
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["phone:sync"]).toContain("pack:static");
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["phone:sync"]).toContain("pack-mac-diary.cjs");
    expect(readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8")).toContain("Pack Mac diary");
    expect(readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8")).toContain("MARKETING_VERSION = 0.8.15");
    expect(readFileSync("phone/ios/App/App.xcodeproj/project.pbxproj", "utf8")).toContain("CURRENT_PROJECT_VERSION = 25");
    const scene = readFileSync("phone/ios/App/App/SceneDelegate.swift", "utf8");
    expect(scene).toContain("class CircadiaBridgeViewController: CAPBridgeViewController");
    expect(scene).toContain("CircadiaBridgeViewController()");
    expect(scene).toContain("circadia-surface");
    expect(scene).toContain("__CIRCADIA_SURFACE__");
    expect(scene).not.toContain("rootViewController = CAPBridgeViewController()");
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("NEXT_PUBLIC_CIRCADIA_PHONE_PACK");
    expect(readFileSync("next.config.ts", "utf8")).toContain("turbopack: { root: repoRoot }");
    expect(readFileSync("next.config.ts", "utf8")).toContain("outputFileTracingRoot: repoRoot");
    expect(existsSync("src/app/mod/page.tsx")).toBe(true);
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain(".mod-parked");
    expect(readFileSync("src/components/native-chrome.tsx", "utf8")).toContain("setOverlaysWebView");
    expect(readFileSync("src/components/native-chrome.tsx", "utf8")).toContain("setAccessoryBarVisible");
    expect(readFileSync("src/components/ui/dialog.tsx", "utf8")).toContain("bg-black/55");
    expect(readFileSync("src/components/ui/dialog.tsx", "utf8")).not.toContain("bg-black/10");
  });

  it("put-on-phone signs from this Mac's cert, installs onto a reachable iPhone, and refuses Linux", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["put-on-phone"]).toBe("bash scripts/put-on-phone.sh");
    const script = readFileSync("scripts/put-on-phone.sh", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");
    const debugXc = readFileSync("phone/ios/debug.xcconfig", "utf8");
    expect(script).toContain("0.7.0");
    expect(script).toContain("phone:sync");
    expect(script).toContain("ios-target.cjs");
    expect(script).toContain("ios-team.cjs");
    expect(script).toContain("ios-install.cjs");
    expect(script).toContain("exit 13");
    expect(script).toContain("Settings → Accounts");
    expect(script).toContain("Any iOS Device");
    expect(script).toContain("deps-missing.cjs");
    expect(script).toContain("new packages after git pull");
    expect(script).toContain("npm install");
    expect(script).toContain("phone-pack-fresh.cjs");
    expect(script).toContain("Skipping the Next.js rebuild");
    expect(script).toContain("CIRCADIA_FORCE_PHONE_SYNC=1 npm run put-on-phone");
    expect(script).toContain("touch phone/ios/App/App/public/index.html");
    expect(script).toContain("--core-device");
    expect(script).toContain("hardware UDID");
    expect(readFileSync("scripts/deps-missing.cjs", "utf8")).toContain("pkg.dependencies");
    expect(spawnSync("node", ["scripts/deps-missing.cjs"]).status).toBe(0);
    expect(script).toContain("Not Operator");
    expect(script).not.toContain("Circadia Operator");
    expect(script).not.toContain("run-device");
    expect(script).not.toMatch(/cap open/);
    expect(script).not.toMatch(/--live-reload/);
    expect(script).toContain("Not live-reload");
    expect(script).toContain('__CIRCADIA_PACK_STATUS__="packed"');
    expect(script).toContain("exit 8");
    expect(script).toContain("exit 10");
    expect(script).toContain("exit 11");
    expect(script).toContain("--fallback-team");
    expect(script).toContain("diagnosis");
    expect(script).toContain("this one install");
    expect(script).not.toContain("exit 12");
    expect(gitignore).toContain("/phone/ios/signing.xcconfig");
    expect(gitignore).toContain("/phone/ios/.pack-stamp");
    expect(debugXc).toContain('#include? "signing.xcconfig"');
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("resolveSignForDevice");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("CODE_SIGN_STYLE=Manual");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("automatic-session");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("generic/platform=iOS");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("devicectl");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("isHardwareUdid");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("waitForInstallTarget");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("Trying Apple's installer with the hardware UDID");
    expect(readFileSync("scripts/ios-install.cjs", "utf8")).toContain("No live CoreDevice tunnel");
    expect(script).toContain("CIRCADIA_IPHONE_WAIT_MS");
    expect(script).toContain("live tunnel");
    expect(readFileSync("scripts/ios-sign.cjs", "utf8")).toContain("app.circadia.diary");
    expect(readFileSync("scripts/ios-sign.cjs", "utf8")).toContain("automatic-session");
    expect(readFileSync("scripts/ios-team.cjs", "utf8")).toContain("Apple Development");
    expect(readFileSync("scripts/ios-team.cjs", "utf8")).toContain("IDEProvisioningTeamByIdentifier");
    expect(readFileSync("scripts/ios-team.cjs", "utf8")).toContain("process.exit(12)");
    expect(readFileSync("scripts/ios-target.cjs", "utf8")).toContain("native-run");
    expect(readFileSync("scripts/ios-target.cjs", "utf8")).toContain("isHardwareUdid");
    expect(readFileSync("scripts/ios-target.cjs", "utf8")).toContain("parseDevicectlJson");
    expect(readFileSync("scripts/pack-mac-diary.cjs", "utf8")).toContain("require.main === module");
    expect(readFileSync("scripts/phone-pack-fresh.cjs", "utf8")).toContain("vaultFingerprint");
    expect(script).toContain("[A-Z0-9]{10}");
    expect(script).toContain("ios-pull-vault.cjs");
    expect(script.indexOf("ios-pull-vault.cjs")).toBeGreaterThan(script.indexOf("ios-target.cjs"));
    expect(script.indexOf("ios-pull-vault.cjs")).toBeLessThan(script.indexOf("ios-install.cjs"));
    expect(script).toContain("node scripts/ios-pull-vault.cjs --target");
    expect(gitignore).toContain("/data/fold-inbox.circadia");
    const storage = readFileSync("src/lib/storage.ts", "utf8");
    expect(storage).toContain("absorbPeerNights");
    expect(storage).toContain("unlockLocalDiary");
    expect(storage).toContain("circadia:folded-pack");
    expect(storage).toContain("circadia:folded-inbox");
    expect(storage).toContain("diaryHasNights");
    expect(storage).toContain("await pushVaultToDisk()");
    expect(readFileSync("src/app/api/fold-inbox/route.ts", "utf8")).toContain("parseLockedDiary");
    expect(readFileSync("src/app/api/fold-inbox/route.ts", "utf8")).toContain("source !== \"inbox\"");
    expect(readFileSync("src/lib/locked-diary-file.ts", "utf8")).toContain("foldInboxFilePath");
    expect(readFileSync("src/context/circadia-store.tsx", "utf8")).toContain("absorbPeerNights");
    const run = spawnSync("bash", ["scripts/put-on-phone.sh"], { encoding: "utf8" });
    expect(run.stdout).toContain("0.8.15");
    if (process.platform === "darwin") {
      expect([0, 5, 6, 8, 10, 11, 13]).toContain(run.status);
    } else {
      expect(run.status).toBe(4);
      expect(run.stdout).toContain("macOS");
    }
  });

  it("lets an empty iPhone log in with a packed Mac diary, or bring a locked copy", () => {
    const gate = readFileSync("src/components/auth-gate.tsx", "utf8");
    const unlock = readFileSync("src/components/phone-unlock.tsx", "utf8");
    const bring = readFileSync("src/components/locked-diary-controls.tsx", "utf8");
    expect(gate).toContain("gate-brand");
    expect(unlock).toContain("gate-brand");
    expect(gate).toContain("PhoneUnlock");
    expect(gate).toContain("PhoneEmptyPack");
    expect(gate.indexOf("if (!isVaultEmpty())")).toBeGreaterThan(-1);
    expect(gate.indexOf("if (!isVaultEmpty())")).toBeLessThan(gate.indexOf("return <PhoneUnlock />"));
    expect(unlock).toContain("A locked diary is in this app");
    expect(unlock).toContain("diary packed");
    expect(unlock).toContain("no diary packed");
    expect(unlock).toContain("BringLockedDiaryButton");
    expect(unlock).toContain("Start a new diary on this device");
    expect(gate).toContain("BringLockedDiaryButton");
    expect(gate).toContain("bring a locked copy");
    expect(gate).toContain('autoCapitalize="none"');
    expect(gate).toContain("AUTH_ERRORS.orphan");
    expect(gate).not.toContain('includes("Sign up")');
    expect(gate).toContain("The locked diary is on this device");
    expect(gate).toContain("UsePackedDiaryButton");
    expect(gate).not.toContain("will not find it");
    expect(gate).toContain("diaries on this device");
    expect(gate).not.toContain("Diaries on this device:");
    expect(readFileSync("src/components/bubbles.tsx", "utf8")).toContain("hapticSelect");
    expect(readFileSync("src/components/ui/switch.tsx", "utf8")).toContain("w-[51px]");
    expect(readFileSync("src/components/confirm-dialog.tsx", "utf8")).toContain("rounded-[14px]");
    expect(readFileSync("src/app/globals.css", "utf8")).toContain("phone-page-y");
    expect(readFileSync("src/app/globals.css", "utf8")).toContain("circadia-sheet");
    expect(readFileSync("src/lib/login.ts", "utf8")).toContain("this app was packed with");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("SaveLockedCopyButton");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("FoldLockedDiaryButton");
    expect(bring).toContain("Bring a locked diary");
    expect(bring).toContain("Fold nights from a locked copy");
    expect(bring).toContain("Use the packed diary");
    expect(bring).toContain("fetchPackedDiary");
    expect(readFileSync("scripts/pack-mac-diary.cjs", "utf8")).toContain("circadia-locked.json");
    expect(readFileSync("scripts/pack-mac-diary.cjs", "utf8")).toContain("session: null");
    expect(readFileSync("scripts/pack-mac-diary.cjs", "utf8")).toContain("__CIRCADIA_LOCKED_DIARY__");
    expect(readFileSync("src/lib/packed-diary.ts", "utf8")).toContain("readInlinePackedDiary");
    expect(bring).toContain("<label");
    expect(bring).toContain("opacity-0");
    expect(bring).toContain("isPhoneNative");
    expect(bring).not.toContain('className="hidden"');
    expect(bring).not.toContain("inputRef");
    expect(readFileSync("src/lib/login.ts", "utf8")).toContain("emptyDevice");
    expect(readFileSync("src/lib/login.ts", "utf8")).toContain("bring a locked copy");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('interactiveWidget: "resizes-content"');
    expect(readFileSync("src/components/chat-bar.tsx", "utf8")).toContain('sheet ? "text-base"');
  });

  it("keeps user-facing copy on this device, not this computer", () => {
    for (const file of [
      "src/components/auth-gate.tsx",
      "src/components/study-gate.tsx",
      "src/components/you-view.tsx",
      "src/components/locked-diary-controls.tsx",
      "src/components/phone-unlock.tsx",
      "src/lib/login.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/this device/);
      expect(src, file).not.toMatch(/this computer|this laptop|this Mac/);
    }
  });
});
