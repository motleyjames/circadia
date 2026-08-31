import { afterEach, describe, expect, it } from "vitest";
import { emptyDiskVault } from "./vault";
import {
  phoneSecureDelete,
  phoneSecureGet,
  phoneSecureSet,
  phoneVaultActive,
  readPhoneVault,
  setPhoneVaultIoForTests,
  writePhoneVault,
} from "./phone-vault";

describe("phone vault adapter", () => {
  afterEach(() => {
    setPhoneVaultIoForTests(null);
  });

  it("round-trips a disk vault and a stay-signed-in key through the injected io", async () => {
    let file: string | null = null;
    const keys = new Map<string, string>();
    setPhoneVaultIoForTests({
      native: () => true,
      readFile: async () => file,
      writeFile: async (data) => {
        file = data;
      },
      secureGet: async (account) => keys.get(account) ?? null,
      secureSet: async (account, value) => {
        keys.set(account, value);
        return true;
      },
      secureDelete: async (account) => {
        keys.delete(account);
      },
    });

    expect(phoneVaultActive()).toBe(true);
    expect(await readPhoneVault()).toEqual(emptyDiskVault());

    const vault = { ...emptyDiskVault(), session: "email:james@local.test" };
    expect(await writePhoneVault(vault)).toBe(true);
    expect(await readPhoneVault()).toEqual(vault);

    expect(await phoneSecureSet("email:james@local.test", "master-b64")).toBe(true);
    expect(await phoneSecureGet("email:james@local.test")).toBe("master-b64");
    await phoneSecureDelete("email:james@local.test");
    expect(await phoneSecureGet("email:james@local.test")).toBeNull();
  });

  it("returns an empty vault when the file is missing or garbage", async () => {
    setPhoneVaultIoForTests({
      native: () => true,
      readFile: async () => "not-json",
      writeFile: async () => {
        throw new Error("disk full");
      },
      secureGet: async () => null,
      secureSet: async () => false,
      secureDelete: async () => undefined,
    });
    expect(await readPhoneVault()).toEqual(emptyDiskVault());
    expect(await writePhoneVault(emptyDiskVault())).toBe(false);
  });
});
