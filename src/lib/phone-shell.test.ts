import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";
import { LOCAL_FILE_KEY } from "./login";
import { TABS } from "./nav";

describe("phone diary shell", () => {
  it("is version 0.7.2 and keeps the vault key local:this-computer", () => {
    expect(APP_VERSION).toBe("0.7.2");
    expect(JSON.parse(readFileSync("package.json", "utf8")).version).toBe("0.7.2");
    expect(LOCAL_FILE_KEY).toBe("local:this-computer");
  });

  it("keeps five diary tabs and never adds Consult as a sixth", () => {
    expect(TABS.map((tab) => tab.label)).toEqual(["Tonight", "Morning", "Notes", "Library", "You"]);
    expect(readFileSync("src/lib/nav.ts", "utf8")).not.toMatch(/Consult/);
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).toContain("grid-cols-5");
    expect(readFileSync("src/components/bottom-nav.tsx", "utf8")).not.toContain("drop-shadow");
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
    expect(chat).toContain("xl:hidden");
    expect(chat).toContain("hidden w-[23.5rem]");
    expect(chat).toContain("xl:flex");
  });

  it("gives Tonight and the inner pages air under Ask, and hides the Mac install hint on a phone", () => {
    const tonight = readFileSync("src/components/tonight-view.tsx", "utf8");
    expect(tonight).toMatch(/safe-area-inset-(top|bottom)/);
    expect(tonight).toContain("size-[13.5rem]");
    expect(tonight).toContain("md:hidden");
    expect(readFileSync("src/components/install-hint.tsx", "utf8")).toContain("hidden");
    expect(readFileSync("src/components/install-hint.tsx", "utf8")).toContain("md:block");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain(
      "pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.4rem))]",
    );
    expect(readFileSync("src/components/library-view.tsx", "utf8")).toContain(
      "pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.4rem))]",
    );
    expect(readFileSync("src/components/insights-view.tsx", "utf8")).toContain(
      "pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.4rem))]",
    );
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
    expect(cap).not.toMatch(/server\s*:/);
    expect(JSON.parse(readFileSync("phone/ios/App/App/capacitor.config.json", "utf8"))).not.toHaveProperty("server");
    expect(phonePkg.description?.toLowerCase()).toMatch(/diary/);
    expect(phonePkg.description?.toLowerCase()).toMatch(/not the operator/);
    expect(phonePkg.dependencies?.["circadia-keychain"]).toBe("file:./plugins/circadia-keychain");
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
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["phone:sync"]).toContain("pack:static");
    expect(readFileSync("next.config.ts", "utf8")).toContain("turbopack: { root: repoRoot }");
    expect(readFileSync("next.config.ts", "utf8")).toContain("outputFileTracingRoot: repoRoot");
    expect(existsSync("src/app/mod/page.tsx")).toBe(true);
    expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain(".mod-parked");
  });

  it("put-on-phone opens Xcode for a real iPhone over USB or Wi-Fi, and refuses Linux", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["put-on-phone"]).toBe("bash scripts/put-on-phone.sh");
    const script = readFileSync("scripts/put-on-phone.sh", "utf8");
    expect(script).toContain("0.7.0");
    expect(script).toContain("phone:sync");
    expect(script).toContain("phone:open");
    expect(script).toContain("@capacitor/core");
    expect(script).toContain("npm install");
    expect(script).toContain("Not Operator");
    expect(script).toContain("Connect via network");
    expect(script).toContain("never needs a cable");
    expect(script).not.toContain("Circadia Operator");
    expect(script).not.toMatch(/live.?reload/i);
    const run = spawnSync("bash", ["scripts/put-on-phone.sh"], { encoding: "utf8" });
    expect(run.stdout).toContain("0.7.2");
    if (process.platform === "darwin") {
      expect([0, 5, 6]).toContain(run.status);
    } else {
      expect(run.status).toBe(4);
      expect(run.stdout).toContain("macOS");
    }
  });

  it("lets an empty iPhone bring a locked diary instead of pretending Mac login will find it", () => {
    const gate = readFileSync("src/components/auth-gate.tsx", "utf8");
    const bring = readFileSync("src/components/locked-diary-controls.tsx", "utf8");
    expect(gate).toContain("BringLockedDiaryButton");
    expect(gate).toContain("bring a locked copy");
    expect(gate).toContain('autoCapitalize="none"');
    expect(gate).toContain("AUTH_ERRORS.orphan");
    expect(gate).not.toContain('includes("Sign up")');
    expect(gate).toContain("The locked diary is on this device");
    expect(readFileSync("src/components/you-view.tsx", "utf8")).toContain("SaveLockedCopyButton");
    expect(bring).toContain("Bring a locked diary");
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
      "src/lib/login.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/this device/);
      expect(src, file).not.toMatch(/this computer|this laptop|this Mac/);
    }
  });
});
