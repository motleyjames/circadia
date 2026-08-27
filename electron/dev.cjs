"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const electronBin = path.join(root, "node_modules", "electron", "cli.js");

const next = spawn(process.execPath, [nextBin, "dev", "--port", "43147", "--hostname", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const electron = spawn(process.execPath, [electronBin, root], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, CIRCADIA_DEV: "1" },
});

function shutdown() {
  if (!next.killed) next.kill();
  if (!electron.killed) electron.kill();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

electron.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});
