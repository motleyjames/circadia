"use strict";

/**
 * Build the Circadia diary and put it on a connected iPhone.
 * Passes DEVELOPMENT_TEAM to xcodebuild so GitHub's empty Team field is not a blocker.
 * Does not open Xcode. Does not use destination Any iOS Device. Not live-reload.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function repoRoot() {
  return path.join(__dirname, "..");
}

function xcodebuildArgs({ team, targetId, derivedDataPath }) {
  return [
    "-project",
    "App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Debug",
    "-destination",
    `id=${targetId}`,
    "-derivedDataPath",
    derivedDataPath,
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    `DEVELOPMENT_TEAM=${team}`,
    "CODE_SIGN_STYLE=Automatic",
  ];
}

function nativeRunBin(root = repoRoot()) {
  const bin = path.join(root, "phone", "node_modules", "native-run", "bin", "native-run");
  return fs.existsSync(bin) ? bin : null;
}

function appPathForTarget(derivedDataPath) {
  return path.join(derivedDataPath, "Build", "Products", "Debug-iphoneos", "App.app");
}

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: "inherit",
    ...opts,
  });
  return result.status ?? 1;
}

function installOnDevice({ root = repoRoot(), team, targetId } = {}) {
  if (!team || !targetId) return 11;
  const phone = path.join(root, "phone");
  const nativeDir = path.join(phone, "ios", "App");
  const derivedDataPath = path.join(phone, "ios", "DerivedData", targetId);
  const args = xcodebuildArgs({ team, targetId, derivedDataPath });
  const built = run("xcrun", ["xcodebuild", ...args], { cwd: nativeDir });
  if (built !== 0) return built || 11;
  const app = appPathForTarget(derivedDataPath);
  if (!fs.existsSync(app)) {
    console.error(`xcodebuild finished but ${app} is missing.`);
    return 11;
  }
  const nativeRun = nativeRunBin(root);
  if (!nativeRun) {
    console.error("native-run is missing. From the Circadia clone: npm --prefix phone install");
    return 11;
  }
  const deployed = run(nativeRun, ["ios", "--app", app, "--target", targetId], { cwd: phone });
  return deployed === 0 ? 0 : deployed || 11;
}

module.exports = { xcodebuildArgs, appPathForTarget, nativeRunBin, installOnDevice };

if (require.main === module) {
  const teamFlag = process.argv.indexOf("--team");
  const targetFlag = process.argv.indexOf("--target");
  const team = teamFlag !== -1 ? process.argv[teamFlag + 1] : "";
  const targetId = targetFlag !== -1 ? process.argv[targetFlag + 1] : "";
  if (!team || !targetId || team.startsWith("-") || targetId.startsWith("-")) {
    console.error("usage: node scripts/ios-install.cjs --team TEAMID --target DEVICE_ID");
    process.exit(11);
  }
  const status = installOnDevice({ team, targetId });
  process.exit(status);
}
