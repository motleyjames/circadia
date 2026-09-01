import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isFresh, stampsEqual } = require("../../scripts/phone-pack-fresh.cjs") as {
  isFresh: (
    root?: string,
    opts?: {
      force?: string;
      packed?: boolean;
      stamp?: { gitHead: string; version: string; vaultFingerprint: string } | null;
      current?: { gitHead: string; version: string; vaultFingerprint: string };
    },
  ) => boolean;
  stampsEqual: (a: unknown, b: unknown) => boolean;
};

const stamp = { gitHead: "abc", version: "0.8.2", vaultFingerprint: "vault" };

describe("phone-pack-fresh", () => {
  it("skips rebuild when commit, version, packed index, and diary match", () => {
    expect(isFresh("/tmp", { packed: true, stamp, current: stamp })).toBe(true);
  });

  it("rebuilds when the commit, version, or diary changed", () => {
    expect(isFresh("/tmp", { packed: true, stamp, current: { ...stamp, version: "0.8.1" } })).toBe(false);
    expect(isFresh("/tmp", { packed: true, stamp, current: { ...stamp, gitHead: "def" } })).toBe(false);
    expect(isFresh("/tmp", { packed: true, stamp, current: { ...stamp, vaultFingerprint: "other" } })).toBe(false);
    expect(isFresh("/tmp", { packed: false, stamp, current: stamp })).toBe(false);
    expect(isFresh("/tmp", { force: "1", packed: true, stamp, current: stamp })).toBe(false);
  });

  it("does not treat a missing stamp as fresh", () => {
    expect(stampsEqual(null, stamp)).toBe(false);
    expect(isFresh("/tmp", { packed: true, stamp: null, current: stamp })).toBe(false);
  });
});
