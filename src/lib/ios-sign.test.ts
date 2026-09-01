import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const sign = require("../../scripts/ios-sign.cjs") as {
  BUNDLE_ID: string;
  profileMatches: (profile: unknown, opts: { bundleId?: string; deviceId: string; now?: Date }) => boolean;
  resolveSign: (input: {
    profiles?: unknown[];
    accountTeams?: string[];
    bundleId?: string;
    deviceId: string;
    now?: Date;
  }) => { style: string; team: string; profileUuid?: string; source: string } | null;
};
const install = require("../../scripts/ios-install.cjs") as {
  xcodebuildArgs: (input: {
    sign: { style: string; team: string; profileUuid?: string };
    targetId: string;
    derivedDataPath: string;
  }) => string[];
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

  it("skips expired and distribution profiles", () => {
    expect(
      sign.profileMatches(developmentProfile({ ExpirationDate: "2020-01-01T00:00:00Z" }), { deviceId: DEVICE, now }),
    ).toBe(false);
    expect(
      sign.profileMatches(
        developmentProfile({
          Entitlements: {
            "application-identifier": `${TEAM}.app.circadia.diary`,
            "get-task-allow": false,
          },
        }),
        { deviceId: DEVICE, now },
      ),
    ).toBe(false);
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
  });
});
