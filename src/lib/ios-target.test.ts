import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { pickConnectedIphone, parseDevicectlTable, extractJson, unavailableHint } = require(
  "../../scripts/ios-target.cjs",
) as {
  pickConnectedIphone: (payload: unknown) => { id: string; name?: string } | null;
  parseDevicectlTable: (text: string) => unknown;
  extractJson: (text: string) => unknown;
  unavailableHint: (text: string) => boolean;
};

describe("ios-target", () => {
  it("prefers James-iPhone and ignores simulators", () => {
    const pick = pickConnectedIphone({
      devices: [
        { id: "sim-1", name: "iPhone 16 Pro", virtual: true },
        { id: "aaaa", name: "iPad", virtual: false },
        { id: "3BF49769-5494-56B1-8F32-F329DC6F058F", name: "James-iPhone", virtual: false },
      ],
      virtualDevices: [{ id: "sim-2", name: "iPhone 16" }],
    });
    expect(pick?.id).toBe("3BF49769-5494-56B1-8F32-F329DC6F058F");
    expect(pick?.name).toBe("James-iPhone");
  });

  it("reads cap run --list --json rows and skips simulators", () => {
    const pick = pickConnectedIphone([
      { id: "SIM-UDID", name: "iPhone 16 Pro (simulator)", api: "iOS 18.4" },
      { id: "00008140-001A", name: "James-iPhone", api: "iOS 26.6" },
    ]);
    expect(pick?.id).toBe("00008140-001A");
    expect(pick?.name).toBe("James-iPhone");
  });

  it("extracts the device array when npx prints logs before JSON", () => {
    const raw = `npm warn exec extra stuff\n[{"name":"iPhone 16 Pro (simulator)","api":"iOS 18.4","id":"sim"},{"name":"James-iPhone","api":"iOS 26.6","id":"udid-james"}]\n`;
    expect(pickConnectedIphone(extractJson(raw))?.id).toBe("udid-james");
  });

  it("returns null when every phone is a simulator or missing", () => {
    expect(pickConnectedIphone({ devices: [{ id: "s", name: "iPhone 16", virtual: true }] })).toBeNull();
    expect(pickConnectedIphone([{ id: "s", name: "iPhone 16 Pro (simulator)", api: "iOS 18" }])).toBeNull();
    expect(pickConnectedIphone({})).toBeNull();
  });

  it("parses a connected row from xcrun devicectl and skips unavailable for install", () => {
    const table = `
Name           Hostname                        Identifier                             State         Model
------------   -----------------------------   ------------------------------------   -----------   --------------------------
James-iPhone   James-iPhone.coredevice.local   3BF49769-5494-56B1-8F32-F329DC6F058F   unavailable   iPhone 16 Pro (iPhone17,1)
`;
    expect(unavailableHint(table)).toBe(true);
    expect(pickConnectedIphone(parseDevicectlTable(table))).toBeNull();
    const up = table.replace("unavailable", "connected");
    expect(unavailableHint(up)).toBe(false);
    expect(pickConnectedIphone(parseDevicectlTable(up))?.id).toBe("3BF49769-5494-56B1-8F32-F329DC6F058F");
  });
});
