import { describe, expect, it } from "vitest";
import { KEYCHAIN_SERVICE, defaultSecurity, makeKeychain } from "./keychain";

describe("keychain", () => {
  it("writes with add-generic-password -U under service Circadia", () => {
    const calls: string[][] = [];
    const kc = makeKeychain((args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    });
    expect(kc.set("email:ada@example.com", "YWFh")).toBe(true);
    expect(calls[0]).toEqual([
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      "email:ada@example.com",
      "-w",
      "YWFh",
    ]);
  });

  it("returns the password from find-generic-password -w", () => {
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
