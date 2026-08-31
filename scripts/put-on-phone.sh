#!/usr/bin/env bash
# Put the Circadia diary on an iPhone via Xcode.
# USB is optional after the first pair. The installed app never needs a cable.
# Diary only. Not Operator. Not the simulator. Not a Circadia server.

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

if command -v xcrun >/dev/null 2>&1; then
  echo
  echo "Phones this Mac can already see (USB or Wi-Fi):"
  xcrun devicectl list devices 2>/dev/null || true
fi

cat <<'EOF'

Xcode should be open on the Circadia diary (app.circadia.diary). Not Operator.

Circadia on the iPhone does not use a cable and does not call a Circadia server.
The cable (or Wi-Fi to this Mac) is only how Xcode puts a new build on the phone.
After Run finishes, unplug. Open Circadia from the home screen like any app.

Wireless (same Wi-Fi, phone unlocked):
1. Xcode → Window → Devices and Simulators → pick James-iPhone → Connect via network.
2. Destination: James-iPhone. Not a simulator. A globe/network icon next to the phone is the wireless path.
3. Signing & Capabilities → Team → your Apple ID, if Xcode cleared it after git pull.
4. Run. Unplug when the app is on the home screen. If this Mac had a diary, it is packed in the build — log in with the same password.

First pair only: a USB cable once, Unlock, Trust. After that, Wi-Fi is enough.
If Xcode says the device is disconnected, plug in once, tick Connect via network, then unplug.

First launch on the phone: Settings → General → VPN & Device Management → trust the developer cert.
Developer Mode if iOS asks.

Other people need TestFlight and a paid Apple Developer Program
membership (https://developer.apple.com/programs/). Simulator, Safari, and sideloading are not this path.
EOF
