"use strict";

/**
 * Copy the phone's vault.json onto this Mac as fold-inbox.circadia.
 * Ciphertext only. Never decrypts. Never fails the install — missing phone
 * diary is a skip, not an error. Darwin-only; other platforms exit 0.
 *
 * Capacitor Directory.Data is the app Documents folder (vault.json).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BUNDLE_ID = "app.circadia.diary";
const LOCKED_KIND = "circadia.locked-diary";
const MAX_BYTES = 20 * 1024 * 1024;

/** Tried in order. Capacitor Data → Documents; older builds used Library/NoCloud. */
const SOURCE_CANDIDATES = [
  "Documents/vault.json",
  "/Documents/vault.json",
  "Library/NoCloud/vault.json",
  "Documents/capacitor/vault.json",
];

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("-")) return null;
  return next;
}

function inboxPath() {
  const fromEnv = process.env.CIRCADIA_FOLD_INBOX_FILE?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Circadia", "fold-inbox.circadia");
  }
  return path.join(process.cwd(), "data", "fold-inbox.circadia");
}

function hasFiles(files) {
  return Boolean(files && typeof files === "object" && !Array.isArray(files) && Object.keys(files).length > 0);
}

/**
 * Wrap a phone vault.json or an already-locked pack. Session is stripped.
 * Hostile / empty input returns null — do not write the inbox.
 */
function wrapLockedDiary(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  if (parsed.kind === LOCKED_KIND) {
    if (parsed.v !== 1) return null;
    const vault = parsed.vault;
    if (!vault || typeof vault !== "object" || !hasFiles(vault.files)) return null;
    return {
      kind: LOCKED_KIND,
      v: 1,
      vault: {
        v: typeof vault.v === "number" ? vault.v : 1,
        files: vault.files,
        locks: vault.locks && typeof vault.locks === "object" ? vault.locks : {},
        session: null,
      },
    };
  }

  if (parsed.kind !== undefined) return null;
  if (typeof parsed.v !== "number" || !hasFiles(parsed.files)) return null;
  return {
    kind: LOCKED_KIND,
    v: 1,
    vault: {
      v: parsed.v,
      files: parsed.files,
      locks: parsed.locks && typeof parsed.locks === "object" ? parsed.locks : {},
      session: null,
    },
  };
}

function copyFromDevice(udid, source, dest) {
  const attempts = [[], ["--user", "mobile"]];
  for (const extra of attempts) {
    const result = spawnSync(
      "xcrun",
      [
        "devicectl",
        "device",
        "copy",
        "from",
        "--device",
        udid,
        "--domain-type",
        "appDataContainer",
        "--domain-identifier",
        BUNDLE_ID,
        ...extra,
        "--source",
        source,
        "--destination",
        dest,
      ],
      { encoding: "utf8" },
    );
    if (result.status === 0 && fs.existsSync(dest)) {
      const st = fs.statSync(dest);
      if (st.isFile() && st.size > 0) return true;
    }
  }
  return false;
}

function writeInbox(pack) {
  const out = inboxPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(pack), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, out);
}

function pullVault(udid) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "circadia-pull-"));
  try {
    for (const source of SOURCE_CANDIDATES) {
      const dest = path.join(tmpDir, "vault.json");
      try {
        fs.unlinkSync(dest);
      } catch {
        /* first try */
      }
      if (!copyFromDevice(udid, source, dest)) continue;
      const st = fs.statSync(dest);
      if (st.size > MAX_BYTES) continue;
      const raw = fs.readFileSync(dest, "utf8");
      const pack = wrapLockedDiary(raw);
      if (!pack) continue;
      writeInbox(pack);
      console.log("Copied the phone diary onto this Mac (ciphertext) so Circadia.app can fold those nights.");
      return true;
    }
    console.log("No phone diary to copy. Continuing.");
    return false;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  try {
    if (process.platform !== "darwin") {
      console.log("Skipping phone vault pull (not macOS).");
      process.exit(0);
    }
    const target = argValue("--target");
    if (!target) {
      console.log("No iPhone target — skipping phone vault pull.");
      process.exit(0);
    }
    pullVault(target);
    process.exit(0);
  } catch {
    console.log("Phone vault pull did not finish. Continuing.");
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  BUNDLE_ID,
  SOURCE_CANDIDATES,
  inboxPath,
  wrapLockedDiary,
};
