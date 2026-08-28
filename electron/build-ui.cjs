"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const apiDir = path.join(root, "src", "app", "api");
const apiPark = path.join(root, ".api-parked");

function parkApi() {
  if (fs.existsSync(apiPark)) fs.rmSync(apiPark, { recursive: true, force: true });
  if (fs.existsSync(apiDir)) fs.renameSync(apiDir, apiPark);
}

function restoreApi() {
  if (fs.existsSync(apiPark)) {
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true, force: true });
    fs.renameSync(apiPark, apiDir);
  }
}

parkApi();
try {
  fs.rmSync(path.join(root, ".next"), { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CIRCADIA_ELECTRON: "1", CIRCADIA_PACK_STATIC: "1" },
    },
  );
  if (result.status) {
    restoreApi();
    process.exit(result.status);
  }
  if (!fs.existsSync(path.join(root, "out", "index.html"))) {
    restoreApi();
    console.error("Static export did not produce out/index.html");
    process.exit(1);
  }
} finally {
  restoreApi();
}

console.log("Static UI is in out/");
