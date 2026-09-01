import { emptyDiskVault, parseDiskVault, type DiskVault } from "@/lib/vault";
import { isPhoneNative } from "@/lib/phone-native";

const VAULT_PATH = "vault.json";

export type PhoneFileRead = { status: "ok"; data: string } | { status: "missing" } | { status: "unavailable" };

export type PhoneVaultRead = {
  status: "ok" | "missing" | "unavailable";
  vault: DiskVault;
};

export type PhoneVaultIo = {
  native: () => boolean;
  readFile: () => Promise<string | null | PhoneFileRead>;
  writeFile: (data: string) => Promise<void>;
  secureGet: (account: string) => Promise<string | null>;
  secureSet: (account: string, value: string) => Promise<boolean>;
  secureDelete: (account: string) => Promise<void>;
};

function classifyFsError(err: unknown): "missing" | "unavailable" {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/does not exist|not found|no such file|ENOENT|OS-PLUG-FILE-0008/i.test(msg)) return "missing";
  return "unavailable";
}

function normalizeRead(raw: string | null | PhoneFileRead): PhoneFileRead {
  if (raw && typeof raw === "object" && "status" in raw) return raw;
  if (typeof raw === "string" && raw.length > 0) return { status: "ok", data: raw };
  return { status: "missing" };
}

async function capacitorRead(): Promise<PhoneFileRead> {
  try {
    const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
    const got = await Filesystem.readFile({
      path: VAULT_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof got.data === "string" && got.data.length > 0
      ? { status: "ok", data: got.data }
      : { status: "missing" };
  } catch (err) {
    return { status: classifyFsError(err) };
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

export async function readPhoneVaultDetailed(): Promise<PhoneVaultRead> {
  try {
    const normalized = normalizeRead(await io.readFile());
    if (normalized.status !== "ok") {
      return { status: normalized.status, vault: emptyDiskVault() };
    }
    try {
      return { status: "ok", vault: parseDiskVault(JSON.parse(normalized.data) as unknown) };
    } catch {
      return { status: "ok", vault: emptyDiskVault() };
    }
  } catch {
    return { status: "unavailable", vault: emptyDiskVault() };
  }
}

export async function readPhoneVault(): Promise<DiskVault> {
  return (await readPhoneVaultDetailed()).vault;
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
