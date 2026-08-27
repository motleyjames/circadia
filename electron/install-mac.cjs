"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const operator = process.argv.includes("--operator");
const APP_DISPLAY = operator ? "Circadia Operator" : "Circadia";
const EXEC_NAME = operator ? "CircadiaOperator" : "Circadia";
const BUNDLE_ID = operator ? "app.circadia.operator" : "app.circadia.desktop";
const APP_FILE = operator ? "Circadia Operator.app" : "Circadia.app";
const SYSTEM = path.join("/Applications", APP_FILE);
const HOME = path.join(os.homedir(), "Applications", APP_FILE);
const DOCK_PORT = operator ? 43149 : 43148;

function findInstalled() {
  if (fs.existsSync(SYSTEM)) return SYSTEM;
  if (fs.existsSync(HOME)) return HOME;
  return null;
}

function reveal(dest) {
  console.log(dest);
  spawnSync("open", ["-R", dest], { stdio: "inherit" });
}

if (process.argv.includes("--reveal")) {
  const existing = findInstalled();
  if (!existing) {
    console.error(`${APP_FILE} is not installed. From rest-ai run: npm run ${operator ? "dock:mod" : "dock"}`);
    process.exit(1);
  }
  reveal(existing);
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.error(`npm run ${operator ? "dock:mod" : "dock"} only works on a Mac.`);
  process.exit(1);
}

const root = path.join(__dirname, "..");
const swift = path.join(__dirname, "launcher.swift");
const png = path.join(__dirname, operator ? "operator-icon.png" : "icon.png");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const APP_VERSION = typeof pkg.version === "string" ? pkg.version : "0.5.0";

spawnSync("killall", [EXEC_NAME], { stdio: "ignore" });
freePort(DOCK_PORT);

function freePort(port) {
  const listed = spawnSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8" });
  const pids = (listed.stdout || "").trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) spawnSync("kill", [pid], { stdio: "ignore" });
}

function buildDiary() {
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    console.error("Next is missing. Run npm install inside rest-ai first.");
    process.exit(1);
  }
  console.log(
    operator
      ? "Compiling Circadia Operator for the Dock (gold clock, not the diary)…"
      : "Compiling Circadia once for the Dock window (not a live-reload server)…",
  );
  const env = { ...process.env };
  delete env.CIRCADIA_ELECTRON;
  if (operator) {
    env.CIRCADIA_SURFACE = "mod";
    env.NEXT_PUBLIC_CIRCADIA_SURFACE = "mod";
  } else {
    delete env.CIRCADIA_SURFACE;
    delete env.NEXT_PUBLIC_CIRCADIA_SURFACE;
  }
  const result = spawnSync(process.execPath, [nextBin, "build"], { cwd: root, stdio: "inherit", env });
  if (result.status !== 0) {
    console.error(`next build failed. ${APP_FILE} was not replaced.`);
    process.exit(1);
  }
}

function installPayload() {
  return {
    node: process.execPath,
    repo: root,
    path: process.env.PATH || "",
    port: DOCK_PORT,
    title: APP_DISPLAY,
    logFile: operator ? "Circadia-Operator.log" : "Circadia.log",
    serve: "electron/serve-dock.cjs",
    surface: operator ? "mod" : undefined,
    version: APP_VERSION,
    installedAt: new Date().toISOString(),
  };
}

function makeIcns(icns) {
  if (!fs.existsSync(png)) return;
  const iconset = path.join(os.tmpdir(), `circadia-${Date.now()}.iconset`);
  fs.mkdirSync(iconset, { recursive: true });
  const sizes = [16, 32, 64, 128, 256, 512];
  for (const size of sizes) {
    spawnSync("sips", ["-z", String(size), String(size), png, "--out", path.join(iconset, `icon_${size}x${size}.png`)], {
      stdio: "ignore",
    });
    spawnSync(
      "sips",
      ["-z", String(size * 2), String(size * 2), png, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)],
      { stdio: "ignore" },
    );
  }
  const result = spawnSync("iconutil", ["-c", "icns", iconset, "-o", icns], { stdio: "ignore" });
  fs.rmSync(iconset, { recursive: true, force: true });
  if (result.status !== 0) fs.copyFileSync(png, icns);
}

