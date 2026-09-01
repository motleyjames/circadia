"use strict";

/**
 * Find an Apple Development team on this Mac and keep it out of git.
 *
 * GitHub's Xcode project has no DEVELOPMENT_TEAM on purpose — James's team
 * is not Circadia's to commit. Opening Xcode to pick Team writes it into
 * project.pbxproj, which `git restore` / `git pull` then wipes. That is the
 * loop.
 *
 * A keychain certificate is not an Xcode Accounts session. 0.7.7 passed the
 * keychain team into automatic signing and died with "No Account for Team".
 * This file may still *record* a keychain team in the gitignored xcconfig
 * for the GUI. ios-sign must not treat that as an Accounts team.
 *
 * Xcode 16+/26 often leaves IDEProvisioningTeams empty. Team ids live in
 * IDEProvisioningTeamByIdentifier / IDEProvisioningTeamIdentifiers instead.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TEAM_RE = /^[A-Z0-9]{10}$/;

const XCODE_TEAM_KEYS = [
  "IDEProvisioningTeamByIdentifier",
  "IDEProvisioningTeams",
  "IDEProvisioningTeamIdentifiers",
  "IDELastSelectedProvisioningTeam",
];

function repoRoot() {
  return path.join(__dirname, "..");
}

function signingXcconfigPath(root = repoRoot()) {
  return path.join(root, "phone", "ios", "signing.xcconfig");
}

function debugXcconfigPath(root = repoRoot()) {
  return path.join(root, "phone", "ios", "debug.xcconfig");
}

function pbxprojPath(root = repoRoot()) {
  return path.join(root, "phone", "ios", "App", "App.xcodeproj", "project.pbxproj");
}

function normalizeTeam(value) {
  const team = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return TEAM_RE.test(team) ? team : null;
}

function readTeamFromXcconfig(src) {
  const m = String(src || "").match(/^\s*DEVELOPMENT_TEAM\s*=\s*([A-Za-z0-9]+)\s*$/m);
  return normalizeTeam(m?.[1]);
}

function readTeamFromPbxproj(src) {
  const matches = [...String(src || "").matchAll(/DEVELOPMENT_TEAM\s*=\s*([A-Za-z0-9]+)\s*;/g)];
  for (const m of matches) {
    const team = normalizeTeam(m[1]);
    if (team) return team;
  }
  return null;
}

function parseCodesignIdentities(text) {
  const found = [];
  for (const line of String(text || "").split("\n")) {
    if (/CSSMERR|expired/i.test(line)) continue;
    const development = line.match(/Apple Development:[^"]*\(([A-Za-z0-9]{10})\)/i);
    if (development) {
      const team = normalizeTeam(development[1]);
      if (team) found.push({ team, kind: "development" });
      continue;
    }
    const legacy = line.match(/iPhone Developer:[^"]*\(([A-Za-z0-9]{10})\)/i);
    if (legacy) {
      const team = normalizeTeam(legacy[1]);
      if (team) found.push({ team, kind: "iphone-developer" });
    }
  }
  const preferred = found.find((row) => row.kind === "development") || found[0];
  return preferred?.team ?? null;
}

function teamFromCertificateSubject(subject) {
  const text = String(subject || "");
  const ou =
    text.match(/(?:^|[,/])\s*OU\s*=\s*([A-Za-z0-9]{10})(?:\s*[,/]|$)/i) ||
    text.match(/\/OU=([A-Za-z0-9]{10})(?:\/|$)/);
  return normalizeTeam(ou?.[1]);
}

function parseXcodeTeamsPlist(text) {
  const ids = collectTeamIdsFromPlistText(text);
  return ids[0] ?? null;
}

function collectTeamIdsFromPlistText(text) {
  const ids = [];
  function add(value) {
    const team = normalizeTeam(value);
    if (team && !ids.includes(team)) ids.push(team);
  }
  const src = String(text || "");
  if (!src.trim() || /does not exist/i.test(src)) return ids;
  for (const m of src.matchAll(/teamID\s*=\s*"?([A-Za-z0-9]{10})"?/gi)) add(m[1]);
  // IDEProvisioningTeamIdentifiers is a bare list of 10-char ids, no teamID=.
  if (!ids.length) {
    for (const m of src.matchAll(/\b([A-Z0-9]{10})\b/g)) add(m[1]);
  }
  return ids;
}

function hasXcodeAccountFromText(text) {
  const src = String(text || "");
  if (!src.trim() || /does not exist/i.test(src)) return false;
  return /\bidentifier\s*=/i.test(src);
}

function signingXcconfigContents(team) {
  return `// Written by scripts/ios-team.cjs. Gitignored — not Circadia's Team.
DEVELOPMENT_TEAM = ${team}
CODE_SIGN_STYLE = Automatic
`;
}

function ensureDebugInclude(root = repoRoot()) {
  const file = debugXcconfigPath(root);
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("signing.xcconfig")) return;
  const next = `${src.replace(/\s*$/, "")}\n#include? "signing.xcconfig"\n`;
  fs.writeFileSync(file, next);
}

function writeSigningXcconfig(team, root = repoRoot()) {
  const normalized = normalizeTeam(team);
  if (!normalized) return null;
  const iosDir = path.join(root, "phone", "ios");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.writeFileSync(signingXcconfigPath(root), signingXcconfigContents(normalized));
  ensureDebugInclude(root);
  return normalized;
}

function teamFromSecurityIdentities() {
  const listed = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
  });
  return parseCodesignIdentities(`${listed.stdout || ""}\n${listed.stderr || ""}`);
}

function teamFromDevelopmentCertificate() {
  const pem = spawnSync("security", ["find-certificate", "-c", "Apple Development", "-p"], {
    encoding: "utf8",
  });
  if (pem.status !== 0 || !pem.stdout) return null;
  const subject = spawnSync("openssl", ["x509", "-noout", "-subject"], {
    encoding: "utf8",
    input: pem.stdout,
  });
  return teamFromCertificateSubject(`${subject.stdout || ""}\n${subject.stderr || ""}`);
}

function readXcodeDefaultsKey(key) {
  const read = spawnSync("defaults", ["read", "com.apple.dt.Xcode", key], {
    encoding: "utf8",
  });
  return `${read.stdout || ""}\n${read.stderr || ""}`;
}

function loadXcodeAccountTeams() {
  if (process.platform !== "darwin") return [];
  const ids = [];
  for (const key of XCODE_TEAM_KEYS) {
    const text = readXcodeDefaultsKey(key);
    for (const id of collectTeamIdsFromPlistText(text)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function loadHasXcodeAccount() {
  if (process.platform !== "darwin") return false;
  return hasXcodeAccountFromText(readXcodeDefaultsKey("DVTDeveloperAccountManagerAppleIDLists"));
}

function teamFromXcodeDefaults() {
  return loadXcodeAccountTeams()[0] ?? null;
}

function discoverTeam(root = repoRoot(), env = process.env) {
  const fromEnv = normalizeTeam(env.CIRCADIA_DEVELOPMENT_TEAM);
  if (fromEnv) return { team: fromEnv, source: "env" };

  if (process.platform === "darwin") {
    const fromXcode = teamFromXcodeDefaults();
    if (fromXcode) return { team: fromXcode, source: "xcode" };
  }

  try {
    const fromFile = readTeamFromXcconfig(fs.readFileSync(signingXcconfigPath(root), "utf8"));
    if (fromFile) return { team: fromFile, source: "xcconfig" };
  } catch {
    /* first run on this clone */
  }

  try {
    const fromPbx = readTeamFromPbxproj(fs.readFileSync(pbxprojPath(root), "utf8"));
    if (fromPbx) return { team: fromPbx, source: "pbxproj" };
  } catch {
    /* project missing */
  }

  if (env.CIRCADIA_TEAM_IDENTITIES) {
    const fromFixture = parseCodesignIdentities(env.CIRCADIA_TEAM_IDENTITIES);
    if (fromFixture) return { team: fromFixture, source: "identities" };
  }

  if (process.platform === "darwin") {
    const fromIdentities = teamFromSecurityIdentities();
    if (fromIdentities) return { team: fromIdentities, source: "keychain" };
    const fromCert = teamFromDevelopmentCertificate();
    if (fromCert) return { team: fromCert, source: "certificate" };
  }

  return null;
}

