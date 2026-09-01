"use strict";

/**
 * Pick a connected physical iPhone for native-run / xcodebuild.
 * IDs must come from native-run — CoreDevice UUIDs from `xcrun devicectl`
 * do not match `--target`. Never returns a simulator. Prefer James-iPhone.
 */

function asList(payload) {
  if (Array.isArray(payload)) {
    const devices = payload
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        id: row.id,
        name: row.name || row.id,
        virtual: /\(\s*simulator\s*\)|\(\s*emulator\s*\)/i.test(String(row.name || "")),
        platform: row.platform || "ios",
        model: row.api || row.model || "",
      }));
    return { devices, virtualDevices: [] };
  }
  if (!payload || typeof payload !== "object") return { devices: [], virtualDevices: [] };
  const devices = Array.isArray(payload.devices) ? payload.devices : [];
  const virtualDevices = Array.isArray(payload.virtualDevices) ? payload.virtualDevices : [];
  return { devices, virtualDevices };
}

function isIphone(row) {
  const blob = `${row.name || ""} ${row.model || ""} ${row.platform || ""}`;
  return /iphone/i.test(blob);
}

function usableId(id) {
  return typeof id === "string" && id.length > 0 && id !== "?";
}

function pickConnectedIphone(payload) {
  const { devices } = asList(payload);
  const physical = devices.filter((d) => d && d.virtual !== true && usableId(d.id));
  const iphones = physical.filter(isIphone);
  const pool = iphones.length ? iphones : physical;
  if (!pool.length) return null;
  const named = process.env.CIRCADIA_IPHONE_NAME?.trim();
  if (named) {
    const hit = pool.find((d) => String(d.name || "") === named);
    if (hit) return hit;
  }
  const james = pool.find((d) => /james-iphone/i.test(String(d.name || "")));
  return james || pool[0];
}

function parseDevicectlTable(text) {
  const devices = [];
  const uuid =
    /([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/;
  for (const line of String(text || "").split("\n")) {
    if (!/iphone/i.test(line)) continue;
    const id = line.match(uuid)?.[1];
    if (!id) continue;
    const state = /\bunavailable\b/i.test(line)
      ? "unavailable"
      : /\bconnected\b/i.test(line) || /\bavailable\b/i.test(line)
        ? "connected"
        : "unknown";
    if (state !== "connected") continue;
    const name = line.trim().split(/\s+/)[0] || "iPhone";
    devices.push({ id, name, virtual: false, model: "iPhone" });
  }
  return { devices, virtualDevices: [] };
}

function extractJson(text) {
  const raw = String(text || "");
  const candidates = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "{" && raw[i] !== "[") continue;
    const close = raw[i] === "{" ? "}" : "]";
    const j = raw.lastIndexOf(close);
    if (j <= i) continue;
    try {
      candidates.push(JSON.parse(raw.slice(i, j + 1)));
    } catch {
      /* npx / Capacitor may print logs before the JSON */
    }
  }
  const native = candidates.find(
    (c) =>
      c &&
      typeof c === "object" &&
      !Array.isArray(c) &&
      (Array.isArray(c.devices) || Array.isArray(c.virtualDevices)),
  );
  if (native) return native;
  const list = candidates.find(
    (c) => Array.isArray(c) && c.some((row) => row && typeof row === "object" && typeof row.id === "string"),
  );
  if (list) return list;
  return candidates[0] ?? null;
}

function unavailableHint(devicectlText) {
  const text = String(devicectlText || "");
  return /iphone/i.test(text) && /\bunavailable\b/i.test(text);
}

module.exports = {
  pickConnectedIphone,
  parseDevicectlTable,
  extractJson,
  unavailableHint,
};

if (require.main === module) {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const { nativeRunBin } = require("./ios-install.cjs");
  const root = path.join(__dirname, "..");
  const phone = path.join(root, "phone");
  const bin = nativeRunBin(root);
  const listed = bin
    ? spawnSync(bin, ["ios", "--list", "--json"], { cwd: phone, encoding: "utf8" })
    : spawnSync("npx", ["cap", "run", "ios", "--list", "--json"], { cwd: phone, encoding: "utf8" });
  const raw = `${listed.stdout || ""}\n${listed.stderr || ""}`;
  const pick = pickConnectedIphone(extractJson(raw));
  if (!pick) {
    let table = "";
    if (process.platform === "darwin") {
      const listedDevices = spawnSync("xcrun", ["devicectl", "list", "devices"], { encoding: "utf8" });
      table = `${listedDevices.stdout || ""}\n${listedDevices.stderr || ""}`;
    }
    if (unavailableHint(table)) {
      console.error("James-iPhone is listed but unavailable. Unlock it and plug in USB, then run this again.");
    } else {
      console.error("No connected iPhone. Unlock it, plug in USB if the list said unavailable, then run this again.");
    }
    console.error("Do not use Xcode destination Any iOS Device (arm64). That never installs on the phone.");
    process.exit(10);
  }
  console.log(`${pick.name || "iPhone"}\t${pick.id}`);
}
