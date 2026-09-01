import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  pickConnectedIphone,
  parseDevicectlTable,
  parseDevicectlJson,
  parseXctraceList,
  extractJson,
  unavailableHint,
  isHardwareUdid,
  isCoreDeviceUuid,
  scanInstallableIphones,
  waitForInstallTarget,
  resolveWaitMs,
  formatTargetLine,
  connectionLive,
  usbSeesIphone,
} = require("../../scripts/ios-target.cjs") as {
  pickConnectedIphone: (payload: unknown) => { id: string; name?: string; reachable?: boolean } | null;
  parseDevicectlTable: (text: string) => unknown;
  parseDevicectlJson: (payload: unknown) => { devices: Array<Record<string, unknown>> };
  parseXctraceList: (text: string) => { devices: Array<Record<string, unknown>> };
  extractJson: (text: string) => unknown;
  unavailableHint: (text: string) => boolean;
  isHardwareUdid: (id: string) => boolean;
  isCoreDeviceUuid: (id: string) => boolean;
  scanInstallableIphones: (input: {
    nativeRunJson?: unknown;
    devicectlJson?: unknown;
    xctraceText?: string;
  }) => { id: string; name?: string; coreDeviceId?: string; reachable?: boolean } | null;
  waitForInstallTarget: (opts: {
    poll: () => { id?: string; reachable?: boolean; name?: string } | null;
    deadlineMs: number;
    pollMs?: number;
    now?: () => number;
    sleep?: (ms: number) => void;
    log?: (last: unknown, remain: number) => void;
  }) => { id?: string; reachable?: boolean } | null;
  resolveWaitMs: (env?: Record<string, string | undefined>, tty?: boolean) => number;
  formatTargetLine: (pick: { name?: string; id: string; coreDeviceId?: string }) => string;
  connectionLive: (conn: { tunnelState?: string; transportType?: string }) => boolean;
  usbSeesIphone: (text: string) => boolean;
};

const HARDWARE = "00008140-001201901A93001C";
const CORE = "3BF49769-5494-56B1-8F32-F329DC6F058F";

const JAMES_IDLE_JSON = {
  info: { outcome: "success" },
  result: {
    devices: [
      {
        identifier: CORE,
        connectionProperties: {
          pairingState: "paired",
          transportType: "localNetwork",
          tunnelState: "disconnected",
        },
        deviceProperties: { name: "James-iPhone", ddiServicesAvailable: false },
        hardwareProperties: {
          deviceType: "iPhone",
          marketingName: "iPhone 16 Pro",
          platform: "iOS",
          productType: "iPhone17,1",
          reality: "physical",
          udid: HARDWARE,
        },
      },
    ],
  },
};