function resolveAndPersistTeam(root = repoRoot(), env = process.env) {
  const hit = discoverTeam(root, env);
  if (!hit) return null;
  writeSigningXcconfig(hit.team, root);
  return hit;
}

module.exports = {
  TEAM_RE,
  XCODE_TEAM_KEYS,
  normalizeTeam,
  parseCodesignIdentities,
  teamFromCertificateSubject,
  parseXcodeTeamsPlist,
  collectTeamIdsFromPlistText,
  hasXcodeAccountFromText,
  readTeamFromXcconfig,
  readTeamFromPbxproj,
  signingXcconfigContents,
  writeSigningXcconfig,
  ensureDebugInclude,
  discoverTeam,
  resolveAndPersistTeam,
  signingXcconfigPath,
  loadXcodeAccountTeams,
  loadHasXcodeAccount,
};

if (require.main === module) {
  const hit = resolveAndPersistTeam();
  if (hit) {
    console.error(`Signing team from ${hit.source} (kept on this Mac, not in git).`);
    if (hit.source === "keychain" || hit.source === "certificate" || hit.source === "xcconfig") {
      console.error("That id is not used for automatic signing unless Xcode Accounts also has it.");
    }
    console.log(hit.team);
    process.exit(0);
  }
  if (loadHasXcodeAccount()) {
    console.error("Xcode Accounts has an Apple ID, but no Team ID is stored yet (common on Xcode 16+).");
    console.error("Install will sign with that session, not a keychain-only team.");
    process.exit(0);
  }
  console.error("No Apple Development team on this Mac.");
  console.error("Xcode → Settings → Accounts → your Apple ID. That creates a development certificate.");
  console.error("Then run npm run put-on-phone again. Do not press Run. Do not use Any iOS Device.");
  process.exit(12);
}
