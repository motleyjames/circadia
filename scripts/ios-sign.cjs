"use strict";

/**
 * How Circadia signs the iPhone diary from the command line.
 *
 * Automatic signing needs an Apple ID in Xcode → Settings → Accounts.
 * A keychain certificate is not that. Passing DEVELOPMENT_TEAM from the
 * cert while Xcode has no account is how 0.7.7 died:
 * "No Account for Team" + no provisioning profile.
 *
 * 0.7.8 only read IDEProvisioningTeams and only opened *.mobileprovision in
 * two folders. Xcode 16+/26 leaves that key empty, stores teams under
 * IDEProvisioningTeamByIdentifier, and may name leftover profiles by UUID
 * with no extension. 0.7.8 then exited 13 without ever calling xcodebuild.
 *
 * Order: leftover development profile for this iPhone → manual (no account
 * lookup). Else an Accounts team id → automatic with that team. Else a
 * signed-in Apple ID with no stored team id (Xcode 16+) → automatic-session
 * without a keychain team. Else refuse.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  normalizeTeam,
  collectTeamIdsFromPlistText,
  loadXcodeAccountTeams,
  loadHasXcodeAccount,
  writeSigningXcconfig,
} = require("./ios-team.cjs");

const BUNDLE_ID = "app.circadia.diary";
const MAX_PROFILE_BYTES = 2 * 1024 * 1024;

function profileDirs(home = os.homedir()) {
  const dirs = [
    path.join(home, "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles"),
    path.join(home, "Library", "MobileDevice", "Provisioning Profiles"),
  ];
  if (process.platform === "darwin") {
    dirs.push(path.join("/Library", "MobileDevice", "Provisioning Profiles"));
  }
  return dirs;
}

function derivedDataRoots(home = os.homedir(), repoRoot) {
  const roots = [];
  if (repoRoot) roots.push(path.join(repoRoot, "phone", "ios", "DerivedData"));
  roots.push(path.join(home, "Library", "Developer", "Xcode", "DerivedData"));
  roots.push(path.join(home, "Library", "Developer", "Xcode", "Archives"));
  return roots;
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

function isTruthyEntitlement(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function appIdBundle(appId) {
  const m = String(appId || "").match(/^([A-Z0-9]{10})\.(.+)$/i);
  if (!m) return null;
  return { team: normalizeTeam(m[1]), bundle: m[2] };
}

function entitlementsOf(profile) {
  const entitlements = profile?.Entitlements;
  return entitlements && typeof entitlements === "object" ? entitlements : {};
}

function applicationIdentifier(entitlements) {
  return entitlements["application-identifier"] || entitlements["com.apple.application-identifier"] || "";
}

function profileTeam(profile) {
  const raw = profile?.TeamIdentifier;
  const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const id of ids) {
    const team = normalizeTeam(id);
    if (team) return team;
  }
  return appIdBundle(applicationIdentifier(entitlementsOf(profile)))?.team ?? null;
}

function isProfileFilename(name) {
  const base = path.basename(String(name || ""));
  if (!base || base.startsWith(".")) return false;
  if (/^(embedded\.mobileprovision|embedded\.provisionprofile)$/i.test(base)) return true;
  if (/\.(mobileprovision|provisionprofile)$/i.test(base)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
  if (/^[0-9a-f]{32}$/i.test(base)) return true;
  return false;
}

function classifyProfile(profile, { bundleId = BUNDLE_ID, deviceId, now = new Date() } = {}) {
  if (!profile || typeof profile !== "object" || !profile.UUID) return "invalid";
  const entitlements = entitlementsOf(profile);
  if (!isTruthyEntitlement(entitlements["get-task-allow"])) return "distribution";
  const parsed = appIdBundle(applicationIdentifier(entitlements));
  if (!parsed || (parsed.bundle !== "*" && parsed.bundle !== bundleId)) return "other-bundle";
  const exp = asDate(profile.ExpirationDate);
  if (exp && exp.getTime() <= now.getTime()) return "expired";
  if (profile.ProvisionsAllDevices === true || profile.ProvisionsAllDevices === 1) return "match";
  const devices = Array.isArray(profile.ProvisionedDevices) ? profile.ProvisionedDevices : [];
  if (!devices.some((id) => idsEqual(id, deviceId))) return "other-device";
  return "match";
}

function profileMatches(profile, opts) {
  return classifyProfile(profile, opts) === "match";
}

function pickProvisioningProfile(profiles, opts) {
  const hits = (Array.isArray(profiles) ? profiles : []).filter((row) => profileMatches(row, opts));
  if (!hits.length) return null;
  const exact = hits.filter(
    (row) => appIdBundle(applicationIdentifier(entitlementsOf(row)))?.bundle === (opts.bundleId || BUNDLE_ID),
  );
  const pool = exact.length ? exact : hits;
  pool.sort((a, b) => (asDate(b.ExpirationDate)?.getTime() || 0) - (asDate(a.ExpirationDate)?.getTime() || 0));
  return pool[0];
}

function parseXcodeTeamIds(text) {
  return collectTeamIdsFromPlistText(text);
}

function diagnoseProfiles(profiles, opts) {
  const counts = {
    decoded: 0,
    match: 0,
    expired: 0,
    "other-device": 0,
    "other-bundle": 0,
    distribution: 0,
    invalid: 0,
  };
  for (const row of Array.isArray(profiles) ? profiles : []) {
    counts.decoded += 1;
    const kind = classifyProfile(row, opts);
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

function formatSignDiagnosis({
  scanned = 0,
  decodeFailed = 0,
  counts = {},
  accountTeams = [],
  hasXcodeAccount = false,
  ignoredKeychainTeam = false,
} = {}) {
  const teams = (Array.isArray(accountTeams) ? accountTeams : []).map(normalizeTeam).filter(Boolean);
  const lines = [
    `Leftover profiles: scanned ${scanned} files, decoded ${counts.decoded || 0}, usable for ${BUNDLE_ID} on this iPhone: ${counts.match || 0}.`,
    `  expired for this app: ${counts.expired || 0}; other iPhone: ${counts["other-device"] || 0}; other app: ${counts["other-bundle"] || 0}; distribution: ${counts.distribution || 0}; could not decode: ${decodeFailed}.`,
    `Xcode Accounts team ids: ${teams.length ? teams.join(", ") : "none"}.`,
    `Xcode Apple ID in Accounts: ${hasXcodeAccount || teams.length ? "yes" : "no"}.`,
  ];
  if (ignoredKeychainTeam) {
    lines.push("Did not pass a keychain-only team into automatic signing (that is how 0.7.7 died).");
  }
  return lines.join("\n");
}

function resolveSign({
  profiles = [],
  accountTeams = [],
  hasXcodeAccount = false,
  bundleId = BUNDLE_ID,
  deviceId,
  now = new Date(),
} = {}) {
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
  if (hasXcodeAccount) {
    return { style: "automatic-session", source: "xcode-session" };
  }
  return null;
}

function nextSignAfterSessionFailure(sign, fallbackTeam, log) {
  if (!sign || sign.style !== "automatic-session") return null;
  const team = normalizeTeam(fallbackTeam);
  if (!team) return null;
  const text = String(log || "");
  if (/No Account for Team/i.test(text)) return null;
  if (!/requires a development team/i.test(text)) return null;
  return { style: "automatic", team, source: "session-retry" };
}

function plistToObject(text) {
  const src = String(text || "").trim();
  if (!src) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "circadia-prov-"));
  try {
    const plistPath = path.join(tmp, "profile.plist");
    fs.writeFileSync(plistPath, src);
    const json = spawnSync("plutil", ["-convert", "json", "-o", "-", plistPath], { encoding: "utf8" });
    if (json.status !== 0 || !json.stdout) return null;
    return JSON.parse(json.stdout);
  } catch {
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function decodeProvisionFile(file) {
  const cms = spawnSync("security", ["cms", "-D", "-i", file], { encoding: "utf8" });
  if (cms.status === 0 && cms.stdout) {
    const decoded = plistToObject(cms.stdout);
    if (decoded) return decoded;
  }
  try {
    const raw = fs.readFileSync(file);
    if (raw.length === 0 || raw.length > MAX_PROFILE_BYTES) return null;
    const asText = raw.toString("utf8");
    if (asText.startsWith("<?xml") || asText.startsWith("bplist") || asText.includes("<plist")) {
      return plistToObject(asText);
    }
  } catch {
    return null;
  }
  return null;
}

function listDirFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function walkNamed(root, match, acc, { max = 80, depth = 0, maxDepth = 16 } = {}) {
  if (acc.length >= max || depth > maxDepth) return;
  if (!fs.existsSync(root)) return;
  for (const ent of listDirFiles(root)) {
    if (acc.length >= max) return;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walkNamed(full, match, acc, { max, depth: depth + 1, maxDepth });
    } else if (ent.isFile() && match.test(ent.name)) {
      acc.push(full);
    }
  }
}

function collectProfileFiles(home = os.homedir(), repoRoot) {
  const files = [];
  const seen = new Set();
  function add(file) {
    const resolved = path.resolve(file);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    files.push(resolved);
  }
  for (const dir of profileDirs(home)) {
    for (const ent of listDirFiles(dir)) {
      if (!ent.isFile() && !ent.isSymbolicLink()) continue;
      if (!isProfileFilename(ent.name)) continue;
      add(path.join(dir, ent.name));
    }
  }
  for (const root of derivedDataRoots(home, repoRoot)) {
    const found = [];
    walkNamed(root, /^(embedded\.mobileprovision|embedded\.provisionprofile)$/i, found, { max: 40 });
    for (const file of found) add(file);
  }
  return files;
}

function loadProfiles(home = os.homedir(), repoRoot) {
  const files = collectProfileFiles(home, repoRoot);
  const profiles = [];
  let decodeFailed = 0;
  for (const file of files) {
    if (process.platform !== "darwin") continue;
    const decoded = decodeProvisionFile(file);
    if (decoded) profiles.push(decoded);
    else decodeFailed += 1;
  }
  return { files, profiles, decodeFailed };
}

function resolveSignForDevice({
  deviceId,
  bundleId = BUNDLE_ID,
  home = os.homedir(),
  now = new Date(),
  profiles,
  accountTeams,
  hasXcodeAccount,
  root,
  env = process.env,
  scanned,
  decodeFailed,
} = {}) {
  const loaded = profiles
    ? { files: [], profiles, decodeFailed: decodeFailed ?? 0 }
    : process.platform === "darwin"
      ? loadProfiles(home, root)
      : { files: [], profiles: [], decodeFailed: 0 };
  const envTeam = normalizeTeam(env.CIRCADIA_DEVELOPMENT_TEAM);
  const teams = [...(accountTeams ?? (process.platform === "darwin" ? loadXcodeAccountTeams() : []))];
  if (envTeam && !teams.includes(envTeam)) teams.unshift(envTeam);
  const signedIn =
    hasXcodeAccount ??
    (teams.length > 0 || (process.platform === "darwin" && loadHasXcodeAccount()));
  const opts = { bundleId, deviceId, now };
  const sign = resolveSign({
    profiles: loaded.profiles,
    accountTeams: teams,
    hasXcodeAccount: signedIn,
    bundleId,
    deviceId,
    now,
  });
  const diagnosis = formatSignDiagnosis({
    scanned: scanned ?? loaded.files.length,
    decodeFailed: loaded.decodeFailed,
    counts: diagnoseProfiles(loaded.profiles, opts),
    accountTeams: teams,
    hasXcodeAccount: signedIn,
    ignoredKeychainTeam: !teams.length,
  });
  if (sign && sign.team && root) writeSigningXcconfig(sign.team, root);
  return { sign, diagnosis };
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
  loadAccountTeams: loadXcodeAccountTeams,
  classifyProfile,
  diagnoseProfiles,
  formatSignDiagnosis,
  isProfileFilename,
  collectProfileFiles,
  isTruthyEntitlement,
  nextSignAfterSessionFailure,
};

if (require.main === module) {
  const deviceFlag = process.argv.indexOf("--device");
  const deviceId = deviceFlag !== -1 ? process.argv[deviceFlag + 1] : "";
  const { sign, diagnosis } = resolveSignForDevice({
    deviceId: deviceId || "unknown",
    root: path.join(__dirname, ".."),
  });
  console.error(diagnosis);
  if (!sign) process.exit(13);
  console.log(JSON.stringify(sign));
}
