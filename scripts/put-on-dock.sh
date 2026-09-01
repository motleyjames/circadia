#!/usr/bin/env bash
# Put Circadia + Circadia Operator on this Mac's Dock.
# Must run from the 0.6.5+ tree. Will refuse ~/rest-ai at 0.5.0.

set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (p.name !== "circadia") {
  console.error("Not Circadia. cd into the Circadia 0.6.5 folder.");
  process.exit(2);
}
const [maj, min, pat] = String(p.version).split(".").map((n) => parseInt(n, 10));
const ok = maj > 0 || min > 6 || (min === 6 && pat >= 5);
if (!ok) {
  console.error("This folder is Circadia " + p.version + ". Dock install needs 0.6.5+.");
  console.error("Do not run this in an old rest-ai clone.");
  process.exit(3);
}
console.log("Circadia " + p.version);
'

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script wraps .app files on macOS. Run it on your Mac, in this 0.6.5 folder."
  exit 4
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "swiftc is missing. Run: xcode-select --install"
  echo "Then run this script again."
  exit 5
fi

if ! node scripts/deps-missing.cjs; then
  echo "Installing dependencies (new packages after git pull)…"
  npm install
fi

npm run dock
