"use strict";

const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = 43147;
const URL = `http://127.0.0.1:${PORT}`;
const root = path.join(__dirname, "..");

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const req = http.get(URL, (res) => {
        res.resume();
        resolve(undefined);
      });
      req.on("error", () => {
        if (Date.now() - started > 60_000) {
          reject(new Error("Next.js did not become ready on 127.0.0.1:43147"));
          return;
        }
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const electronBin = path.join(root, "node_modules", "electron", "cli.js");

const next = spawn(process.execPath, [nextBin, "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

function shutdown() {
  if (!next.killed) next.kill();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

waitForServer()
  .then(() => {
    const electron = spawn(process.execPath, [electronBin, root], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CIRCADIA_DEV: "1" },
    });
    electron.on("exit", (code) => {
      shutdown();
      process.exit(code ?? 0);
    });
  })
  .catch((error) => {
    console.error(error);
    shutdown();
    process.exit(1);
  });
