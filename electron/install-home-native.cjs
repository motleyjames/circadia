"use strict";

/**
 * Builds a native Circadia.app into ~/Applications.
 * Compiles the Swift binary first. Never opens a half-built bundle.
 * Does not touch /Applications (that copy is the broken Electron app).
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repo = process.env.CIRCADIA_REPO || "/Users/jamesmotley/rest-ai";
const swiftSrc = process.env.CIRCADIA_SWIFT || path.join(__dirname, "dock-shell.swift");
const png = path.join(repo, "electron", "icon.png");
const dest = path.join(os.homedir(), "Applications", "Circadia.app");
const binTmp = path.join(os.tmpdir(), "CircadiaBin");

function whichNode() {
  const hit = spawnSync("which", ["node"], { encoding: "utf8" });
  const p = (hit.stdout || "").trim();
  if (p && fs.existsSync(p)) return p;
  return process.execPath;
}

if (!fs.existsSync(swiftSrc)) {
  console.error("missing Swift source:", swiftSrc);
  process.exit(1);
}

fs.rmSync(binTmp, { force: true });
const compiled = spawnSync(
  "swiftc",
  ["-O", "-o", binTmp, swiftSrc, "-framework", "AppKit", "-framework", "WebKit"],
  { encoding: "utf8" },
);
if (compiled.status !== 0 || !fs.existsSync(binTmp)) {
  console.error(compiled.stderr || compiled.stdout || "swiftc failed");
  process.exit(1);
}
fs.chmodSync(binTmp, 0o755);
console.log("compiled", binTmp);

const macos = path.join(dest, "Contents", "MacOS");
const resources = path.join(dest, "Contents", "Resources");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(macos, { recursive: true });
fs.mkdirSync(resources, { recursive: true });
const binary = path.join(macos, "Circadia");
fs.copyFileSync(binTmp, binary);
fs.chmodSync(binary, 0o755);

const node = whichNode();
fs.writeFileSync(
  path.join(resources, "install.json"),
  JSON.stringify(
    {
      node,
      repo,
      path: process.env.PATH || "",
      port: 43148,
      title: "Circadia",
      logFile: "Circadia.log",
      serve: "electron/serve-dock.cjs",
      version: "0.5.0",
      installedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
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
  <key>CFBundleShortVersionString</key><string>0.5.0</string>
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

if (!fs.existsSync(binary)) {
  console.error("bundle missing executable", binary);
  process.exit(1);
}

spawnSync("xattr", ["-cr", dest]);
spawnSync("codesign", ["--force", "--sign", "-", "--identifier", "app.circadia.desktop", dest]);
console.log("INSTALLED", dest);
console.log("executable", binary);
