"use strict";

/**
 * Install Circadia (diary) and Circadia Operator as native WKWebView apps.
 * One swiftc. Two bundles. No Electron. No assemble until the binary exists.
 *
 *   node electron/install-both-native.cjs
 *   node electron/install-both-native.cjs --diary
 *   node electron/install-both-native.cjs --operator
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { APP_KINDS, assembleNativeApp, buildNext, compileSwift, whichNode } = require("./native-bundle.cjs");

const repo = process.env.CIRCADIA_REPO || path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const version = typeof pkg.version === "string" ? pkg.version : "0.6.5";
const swiftSrc = process.env.CIRCADIA_SWIFT || path.join(__dirname, "launcher.swift");

function selectedKinds() {
  const op = process.argv.includes("--operator");
  const diary = process.argv.includes("--diary");
  if (op && !diary) return ["mod"];
  if (diary && !op) return ["diary"];
  return ["diary", "mod"];
}

function destFor(kind) {
  const system = path.join("/Applications", kind.fileName);
  const home = path.join(os.homedir(), "Applications", kind.fileName);
  if (process.env.CIRCADIA_DEST_ROOT) {
    return path.join(process.env.CIRCADIA_DEST_ROOT, kind.fileName);
  }
  if (process.platform !== "darwin") {
    return home;
  }
  try {
    fs.mkdirSync("/Applications", { recursive: true });
    fs.accessSync("/Applications", fs.constants.W_OK);
    return system;
  } catch {
    return home;
  }
}

function installKinds(kindKeys, binarySrc) {
  const installed = [];
  for (const key of kindKeys) {
    const kind = APP_KINDS[key];
    const dest = destFor(kind);
    const result = assembleNativeApp({
      kind: key,
      repo,
      dest,
      binarySrc,
      node: whichNode(),
      version,
    });
    console.log("INSTALLED", result.kind.display, result.dest);
    console.log("MacOS", fs.readdirSync(path.join(result.dest, "Contents", "MacOS")).join(" "));
    installed.push(result);
  }
  return installed;
}

function openInstalled(installed) {
  if (process.platform !== "darwin") return;
  for (const item of installed) {
    spawnSync("open", [item.dest], { stdio: "inherit" });
  }
}

function run() {
  const kindKeys = selectedKinds();
  const skipNext = process.argv.includes("--skip-next") || process.env.CIRCADIA_SKIP_NEXT === "1";
  if (!skipNext) {
    for (const key of kindKeys) buildNext(repo, key);
  }

  if (process.platform !== "darwin" && !process.env.CIRCADIA_PREBUILT_BIN) {
    console.log("Next compiles finished. Native .app wrapping needs macOS swiftc (AppKit/WebKit).");
    console.log("Kinds:", kindKeys.join(", "));
    return [];
  }

  const binTmp = process.env.CIRCADIA_PREBUILT_BIN || path.join(os.tmpdir(), "CircadiaBin");
  if (process.env.CIRCADIA_PREBUILT_BIN) {
    if (!fs.existsSync(binTmp)) throw new Error("prebuilt binary missing: " + binTmp);
  } else {
    compileSwift(swiftSrc, binTmp);
    console.log("compiled", binTmp);
  }

  const installed = installKinds(kindKeys, binTmp);
  if (!process.argv.includes("--no-open")) openInstalled(installed);
  console.log("");
  console.log("Drag these onto the Dock (remove any tile named Electron):");
  for (const item of installed) console.log("  " + item.dest);
  console.log("");
  return installed;
}

module.exports = { selectedKinds, destFor, installKinds, run };

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
