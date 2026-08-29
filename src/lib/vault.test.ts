import { describe, expect, it } from "vitest";
import { mergeDiskVault, parseDiskVault } from "./vault";

describe("disk vault", () => {
  it("merges a WKWebView-wiped origin with the file on disk without dropping mornings", () => {
    const local = parseDiskVault({
      files: { "email:ada@example.com": { reports: [] } },
      locks: {},
      session: null,
    });
    const disk = parseDiskVault({
      files: { "email:ada@example.com": { reports: [1, 2, 3] } },
      locks: { "email:ada@example.com": { algo: "pbkdf2-sha256", iterations: 100000, salt: "YQ==", hash: "Yg==" } },
      session: "email:ada@example.com",
    });
    const merged = mergeDiskVault(local, disk);
    expect((merged.files["email:ada@example.com"] as { reports: number[] }).reports).toHaveLength(3);
    expect(merged.locks["email:ada@example.com"]).toBeTruthy();
    expect(merged.session).toBe("email:ada@example.com");
  });

  it("keeps a local-only diary when disk is empty", () => {
    const local = parseDiskVault({
      files: { "email:james@colorado.edu": { reports: [{ id: "n1" }] } },
      locks: {},
      session: "email:james@colorado.edu",
    });
    const merged = mergeDiskVault(local, parseDiskVault({}));
    expect(merged.files["email:james@colorado.edu"]).toBeTruthy();
    expect(merged.session).toBe("email:james@colorado.edu");
  });

  it("does not copy a stay-signed-in master onto the disk vault", () => {
    const parsed = parseDiskVault({
      v: 1,
      files: {},
      locks: {},
      session: "email:ada@example.com",
      master: "THIS-IS-NOT-A-SESSION",
      unlock: { master: "SECRET-MASTER" },
    });
    expect(parsed.session).toBe("email:ada@example.com");
    expect(JSON.stringify(parsed)).not.toContain("SECRET-MASTER");
    expect(JSON.stringify(parsed)).not.toContain("THIS-IS-NOT-A-SESSION");
    expect(parsed).not.toHaveProperty("master");
    expect(parsed).not.toHaveProperty("unlock");
  });
});
