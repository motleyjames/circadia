import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const sign = require("../../scripts/ios-sign.cjs") as {
  BUNDLE_ID: string;
  profileMatches: (profile: unknown, opts: { bundleId?: string; deviceId: string; now?: Date }) => boolean;
  classifyProfile: (profile: unknown, opts: { bundleId?: string; deviceId: string; now?: Date }) => string;
  resolveSign: (input: {
    profiles?: unknown[];
    accountTeams?: string[];
    hasXcodeAccount?: boolean;
    bundleId?: string;
    deviceId: string;
    now?: Date;
  }) => { style: string; team?: string; profileUuid?: string; source: string } | null;
  parseXcodeTeamIds: (text: string) => string[];
  diagnoseProfiles: (
    profiles: unknown[],
    opts: { deviceId: string; now?: Date },
  ) => Record<string, number>;
  formatSignDiagnosis: (input: Record<string, unknown>) => string;
  isProfileFilename: (name: string) => boolean;
  isTruthyEntitlement: (value: unknown) => boolean;
  collectProfileFiles: (home: string, repoRoot?: string) => string[];
  nextSignAfterSessionFailure: (
    sign: { style: string } | null,
    fallbackTeam: string | null,
    log: string,
  ) => { style: string; team: string; source: string } | null;
  resolveSignForDevice: (input: {
    deviceId: string;
    now?: Date;
    profiles?: unknown[];
    accountTeams?: string[];
    hasXcodeAccount?: boolean;
    env?: { CIRCADIA_DEVELOPMENT_TEAM?: string };
  }) => { sign: { style: string; team?: string; source: string } | null; diagnosis: string };
};
const install = require("../../scripts/ios-install.cjs") as {
  xcodebuildArgs: (input: {
    sign: { style: string; team?: string; profileUuid?: string; source?: string };
    targetId: string;
    derivedDataPath: string;
    generic?: boolean;
  }) => string[];
  explainXcodebuildFailure: (text: string) => string | null;
  destinationMissing: (text: string) => boolean;
  parseCli: (argv: string[]) => { targetId: string; fallbackTeam: string | null; coreDeviceId: string };
  installOnDevice: (input: { targetId: string; sign?: { style: string } }) => number;
  deployApp: (opts: {
    app: string;
    targetId: string;
    coreDeviceId?: string;
    root?: string;
    nativeRun?: string | null;
    waitMs?: number;
    spawn: (cmd: string, args: string[]) => { status: number; stdout?: string; stderr?: string };
    log?: (line: string) => void;
  }) => number;
};

const TEAM = "A1B2C3D4E5";
const DEVICE = "00008140-001201901A93001C";
const now = new Date("2026-09-01T00:00:00Z");

function developmentProfile(overrides: Record<string, unknown> = {}) {
  return {
    UUID: "profile-uuid",
    TeamIdentifier: [TEAM],
    ExpirationDate: "2026-12-01T00:00:00Z",
    ProvisionedDevices: [DEVICE],
    Entitlements: {
      "application-identifier": `${TEAM}.app.circadia.diary`,
      "get-task-allow": true,
    },
    ...overrides,
  };
}

