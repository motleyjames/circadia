"use strict";

/**
 * Pick a physical iPhone for native-run / xcodebuild / devicectl.
 *
 * Two different ids show up on one phone:
 *   hardware UDID  — 00008140-001201901A93001C (or 40 hex). This is the install id.
 *   CoreDevice id  — 8-4-4-4-12 UUID from `xcrun devicectl list devices`.
 * native-run --target and xcodebuild -destination id= need the hardware UDID.
 * ProvisionedDevices in leftover profiles is the hardware UDID too.
 * Passing the CoreDevice UUID is a silent miss: destination not found, profile
 * "other-device", exit 10 after a two-minute pack.
 *
 * `unavailable` on a paired *.coredevice.local row is often an idle tunnel,
 * not an unpaired phone. We still emit the hardware UDID. Never a simulator.
 * Prefer James-iPhone.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function idsEqual(a, b) {
  return String(a || "").replace(/-/g, "").toUpperCase() === String(b || "").replace(/-/g, "").toUpperCase();
}

function isCoreDeviceUuid(id) {
  return /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
    String(id || ""),
  );
}

function isHardwareUdid(id) {
  const value = String(id || "");
  if (/^[0-9A-Fa-f]{40}$/.test(value)) return true;
  if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(value)) return true;
  return false;
}

function asList(payload) {
  if (Array.isArray(payload)) {
    const devices = payload
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        ...row,
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
  const blob = `${row.name || ""} ${row.model || ""} ${row.platform || ""} ${row.deviceType || ""} ${row.productType || ""}`;
  return /iphone/i.test(blob);
}

function usableId(id) {
  return typeof id === "string" && id.length > 0 && id !== "?";
}

function pickConnectedIphone(payload) {
  const { devices } = asList(payload);
  const physical = devices.filter((d) => d && d.virtual !== true && isHardwareUdid(d.id) && usableId(d.id));
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

function tunnelReachable(conn = {}) {
  const tunnel = String(conn.tunnelState || conn.state || "").toLowerCase();
  if (tunnel === "connected" || tunnel === "available") return true;
  return false;
}

function parseDevicectlJson(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const list = Array.isArray(root?.result?.devices)
    ? root.result.devices
    : Array.isArray(root?.devices)
      ? root.devices
      : [];
  const devices = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const hardware = row.hardwareProperties && typeof row.hardwareProperties === "object" ? row.hardwareProperties : {};
    const device = row.deviceProperties && typeof row.deviceProperties === "object" ? row.deviceProperties : {};
    const conn = row.connectionProperties && typeof row.connectionProperties === "object" ? row.connectionProperties : {};
    const name = device.name || row.name || "";
    const model = hardware.marketingName || hardware.productType || row.model || "";
    const deviceType = hardware.deviceType || hardware.platform || "";
    const udid = hardware.udid || row.udid || "";
    const coreDeviceId = row.identifier || row.coreDeviceId || "";
    if (!isHardwareUdid(udid)) continue;
    const mapped = {
      id: udid,
      name: name || "iPhone",
      virtual: String(hardware.reality || "").toLowerCase() === "virtual",
      model,
      deviceType,
      platform: hardware.platform || "iOS",
      productType: hardware.productType || "",
      coreDeviceId: isCoreDeviceUuid(coreDeviceId) ? coreDeviceId : undefined,
      pairingState: conn.pairingState || "",
      transportType: conn.transportType || "",
      tunnelState: conn.tunnelState || "",
      reachable: tunnelReachable(conn),
    };
    if (mapped.virtual) continue;
    if (!isIphone(mapped)) continue;
    devices.push(mapped);
  }
  return { devices, virtualDevices: [] };
}

function parseXctraceList(text) {
  const devices = [];
  let section = "";
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (/^==\s*Devices/i.test(line)) {
      section = "devices";
      continue;
    }
    if (/^==\s*Simulators/i.test(line)) {
      section = "simulators";
      continue;
    }
    if (section !== "devices") continue;
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+\(([0-9A-Fa-f-]+)\)\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    const detail = m[2];
    const id = m[3];
    if (isCoreDeviceUuid(id) || !isHardwareUdid(id)) continue;
    if (/\b(macbook|imac|mac mini|mac studio|mac pro)\b/i.test(name)) continue;
    if (!isIphone({ name, model: detail, platform: "ios" })) continue;
    devices.push({
      id,
      name,
      virtual: false,
      model: detail,
      reachable: true,
      source: "xctrace",
    });
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
  const devicectl = candidates.find(
    (c) => c && typeof c === "object" && c.result && Array.isArray(c.result.devices),
  );
  if (devicectl) return devicectl;
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

function mergeDeviceRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!row || !isHardwareUdid(row.id)) continue;
    const key = String(row.id).replace(/-/g, "").toUpperCase();
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, { ...row, virtual: row.virtual === true });
      continue;
    }
    byId.set(key, {
      ...prev,
      ...row,
      name: /james-iphone/i.test(String(prev.name || "")) ? prev.name : row.name || prev.name,
      coreDeviceId: prev.coreDeviceId || row.coreDeviceId,
      pairingState: row.pairingState || prev.pairingState,
      transportType: row.transportType || prev.transportType,
      tunnelState: row.tunnelState || prev.tunnelState,
      reachable: Boolean(prev.reachable || row.reachable),
      virtual: prev.virtual === true || row.virtual === true,
    });
  }
  return [...byId.values()];
}

function scanInstallableIphones({ nativeRunJson, devicectlJson, xctraceText } = {}) {
  const rows = [];
  if (nativeRunJson != null && nativeRunJson !== "") {
    const extracted = typeof nativeRunJson === "string" ? extractJson(nativeRunJson) : nativeRunJson;
    for (const d of asList(extracted).devices) {
      if (d.virtual === true) continue;
      rows.push({ ...d, reachable: isHardwareUdid(d.id) });
    }
  }
  if (devicectlJson != null && devicectlJson !== "") {
    const parsed = typeof devicectlJson === "string" ? extractJson(devicectlJson) : devicectlJson;
    rows.push(...parseDevicectlJson(parsed).devices);
  }
  if (xctraceText) {
    rows.push(...parseXctraceList(xctraceText).devices);
  }
  const merged = mergeDeviceRows(rows);
  const pick = pickConnectedIphone({ devices: merged });
  if (!pick) return null;
  return merged.find((row) => idsEqual(row.id, pick.id)) || pick;
}

function waitForInstallTarget({
  poll,
  deadlineMs,
  pollMs = 3000,
  now = Date.now,
  sleep = defaultSleep,
  log = () => {},
  nudge = () => {},
} = {}) {
  const start = now();
  let last = poll() || null;
  if (last && last.id && last.reachable) return last;
  if (!(deadlineMs > 0)) return last;
  while (now() - start < deadlineMs) {
    if (last && last.id && last.reachable) return last;
    const remain = deadlineMs - (now() - start);
    log(last, remain);
    try {
      nudge(last);
    } catch {
      /* wake is best-effort */
    }
    const slice = Math.min(pollMs, Math.max(1, remain));
    sleep(slice);
    last = poll() || last;
  }
  return last;
}

