import type { PasswordLock } from "@/lib/password";

export const VAULT_DISK_VERSION = 1;

export type DiskVault = {
  v: number;
  files: Record<string, unknown>;
  locks: Record<string, PasswordLock>;
  session: string | null;
};

export function emptyDiskVault(): DiskVault {
  return { v: VAULT_DISK_VERSION, files: {}, locks: {}, session: null };
}

export function parseDiskVault(raw: unknown): DiskVault {
  if (!raw || typeof raw !== "object") return emptyDiskVault();
  const o = raw as Partial<DiskVault>;
  const files =
    o.files && typeof o.files === "object" && !Array.isArray(o.files) ? (o.files as Record<string, unknown>) : {};
  const locks =
    o.locks && typeof o.locks === "object" && !Array.isArray(o.locks)
      ? (o.locks as Record<string, PasswordLock>)
      : {};
  const session = typeof o.session === "string" && o.session.length > 0 ? o.session : null;
  return { v: VAULT_DISK_VERSION, files, locks, session };
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Union local + disk. For a key in both, keep the larger blob (more mornings, not an empty overwrite). */
export function mergeDiskVault(local: DiskVault, disk: DiskVault): DiskVault {
  const files: Record<string, unknown> = { ...local.files };
  for (const [key, value] of Object.entries(disk.files)) {
    if (!(key in files) || jsonSize(value) >= jsonSize(files[key])) files[key] = value;
  }
  const locks: Record<string, PasswordLock> = { ...local.locks };
  for (const [key, value] of Object.entries(disk.locks)) {
    if (!locks[key]) locks[key] = value;
  }
  const session =
    (local.session && files[local.session] ? local.session : null) ??
    (disk.session && files[disk.session] ? disk.session : null);
  return { v: VAULT_DISK_VERSION, files, locks, session };
}

export function isLocalRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}
