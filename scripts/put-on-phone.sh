#!/usr/bin/env bash
# Put the Circadia diary on a reachable iPhone.
# Signing Team comes from this Mac's Apple Development certificate, not from Xcode's picker
# and not from git. Destination is never Any iOS Device.
#
# USB: only this install, and only if the phone is unavailable.
# After Circadia is on the home screen, unplug. The app does not talk to the Mac.
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

TEAM="$(node scripts/ios-team.cjs)" || {
  echo
  echo "Stopped. This Mac has no Apple Development certificate, so the iPhone build cannot be signed."
  echo "Xcode → Settings → Accounts → your Apple ID. Close Xcode. Do not press Run."
  echo "Then: npm run put-on-phone"
  exit 12
}
TEAM="$(printf '%s' "$TEAM" | tr -d '[:space:]')"
if [[ ! "$TEAM" =~ ^[A-Z0-9]{10}$ ]]; then
  echo
  echo "Stopped. Could not read a development team id from this Mac."
  echo "Xcode → Settings → Accounts → your Apple ID. Close Xcode. Do not press Run."
  echo "Then: npm run put-on-phone"
  exit 12
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
echo "Signing does not open Xcode. The Team stays on this Mac, not in git."

PICK="$(node scripts/ios-target.cjs)" || {
  echo
  echo "James-iPhone is not reachable for this install."
  echo "Unlock it. If the list said unavailable, plug in USB for this one install."
  echo "After Circadia is on the home screen, unplug. The app does not talk to the Mac."
  exit 10
}

NAME="${PICK%%$'\t'*}"
ID="${PICK#*$'\t'}"
echo "Target: $NAME ($ID)"

set +e
node scripts/ios-install.cjs --target "$ID"
STATUS=$?
set -e
if [[ "$STATUS" -eq 13 ]]; then
  echo
  echo "Stopped. Xcode has no signed-in Apple ID that can create a profile for this app,"
  echo "and this Mac has no leftover development profile for app.circadia.diary."
  echo "Xcode → Settings → Accounts → your Apple ID. Wait until a team appears."
  echo "Close Xcode. Do not press Run. Do not use Any iOS Device."
  echo "Then: npm run put-on-phone"
  exit 13
fi
if [[ "$STATUS" -ne 0 ]]; then
  echo
  echo "Install did not finish. Circadia is not on the phone until this step succeeds."
  echo "If the phone is unavailable, unlock it, plug in USB for this one install, run this again."
  echo "Do not use destination Any iOS Device (arm64). Do not press Run in Xcode."
  exit 11
fi

VERSION="$(node -p 'require("./package.json").version')"
echo
echo "Circadia should now open on $NAME. Footer must read ${VERSION} · diary packed."
echo "Then Log in with the same email or phone and password."
echo "Unplug. The installed app does not need the Mac after that."
echo
echo "If the footer is not ${VERSION} · diary packed, this install did not reach the phone."
echo "First launch: Settings → General → VPN & Device Management → trust the developer cert."
