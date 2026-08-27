"use strict";

/**
 * Circadia Operator. Not the diary. Not the Dock app.
 * Run from rest-ai:  npm run mod   or   node electron/run-mod.cjs
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = "43149";

if (!require("node:fs").existsSync(nextBin)) {
  console.error("Next is missing. Inside rest-ai run: npm install");
  process.exit(1);
}

process.env.CIRCADIA_SURFACE = "mod";
process.env.NEXT_PUBLIC_CIRCADIA_SURFACE = "mod";

console.log("");
console.log("Circadia Operator");
console.log(`Open  http://127.0.0.1:${port}`);
console.log("Passphrase  circadia-local");
console.log("The diary is a different app. Circadia.app is not this.");
console.log("");

const child = spawn(process.execPath, [nextBin, "dev", "--port", port, "--hostname", "127.0.0.1"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
