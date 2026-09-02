import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./password";
import { KEYCHAIN_SERVICE, defaultSecurity, makeKeychain, secretForArgv, secretFromArgv } from "./keychain";

describe("keychain", () => {
  it("writes with add-generic-password -U -A and stores a 32-byte master as hex", () => {
    const calls: string[][] = [];
    const master = bytesToBase64(new Uint8Array(32));
    const kc = makeKeychain((args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    });
    expect(kc.set("email:ada@example.com", master)).toBe(true);
    expect(calls[0]).toEqual([
      "add-generic-password",
      "-U",
      "-A",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      "email:ada@example.com",
      "-w",
      secretForArgv(master),
    ]);
    expect(calls[0][calls[0].length - 1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a hex keychain secret as base64 so the diary can unlock", () => {
    const master = bytesToBase64(Uint8Array.from({ length: 32 }, (_, i) => i));
    const hex = secretForArgv(master);
    const kc = makeKeychain((args) => {
      if (args[0] === "find-generic-password") return { status: 0, stdout: `${hex}\n` };
      return { status: 1, stdout: "" };
    });
    expect(kc.get("email:ada@example.com")).toBe(secretFromArgv(hex));
    expect(Buffer.from(kc.get("email:ada@example.com") ?? "", "base64").length).toBe(32);
  });

  it("leaves a non-master secret as-is for find-generic-password -w", () => {
    const kc = makeKeychain((args) => {
      if (args[0] === "find-generic-password") return { status: 0, stdout: "secret-b64\n" };
      return { status: 1, stdout: "" };
    });
    expect(kc.get("email:ada@example.com")).toBe("secret-b64");
  });

  it("fails closed when security exits non-zero", () => {
    const kc = makeKeychain(() => ({ status: 1, stdout: "" }));
    expect(kc.set("email:ada@example.com", "YWFh")).toBe(false);
    expect(kc.get("email:ada@example.com")).toBeNull();
  });

  it("does not call security when the account is empty", () => {
    const calls: string[][] = [];
    const kc = makeKeychain((args) => {
      calls.push(args);
      return { status: 0, stdout: "x" };
    });
    expect(kc.set("", "YWFh")).toBe(false);
    expect(kc.get("")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("fails closed off darwin without throwing", () => {
    if (process.platform === "darwin") return;
    expect(defaultSecurity(["find-generic-password", "-w"]).status).toBe(1);
  });
});