function resolveWaitMs(env = process.env, tty = Boolean(process.stderr && process.stderr.isTTY)) {
  const raw = env.CIRCADIA_IPHONE_WAIT_MS;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return tty ? 90_000 : 0;
}

function defaultSleep(ms) {
  if (!(ms > 0)) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    spawnSync("sleep", [String(Math.max(1, Math.ceil(ms / 1000)))], { encoding: "utf8" });
  }
}

function formatTargetLine(pick) {
  const name = pick.name || "iPhone";
  const id = pick.id;
  const core =
    pick.coreDeviceId && isCoreDeviceUuid(pick.coreDeviceId) && pick.coreDeviceId !== id ? pick.coreDeviceId : "";
  return core ? `${name}\t${id}\t${core}` : `${name}\t${id}`;
}

function wakeDevice(deviceId, spawn = spawnSync) {
  if (!deviceId || process.platform !== "darwin") return;
  spawn("xcrun", ["devicectl", "device", "info", "details", "--device", deviceId], {
    encoding: "utf8",
    timeout: 4_000,
  });
}

function readDevicectlJsonFile(spawn = spawnSync) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "circadia-devicectl-"));
  const file = path.join(tmp, "devices.json");
  try {
    spawn("xcrun", ["devicectl", "list", "devices", "--json-output", file], { encoding: "utf8" });
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function collectSources({ root, nativeRun, spawn = spawnSync } = {}) {
  const phone = path.join(root, "phone");
  let nativeRunJson = "";
  if (nativeRun) {
    const listed = spawn(nativeRun, ["ios", "--list", "--json"], { cwd: phone, encoding: "utf8" });
    nativeRunJson = `${listed.stdout || ""}\n${listed.stderr || ""}`;
  }
  let devicectlJson = null;
  let table = "";
  let xctraceText = "";
  if (process.platform === "darwin") {
    devicectlJson = readDevicectlJsonFile(spawn);
    const listedDevices = spawn("xcrun", ["devicectl", "list", "devices"], { encoding: "utf8" });
    table = `${listedDevices.stdout || ""}\n${listedDevices.stderr || ""}`;
    const xctrace = spawn("xcrun", ["xctrace", "list", "devices"], { encoding: "utf8" });
    xctraceText = `${xctrace.stdout || ""}\n${xctrace.stderr || ""}`;
  }
  return { nativeRunJson, devicectlJson, xctraceText, table };
}

module.exports = {
  pickConnectedIphone,
  parseDevicectlTable,
  parseDevicectlJson,
  parseXctraceList,
  extractJson,
  unavailableHint,
  isHardwareUdid,
  isCoreDeviceUuid,
  mergeDeviceRows,
  scanInstallableIphones,
  waitForInstallTarget,
  resolveWaitMs,
  formatTargetLine,
  wakeDevice,
  idsEqual,
};

if (require.main === module) {
  const { nativeRunBin } = require("./ios-install.cjs");
  const root = path.join(__dirname, "..");
  const bin = nativeRunBin(root);
  const waitMs = resolveWaitMs();
  const poll = () => {
    const src = collectSources({ root, nativeRun: bin });
    return { pick: scanInstallableIphones(src), table: src.table };
  };
  let scanned = { pick: null, table: "" };
  const picked = waitForInstallTarget({
    deadlineMs: waitMs,
    pollMs: 3000,
    poll: () => {
      scanned = poll();
      return scanned.pick;
    },
    log: (last, remain) => {
      const name = last?.name || "James-iPhone";
      const sec = Math.max(1, Math.ceil(remain / 1000));
      if (last?.id) {
        console.error(
          `${name} is paired but idle. Unlock it and keep the screen on. ${sec}s left. Plug in USB if it stays idle.`,
        );
      } else {
        console.error(`No iPhone UDID yet. Unlock James-iPhone. ${sec}s left. Plug in USB if it is not on this list.`);
      }
    },
    nudge: (last) => {
      wakeDevice(last?.coreDeviceId || last?.id);
    },
  });
  const pick = picked || scanned.pick;
  if (!pick || !isHardwareUdid(pick.id)) {
    if (unavailableHint(scanned.table)) {
      console.error("James-iPhone is listed but idle. Unlock it and plug in USB, then run this again.");
    } else {
      console.error("No iPhone UDID on this Mac. Unlock James-iPhone, plug in USB if needed, then run this again.");
    }
    console.error("Do not use Xcode destination Any iOS Device (arm64). That never installs on the phone.");
    process.exit(10);
  }
  if (!pick.reachable) {
    console.error(
      `${pick.name || "James-iPhone"} is paired but idle (the device list said unavailable). Using the hardware UDID, not the CoreDevice list id.`,
    );
  }
  console.log(formatTargetLine(pick));
}
