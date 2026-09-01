"use strict";

/**
 * Build the Circadia diary and put it on a connected iPhone.
 * Manual sign if a development profile already exists. Automatic only when
 * Xcode Accounts has the team, or a signed-in Xcode 16 session with no
 * stored team id. Does not open Xcode. Not live-reload. Never destination
 * Any iOS Device. Never passes a keychain-only team on the first try.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { normalizeTeam } = require("./ios-team.cjs");
const { resolveSignForDevice, nextSignAfterSessionFailure } = require("./ios-sign.cjs");

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
    "CODE_SIGN_IDENTITY=Apple Development",
  ];
  if (sign.style === "manual") {
    args.push(
      `DEVELOPMENT_TEAM=${sign.team}`,
      "CODE_SIGN_STYLE=Manual",
      `PROVISIONING_PROFILE=${sign.profileUuid}`,
    );
    return args;
  }
  if (sign.style === "automatic-session") {
    // Empty team overrides debug.xcconfig's leftover keychain DEVELOPMENT_TEAM.
    args.push(
      "DEVELOPMENT_TEAM=",
      "CODE_SIGN_STYLE=Automatic",
      "-allowProvisioningUpdates",
      "-allowProvisioningDeviceRegistration",
    );
    return args;
  }
  args.push(
    `DEVELOPMENT_TEAM=${sign.team}`,
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    "CODE_SIGN_STYLE=Automatic",
  );
  return args;
}

function appPathForTarget(derivedDataPath) {
  return path.join(derivedDataPath, "Build", "Products", "Debug-iphoneos", "App.app");
}

function describeSign(sign) {
  if (sign.style === "manual") {
    return "Signing with a leftover development profile already on this Mac. Not Xcode Accounts.";
  }
  if (sign.style === "automatic-session") {
    return "Signing with the Apple ID signed into Xcode. Not passing a keychain team (Xcode 16 may not have stored one).";
  }
  if (sign.source === "session-retry") {
    return "Xcode session needed a team id. Retrying once with the development team already on this Mac, because Accounts is signed in.";
  }
  return "Signing with the Apple ID signed into Xcode Accounts.";
}

function explainXcodebuildFailure(text) {
  const src = String(text || "");
  if (/No Account for Team/i.test(src)) {
    return "Xcode has no Accounts session for that team. Circadia did not start from a keychain-only team. If this is a retry, the signed-in Apple ID is not that team.";
  }
  if (/requires a development team/i.test(src)) {
    return "xcodebuild had no team id. On Xcode 16+ that can happen until Accounts has finished loading a team. Circadia will retry once if a team is already on this Mac.";
  }
  if (/No profiles for|requires a provisioning profile/i.test(src)) {
    return "No development profile for app.circadia.diary. Automatic signing can mint one only with an Xcode Accounts session.";
  }
  if (/Communication with Apple failed|Unable to log in|Authentication/i.test(src)) {
    return "Xcode could not talk to Apple to create a profile. That is Apple's session, not USB and not the packed diary.";
  }
  return null;
}

function runXcodebuild(args, cwd) {
  const result = spawnSync("xcrun", ["xcodebuild", ...args], {
    encoding: "utf8",
    cwd,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { status: result.status ?? 1, log: `${stdout}\n${stderr}` };
}

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: "inherit",
    ...opts,
  });
  return result.status ?? 1;
}

function installOnDevice({
  root = repoRoot(),
  targetId,
  sign,
  fallbackTeam,
  diagnosis,
} = {}) {
  if (!targetId) return 11;
  const resolved =
    sign != null
      ? { sign, diagnosis: diagnosis || "" }
      : resolveSignForDevice({ deviceId: targetId, root });
  let decided = resolved.sign;
  if (!decided) {
    if (resolved.diagnosis) console.error(resolved.diagnosis);
    return 13;
  }
  const phone = path.join(root, "phone");
  const nativeDir = path.join(phone, "ios", "App");
  const derivedDataPath = path.join(phone, "ios", "DerivedData", targetId);
  console.error(describeSign(decided));
  const args = xcodebuildArgs({ sign: decided, targetId, derivedDataPath });
  if (args.join(" ").includes("Any iOS Device")) return 11;
  let built = runXcodebuild(args, nativeDir);
  if (built.status !== 0) {
    const retry = nextSignAfterSessionFailure(decided, fallbackTeam, built.log);
    const hint = explainXcodebuildFailure(built.log);
    if (hint) console.error(hint);
    if (retry) {
      decided = retry;
      console.error(describeSign(decided));
      built = runXcodebuild(xcodebuildArgs({ sign: decided, targetId, derivedDataPath }), nativeDir);
      if (built.status !== 0) {
        const again = explainXcodebuildFailure(built.log);
        if (again) console.error(again);
        return built.status || 11;
      }
    } else {
      return built.status || 11;
    }
  }
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

function parseCli(argv = process.argv) {
  const targetFlag = argv.indexOf("--target");
  const teamFlag = argv.indexOf("--fallback-team");
  const targetId = targetFlag !== -1 ? argv[targetFlag + 1] : "";
  const fallbackTeam = teamFlag !== -1 ? normalizeTeam(argv[teamFlag + 1]) : null;
  return { targetId, fallbackTeam };
}

module.exports = {
  xcodebuildArgs,
  appPathForTarget,
  nativeRunBin,
  installOnDevice,
  explainXcodebuildFailure,
  parseCli,
  describeSign,
};

if (require.main === module) {
  const { targetId, fallbackTeam } = parseCli();
  if (!targetId || targetId.startsWith("-")) {
    console.error("usage: node scripts/ios-install.cjs --target DEVICE_ID [--fallback-team TEAM]");
    process.exit(11);
  }
  const status = installOnDevice({ targetId, fallbackTeam });
  process.exit(status);
}
