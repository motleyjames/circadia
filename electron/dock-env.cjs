"use strict";

/**
 * Dock (Circadia.app / Operator.app) and the iPhone pack are two compiles.
 * put-on-phone used to `next build` into `.next` with
 * NEXT_PUBLIC_CIRCADIA_PHONE_PACK inlined, then Circadia.app's `next start`
 * skipped a rebuild because BUILD_ID was newer than src — so the Dock
 * window served the phone bundle and the CSS open never ran.
 */

const fs = require("node:fs");
const path = require("node:path");

function stripPackLeakEnv(env = process.env) {
  const next = { ...env };
  delete next.CIRCADIA_ELECTRON;
  delete next.CIRCADIA_PACK_STATIC;
  delete next.CIRCADIA_SESSION_TOKEN;
  delete next.NEXT_PUBLIC_CIRCADIA_PHONE_PACK;
  return next;
}

function dockCompileEnv(operator, sourceEnv = process.env) {
  const env = stripPackLeakEnv(sourceEnv);
  if (operator) {
    env.CIRCADIA_SURFACE = "mod";
    env.NEXT_PUBLIC_CIRCADIA_SURFACE = "mod";
  } else {
    delete env.CIRCADIA_SURFACE;
    delete env.NEXT_PUBLIC_CIRCADIA_SURFACE;
  }
  return env;
}

function expectedKind(operator) {
  return operator ? "operator-server" : "diary-server";
}

function distDirName(operator) {
  return operator ? ".next-mod" : ".next";
}

function kindPath(root, operator) {
  return path.join(root, distDirName(operator), "circadia-kind");
}

function isServerCompile(dir) {
  const manifestPath = path.join(dir, "required-server-files.json");
  if (!fs.existsSync(path.join(dir, "BUILD_ID")) || !fs.existsSync(manifestPath)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return manifest?.config?.output !== "export";
  } catch {
    return false;
  }
}

function isDiaryServerKind(root, operator) {
  try {
    if (fs.readFileSync(kindPath(root, operator), "utf8").trim() !== expectedKind(operator)) {
      return false;
    }
    return isServerCompile(path.join(root, distDirName(operator)));
  } catch {
    return false;
  }
}

function writeDiaryServerKind(root, operator) {
  const dir = path.join(root, distDirName(operator));
  if (!isServerCompile(dir)) {
    throw new Error("Dock compile is not a server tree; refusing to stamp it.");
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(kindPath(root, operator), expectedKind(operator));
}

const DOCK_STASH = ".next-dock-stash";

function stashPath(root) {
  return path.join(root, DOCK_STASH);
}

/** Next `output: "export"` with a custom distDir remaps that folder to `out/`
 * and still builds into `.next`. Stash the Dock server tree around a pack. */
function stashDiaryServer(root) {
  const nextDir = path.join(root, distDirName(false));
  const stash = stashPath(root);
  fs.rmSync(stash, { recursive: true, force: true });
  if (!isDiaryServerKind(root, false)) return false;
  fs.renameSync(nextDir, stash);
  return true;
}

function restoreDiaryServer(root) {
  const nextDir = path.join(root, distDirName(false));
  const stash = stashPath(root);
  fs.rmSync(nextDir, { recursive: true, force: true });
  if (!fs.existsSync(stash)) return false;
  fs.renameSync(stash, nextDir);
  return true;
}

module.exports = {
  stripPackLeakEnv,
  dockCompileEnv,
  expectedKind,
  distDirName,
  isServerCompile,
  isDiaryServerKind,
  writeDiaryServerKind,
  DOCK_STASH,
  stashDiaryServer,
  restoreDiaryServer,
};