describe("ios-sign", () => {
  it("uses a leftover development profile for this iPhone instead of Xcode Accounts", () => {
    const profile = developmentProfile();
    expect(sign.profileMatches(profile, { deviceId: DEVICE, now })).toBe(true);
    expect(sign.profileMatches(profile, { deviceId: "other", now })).toBe(false);
    const decided = sign.resolveSign({ profiles: [profile], accountTeams: [], deviceId: DEVICE, now });
    expect(decided).toEqual({
      style: "manual",
      team: TEAM,
      profileUuid: "profile-uuid",
      source: "profile",
    });
  });

  it("accepts get-task-allow 1, hyphenless UDIDs, wildcard app ids, and TeamIdentifier as a string", () => {
    expect(sign.isTruthyEntitlement(1)).toBe(true);
    expect(sign.isTruthyEntitlement("true")).toBe(true);
    expect(sign.isTruthyEntitlement(false)).toBe(false);
    const profile = developmentProfile({
      TeamIdentifier: TEAM,
      ProvisionedDevices: [DEVICE.replace(/-/g, "")],
      Entitlements: {
        "com.apple.application-identifier": `${TEAM}.*`,
        "get-task-allow": 1,
      },
    });
    expect(sign.profileMatches(profile, { deviceId: DEVICE, now })).toBe(true);
    const decided = sign.resolveSign({ profiles: [profile], accountTeams: [], deviceId: DEVICE, now });
    expect(decided?.style).toBe("manual");
    expect(decided?.team).toBe(TEAM);
  });

  it("skips expired and distribution profiles but counts expired Circadia profiles", () => {
    const expired = developmentProfile({ ExpirationDate: "2020-01-01T00:00:00Z" });
    const distro = developmentProfile({
      Entitlements: {
        "application-identifier": `${TEAM}.app.circadia.diary`,
        "get-task-allow": false,
      },
    });
    expect(sign.profileMatches(expired, { deviceId: DEVICE, now })).toBe(false);
    expect(sign.profileMatches(distro, { deviceId: DEVICE, now })).toBe(false);
    expect(sign.classifyProfile(expired, { deviceId: DEVICE, now })).toBe("expired");
    expect(sign.classifyProfile(distro, { deviceId: DEVICE, now })).toBe("distribution");
    const counts = sign.diagnoseProfiles([expired, distro], { deviceId: DEVICE, now });
    expect(counts.expired).toBe(1);
    expect(counts.distribution).toBe(1);
    expect(counts.match).toBe(0);
  });

  it("falls back to Xcode Accounts only when no profile matches", () => {
    const decided = sign.resolveSign({
      profiles: [],
      accountTeams: [TEAM],
      deviceId: DEVICE,
      now,
    });
    expect(decided).toEqual({ style: "automatic", team: TEAM, source: "xcode-account" });
    expect(sign.resolveSign({ profiles: [], accountTeams: [], deviceId: DEVICE, now })).toBeNull();
  });

  it("uses a signed-in Xcode 16 session when Accounts has an Apple ID but no team id", () => {
    const decided = sign.resolveSign({
      profiles: [],
      accountTeams: [],
      hasXcodeAccount: true,
      deviceId: DEVICE,
      now,
    });
    expect(decided).toEqual({ style: "automatic-session", source: "xcode-session" });
    expect(decided).not.toHaveProperty("team");
  });

  it("never promotes a keychain-only team into automatic signing", () => {
    expect(
      sign.resolveSign({
        profiles: [],
        accountTeams: [],
        hasXcodeAccount: false,
        deviceId: DEVICE,
        now,
      }),
    ).toBeNull();
  });

  it("prefers a leftover profile over an Accounts team", () => {
    const decided = sign.resolveSign({
      profiles: [developmentProfile()],
      accountTeams: ["ZZZZZZZZZZ"],
      hasXcodeAccount: true,
      deviceId: DEVICE,
      now,
    });
    expect(decided?.style).toBe("manual");
    expect(decided?.team).toBe(TEAM);
  });

  it("reads Xcode 16 team keys, not only IDEProvisioningTeams", () => {
    const byIdentifier = `{
        "ACCT-UUID" = (
            {
                teamID = ${TEAM};
                teamName = "James Motley";
                isFreeProvisioningTeam = 1;
            }
        );
    }`;
    const identifiers = `(\n    ${TEAM}\n)`;
    expect(sign.parseXcodeTeamIds(byIdentifier)).toEqual([TEAM]);
    expect(sign.parseXcodeTeamIds(identifiers)).toEqual([TEAM]);
    expect(sign.parseXcodeTeamIds("The domain/default pair of (com.apple.dt.Xcode, IDEProvisioningTeams) does not exist")).toEqual(
      [],
    );
  });

  it("names UUID files and embedded.mobileprovision as leftover profiles", () => {
    expect(sign.isProfileFilename("9C1E2B0A-1111-2222-3333-444444444444")).toBe(true);
    expect(sign.isProfileFilename("9c1e2b0a111122223333444444444444")).toBe(true);
    expect(sign.isProfileFilename("embedded.mobileprovision")).toBe(true);
    expect(sign.isProfileFilename("foo.mobileprovision")).toBe(true);
    expect(sign.isProfileFilename(".DS_Store")).toBe(false);
    expect(sign.isProfileFilename("notes.txt")).toBe(false);
  });

  it("walks UserData, MobileDevice, and DerivedData for leftover profiles", () => {
    const home = mkdtempSync(join(tmpdir(), "circadia-profiles-"));
    const repo = mkdtempSync(join(tmpdir(), "circadia-repo-"));
    const userData = join(home, "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles");
    const mobile = join(home, "Library", "MobileDevice", "Provisioning Profiles");
    const derived = join(
      home,
      "Library",
      "Developer",
      "Xcode",
      "DerivedData",
      "App-abc",
      "Build",
      "Products",
      "Debug-iphoneos",
      "App.app",
    );
    const localDerived = join(repo, "phone", "ios", "DerivedData", DEVICE, "Build", "Products", "Debug-iphoneos", "App.app");
    mkdirSync(userData, { recursive: true });
    mkdirSync(mobile, { recursive: true });
    mkdirSync(derived, { recursive: true });
    mkdirSync(localDerived, { recursive: true });
    const uuidFile = join(userData, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const named = join(mobile, "circadia.mobileprovision");
    const embedded = join(derived, "embedded.mobileprovision");
    const localEmbedded = join(localDerived, "embedded.mobileprovision");
    writeFileSync(uuidFile, "x");
    writeFileSync(named, "x");
    writeFileSync(embedded, "x");
    writeFileSync(localEmbedded, "x");
    writeFileSync(join(userData, ".DS_Store"), "x");
    const found = sign.collectProfileFiles(home, repo);
    expect(found).toEqual(expect.arrayContaining([uuidFile, named, embedded, localEmbedded]));
    expect(found.some((file) => file.endsWith(".DS_Store"))).toBe(false);
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  it("prints diagnosis without emails, vault paths, or a keychain-as-account lie", () => {
    const expired = developmentProfile({ ExpirationDate: "2020-01-01T00:00:00Z" });
    const text = sign.formatSignDiagnosis({
      scanned: 4,
      decodeFailed: 1,
      counts: sign.diagnoseProfiles([expired], { deviceId: DEVICE, now }),
      accountTeams: [],
      hasXcodeAccount: false,
      ignoredKeychainTeam: true,
    });
    expect(text).toContain("scanned 4 files");
    expect(text).toContain("expired for this app: 1");
    expect(text).toContain("Xcode Accounts team ids: none");
    expect(text).toContain("Xcode Apple ID in Accounts: no");
    expect(text).toContain("keychain-only team");
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/vault\.json/);
    expect(text).not.toMatch(/this computer/i);
  });

  it("treats CIRCADIA_DEVELOPMENT_TEAM as an explicit override, not a silent keychain fallback", () => {
    const { sign: decided } = sign.resolveSignForDevice({
      deviceId: DEVICE,
      now,
      profiles: [],
      accountTeams: [],
      hasXcodeAccount: false,
      env: { CIRCADIA_DEVELOPMENT_TEAM: TEAM },
    });
    expect(decided).toEqual({ style: "automatic", team: TEAM, source: "xcode-account" });
  });

  it("retries automatic signing once when a signed-in Xcode 16 session has no team id", () => {
    const session = { style: "automatic-session" as const, source: "xcode-session" };
    expect(
      sign.nextSignAfterSessionFailure(session, TEAM, `Signing for "App" requires a development team.`),
    ).toEqual({ style: "automatic", team: TEAM, source: "session-retry" });
    expect(sign.nextSignAfterSessionFailure(session, TEAM, `No Account for Team "${TEAM}"`)).toBeNull();
    expect(sign.nextSignAfterSessionFailure({ style: "manual" }, TEAM, `requires a development team`)).toBeNull();
    expect(sign.nextSignAfterSessionFailure(session, null, `requires a development team`)).toBeNull();
  });
});

describe("ios-install signing args", () => {
  it("manual signing does not ask Xcode Accounts for a profile", () => {
    const args = install.xcodebuildArgs({
      sign: { style: "manual", team: TEAM, profileUuid: "profile-uuid" },
      targetId: DEVICE,
      derivedDataPath: "/tmp/derived",
    });
    expect(args).toContain("CODE_SIGN_STYLE=Manual");
    expect(args).toContain("PROVISIONING_PROFILE=profile-uuid");
    expect(args).toContain(`DEVELOPMENT_TEAM=${TEAM}`);
    expect(args).not.toContain("-allowProvisioningUpdates");
    expect(args.join(" ")).not.toMatch(/live.?reload/i);
    expect(args.join(" ")).not.toMatch(/Any iOS Device/);
    expect(args).toContain(`platform=iOS,id=${DEVICE}`);
  });

  it("automatic signing is only the Accounts path", () => {
    const args = install.xcodebuildArgs({
      sign: { style: "automatic", team: TEAM },
      targetId: DEVICE,
      derivedDataPath: "/tmp/derived",
    });
    expect(args).toContain("CODE_SIGN_STYLE=Automatic");
    expect(args).toContain("-allowProvisioningUpdates");
    expect(args).toContain("CODE_SIGN_IDENTITY=Apple Development");
    expect(args).toContain(`DEVELOPMENT_TEAM=${TEAM}`);
  });

  it("clears a leftover xcconfig team when signing with an Xcode 16 session", () => {
    const args = install.xcodebuildArgs({
      sign: { style: "automatic-session", source: "xcode-session" },
      targetId: DEVICE,
      derivedDataPath: "/tmp/derived",
    });
    expect(args).toContain("DEVELOPMENT_TEAM=");
    expect(args.some((arg) => /^DEVELOPMENT_TEAM=.+$/.test(arg))).toBe(false);
    expect(args).toContain("-allowProvisioningUpdates");
    expect(args).toContain("CODE_SIGN_STYLE=Automatic");
    expect(args.join(" ")).not.toMatch(/Any iOS Device/);
  });

  it("does not blame USB when Apple rejects a team", () => {
    const text = install.explainXcodebuildFailure(`No Account for Team "${TEAM}".`);
    expect(text).toMatch(/Accounts session/i);
    expect(text).not.toMatch(/USB|unplug|live-reload/i);
  });

  it("reads --fallback-team for the one session retry, not as the first automatic team", () => {
    expect(install.parseCli(["node", "ios-install.cjs", "--target", DEVICE, "--fallback-team", TEAM])).toEqual({
      targetId: DEVICE,
      fallbackTeam: TEAM,
      coreDeviceId: "",
    });
    expect(install.parseCli(["node", "ios-install.cjs", "--target", DEVICE]).fallbackTeam).toBeNull();
    expect(
      install.parseCli([
        "node",
        "ios-install.cjs",
        "--target",
        DEVICE,
        "--core-device",
        "3BF49769-5494-56B1-8F32-F329DC6F058F",
      ]).coreDeviceId,
    ).toBe("3BF49769-5494-56B1-8F32-F329DC6F058F");
  });

  it("compiles generic iOS without saying Any iOS Device, and refuses a CoreDevice UUID", () => {
    const args = install.xcodebuildArgs({
      sign: { style: "manual", team: TEAM, profileUuid: "profile-uuid" },
      targetId: DEVICE,
      derivedDataPath: "/tmp/derived",
      generic: true,
    });
    expect(args).toContain("generic/platform=iOS");
    expect(args.join(" ")).not.toMatch(/Any iOS Device/);
    expect(args).not.toContain(`platform=iOS,id=${DEVICE}`);
    expect(
      install.destinationMissing(
        "xcodebuild: error: Unable to find a destination matching the provided destination specifier",
      ),
    ).toBe(true);
    expect(install.installOnDevice({ targetId: "3BF49769-5494-56B1-8F32-F329DC6F058F", sign: { style: "manual" } })).toBe(
      11,
    );
  });

  it("tries Apple's installer with the hardware UDID before the CoreDevice UUID", () => {
    const devices: string[] = [];
    const logs: string[] = [];
    const status = install.deployApp({
      app: "/tmp/Circadia.app",
      targetId: DEVICE,
      coreDeviceId: "3BF49769-5494-56B1-8F32-F329DC6F058F",
      root: "/tmp",
      nativeRun: null,
      waitMs: 0,
      log: (line) => logs.push(line),
      spawn: (_cmd, args) => {
        const i = args.indexOf("--device");
        if (i >= 0) devices.push(String(args[i + 1]));
        return {
          status: 1,
          stdout: "",
          stderr:
            "CoreDeviceService was unable to locate a device matching the requested device identifier",
        };
      },
    });
    expect(devices[0]).toBe(DEVICE);
    expect(devices[1]).toBe("3BF49769-5494-56B1-8F32-F329DC6F058F");
    expect(logs.join("\n")).toMatch(/Trying Apple's installer with the hardware UDID|Installing with Apple's installer/);
    expect(logs.join("\n")).toMatch(/Install did not finish|CoreDevice still cannot see James-iPhone/);
    expect(status).toBe(1);
  });
});
