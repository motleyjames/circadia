"use strict";

/**
 * After Dock pull, recompile launcher.swift into the installed .app when the
 * source hash changes. Next start uses the new binary. This process still has
 * the old window — scheduleRelaunch opens a replacement and exits.
 *
 * Linux / missing .app / missing swiftc → skip. Never bake a launch token into Next.
 */

const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { compileSwift } = require("./native-bundle.cjs");

const STAMP_NAME = "launcher.swift.sha256";

function hashFile(file) {
  if (!fs.existsSync(file)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stampPath(dest) {
  return path.join(dest, "Contents", "Resources", STAMP_NAME);
}

function readStamp(dest) {
  const file = stampPath(dest);
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8").trim();
}

function writeStamp(dest, hash) {
  const resources = path.join(dest, "Contents", "Resources");
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(stampPath(dest), `${hash}\n`);
}

function isLauncherStale(dest, swiftSrc) {
  const hash = hashFile(swiftSrc);
  if (!hash) return false;
  return readStamp(dest) !== hash;
}

function findInstalled(operator) {
  const appFile = operator ? "Circadia Operator.app" : "Circadia.app";
  const system = path.join("/Applications", appFile);
  const home = path.join(os.homedir(), "Applications", appFile);
  if (fs.existsSync(system)) return system;
  if (fs.existsSync(home)) return home;
  return null;
}

function execName(operator) {
  return operator ? "CircadiaOperator" : "Circadia";
}

function scheduleRelaunch(dest, operator) {
  const quoted = JSON.stringify(dest);
  spawn("sh", ["-c", `sleep 1; open ${quoted}`], {
    detached: true,
    stdio: "ignore",
  }).unref();
  spawnSync("killall", [execName(operator)], { stdio: "ignore" });
}

function rebuildIfStale(opts = {}) {
  const repo = opts.repo || path.join(__dirname, "..");
  const operator = Boolean(opts.operator);
  const swiftSrc = opts.swiftSrc || path.join(repo, "electron", "launcher.swift");
  const dest = opts.dest || findInstalled(operator);
  const platform = opts.platform || process.platform;

  if (platform !== "darwin") return { ok: true, skipped: "platform" };
  if (!dest || !fs.existsSync(dest)) return { ok: true, skipped: "no-app" };
  if (!isLauncherStale(dest, swiftSrc)) return { ok: true, skipped: "fresh" };

  const binTmp = path.join(os.tmpdir(), `circadia-launcher-${process.pid}-${Date.now()}`);
  try {
    compileSwift(swiftSrc, binTmp);
    const binary = path.join(dest, "Contents", "MacOS", execName(operator));
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    const staging = `${binary}.new`;
    fs.copyFileSync(binTmp, staging);
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, binary);
    writeStamp(dest, hashFile(swiftSrc));
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  } finally {
    fs.rmSync(binTmp, { force: true });
  }

  const relaunch = opts.relaunch === true;
  if (relaunch) scheduleRelaunch(dest, operator);
  return { ok: true, updated: true, relaunched: relaunch };
}

module.exports = {
  STAMP_NAME,
  hashFile,
  stampPath,
  readStamp,
  writeStamp,
  isLauncherStale,
  findInstalled,
  execName,
  rebuildIfStale,
};
