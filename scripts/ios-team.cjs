"use strict";

/**
 * Find an Apple Development team on this Mac and keep it out of git.
 *
 * GitHub's Xcode project has no DEVELOPMENT_TEAM on purpose — James's team
 * is not Circadia's to commit. Opening Xcode to pick Team writes it into
 * project.pbxproj, which `git restore` / `git pull` then wipes. That is the
 * loop. The Team ID already lives on the Apple Development certificate in
 * the keychain (any Mac that has Run an app on a phone has one).
 *
 * Writes phone/ios/signing.xcconfig (gitignored) and ensures debug.xcconfig
 * includes it. put-on-phone also passes DEVELOPMENT_TEAM to xcodebuild.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TEAM_RE = /^[A-Z0-9]{10}$/;

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
  const ids = [...String(text || "").matchAll(/teamID\s*=\s*"?([A-Za-z0-9]{10})"?/gi)];
  for (const m of ids) {
    const team = normalizeTeam(m[1]);
    if (team) return team;
  }
  return null;
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

function teamFromXcodeDefaults() {
  const read = spawnSync("defaults", ["read", "com.apple.dt.Xcode", "IDEProvisioningTeams"], {
    encoding: "utf8",
  });
  if (read.status !== 0) return null;
  return parseXcodeTeamsPlist(`${read.stdout || ""}\n${read.stderr || ""}`);
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
  normalizeTeam,
  parseCodesignIdentities,
  teamFromCertificateSubject,
  parseXcodeTeamsPlist,
  readTeamFromXcconfig,
  readTeamFromPbxproj,
  signingXcconfigContents,
  writeSigningXcconfig,
  ensureDebugInclude,
  discoverTeam,
  resolveAndPersistTeam,
  signingXcconfigPath,
};

if (require.main === module) {
  const hit = resolveAndPersistTeam();
  if (!hit) {
    console.error("No Apple Development team on this Mac.");
    console.error("Xcode → Settings → Accounts → your Apple ID. That creates a development certificate.");
    console.error("Then run npm run put-on-phone again. Do not press Run. Do not use Any iOS Device.");
    process.exit(12);
  }
  console.error(`Signing team from ${hit.source} (kept on this Mac, not in git).`);
  console.log(hit.team);
}
