import { describe, expect, it } from "vitest";
import { nextDistDir, nextImagesUnoptimized, nextOutput } from "./next-output";

describe("nextOutput", () => {
  it("keeps Dock compiles standalone even if CIRCADIA_ELECTRON leaked", () => {
    expect(nextOutput({ CIRCADIA_ELECTRON: "1" })).toBe("standalone");
    expect(
      nextOutput({
        CIRCADIA_ELECTRON: "1",
        CIRCADIA_SURFACE: "mod",
        NEXT_PUBLIC_CIRCADIA_SURFACE: "mod",
      }),
    ).toBe("standalone");
  });

  it("never static-exports the operator (that prerenders /check-in without a provider)", () => {
    expect(
      nextOutput({
        CIRCADIA_PACK_STATIC: "1",
        CIRCADIA_SURFACE: "mod",
        NEXT_PUBLIC_CIRCADIA_SURFACE: "mod",
      }),
    ).toBe("standalone");
    expect(nextOutput({ CIRCADIA_SURFACE: "mod" })).toBe("standalone");
  });

  it("static-exports only the packaged diary UI", () => {
    expect(nextOutput({ CIRCADIA_PACK_STATIC: "1" })).toBe("export");
    expect(nextOutput({})).toBe("standalone");
    expect(nextImagesUnoptimized({ CIRCADIA_PACK_STATIC: "1" })).toBe(true);
    expect(nextImagesUnoptimized({})).toBe(false);
  });

  it("keeps operator distDir off the diary tree; pack uses default .next then stash", () => {
    expect(nextDistDir({ CIRCADIA_PACK_STATIC: "1" })).toBe(".next");
    expect(nextDistDir({})).toBe(".next");
    expect(nextDistDir({ CIRCADIA_SURFACE: "mod", NEXT_PUBLIC_CIRCADIA_SURFACE: "mod" })).toBe(".next-mod");
    expect(
      nextDistDir({
        CIRCADIA_PACK_STATIC: "1",
        CIRCADIA_SURFACE: "mod",
        NEXT_PUBLIC_CIRCADIA_SURFACE: "mod",
      }),
    ).toBe(".next-mod");
  });
});
