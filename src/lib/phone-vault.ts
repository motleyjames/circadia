import { emptyDiskVault, parseDiskVault, type DiskVault } from "@/lib/vault";
import { isPhoneNative } from "@/lib/phone-native";

const VAULT_PATH = "vault.json";

export type PhoneVaultIo = {
  native: () => boolean;
  readFile: () => Promise<string | null>;
  writeFile: (data: string) => Promise<void>;
  secureGet: (account: string) => Promise<string | null>;
  secureSet: (account: string, value: string) => Promise<boolean>;
  secureDelete: (account: string) => Promise<void>;
};

async function capacitorRead(): Promise<string | null> {
  const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
  try {
    const got = await Filesystem.readFile({
      path: VAULT_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof got.data === "string" ? got.data : null;
  } catch {
    return null;
  }
}

async function capacitorWrite(data: string): Promise<void> {
  const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
  await Filesystem.writeFile({
    path: VAULT_PATH,
    data,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  });
}

async function keychainGet(account: string): Promise<string | null> {
  const { CircadiaKeychain } = await import("@/lib/circadia-keychain");
  const got = await CircadiaKeychain.get({ account });
  return typeof got.value === "string" && got.value.length > 0 ? got.value : null;
}

async function keychainSet(account: string, value: string): Promise<boolean> {
  const { CircadiaKeychain } = await import("@/lib/circadia-keychain");
  const got = await CircadiaKeychain.set({ account, value });
  return got.ok === true;
}

async function keychainDelete(account: string): Promise<void> {
  const { CircadiaKeychain } = await import("@/lib/circadia-keychain");
  await CircadiaKeychain.remove({ account });
}

const defaultIo: PhoneVaultIo = {
  native: isPhoneNative,
  readFile: capacitorRead,
  writeFile: capacitorWrite,
  secureGet: keychainGet,
  secureSet: keychainSet,
  secureDelete: keychainDelete,
};

let io: PhoneVaultIo = defaultIo;

export function setPhoneVaultIoForTests(next: PhoneVaultIo | null): void {
  io = next ?? defaultIo;
}

export function phoneVaultActive(): boolean {
  return io.native();
}

export async function readPhoneVault(): Promise<DiskVault> {
  const raw = await io.readFile();
  if (!raw) return emptyDiskVault();
  try {
    return parseDiskVault(JSON.parse(raw) as unknown);
  } catch {
    return emptyDiskVault();
  }
}

export async function writePhoneVault(vault: DiskVault): Promise<boolean> {
  try {
    await io.writeFile(JSON.stringify(vault));
    return true;
  } catch {
    return false;
  }
}

export async function phoneSecureGet(account: string): Promise<string | null> {
  try {
    return await io.secureGet(account);
  } catch {
    return null;
  }
}

export async function phoneSecureSet(account: string, value: string): Promise<boolean> {
  try {
    return await io.secureSet(account, value);
  } catch {
    return false;
  }
}

export async function phoneSecureDelete(account: string): Promise<void> {
  try {
    await io.secureDelete(account);
  } catch {
    /* fail closed */
  }
}
