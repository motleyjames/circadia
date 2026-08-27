"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isElectronApp, writePackagedApp } = require("./pack-app.cjs");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const APP_VERSION = typeof pkg.version === "string" ? pkg.version : "0.5.3";

function payload(kind) {
  return {
    node: process.execPath,
    repo: root,
    path: process.env.PATH || "",
    port: kind === "mod" ? 43149 : 43148,
    title: kind === "mod" ? "Circadia Operator" : "Circadia",
    logFile: kind === "mod" ? "Circadia-Operator.log" : "Circadia.log",
    serve: "electron/serve-dock.cjs",
    surface: kind === "mod" ? "mod" : undefined,
    version: APP_VERSION,
    installedAt: new Date().toISOString(),
  };
}

function quitBundle(dest) {
  const listed = spawnSync("pgrep", ["-f", dest], { encoding: "utf8" });
  const pids = (listed.stdout || "").trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) spawnSync("kill", [pid], { stdio: "ignore" });
}

function candidates() {
  const extra = process.env.CIRCADIA_REPAIR_ROOT;
  const bases = extra
    ? [extra]
    : [path.join("/Applications"), path.join(os.homedir(), "Applications")];
  const found = [];
  for (const base of bases) {
    found.push({ dest: path.join(base, "Circadia.app"), kind: "diary" });
    found.push({ dest: path.join(base, "Circadia Operator.app"), kind: "mod" });
  }
  return found;
}

function repairDest(dest, kind) {
  if (!isElectronApp(dest)) return false;
  quitBundle(dest);
  const appDir = path.join(dest, "Contents", "Resources", "app");
  writePackagedApp(appDir, {
    electronDir: __dirname,
    payload: payload(kind),
    name: kind === "mod" ? "circadia-operator" : "circadia",
    version: APP_VERSION,
  });
  return true;
}

function repairAll() {
  let n = 0;
  for (const { dest, kind } of candidates()) {
    if (!repairDest(dest, kind)) continue;
    console.log("Repaired Electron main (no next build):", dest);
    n += 1;
  }
  if (n === 0) console.log("No Electron Circadia.app to repair.");
  return n;
}

if (require.main === module) {
  repairAll();
}

module.exports = { payload, repairDest, repairAll, candidates };
