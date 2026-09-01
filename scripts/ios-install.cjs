"use strict";

/**
 * Build the Circadia diary and put it on a connected iPhone.
 * Manual sign if a development profile already exists. Automatic only when
 * Xcode Accounts has the team. Does not open Xcode. Not live-reload.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveSignForDevice } = require("./ios-sign.cjs");

function repoRoot() {
  return path.join(__dirname, "..");
}

function nativeRunBin(root = repoRoot()) {
  const candidates = [
    path.join(root, "phone", "node_modules", ".bin", "native-run"),
    path.join(root, "phone", "node_modules", "native-run", "bin", "native-run"),
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function xcodebuildArgs({ sign, targetId, derivedDataPath }) {
  const args = [
    "-project",
    "App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Debug",
    "-destination",
    `platform=iOS,id=${targetId}`,
    "-derivedDataPath",
    derivedDataPath,
    `DEVELOPMENT_TEAM=${sign.team}`,
    "CODE_SIGN_IDENTITY=Apple Development",
  ];
  if (sign.style === "manual") {
    args.push("CODE_SIGN_STYLE=Manual", `PROVISIONING_PROFILE=${sign.profileUuid}`);
    return args;
  }
  args.push(
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    "CODE_SIGN_STYLE=Automatic",
  );
  return args;
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

function installOnDevice({ root = repoRoot(), targetId, sign } = {}) {
  if (!targetId) return 11;
  const decided = sign ?? resolveSignForDevice({ deviceId: targetId, root });
  if (!decided) return 13;
  const phone = path.join(root, "phone");
  const nativeDir = path.join(phone, "ios", "App");
  const derivedDataPath = path.join(phone, "ios", "DerivedData", targetId);
  const args = xcodebuildArgs({ sign: decided, targetId, derivedDataPath });
  if (decided.style === "manual") {
    console.error("Signing with a development profile already on this Mac. Not Xcode Accounts.");
  } else {
    console.error("Signing with the Apple ID signed into Xcode Accounts.");
  }
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
  const targetFlag = process.argv.indexOf("--target");
  const targetId = targetFlag !== -1 ? process.argv[targetFlag + 1] : "";
  if (!targetId || targetId.startsWith("-")) {
    console.error("usage: node scripts/ios-install.cjs --target DEVICE_ID");
    process.exit(11);
  }
  const status = installOnDevice({ targetId });
  process.exit(status);
}
