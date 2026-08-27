"use strict";

/**
 * Standalone. No Circadia modules besides this file.
 * Patches an already-installed Electron Circadia.app so launch does not
 * look up …/Resources/app/Users/…/electron/main.cjs
 *
 *   cd ~/rest-ai
 *   node electron/fix-mac.cjs
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function findRepo() {
  const guesses = [
    process.env.CIRCADIA_REPO,
    path.join(__dirname, ".."),
    process.cwd(),
    path.join(os.homedir(), "rest-ai"),
  ].filter(Boolean);
  for (const dir of guesses) {
    if (fs.existsSync(path.join(dir, "electron", "main.cjs"))) return dir;
  }
  throw new Error("Cannot find rest-ai. cd ~/rest-ai and run: node electron/fix-mac.cjs");
}

function isElectronApp(dest) {
  if (!dest || !fs.existsSync(dest)) return false;
  return (
    fs.existsSync(path.join(dest, "Contents", "MacOS", "Electron")) ||
    fs.existsSync(path.join(dest, "Contents", "Resources", "app", "package.json"))
  );
}

function quitBundle(dest) {
  const listed = spawnSync("pgrep", ["-f", dest], { encoding: "utf8" });
  const pids = (listed.stdout || "").trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) spawnSync("kill", [pid], { stdio: "ignore" });
}

function packagedMainPath(appDir, mainField) {
  const raw = String(mainField);
  if (raw.startsWith("/")) return path.join(appDir, raw.slice(1));
  return path.join(appDir, raw);
}

function payload(repo, kind, version) {
  return {
    node: process.execPath,
    repo,
    path: process.env.PATH || "",
    port: kind === "mod" ? 43149 : 43148,
    title: kind === "mod" ? "Circadia Operator" : "Circadia",
    logFile: kind === "mod" ? "Circadia-Operator.log" : "Circadia.log",
    serve: "electron/serve-dock.cjs",
    surface: kind === "mod" ? "mod" : undefined,
    version,
    installedAt: new Date().toISOString(),
  };
}

function writeBundle(appDir, repo, kind, version) {
  const electronDir = path.join(repo, "electron");
  fs.mkdirSync(appDir, { recursive: true });
  const mainSrc = path.join(electronDir, "main.cjs");
  if (!fs.existsSync(mainSrc)) throw new Error("missing " + mainSrc);
  for (const file of ["main.cjs", "preload.cjs", "static-server.cjs"]) {
    const src = path.join(electronDir, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appDir, file));
  }
  for (const icon of ["icon.png", "operator-icon.png"]) {
    const src = path.join(electronDir, icon);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appDir, icon));
  }
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: kind === "mod" ? "circadia-operator" : "circadia", version, main: "main.cjs" }, null, 2),
  );
  fs.writeFileSync(path.join(appDir, "install.json"), JSON.stringify(payload(repo, kind, version), null, 2));

  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  if (pkg.main !== "main.cjs" || path.isAbsolute(pkg.main)) {
    throw new Error("refusing to leave an absolute Electron main");
  }
  const resolved = packagedMainPath(appDir, pkg.main);
  if (resolved !== path.join(appDir, "main.cjs") || !fs.existsSync(resolved)) {
    throw new Error("main.cjs did not land in the bundle");
  }

  const shim = packagedMainPath(appDir, path.join(repo, "electron", "main.cjs"));
  fs.mkdirSync(path.dirname(shim), { recursive: true });
  fs.copyFileSync(path.join(appDir, "main.cjs"), shim);
  return { resolved, shim };
}

function repairDest(dest, kind, repo) {
  if (!isElectronApp(dest)) return false;
  quitBundle(dest);
  const root = repo || findRepo();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const version = typeof pkg.version === "string" ? pkg.version : "0.5.4";
  const appDir = path.join(dest, "Contents", "Resources", "app");
  const written = writeBundle(appDir, root, kind, version);
  const check = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  if (check.main !== "main.cjs") throw new Error("package.json main is still " + check.main);
  if (!fs.existsSync(written.shim)) throw new Error("concatenation shim missing: " + written.shim);
  resignBundle(dest);
  return true;
}

function resignBundle(dest) {
  if (process.platform !== "darwin") return;
  spawnSync("xattr", ["-cr", dest], { stdio: "ignore" });
  // Never deep-sign: Electron Framework.framework then reports "unsealed contents".
  const electronBin = path.join(dest, "Contents", "MacOS", "Electron");
  if (fs.existsSync(electronBin)) {
    spawnSync("codesign", ["--force", "--sign", "-", electronBin], { stdio: "ignore" });
  }
  const signed = spawnSync("codesign", ["--force", "--sign", "-", dest], { encoding: "utf8" });
  if (signed.status !== 0) {
    console.warn("codesign failed:", (signed.stderr || signed.stdout || "").trim());
  } else {
    console.log("Re-signed", dest);
  }
}

function candidates() {
  const extra = process.env.CIRCADIA_REPAIR_ROOT;
  const bases = extra ? [extra] : ["/Applications", path.join(os.homedir(), "Applications")];
  const found = [];
  for (const base of bases) {
    found.push({ dest: path.join(base, "Circadia.app"), kind: "diary" });
    found.push({ dest: path.join(base, "Circadia Operator.app"), kind: "mod" });
  }
  return found;
}

function repairAll() {
  const repo = findRepo();
  let n = 0;
  for (const { dest, kind } of candidates()) {
    if (!repairDest(dest, kind, repo)) continue;
    console.log("Patched Electron main (did not compile Next):", dest);
    n += 1;
  }
  if (n === 0) {
    console.log("No Electron Circadia.app found to patch.");
    console.log("Repo:", repo);
  } else {
    console.log("Done.", n, "app(s). Open Circadia from /Applications. Do not run npm run dock until this rest-ai tree has native-only install.");
  }
  return n;
}

if (require.main === module) {
  try {
    repairAll();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  findRepo,
  isElectronApp,
  packagedMainPath,
  writeBundle,
  repairDest,
  resignBundle,
  repairAll,
  candidates,
};
