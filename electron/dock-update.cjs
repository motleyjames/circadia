"use strict";

/**
 * Dock apps run Node from the clone in install.json.
 * Opening Circadia pulls GitHub main (public, no Keychain) then serve-dock rebuilds.
 * This Linux VM cannot write /Applications — git push is the deploy.
 */

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const UPDATE_URL = "https://github.com/motleyjames/circadia.git";
const BRANCH = "main";

function git(root, args) {
  return spawnSync("git", ["-c", "credential.helper=", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function isGitRepo(root) {
  return git(root, ["rev-parse", "--is-inside-work-tree"]).stdout.trim() === "true";
}

function dirty(root) {
  return (git(root, ["status", "--porcelain"]).stdout || "").trim().length > 0;
}

function currentBranch(root) {
  return git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
}

function hashFile(file) {
  if (!fs.existsSync(file)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function withLock(root, fn) {
  const lockDir = path.join(root, ".circadia-update.lock");
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lockDir);
      try {
        return fn();
      } finally {
        fs.rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (err) {
      if (!err || err.code !== "EEXIST") throw err;
      spawnSync("sleep", ["0.3"]);
    }
  }
  return { ok: true, skipped: "lock" };
}

function npmCi(root) {
  if (process.env.CIRCADIA_SKIP_NPM === "1") return { ok: true, skipped: "npm" };
  const result = spawnSync("npm", ["ci"], { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) return { ok: false, error: "npm ci failed" };
  return { ok: true };
}

function pullDockTree(root, opts = {}) {
  if (process.env.CIRCADIA_SKIP_UPDATE === "1" || opts.skip) {
    return { ok: true, skipped: "env" };
  }
  if (!isGitRepo(root)) return { ok: true, skipped: "not-git" };
  const branch = currentBranch(root);
  if (branch !== BRANCH) return { ok: true, skipped: "branch", branch };

  const url = opts.url || process.env.CIRCADIA_UPDATE_URL || UPDATE_URL;

  return withLock(root, () => {
    if (dirty(root)) return { ok: true, skipped: "dirty" };
    const before = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    const lockBefore = hashFile(path.join(root, "package-lock.json"));
    const fetch = git(root, ["fetch", "--prune", url, BRANCH]);
    if (fetch.status !== 0) {
      return { ok: false, error: (fetch.stderr || fetch.stdout || "fetch failed").trim() };
    }
    const remote = git(root, ["rev-parse", "FETCH_HEAD"]).stdout.trim();
    if (!remote) return { ok: false, error: "empty FETCH_HEAD" };
    if (remote === before) return { ok: true, updated: false };
    const merge = git(root, ["merge", "--ff-only", "FETCH_HEAD"]);
    if (merge.status !== 0) {
      return { ok: false, error: (merge.stderr || "ff-only failed").trim() };
    }
    const after = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    const lockAfter = hashFile(path.join(root, "package-lock.json"));
    const needNpm =
      lockAfter !== lockBefore || !fs.existsSync(path.join(root, "node_modules", "next"));
    if (needNpm) {
      const npm = npmCi(root);
      if (!npm.ok) return npm;
    }
    return { ok: true, updated: after !== before, from: before, to: after };
  });
}

if (require.main === module) {
  const result = pullDockTree(path.join(__dirname, ".."));
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { UPDATE_URL, BRANCH, pullDockTree, dirty, isGitRepo };
