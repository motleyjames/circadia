#!/usr/bin/env bash
# Put the Circadia diary on a reachable iPhone.
# Destination is never Any iOS Device. Signing does not open Xcode.
# A leftover development profile is enough. An Xcode Accounts team is enough.
# A signed-in Xcode 16 Apple ID with no stored team id is enough.
# A keychain certificate alone is not automatic signing.
#
# USB: only this install, and only if the idle tunnel never comes back.
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

if [[ -z "${CIRCADIA_IPHONE_WAIT_MS:-}" ]]; then
  export CIRCADIA_IPHONE_WAIT_MS=600000
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

if ! node scripts/deps-missing.cjs; then
  echo "Installing dependencies (new packages after git pull)…"
  npm install
fi

SYNCED=0
  if [[ "${CIRCADIA_FORCE_PHONE_SYNC:-}" == "1" ]] || ! node scripts/phone-pack-fresh.cjs; then
  npm run phone:sync
  SYNCED=1
else
  echo "iPhone pack already matches this commit, this version, and the locked diary. Skipping the Next.js rebuild."
  echo "If Tonight still opens like the old install, quit this script and run: CIRCADIA_FORCE_PHONE_SYNC=1 npm run put-on-phone"
fi

set +e
TEAM="$(node scripts/ios-team.cjs)"
TEAM_STATUS=$?
set -e
TEAM="$(printf '%s' "$TEAM" | tr -d '[:space:]')"
if [[ "$TEAM_STATUS" -ne 0 ]]; then
  echo "No stored Team ID yet. Install will still look for a leftover profile or a signed-in Xcode account."
  TEAM=""
fi

INDEX="phone/ios/App/App/public/index.html"
if [[ ! -f "$INDEX" ]] || ! grep -q '__CIRCADIA_PACK_STATUS__="packed"' "$INDEX"; then
  echo
  echo "Stopped. This iPhone build has no locked diary in it — login would miss."
  echo "Open Circadia.app, log in, wait a few seconds, then run this again."
  echo "Looked for ~/Library/Application Support/Circadia/vault.json"
  echo "Empty iPhone (no nights): CIRCADIA_ALLOW_EMPTY_PHONE=1 npm run put-on-phone"
  exit 8
fi

if ! node scripts/assert-phone-app.cjs phone/ios/App/App/public; then
  echo
  echo "Stopped. The packed iPhone diary is not this Circadia version."
  echo "CIRCADIA_FORCE_PHONE_SYNC=1 npm run put-on-phone"
  exit 11
fi

if [[ "$SYNCED" -eq 1 ]]; then
  mkdir -p phone/ios/App/App/public
  touch phone/ios/App/App/public phone/ios/App/App/public/index.html 2>/dev/null || true
  node scripts/phone-pack-fresh.cjs --write || true
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
  echo "No iPhone hardware UDID on this Mac. Pair James-iPhone (USB once, Trust)."
  echo "Unlock it. Plug in USB for this one install if the list stays empty."
  echo "The diary pack is already on disk. The next run skips the Next.js rebuild."
  echo "After Circadia is on the home screen, unplug. The app does not talk to the Mac."
  exit 10
}

NAME=""
ID=""
CORE=""
IFS=$'\t' read -r NAME ID CORE <<< "$PICK"
echo "Target: $NAME ($ID)"

echo "Copying the phone diary onto this Mac (ciphertext) so Circadia.app can fold those nights."
node scripts/ios-pull-vault.cjs --target "$ID" || true

INSTALL_ARGS=(--target "$ID")
if [[ -n "${CORE:-}" && "$CORE" != "$ID" ]]; then
  INSTALL_ARGS+=(--core-device "$CORE")
fi
if [[ "$TEAM" =~ ^[A-Z0-9]{10}$ ]]; then
  INSTALL_ARGS+=(--fallback-team "$TEAM")
fi

set +e
node scripts/ios-install.cjs "${INSTALL_ARGS[@]}"
STATUS=$?
set -e
if [[ "$STATUS" -eq 13 ]]; then
  echo
  echo "Stopped. No leftover development profile for this iPhone was usable,"
  echo "and Xcode did not expose an Accounts team or a signed-in Apple ID."
  echo "The diagnosis is above. This is not USB and not the packed diary."
  echo "Xcode → Settings → Accounts → your Apple ID. Wait until a team appears."
  echo "Close Xcode. Do not press Run. Do not use Any iOS Device."
  echo "Then: npm run put-on-phone"
  exit 13
fi
if [[ "$STATUS" -ne 0 ]]; then
  echo
    echo "Install did not finish. Circadia is not on the phone until this step succeeds."
    echo "CoreDevice needs a live tunnel, not just a paired row. Unlock James-iPhone, keep the screen on, plug in USB."
  echo "The diary pack is already on disk. The next run skips the Next.js rebuild."
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
