"use strict";

/**
 * Copy the locked Mac diary into the iPhone static pack.
 * Ciphertext only. Password is typed on the phone. Stay-signed-in does not travel.
 *
 * Writes circadia-locked.json AND inlines the pack into index.html so WKWebView
 * does not have to fetch a sidecar file (that fetch is how 0.7.3 missed).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LOCKED_KIND = "circadia.locked-diary";
const MARK_START = "<!--circadia-locked-diary-->";
const MARK_END = "<!--/circadia-locked-diary-->";

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("-")) return null;
  return next;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function allowEmpty() {
  return hasFlag("--allow-empty") || process.env.CIRCADIA_ALLOW_EMPTY_PHONE === "1";
}

function vaultCandidates(root) {
  const home = os.homedir();
  const envPath = process.env.CIRCADIA_VAULT_FILE?.trim();
  if (envPath) return [envPath];
  const list = [
    path.join(home, "Library", "Application Support", "Circadia", "vault.json"),
    path.join(home, "Library", "Application Support", "circadia", "vault.json"),
    path.join(
      home,
      "Library",
      "Containers",
      "app.circadia.desktop",
      "Data",
      "Library",
      "Application Support",
      "Circadia",
      "vault.json",
    ),
    path.join(root, "data", "vault.json"),
  ];
  return [...new Set(list)];
}

function readVault(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const files = raw && raw.files && typeof raw.files === "object" && !Array.isArray(raw.files) ? raw.files : {};
    const locks = raw && raw.locks && typeof raw.locks === "object" && !Array.isArray(raw.locks) ? raw.locks : {};
    const n = Object.keys(files).length;
    if (!n) return null;
    let bytes = 0;
    try {
      bytes = Buffer.byteLength(JSON.stringify(files));
    } catch {
      bytes = n;
    }
    return { file, files, locks, n, bytes };
  } catch {
    return null;
  }
}

function pickVault(root) {
  let best = null;
  for (const file of vaultCandidates(root)) {
    if (!fs.existsSync(file)) continue;
    const hit = readVault(file);
    if (!hit) continue;
    if (!best || hit.n > best.n || (hit.n === best.n && hit.bytes > best.bytes)) best = hit;
  }
  return best;
}

function packScript(pack, status) {
  const json = status === "packed" ? JSON.stringify(pack).replace(/</g, "\\u003c") : "null";
  return (
    MARK_START +
    "\n<script>window.__CIRCADIA_PACK_STATUS__=" +
    JSON.stringify(status) +
    ";window.__CIRCADIA_LOCKED_DIARY__=" +
    json +
    ";</script>\n" +
    MARK_END
  );
}

function injectIndex(indexPath, pack, status) {
  if (!fs.existsSync(indexPath)) return false;
  let html = fs.readFileSync(indexPath, "utf8");
  const block = packScript(pack, status);
  const start = html.indexOf(MARK_START);
  const end = html.indexOf(MARK_END);
  if (start !== -1 && end !== -1 && end > start) {
    html = html.slice(0, start) + block + html.slice(end + MARK_END.length);
  } else if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => m + "\n" + block);
  } else {
    html = block + "\n" + html;
  }
  fs.writeFileSync(indexPath, html);
  return true;
}

function alreadyPacked(dir) {
  const index = path.join(dir, "index.html");
  if (!fs.existsSync(index)) return false;
  return fs.readFileSync(index, "utf8").includes('__CIRCADIA_PACK_STATUS__="packed"');
}

function writeDest(dir, pack, status) {
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, "circadia-locked.json");
  if (status === "packed") {
    fs.writeFileSync(jsonPath, JSON.stringify(pack), { encoding: "utf8", mode: 0o600 });
  } else if (fs.existsSync(jsonPath)) {
    fs.rmSync(jsonPath, { force: true });
  }
  injectIndex(path.join(dir, "index.html"), pack, status);
}

function printNoDiary(candidates) {
  console.error("Stopped. No locked diary to put on the iPhone.");
  console.error("Open Circadia.app, log in, wait a few seconds, then run this again.");
  console.error("Looked in:");
  for (const file of candidates) console.error("  " + file);
  console.error("Empty iPhone (no nights): CIRCADIA_ALLOW_EMPTY_PHONE=1 npm run put-on-phone");
}

function main() {
  const root = argValue("--root") || process.cwd();
  const outDir = path.join(root, "out");
  const iosPublic = argValue("--ios-public");
  const destDirs = [];
  if (fs.existsSync(outDir)) destDirs.push(outDir);
  if (iosPublic) destDirs.push(path.resolve(iosPublic));

  if (!destDirs.length) {
    console.error("out/ is missing. Run pack:static first.");
    process.exit(7);
  }

  const hit = pickVault(root);
  if (!hit) {
    if (!allowEmpty()) {
      printNoDiary(vaultCandidates(root));
      process.exit(8);
    }
    let kept = false;
    for (const dir of destDirs) {
      if (alreadyPacked(dir)) {
        kept = true;
        continue;
      }
      writeDest(dir, null, "empty");
    }
    if (kept) {
      console.log("No live diary on disk. Left the locked diary already in this iPhone build.");
    } else {
      console.log("No Mac diary to pack. The iPhone build is empty on purpose.");
    }
    process.exit(0);
  }

  const pack = {
    kind: LOCKED_KIND,
    v: 1,
    vault: { v: 1, files: hit.files, locks: hit.locks, session: null },
  };
  for (const dir of destDirs) writeDest(dir, pack, "packed");
  const noun = hit.n === 1 ? "file" : "files";
  console.log(
    "Packed the locked diary (" +
      hit.n +
      " " +
      noun +
      ") into the iPhone build. On the phone, log in with the same password.",
  );
}

main();
