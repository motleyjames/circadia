"use strict";

/**
 * Copy the locked Mac diary into the iPhone static pack.
 * Ciphertext only. Password is typed on the phone. Stay-signed-in does not travel.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LOCKED_KIND = "circadia.locked-diary";

function vaultPath() {
  const fromEnv = process.env.CIRCADIA_VAULT_FILE?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Circadia", "vault.json");
  }
  return path.join(process.cwd(), "data", "vault.json");
}

function main() {
  const root = process.cwd();
  const outDir = path.join(root, "out");
  const dest = path.join(outDir, "circadia-locked.json");
  if (!fs.existsSync(outDir)) {
    console.error("out/ is missing. Run pack:static first.");
    process.exit(7);
  }

  const file = vaultPath();
  if (!fs.existsSync(file)) {
    console.log("No Mac diary to pack. The iPhone will start empty. Log nights here first, or AirDrop a locked copy.");
    process.exit(0);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.error("The Mac diary file is unreadable. Phone pack continues empty.");
    process.exit(0);
  }

  const files = raw && raw.files && typeof raw.files === "object" && !Array.isArray(raw.files) ? raw.files : {};
  const locks = raw && raw.locks && typeof raw.locks === "object" && !Array.isArray(raw.locks) ? raw.locks : {};
  if (Object.keys(files).length === 0) {
    console.log("Mac diary has no files. The iPhone will start empty.");
    process.exit(0);
  }

  const pack = {
    kind: LOCKED_KIND,
    v: 1,
    vault: { v: 1, files, locks, session: null },
  };
  fs.writeFileSync(dest, JSON.stringify(pack), { encoding: "utf8", mode: 0o600 });
  console.log("Packed the locked diary into the iPhone build. On the phone, log in with the same email or phone and password.");
}

main();
