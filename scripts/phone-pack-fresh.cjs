"use strict";

/**
 * Skip the Next.js + cap sync rebuild when the iPhone pack already matches
 * this commit, this Circadia version, and the locked Mac diary.
 * A failed install used to cost another two-minute pack.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pickVault } = require("./pack-mac-diary.cjs");

const STAMP_REL = path.join("phone", "ios", ".pack-stamp");

function repoRoot() {
  return path.join(__dirname, "..");
}

function stampPath(root) {
  return path.join(root, STAMP_REL);
}

function appVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
}

function gitHead(root) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout || "").trim() : "";
}

function vaultFingerprint(root) {
  const hit = pickVault(root);
  if (!hit) return "empty";
  return crypto.createHash("sha256").update(JSON.stringify({ files: hit.files, locks: hit.locks })).digest("hex");
}

function packedIndex(root) {
  const index = path.join(root, "phone", "ios", "App", "App", "public", "index.html");
  if (!fs.existsSync(index)) return false;
  return fs.readFileSync(index, "utf8").includes('__CIRCADIA_PACK_STATUS__="packed"');
}

function currentStamp(root) {
  return {
    gitHead: gitHead(root),
    version: appVersion(root),
    vaultFingerprint: vaultFingerprint(root),
  };
}

function readStamp(root) {
  try {
    return JSON.parse(fs.readFileSync(stampPath(root), "utf8"));
  } catch {
    return null;
  }
}

function stampsEqual(a, b) {
  return Boolean(
    a &&
      b &&
      a.gitHead &&
      a.version &&
      a.vaultFingerprint &&
      a.gitHead === b.gitHead &&
      a.version === b.version &&
      a.vaultFingerprint === b.vaultFingerprint,
  );
}

function isFresh(
  root = repoRoot(),
  { force, packed, stamp, current } = {},
) {
  const forced = force ?? process.env.CIRCADIA_FORCE_PHONE_SYNC;
  if (forced === "1") return false;
  if (!(packed ?? packedIndex(root))) return false;
  return stampsEqual(stamp ?? readStamp(root), current ?? currentStamp(root));
}

function writeStamp(root = repoRoot()) {
  const stamp = currentStamp(root);
  fs.mkdirSync(path.dirname(stampPath(root)), { recursive: true });
  fs.writeFileSync(stampPath(root), `${JSON.stringify(stamp)}\n`);
  return stamp;
}

module.exports = {
  STAMP_REL,
  isFresh,
  writeStamp,
  currentStamp,
  packedIndex,
  stampsEqual,
  vaultFingerprint,
};

if (require.main === module) {
  const root = repoRoot();
  if (process.argv.includes("--write")) {
    if (!packedIndex(root)) process.exit(1);
    writeStamp(root);
    process.exit(0);
  }
  process.exit(isFresh(root) ? 0 : 1);
}