describe("ios-target", () => {
  it("prefers James-iPhone hardware UDID and ignores simulators", () => {
    const pick = pickConnectedIphone({
      devices: [
        { id: "sim-1", name: "iPhone 16 Pro", virtual: true },
        { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "iPad", virtual: false },
        { id: HARDWARE, name: "James-iPhone", virtual: false },
      ],
      virtualDevices: [{ id: "sim-2", name: "iPhone 16" }],
    });
    expect(pick?.id).toBe(HARDWARE);
    expect(pick?.name).toBe("James-iPhone");
  });

  it("reads cap run --list --json rows and skips simulators", () => {
    const pick = pickConnectedIphone([
      { id: "SIM-UDID", name: "iPhone 16 Pro (simulator)", api: "iOS 18.4" },
      { id: HARDWARE, name: "James-iPhone", api: "iOS 26.6" },
    ]);
    expect(pick?.id).toBe(HARDWARE);
    expect(pick?.name).toBe("James-iPhone");
  });

  it("extracts the device array when npx prints logs before JSON", () => {
    const raw = `npm warn exec extra stuff\n[{"name":"iPhone 16 Pro (simulator)","api":"iOS 18.4","id":"sim"},{"name":"James-iPhone","api":"iOS 26.6","id":"${HARDWARE}"}]\n`;
    expect(pickConnectedIphone(extractJson(raw))?.id).toBe(HARDWARE);
  });

  it("returns null when every phone is a simulator, a CoreDevice UUID, or missing", () => {
    expect(pickConnectedIphone({ devices: [{ id: "s", name: "iPhone 16", virtual: true }] })).toBeNull();
    expect(pickConnectedIphone([{ id: "s", name: "iPhone 16 Pro (simulator)", api: "iOS 18" }])).toBeNull();
    expect(pickConnectedIphone({ devices: [{ id: CORE, name: "James-iPhone", virtual: false }] })).toBeNull();
    expect(pickConnectedIphone({})).toBeNull();
  });

  it("never treats a CoreDevice list UUID as an install id", () => {
    expect(isCoreDeviceUuid(CORE)).toBe(true);
    expect(isHardwareUdid(CORE)).toBe(false);
    expect(isHardwareUdid(HARDWARE)).toBe(true);
    expect(isCoreDeviceUuid(HARDWARE)).toBe(false);
    expect(isHardwareUdid("00008140-001A")).toBe(false);
  });

  it("parses a connected row from xcrun devicectl and still refuses the table UUID as an install id", () => {
    const table = `
Name           Hostname                        Identifier                             State         Model
------------   -----------------------------   ------------------------------------   -----------   --------------------------
James-iPhone   James-iPhone.coredevice.local   ${CORE}   unavailable   iPhone 16 Pro (iPhone17,1)
`;
    expect(unavailableHint(table)).toBe(true);
    expect(pickConnectedIphone(parseDevicectlTable(table))).toBeNull();
    const up = table.replace("unavailable", "connected");
    expect(unavailableHint(up)).toBe(false);
    expect(pickConnectedIphone(parseDevicectlTable(up))).toBeNull();
  });

  it("uses the hardware UDID when James-iPhone is listed unavailable", () => {
    const parsed = parseDevicectlJson(JAMES_IDLE_JSON);
    expect(parsed.devices[0]?.id).toBe(HARDWARE);
    expect(parsed.devices[0]?.coreDeviceId).toBe(CORE);
    expect(parsed.devices[0]?.reachable).toBe(false);
    expect(parsed.devices[0]?.name).toBe("James-iPhone");
    expect(pickConnectedIphone(parsed)?.id).toBe(HARDWARE);
    expect(pickConnectedIphone(parsed)?.id).not.toBe(CORE);
  });

  it("scan prefers hardware UDID from idle JSON over an empty native-run list", () => {
    const pick = scanInstallableIphones({
      nativeRunJson: '{"devices":[],"virtualDevices":[]}',
      devicectlJson: JAMES_IDLE_JSON,
      xctraceText: "",
    });
    expect(pick?.id).toBe(HARDWARE);
    expect(pick?.coreDeviceId).toBe(CORE);
    expect(pick?.reachable).toBe(false);
    expect(formatTargetLine(pick!)).toBe(`James-iPhone\t${HARDWARE}\t${CORE}`);
  });

  it("does not treat an xctrace listing or a native-run UDID as a live tunnel", () => {
    const pick = scanInstallableIphones({
      nativeRunJson: `{"devices":[{"id":"${HARDWARE}","name":"James-iPhone"}],"virtualDevices":[]}`,
      devicectlJson: JAMES_IDLE_JSON,
      xctraceText: `
== Devices ==
James-iPhone (26.6) (${HARDWARE})
== Simulators ==
iPhone 16 Pro (26.0) (AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE)
`,
    });
    expect(pick?.id).toBe(HARDWARE);
    expect(pick?.reachable).toBe(false);
    expect(connectionLive({ tunnelState: "disconnected", transportType: "localNetwork" })).toBe(false);
    expect(connectionLive({ tunnelState: "connected", transportType: "localNetwork" })).toBe(true);
    expect(connectionLive({ transportType: "wired" })).toBe(true);
    expect(usbSeesIphone("USB:\n\n    iPhone:\n      Product ID: 0x12a8\n")).toBe(true);
    expect(usbSeesIphone("USB:\n\n    Hub:\n      Product ID: 0x0000\n")).toBe(false);
  });

  it("parses xctrace hardware UDIDs and skips Macs and simulators", () => {
    const text = `
== Devices ==
MacBook Pro (14-inch, 2024) (00008120-001A218822EBC01E)
James-iPhone (26.6) (${HARDWARE})
== Simulators ==
iPhone 16 Pro (26.0) (AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE)
`;
    const parsed = parseXctraceList(text);
    expect(parsed.devices.map((row) => row.id)).toEqual([HARDWARE]);
    expect(parsed.devices[0]?.name).toBe("James-iPhone");
    expect(parsed.devices[0]?.reachable).toBe(false);
  });

  it("does not wait when the first poll is reachable", () => {
    let slept = 0;
    const hit = waitForInstallTarget({
      deadlineMs: 90_000,
      pollMs: 3000,
      now: () => 0,
      sleep: () => {
        slept += 1;
      },
      poll: () => ({ id: HARDWARE, name: "James-iPhone", reachable: true }),
    });
    expect(hit?.id).toBe(HARDWARE);
    expect(slept).toBe(0);
  });

  it("returns an idle hardware UDID after the deadline instead of giving up", () => {
    const t = { now: 0 };
    const hit = waitForInstallTarget({
      deadlineMs: 9000,
      pollMs: 3000,
      now: () => t.now,
      sleep: (ms) => {
        t.now += ms;
      },
      poll: () => ({ id: HARDWARE, name: "James-iPhone", reachable: false }),
    });
    expect(hit?.id).toBe(HARDWARE);
    expect(hit?.reachable).toBe(false);
  });

  it("stops waiting when a later poll becomes reachable", () => {
    let n = 0;
    const t = { now: 0 };
    const hit = waitForInstallTarget({
      deadlineMs: 90_000,
      pollMs: 3000,
      now: () => t.now,
      sleep: (ms) => {
        t.now += ms;
      },
      poll: () => {
        n += 1;
        return { id: HARDWARE, name: "James-iPhone", reachable: n >= 3 };
      },
    });
    expect(hit?.reachable).toBe(true);
    expect(n).toBe(3);
  });

  it("waits on a TTY and not when tests spawn the CLI", () => {
    expect(resolveWaitMs({}, true)).toBe(90_000);
    expect(resolveWaitMs({}, false)).toBe(0);
    expect(resolveWaitMs({ CIRCADIA_IPHONE_WAIT_MS: "0" }, true)).toBe(0);
    expect(resolveWaitMs({ CIRCADIA_IPHONE_WAIT_MS: "15000" }, false)).toBe(15_000);
  });
});
