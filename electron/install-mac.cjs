"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SYSTEM = "/Applications/Circadia.app";
const HOME = path.join(os.homedir(), "Applications", "Circadia.app");

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
    console.error("Circadia.app is not installed yet. From the rest-ai folder run: npm run dock");
    process.exit(1);
  }
  reveal(existing);
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.error("npm run dock only works on a Mac.");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
  if (result.status) process.exit(result.status ?? 1);
}

run(process.execPath, [path.join(root, "electron", "build-ui.cjs")]);
run(path.join(root, "node_modules", ".bin", "electron-builder"), ["--mac", "dir", "--publish", "never"]);

const built = [
  path.join(root, "dist", "mac-arm64", "Circadia.app"),
  path.join(root, "dist", "mac", "Circadia.app"),
  path.join(root, "dist", "mac-x64", "Circadia.app"),
].find((candidate) => fs.existsSync(candidate));

if (!built) {
  console.error("electron-builder finished, but Circadia.app was not in dist/.");
  process.exit(1);
}

function copyApp(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(built, dest, { recursive: true });
}

let dest = SYSTEM;
try {
  copyApp(SYSTEM);
} catch {
  copyApp(HOME);
  dest = HOME;
}

console.log("");
console.log("Installed to:");
console.log(dest);
console.log("Finder will now jump to that file. Drag it to the Dock.");
spawnSync("xattr", ["-cr", dest], { stdio: "ignore" });
reveal(dest);
spawnSync("open", [dest], { stdio: "inherit" });
