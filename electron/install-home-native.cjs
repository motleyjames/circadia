"use strict";

/**
 * Native Circadia.app → ~/Applications.
 * Compile (or accept a prebuilt binary) first. Never assemble, never open,
 * until Contents/MacOS/Circadia exists.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function whichNode() {
  const hit = spawnSync("which", ["node"], { encoding: "utf8" });
  const p = (hit.stdout || "").trim();
  if (p && fs.existsSync(p)) return p;
  return process.execPath;
}

function compileSwift(swiftSrc, binTmp) {
  if (!fs.existsSync(swiftSrc)) {
    throw new Error("missing Swift source: " + swiftSrc);
  }
  fs.rmSync(binTmp, { force: true });
  const compiled = spawnSync(
    "swiftc",
    ["-O", "-o", binTmp, swiftSrc, "-framework", "AppKit", "-framework", "WebKit"],
    { encoding: "utf8" },
  );
  if (compiled.status !== 0 || !fs.existsSync(binTmp)) {
    throw new Error(compiled.stderr || compiled.stdout || "swiftc failed");
  }
  fs.chmodSync(binTmp, 0o755);
  return binTmp;
}

function assembleNativeApp(opts) {
  const repo = opts.repo;
  const dest = opts.dest;
  const binarySrc = opts.binarySrc;
  const png = path.join(repo, "electron", "icon.png");
  if (!fs.existsSync(binarySrc)) {
    throw new Error("refusing to assemble without a binary: " + binarySrc);
  }

  const macos = path.join(dest, "Contents", "MacOS");
  const resources = path.join(dest, "Contents", "Resources");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  const binary = path.join(macos, "Circadia");
  fs.copyFileSync(binarySrc, binary);
  fs.chmodSync(binary, 0o755);

  const node = opts.node || whichNode();
  const payload = {
    node,
    repo,
    path: process.env.PATH || "",
    port: 43148,
    title: "Circadia",
    logFile: "Circadia.log",
    serve: "electron/serve-dock.cjs",
    version: opts.version || "0.5.0",
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(resources, "install.json"), JSON.stringify(payload, null, 2));
  if (fs.existsSync(png)) fs.copyFileSync(png, path.join(resources, "icon.png"));
  fs.writeFileSync(
    path.join(dest, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>Circadia</string>
  <key>CFBundleExecutable</key><string>Circadia</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundleIdentifier</key><string>app.circadia.desktop</string>
  <key>CFBundleName</key><string>Circadia</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${payload.version}</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoads</key><true/>
  </dict>
</dict>
</plist>
`,
  );

  if (!fs.existsSync(binary) || fs.statSync(binary).size < 1) {
    throw new Error("bundle missing executable: " + binary);
  }
  if (fs.existsSync(path.join(macos, "Electron"))) {
    throw new Error("refusing an Electron binary in a native bundle");
  }
  if (fs.existsSync(path.join(dest, "Contents", "Resources", "app", "package.json"))) {
    throw new Error("refusing an Electron Resources/app tree in a native bundle");
  }

  if (process.platform === "darwin") {
    spawnSync("xattr", ["-cr", dest]);
    spawnSync("codesign", ["--force", "--sign", "-", "--identifier", "app.circadia.desktop", dest]);
  }

  return { dest, binary, payload };
}

function installNativeHome() {
  const repo = process.env.CIRCADIA_REPO || "/Users/jamesmotley/rest-ai";
  const swiftSrc = process.env.CIRCADIA_SWIFT || path.join(__dirname, "dock-shell.swift");
  const dest = process.env.CIRCADIA_DEST || path.join(os.homedir(), "Applications", "Circadia.app");
  const binTmp = process.env.CIRCADIA_PREBUILT_BIN || path.join(os.tmpdir(), "CircadiaBin");

  if (process.env.CIRCADIA_PREBUILT_BIN) {
    if (!fs.existsSync(binTmp)) throw new Error("prebuilt binary missing: " + binTmp);
  } else {
    compileSwift(swiftSrc, binTmp);
    console.log("compiled", binTmp);
  }

  const result = assembleNativeApp({
    repo,
    dest,
    binarySrc: binTmp,
    node: whichNode(),
  });
  console.log("INSTALLED", result.dest);
  console.log("MacOS", fs.readdirSync(path.join(result.dest, "Contents", "MacOS")).join(" "));
  return result;
}

module.exports = { compileSwift, assembleNativeApp, installNativeHome, whichNode };

if (require.main === module) {
  try {
    installNativeHome();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
