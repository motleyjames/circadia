import { spawnSync } from "node:child_process";

export const KEYCHAIN_SERVICE = "Circadia";

export type SecurityResult = { status: number | null; stdout: string };

export type SecurityFn = (args: string[]) => SecurityResult;

/** Shell out to `/usr/bin/security`. Off darwin, or if the binary is missing, fail closed. */
export function defaultSecurity(args: string[]): SecurityResult {
  if (process.platform !== "darwin") return { status: 1, stdout: "" };
  try {
    const result = spawnSync("security", args, { encoding: "utf8", timeout: 8000 });
    if (result.error) return { status: 1, stdout: "" };
    return { status: result.status, stdout: result.stdout ?? "" };
  } catch {
    return { status: 1, stdout: "" };
  }
}

/**
 * `security -w` treats a leading dash as a flag, and some macOS builds mangle
 * `+` `/` in argv. A 32-byte master as hex is only 0-9a-f.
 */
export function secretForArgv(password: string): string {
  try {
    const buf = Buffer.from(password, "base64");
    if (buf.length === 32) return buf.toString("hex");
  } catch {
    /* keep the original */
  }
  return password;
}

export function secretFromArgv(value: string): string {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex").toString("base64");
  }
  return trimmed;
}

export type Keychain = {
  set: (account: string, password: string) => boolean;
  get: (account: string) => string | null;
  delete: (account: string) => boolean;
};

export function makeKeychain(security: SecurityFn = defaultSecurity): Keychain {
  return {
    set(account: string, password: string) {
      if (!account || !password) return false;
      const result = security([
        "add-generic-password",
        "-U",
        "-A",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
        "-w",
        secretForArgv(password),
      ]);
      return result.status === 0;
    },
    get(account: string) {
      if (!account) return null;
      const result = security([
        "find-generic-password",
        "-w",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
      ]);
      if (result.status !== 0) return null;
      const value = secretFromArgv(result.stdout);
      return value.length > 0 ? value : null;
    },
    delete(account: string) {
      if (!account) return false;
      const result = security([
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
      ]);
      return result.status === 0;
    },
  };
}

export const keychain = makeKeychain();
