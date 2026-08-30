"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const defaultRoot = path.join(__dirname, "..");

function dirs(root) {
  return {
    apiSrc: path.join(root, "src", "app", "api"),
    apiPark: path.join(root, ".api-parked"),
    modSrc: path.join(root, "src", "app", "mod"),
    modPark: path.join(root, ".mod-parked"),
  };
}

function restoreOne(src, park) {
  if (!fs.existsSync(park)) return;
  if (fs.existsSync(src)) {
    fs.rmSync(park, { recursive: true, force: true });
    return;
  }
  fs.renameSync(park, src);
}

function restoreSurfaces(root = defaultRoot) {
  const d = dirs(root);
  restoreOne(d.apiSrc, d.apiPark);
  restoreOne(d.modSrc, d.modPark);
}

function parkSurfaces(root = defaultRoot) {
  restoreSurfaces(root);
  const d = dirs(root);
  if (fs.existsSync(d.apiSrc)) fs.renameSync(d.apiSrc, d.apiPark);
  if (fs.existsSync(d.modSrc)) fs.renameSync(d.modSrc, d.modPark);
}

function packStatic(root = defaultRoot) {
  let code = 0;
  try {
    parkSurfaces(root);
    fs.rmSync(path.join(root, "out"), { recursive: true, force: true });
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
    if (result.status) code = result.status;
    else if (!fs.existsSync(path.join(root, "out", "index.html"))) {
      console.error("Static export did not produce out/index.html");
      code = 1;
    }
  } catch (err) {
    console.error(err);
    code = 1;
  } finally {
    restoreSurfaces(root);
  }
  return code;
}

if (require.main === module) {
  const code = packStatic();
  if (code) process.exit(code);
  console.log("Static UI is in out/");
}

module.exports = { parkSurfaces, restoreSurfaces, packStatic };
