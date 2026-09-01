"use strict";

/**
 * Build the Circadia diary and put it on a connected iPhone.
 * Manual sign if a development profile already exists. Automatic only when
 * Xcode Accounts has the team, or a signed-in Xcode 16 session with no
 * stored team id. Does not open Xcode. Not live-reload. Never destination
 * Any iOS Device. Never passes a keychain-only team on the first try.
 *
 * --target is the hardware UDID. CoreDevice list UUIDs are refused.
 * If Xcode cannot see an idle phone, compile generic iOS (arm64) and
 * install with native-run, then `devicectl device install app`.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { normalizeTeam } = require("./ios-team.cjs");
const { resolveSignForDevice, nextSignAfterSessionFailure } = require("./ios-sign.cjs");
const { isHardwareUdid, isCoreDeviceUuid, wakeDevice, waitForInstallTarget, resolveWaitMs, scanInstallableIphones, collectSources } = require("./ios-target.cjs");

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

function xcodebuildArgs({ sign, targetId, derivedDataPath, generic = false }) {
  const destination = generic ? "generic/platform=iOS" : `platform=iOS,id=${targetId}`;
  const args = [
    "-project",
    "App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Debug",
    "-destination",
    destination,
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
  if (destinationMissing(src)) {
    return "Xcode could not see that iPhone as a live destination. Circadia will compile generic iOS (arm64) and install onto the hardware UDID.";
  }
  return null;
}

function destinationMissing(text) {
  const src = String(text || "");
  return (
    /Unable to find a destination matching/i.test(src) ||
    /The requested device could not be found/i.test(src) ||
    /Failed to find a device matching/i.test(src)
  );
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

function buildApp({ sign, targetId, derivedDataPath, nativeDir, generic = false }) {
  const args = xcodebuildArgs({ sign, targetId, derivedDataPath, generic });
  if (args.join(" ").includes("Any iOS Device")) {
    return { status: 11, log: "refused Any iOS Device destination" };
  }
  return runXcodebuild(args, nativeDir);
}

function compileForPhone({ decided, fallbackTeam, targetId, derivedDataPath, nativeDir }) {
  let sign = decided;
  let built = buildApp({ sign, targetId, derivedDataPath, nativeDir, generic: false });
  if (built.status !== 0 && destinationMissing(built.log)) {
    const hint = explainXcodebuildFailure(built.log);
    if (hint) console.error(hint);
    console.error("Phone is idle for Xcode. Compiling generic iOS (arm64), then installing onto the hardware UDID.");
    built = buildApp({ sign, targetId, derivedDataPath, nativeDir, generic: true });
  }
  if (built.status !== 0) {
    const retry = nextSignAfterSessionFailure(sign, fallbackTeam, built.log);
    const hint = explainXcodebuildFailure(built.log);
    if (hint) console.error(hint);
    if (!retry) return { sign, built };
    sign = retry;
    console.error(describeSign(sign));
    built = buildApp({ sign, targetId, derivedDataPath, nativeDir, generic: false });
    if (built.status !== 0 && destinationMissing(built.log)) {
      console.error("Phone is idle for Xcode. Compiling generic iOS (arm64), then installing onto the hardware UDID.");
      built = buildApp({ sign, targetId, derivedDataPath, nativeDir, generic: true });
    }
    if (built.status !== 0) {
      const again = explainXcodebuildFailure(built.log);
      if (again) console.error(again);
    }
  }
  return { sign, built };
}

function installWithDevicectl(app, device, spawn = spawnSync) {
  if (!device) return 11;
  const result = spawn("xcrun", ["devicectl", "device", "install", "app", "--device", device, app], {
    encoding: "utf8",
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function deployApp({
  app,
  targetId,
  coreDeviceId,
  root = repoRoot(),
  nativeRun,
  waitMs,
  poll,
  spawn = spawnSync,
  log = (msg) => console.error(msg),
} = {}) {
  const phone = path.join(root, "phone");
  const bin = nativeRun === undefined ? nativeRunBin(root) : nativeRun;
  const deadline = waitMs != null ? waitMs : resolveWaitMs();
  if (deadline > 0) {
    waitForInstallTarget({
      deadlineMs: deadline,
      poll:
        poll ||
        (() => {
          const src = collectSources({ root, nativeRun: bin, spawn });
          const pick = scanInstallableIphones(src);
          return pick;
        }),
      log: (_last, remain) => {
        log(
          `Unlock James-iPhone, keep the screen on, plug in USB. ${Math.max(1, Math.ceil(remain / 1000))}s left before install.`,
        );
      },
      nudge: (last) => {
        wakeDevice(last?.coreDeviceId || coreDeviceId || targetId, spawn);
      },
    });
  }
  if (bin) {
    const deployed = run(bin, ["ios", "--app", app, "--target", targetId], { cwd: phone });
    if (deployed === 0) return 0;
    log("native-run could not reach the phone. Trying Apple's installer with the hardware UDID.");
  } else {
    log("native-run is missing. Installing with Apple's installer.");
  }
  let status = installWithDevicectl(app, targetId, spawn);
  if (status === 0) return 0;
  if (coreDeviceId && isCoreDeviceUuid(coreDeviceId) && coreDeviceId !== targetId) {
    status = installWithDevicectl(app, coreDeviceId, spawn);
    if (status === 0) return 0;
  }
  log(
    "CoreDevice still cannot see James-iPhone. Unlock it, keep the screen on, plug in USB, then run this again. The .app is already compiled — the next run skips the Next.js pack.",
  );
  return status || 11;
}

function installOnDevice({
  root = repoRoot(),
  targetId,
  coreDeviceId,
  sign,
  fallbackTeam,
  diagnosis,
} = {}) {
  if (!targetId) return 11;
  if (isCoreDeviceUuid(targetId) || !isHardwareUdid(targetId)) {
    console.error(
      "That id is not an iPhone hardware UDID. CoreDevice list ids cannot be passed to native-run or xcodebuild.",
    );
    return 11;
  }
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
  wakeDevice(coreDeviceId || targetId);
  console.error(describeSign(decided));
  const compiled = compileForPhone({
    decided,
    fallbackTeam,
    targetId,
    derivedDataPath,
    nativeDir,
  });
  decided = compiled.sign;
  const built = compiled.built;
  if (built.status !== 0) return built.status || 11;
  const app = appPathForTarget(derivedDataPath);
  if (!fs.existsSync(app)) {
    console.error(`xcodebuild finished but ${app} is missing.`);
    return 11;
  }
  wakeDevice(coreDeviceId || targetId);
  return deployApp({ app, targetId, coreDeviceId, root });
}

function parseCli(argv = process.argv) {
  const targetFlag = argv.indexOf("--target");
  const teamFlag = argv.indexOf("--fallback-team");
  const coreFlag = argv.indexOf("--core-device");
  const targetId = targetFlag !== -1 ? argv[targetFlag + 1] : "";
  const fallbackTeam = teamFlag !== -1 ? normalizeTeam(argv[teamFlag + 1]) : null;
  const rawCore = coreFlag !== -1 ? argv[coreFlag + 1] : "";
  const coreDeviceId = rawCore && !String(rawCore).startsWith("-") ? rawCore : "";
  return { targetId, fallbackTeam, coreDeviceId };
}

module.exports = {
  xcodebuildArgs,
  appPathForTarget,
  nativeRunBin,
  installOnDevice,
  explainXcodebuildFailure,
  destinationMissing,
  parseCli,
  describeSign,
  deployApp,
  installWithDevicectl,
};

if (require.main === module) {
  const { targetId, fallbackTeam, coreDeviceId } = parseCli();
  if (!targetId || targetId.startsWith("-")) {
    console.error(
      "usage: node scripts/ios-install.cjs --target HARDWARE_UDID [--core-device CORE_ID] [--fallback-team TEAM]",
    );
    process.exit(11);
  }
  const status = installOnDevice({ targetId, fallbackTeam, coreDeviceId });
  process.exit(status);
}
