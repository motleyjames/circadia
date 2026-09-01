"use strict";

/**
 * How Circadia signs the iPhone diary from the command line.
 *
 * Automatic signing needs an Apple ID in Xcode → Settings → Accounts.
 * A keychain certificate is not that. Passing DEVELOPMENT_TEAM from the
 * cert while Xcode has no account is how 0.7.7 died:
 * "No Account for Team" + no provisioning profile.
 *
 * If a development profile for app.circadia.diary already exists on this Mac
 * (from a previous Xcode Run), sign manually with it. No account lookup.
 * Otherwise automatic, but only with a team Xcode Accounts actually has.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { normalizeTeam, parseXcodeTeamsPlist, writeSigningXcconfig } = require("./ios-team.cjs");

const BUNDLE_ID = "app.circadia.diary";

function profileDirs(home = os.homedir()) {
  return [
    path.join(home, "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles"),
    path.join(home, "Library", "MobileDevice", "Provisioning Profiles"),
  ];
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12) return new Date(value);
    if (value > 1e9) return new Date(value * 1000);
    return new Date(Date.UTC(2001, 0, 1) + value * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function idsEqual(a, b) {
  return String(a || "").replace(/-/g, "").toUpperCase() === String(b || "").replace(/-/g, "").toUpperCase();
}

function appIdBundle(appId) {
  const m = String(appId || "").match(/^([A-Z0-9]{10})\.(.+)$/i);
  if (!m) return null;
  return { team: normalizeTeam(m[1]), bundle: m[2] };
}

function profileTeam(profile) {
  const ids = Array.isArray(profile?.TeamIdentifier) ? profile.TeamIdentifier : [];
  for (const id of ids) {
    const team = normalizeTeam(id);
    if (team) return team;
  }
  return appIdBundle(profile?.Entitlements?.["application-identifier"])?.team ?? null;
}

function profileMatches(profile, { bundleId = BUNDLE_ID, deviceId, now = new Date() } = {}) {
  if (!profile || typeof profile !== "object") return false;
  if (!profile.UUID) return false;
  const exp = asDate(profile.ExpirationDate);
  if (exp && exp.getTime() <= now.getTime()) return false;
  const entitlements = profile.Entitlements && typeof profile.Entitlements === "object" ? profile.Entitlements : {};
  if (entitlements["get-task-allow"] !== true) return false;
  const parsed = appIdBundle(entitlements["application-identifier"]);
  if (!parsed) return false;
  if (parsed.bundle !== "*" && parsed.bundle !== bundleId) return false;
  if (profile.ProvisionsAllDevices === true) return true;
  const devices = Array.isArray(profile.ProvisionedDevices) ? profile.ProvisionedDevices : [];
  return devices.some((id) => idsEqual(id, deviceId));
}

function pickProvisioningProfile(profiles, opts) {
  const hits = (Array.isArray(profiles) ? profiles : []).filter((row) => profileMatches(row, opts));
  if (!hits.length) return null;
  const exact = hits.filter((row) => appIdBundle(row.Entitlements?.["application-identifier"])?.bundle === (opts.bundleId || BUNDLE_ID));
  const pool = exact.length ? exact : hits;
  pool.sort((a, b) => (asDate(b.ExpirationDate)?.getTime() || 0) - (asDate(a.ExpirationDate)?.getTime() || 0));
  return pool[0];
}

function parseXcodeTeamIds(text) {
  const ids = [];
  for (const m of String(text || "").matchAll(/teamID\s*=\s*"?([A-Za-z0-9]{10})"?/gi)) {
    const team = normalizeTeam(m[1]);
    if (team && !ids.includes(team)) ids.push(team);
  }
  const first = parseXcodeTeamsPlist(text);
  if (first && !ids.includes(first)) ids.unshift(first);
  return ids;
}

function resolveSign({ profiles = [], accountTeams = [], bundleId = BUNDLE_ID, deviceId, now = new Date() } = {}) {
  const profile = pickProvisioningProfile(profiles, { bundleId, deviceId, now });
  if (profile) {
    const team = profileTeam(profile);
    if (team && profile.UUID) {
      return { style: "manual", team, profileUuid: profile.UUID, source: "profile" };
    }
  }
  const teams = (Array.isArray(accountTeams) ? accountTeams : []).map(normalizeTeam).filter(Boolean);
  if (teams.length) {
    return { style: "automatic", team: teams[0], source: "xcode-account" };
  }
  return null;
}

function decodeProvisionFile(file) {
  const cms = spawnSync("security", ["cms", "-D", "-i", file], { encoding: "utf8" });
  if (cms.status !== 0 || !cms.stdout) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "circadia-prov-"));
  try {
    const plistPath = path.join(tmp, "profile.plist");
    fs.writeFileSync(plistPath, cms.stdout);
    const json = spawnSync("plutil", ["-convert", "json", "-o", "-", plistPath], { encoding: "utf8" });
    if (json.status !== 0 || !json.stdout) return null;
    return JSON.parse(json.stdout);
  } catch {
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function loadProfiles(home = os.homedir()) {
  const profiles = [];
  for (const dir of profileDirs(home)) {
    if (!fs.existsSync(dir)) continue;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.(mobileprovision|provisionprofile)$/i.test(name)) continue;
      const decoded = decodeProvisionFile(path.join(dir, name));
      if (decoded) profiles.push(decoded);
    }
  }
  return profiles;
}

function loadAccountTeams() {
  const read = spawnSync("defaults", ["read", "com.apple.dt.Xcode", "IDEProvisioningTeams"], {
    encoding: "utf8",
  });
  if (read.status !== 0) return [];
  return parseXcodeTeamIds(`${read.stdout || ""}\n${read.stderr || ""}`);
}

function resolveSignForDevice({
  deviceId,
  bundleId = BUNDLE_ID,
  home = os.homedir(),
  now = new Date(),
  profiles,
  accountTeams,
  root,
} = {}) {
  const sign = resolveSign({
    profiles: profiles ?? (process.platform === "darwin" ? loadProfiles(home) : []),
    accountTeams: accountTeams ?? (process.platform === "darwin" ? loadAccountTeams() : []),
    bundleId,
    deviceId,
    now,
  });
  if (sign && root) writeSigningXcconfig(sign.team, root);
  return sign;
}

module.exports = {
  BUNDLE_ID,
  profileDirs,
  profileMatches,
  pickProvisioningProfile,
  parseXcodeTeamIds,
  resolveSign,
  resolveSignForDevice,
  loadProfiles,
  loadAccountTeams,
};
