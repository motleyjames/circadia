#!/usr/bin/env bash
# Put the Circadia diary on a connected iPhone.
# Does not use Xcode destination Any iOS Device — that never installs on glass.
# USB is optional after the first pair. The installed app never needs a cable.
# Diary only. Not Operator. Not the simulator. Not a Circadia server. Not live-reload.

set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (p.name !== "circadia") {
  console.error("Not Circadia. cd into the Circadia folder from GitHub main.");
  process.exit(2);
}
const [maj, min] = String(p.version).split(".").map((n) => parseInt(n, 10));
const ok = maj > 0 || min >= 7;
if (!ok) {
  console.error("This folder is Circadia " + p.version + ". The phone port needs 0.7.0+.");
  process.exit(3);
}
console.log("Circadia " + p.version);
'

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script installs onto an iPhone from macOS. Run it on your Mac, in a 0.7.0+ clone."
  exit 4
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Xcode is missing. Install Xcode from the App Store, then: xcode-select --install"
  echo "Then run this script again."
  exit 5
fi

if [[ ! -d phone/ios/App/App.xcodeproj ]]; then
  echo "phone/ios is missing. This clone is too old. git pull from GitHub main (0.7.0+)."
  exit 6
fi

if [[ ! -d node_modules/next ]] || [[ ! -d node_modules/@capacitor/core ]]; then
  echo "Installing dependencies (including Capacitor for the phone pack)…"
  npm install
fi

npm run phone:sync

INDEX="phone/ios/App/App/public/index.html"
if [[ ! -f "$INDEX" ]] || ! grep -q '__CIRCADIA_PACK_STATUS__="packed"' "$INDEX"; then
  echo
  echo "Stopped. This iPhone build has no locked diary in it — login would miss."
  echo "Open Circadia.app, log in, wait a few seconds, then run this again."
  echo "Looked for ~/Library/Application Support/Circadia/vault.json"
  echo "Empty iPhone (no nights): CIRCADIA_ALLOW_EMPTY_PHONE=1 npm run put-on-phone"
  exit 8
fi

if command -v xcrun >/dev/null 2>&1; then
  echo
  echo "Phones this Mac can already see (USB or Wi-Fi):"
  xcrun devicectl list devices 2>/dev/null || true
fi

echo
echo "Installing onto the iPhone. This will not use destination Any iOS Device (arm64)."
echo "Do not git restore the Xcode project — that forgets your signing Team."

PICK="$(node scripts/ios-target.cjs)" || {
  echo
  echo "James-iPhone is not connected. Unlock it. Plug in USB if the list said unavailable."
  echo "Xcode → Window → Devices and Simulators → James-iPhone → Connect via network."
  echo "Do not press Run with destination Any iOS Device (arm64). That never puts Circadia on the phone."
  exit 10
}

NAME="${PICK%%$'\t'*}"
ID="${PICK#*$'\t'}"
echo "Target: $NAME ($ID)"

npm --prefix phone run run-device -- --target "$ID" || {
  echo
  echo "Install did not finish. Circadia is not on the phone until this step succeeds."
  echo "If the log mentioned signing or a development team: npm run phone:open"
  echo "then Signing & Capabilities → Team → your Apple ID. Close Xcode. Do not press Run."
  echo "Then: npm run put-on-phone"
  echo "If the phone is unavailable, unlock it, plug in USB, run this again."
  echo "Do not use destination Any iOS Device (arm64)."
  exit 11
}

VERSION="$(node -p 'require("./package.json").version')"
echo
echo "Circadia should now open on $NAME. Footer must read ${VERSION} · diary packed."
echo "Then Log in with the same email or phone and password."
echo "The installed app does not need a cable after that."
echo
echo "If the footer is still 0.7.2 or 0.7.3 or 0.7.4, this install did not reach the phone. Plug in USB and run this again."
echo "First launch: Settings → General → VPN & Device Management → trust the developer cert."
