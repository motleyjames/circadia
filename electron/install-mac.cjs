"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

run("npm", ["run", "build"]);
run(process.execPath, [path.join(root, "electron", "prepare-standalone.cjs")]);
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

const destDir = path.join(os.homedir(), "Applications");
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "Circadia.app");
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(built, dest, { recursive: true });

console.log(`Installed ${dest}`);
console.log("First open: if macOS blocks it, right-click Circadia → Open.");
spawnSync("open", [dest], { stdio: "inherit" });
