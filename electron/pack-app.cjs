"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RELATIVE_MAIN = "main.cjs";
const BUNDLE_FILES = ["main.cjs", "preload.cjs", "static-server.cjs"];

/**
 * Electron 44, copied Electron.app, unpackaged Resources/app:
 * package.json "main" is resolved inside that folder. An absolute POSIX path
 * has its leading slash stripped and is concatenated — which is the crash:
 *   /Applications/Circadia.app/Contents/Resources/app
 * + /Users/jamesmotley/rest-ai/electron/main.cjs
 * = …/app/Users/jamesmotley/rest-ai/electron/main.cjs
 */
function packagedMainPath(appDir, mainField) {
  const raw = String(mainField);
  if (raw.startsWith("/")) return path.join(appDir, raw.slice(1));
  return path.join(appDir, raw);
}

function assertSafeMain(mainField) {
  if (mainField !== RELATIVE_MAIN) {
    throw new Error(`Electron main must be relative "${RELATIVE_MAIN}", got ${JSON.stringify(mainField)}`);
  }
  if (path.isAbsolute(mainField) || mainField.includes("Users") || mainField.includes("rest-ai")) {
    throw new Error("refusing an Electron main that points at the repo");
  }
}

function verifyPackagedApp(appDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  assertSafeMain(pkg.main);
  const resolved = packagedMainPath(appDir, pkg.main);
  const expected = path.join(appDir, RELATIVE_MAIN);
  if (resolved !== expected) {
    throw new Error(`resolved main escaped the app dir:\n  ${resolved}\n  expected ${expected}`);
  }
  for (const file of [...BUNDLE_FILES, "install.json"]) {
    const abs = path.join(appDir, file);
    if (!fs.existsSync(abs)) throw new Error(`missing ${file} in ${appDir}`);
  }
  return resolved;
}

function writePackagedApp(appDir, opts) {
  const electronDir = opts.electronDir;
  const payload = opts.payload;
  const name = opts.name;
  const version = opts.version;
  fs.mkdirSync(appDir, { recursive: true });
  assertSafeMain(RELATIVE_MAIN);
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name, version, main: RELATIVE_MAIN }, null, 2),
  );
  for (const file of BUNDLE_FILES) {
    const src = path.join(electronDir, file);
    if (!fs.existsSync(src)) throw new Error(`cannot pack missing ${src}`);
    fs.copyFileSync(src, path.join(appDir, file));
  }
  for (const icon of ["icon.png", "operator-icon.png"]) {
    const src = path.join(electronDir, icon);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appDir, icon));
  }
  fs.writeFileSync(path.join(appDir, "install.json"), JSON.stringify(payload, null, 2));
  return verifyPackagedApp(appDir);
}

module.exports = {
  RELATIVE_MAIN,
  packagedMainPath,
  assertSafeMain,
  verifyPackagedApp,
  writePackagedApp,
};
