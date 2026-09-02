"use strict";

/**
 * One Swift binary, two .app bundles.
 * Diary = ice clock on 43148. Operator = gold clock on 43149.
 * Compile the binary first. Never wrap Electron.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { dockCompileEnv, writeDiaryServerKind } = require("./dock-env.cjs");

const APP_KINDS = {
  diary: {
    id: "diary",
    display: "Circadia",
    exec: "Circadia",
    fileName: "Circadia.app",
    bundleId: "app.circadia.desktop",
    port: 43148,
    iconFile: "icon.png",
    logFile: "Circadia.log",
    surface: null,
  },
  mod: {
    id: "mod",
    display: "Circadia Operator",
    exec: "CircadiaOperator",
    fileName: "Circadia Operator.app",
    bundleId: "app.circadia.operator",
    port: 43149,
    iconFile: "operator-icon.png",
    logFile: "Circadia-Operator.log",
    surface: "mod",
  },
};

function whichNode() {
  const hit = spawnSync("which", ["node"], { encoding: "utf8" });
  const p = (hit.stdout || "").trim();
  if (p && fs.existsSync(p)) return p;
  return process.execPath;
}

function kindOf(name) {
  const kind = APP_KINDS[name || "diary"];
  if (!kind) throw new Error("unknown app kind: " + name);
  return kind;
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
  const kind = kindOf(opts.kind || "diary");
  const repo = opts.repo;
  const dest = opts.dest;
  const binarySrc = opts.binarySrc;
  const png = path.join(repo, "electron", kind.iconFile);
  if (!fs.existsSync(binarySrc)) {
    throw new Error("refusing to assemble without a binary: " + binarySrc);
  }

  const macos = path.join(dest, "Contents", "MacOS");
  const resources = path.join(dest, "Contents", "Resources");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  const binary = path.join(macos, kind.exec);
  fs.copyFileSync(binarySrc, binary);
  fs.chmodSync(binary, 0o755);

  const node = opts.node || whichNode();
  const payload = {
    node,
    repo,
    path: process.env.PATH || "",
    port: kind.port,
    title: kind.display,
    logFile: kind.logFile,
    serve: "electron/serve-dock.cjs",
    update: "electron/dock-update.cjs",
    updateUrl: "https://github.com/motleyjames/circadia.git",
    version: opts.version || "0.6.5",
    installedAt: new Date().toISOString(),
  };
  if (kind.surface) payload.surface = kind.surface;

  fs.writeFileSync(path.join(resources, "install.json"), JSON.stringify(payload, null, 2));
  if (fs.existsSync(png)) fs.copyFileSync(png, path.join(resources, "icon.png"));
  fs.writeFileSync(
    path.join(dest, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>${kind.display}</string>
  <key>CFBundleExecutable</key><string>${kind.exec}</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundleIdentifier</key><string>${kind.bundleId}</string>
  <key>CFBundleName</key><string>${kind.display}</string>
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
  if (kind.exec !== "Electron" && fs.existsSync(path.join(macos, "Electron"))) {
    throw new Error("refusing an Electron binary in a native bundle");
  }
  if (fs.existsSync(path.join(dest, "Contents", "Resources", "app", "package.json"))) {
    throw new Error("refusing an Electron Resources/app tree in a native bundle");
  }
  if (kind.id === "diary" && payload.surface) {
    throw new Error("diary bundle must not carry surface=mod");
  }
  if (kind.id === "mod" && payload.surface !== "mod") {
    throw new Error("operator bundle must carry surface=mod");
  }
  if (kind.id === "mod" && payload.port !== 43149) {
    throw new Error("operator must listen on 43149");
  }
  if (kind.id === "diary" && payload.port !== 43148) {
    throw new Error("diary must listen on 43148");
  }

  if (process.platform === "darwin") {
    spawnSync("xattr", ["-cr", dest]);
    spawnSync("codesign", ["--force", "--sign", "-", "--identifier", kind.bundleId, dest]);
  }

  return { dest, binary, payload, kind };
}

function nextBuildEnv(kindKey, sourceEnv = process.env) {
  const kind = kindOf(kindKey);
  return dockCompileEnv(kind.surface === "mod", sourceEnv);
}

function buildNext(repo, kindKey) {
  const nextBin = path.join(repo, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) throw new Error("Next is missing. Run npm install first.");
  const kind = kindOf(kindKey);
  console.log("Compiling", kind.display, "…");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: repo,
    stdio: "inherit",
    env: nextBuildEnv(kindKey),
  });
  if (result.status !== 0) {
    throw new Error("next build failed for " + kind.display);
  }
  writeDiaryServerKind(repo, kind.surface === "mod");
}

module.exports = {
  APP_KINDS,
  whichNode,
  kindOf,
  compileSwift,
  assembleNativeApp,
  nextBuildEnv,
  buildNext,
};
