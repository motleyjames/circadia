"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const port = process.env.CIRCADIA_DOCK_PORT || (process.env.CIRCADIA_SURFACE === "mod" ? "43149" : "43148");
const operator = process.env.CIRCADIA_SURFACE === "mod";
const distDir = operator ? ".next-mod" : ".next";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

function latestMtime(dir) {
  let latest = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".next-mod" || ent.name === "out" || ent.name === "data") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) latest = Math.max(latest, latestMtime(abs));
    else latest = Math.max(latest, fs.statSync(abs).mtimeMs);
  }
  return latest;
}

function needsBuild() {
  const buildId = path.join(root, distDir, "BUILD_ID");
  if (!fs.existsSync(buildId)) return true;
  const builtAt = fs.statSync(buildId).mtimeMs;
  const srcAt = Math.max(latestMtime(path.join(root, "src")), fs.statSync(path.join(root, "package.json")).mtimeMs);
  return srcAt > builtAt + 500;
}

function freePort() {
  const listed = spawnSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8" });
  const pids = (listed.stdout || "").trim().split(/\s+/).filter(Boolean);
  for (const pid of pids) spawnSync("kill", [pid], { stdio: "ignore" });
}

function build() {
  console.log(operator ? "Circadia Operator: source is newer than the Dock compile. Building…" : "Circadia: source is newer than the Dock compile. Building…");
  const env = { ...process.env };
  delete env.CIRCADIA_ELECTRON;
  delete env.CIRCADIA_PACK_STATIC;
  if (operator) {
    env.CIRCADIA_SURFACE = "mod";
    env.NEXT_PUBLIC_CIRCADIA_SURFACE = "mod";
  } else {
    delete env.CIRCADIA_SURFACE;
    delete env.NEXT_PUBLIC_CIRCADIA_SURFACE;
  }
  const result = spawnSync(process.execPath, [nextBin, "build"], { cwd: root, stdio: "inherit", env });
  if (result.status !== 0) {
    console.error("next build failed");
    process.exit(1);
  }
}

if (!fs.existsSync(nextBin)) {
  console.error("Next is missing. Run npm install inside rest-ai.");
  process.exit(1);
}

freePort();
if (needsBuild()) build();

const child = spawn(process.execPath, [nextBin, "start", "--port", String(port), "--hostname", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