function writePlist(plist, executable) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>${APP_DISPLAY}</string>
  <key>CFBundleExecutable</key><string>${executable}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>${APP_DISPLAY}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${APP_VERSION}</string>
  <key>CFBundleVersion</key><string>${APP_VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoads</key><true/>
  </dict>
</dict>
</plist>
`;
  fs.writeFileSync(plist, body);
}

function finishBundle(dest, executable) {
  const contents = path.join(dest, "Contents");
  const resources = path.join(contents, "Resources");
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(resources, "install.json"), JSON.stringify(installPayload(), null, 2));
  if (fs.existsSync(png)) fs.copyFileSync(png, path.join(resources, "icon.png"));
  makeIcns(path.join(resources, "AppIcon.icns"));
  writePlist(path.join(contents, "Info.plist"), executable);
  spawnSync("xattr", ["-cr", dest], { stdio: "ignore" });
  spawnSync("codesign", ["--force", "--deep", "--sign", "-", "--identifier", BUNDLE_ID, dest], {
    stdio: "ignore",
  });
}

function installNative(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  const macos = path.join(dest, "Contents", "MacOS");
  fs.mkdirSync(macos, { recursive: true });
  const binary = path.join(macos, EXEC_NAME);
  const compiled = spawnSync(
    "swiftc",
    ["-O", "-o", binary, swift, "-framework", "AppKit", "-framework", "WebKit"],
    { encoding: "utf8" },
  );
  if (compiled.status !== 0 || !fs.existsSync(binary)) {
    const err = new Error(compiled.stderr || compiled.stdout || "swiftc failed");
    err.code = "SWIFT";
    throw err;
  }
  fs.chmodSync(binary, 0o755);
  finishBundle(dest, EXEC_NAME);
}

function installElectronFallback(dest) {
  const electronApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");
  if (!fs.existsSync(electronApp)) {
    throw new Error("Electron.app is missing. Run npm install inside rest-ai first.");
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(electronApp, dest, { recursive: true });

  const electronBin = path.join(dest, "Contents", "MacOS", "Electron");
  if (!fs.existsSync(electronBin)) {
    throw new Error("Copied Electron.app has no Contents/MacOS/Electron — refusing to rename helpers.");
  }

  const appDir = path.join(dest, "Contents", "Resources", "app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: operator ? "circadia-operator" : "circadia", version: APP_VERSION, main: path.join(root, "electron", "main.cjs") }, null, 2),
  );
  fs.writeFileSync(path.join(appDir, "install.json"), JSON.stringify(installPayload(), null, 2));
  if (fs.existsSync(png)) {
    fs.copyFileSync(png, path.join(dest, "Contents", "Resources", "icon.png"));
    makeIcns(path.join(dest, "Contents", "Resources", "AppIcon.icns"));
  }

  const plist = path.join(dest, "Contents", "Info.plist");
  const keys = {
    CFBundleName: APP_DISPLAY,
    CFBundleDisplayName: APP_DISPLAY,
    CFBundleIdentifier: BUNDLE_ID,
    CFBundleIconFile: "AppIcon",
  };
  for (const [key, value] of Object.entries(keys)) {
    spawnSync("plutil", ["-replace", key, "-string", value, plist], { stdio: "inherit" });
  }
  const lsEnv = JSON.stringify({ PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ""}` });
  spawnSync("plutil", ["-replace", "LSEnvironment", "-json", lsEnv, plist], { stdio: "inherit" });
  spawnSync("xattr", ["-cr", dest], { stdio: "ignore" });
  spawnSync("codesign", ["--force", "--deep", "--sign", "-", dest], { stdio: "ignore" });
}

function place(installFn) {
  try {
    installFn(SYSTEM);
    return SYSTEM;
  } catch (error) {
    if (error && error.code === "SWIFT") throw error;
    console.warn("Could not write /Applications, using ~/Applications instead.");
    console.warn(String(error));
    installFn(HOME);
    return HOME;
  }
}

let dest;
let mode = "native";
buildDiary();
try {
  dest = place(installNative);
} catch (error) {
  console.warn("Native launcher did not compile (install Xcode Command Line Tools with: xcode-select --install).");
  console.warn(String(error));
  console.warn("Falling back to this Mac's Electron — executable stays named Electron.");
  mode = "electron-fallback";
  dest = place(installElectronFallback);
}

console.log("");
console.log(mode === "native" ? `Installed a native ${APP_DISPLAY} window (not a packaged Chromium).` : `Installed ${APP_DISPLAY} using this Mac's Electron (binary not renamed).`);
console.log(dest);
console.log(`Node: ${process.execPath}`);
console.log(`Repo: ${root}`);
if (operator) {
  console.log("A window should appear. Drag THIS Circadia Operator to the Dock — gold clock, not the ice one.");
} else {
  console.log("A window should appear. Drag THIS Circadia to the Dock. Remove any icon named Electron.");
  console.log("Operator app (gold clock): npm run dock:mod");
}
reveal(dest);
spawnSync("open", [dest], { stdio: "inherit" });
