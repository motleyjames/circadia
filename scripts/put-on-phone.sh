#!/usr/bin/env bash
# Put the Circadia diary on a plugged-in iPhone via Xcode.
# Diary only. Not Operator. Not the simulator.

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
  echo "This script opens Xcode on macOS. Run it on your Mac, in a 0.7.0+ clone."
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
npm run phone:open

cat <<'EOF'

Xcode should be open on the Circadia diary (app.circadia.diary). Not Operator.

1. Plug in the iPhone. Unlock it. Trust this computer if it asks.
2. iPhone: Settings → Privacy & Security → Developer Mode → on, then reboot if iOS asks.
3. In Xcode, pick the App target. Signing & Capabilities → Team → your Apple ID.
4. Destination: your iPhone. Not any simulator — Keychain and lock-screen audio lie there.
5. Run. First launch: the phone may say Untrusted Developer. Settings → General → VPN & Device Management → trust.

That is Circadia on YOUR phone. Other people need TestFlight and a paid Apple Developer Program
membership (start that at https://developer.apple.com/programs/ if it is not already running).
Simulator, Safari, and sideloading are not this path.
EOF
