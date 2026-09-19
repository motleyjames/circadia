import type { KeyWrap, PasswordLock } from "@/lib/password";

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

/** Envelope revision, when the writer stamped one. Older files have none. */
function fileRev(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const rev = (value as { rev?: unknown }).rev;
  return typeof rev === "number" && Number.isFinite(rev) ? rev : 0;
}

/**
 * Union local + disk.
 *
 * Revision wins. Size is only a tie-breaker for files written before revisions
 * existed — and it is a bad one: AES-GCM ciphertext length tracks plaintext length,
 * so editing a rating from 3 to 4 produces an exact tie, and `>=` handed that tie to
 * the stale disk copy. Withdrawing a morning made the new blob *smaller* and lost
 * outright. Both silently reverted the user's edit on the next launch.
 *
 * Locks merge field-wise when the data key is the same, so a stale local copy
 * cannot delete a recovery wrap that disk already has. Different wraps stay
 * local — that is a password change, not a field to union.
 */
export function mergeDiskVault(local: DiskVault, disk: DiskVault): DiskVault {
  const files: Record<string, unknown> = { ...local.files };
  for (const [key, value] of Object.entries(disk.files)) {
    if (!(key in files)) {
      files[key] = value;
      continue;
    }
    const diskRev = fileRev(value);
    const localRev = fileRev(files[key]);
    if (diskRev !== localRev) {
      if (diskRev > localRev) files[key] = value;
      continue;
    }
    // Same revision (or neither stamped): fall back to size, and let local win ties.
    if (jsonSize(value) > jsonSize(files[key])) files[key] = value;
  }
  const locks: Record<string, PasswordLock> = { ...local.locks };
  for (const [key, value] of Object.entries(disk.locks)) {
    const here = locks[key];
    locks[key] = here ? mergePasswordLock(here, value) : value;
  }
  const session =
    (local.session && files[local.session] ? local.session : null) ??
    (disk.session && files[disk.session] ? disk.session : null);
  return { v: VAULT_DISK_VERSION, files, locks, session };
}

function wrapEqual(a: KeyWrap | undefined, b: KeyWrap | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.salt === b.salt && a.iterations === b.iterations && a.iv === b.iv && a.ct === b.ct;
}

/**
 * Same data key, not merely the same login. Wrap equality is sufficient. A
 * migrated lock still carries the legacy salt/hash, so those matching means the
 * wrap was adopted around that same derived key. Different wraps are a password
 * change (or a re-key) and must not receive the other copy's recovery.
 */
function sameDataKey(local: PasswordLock, disk: PasswordLock): boolean {
  if (local.wrap && disk.wrap) return wrapEqual(local.wrap, disk.wrap);
  if (local.salt && disk.salt && local.hash && disk.hash) {
    return (
      local.algo === disk.algo &&
      local.salt === disk.salt &&
      local.hash === disk.hash &&
      Number(local.iterations) === Number(disk.iterations)
    );
  }
  return false;
}

/**
 * Field-wise, not presence-only. A stale local lock without `recovery` used to
 * win outright and then get written back, which deleted the second door.
 */
function mergePasswordLock(local: PasswordLock, disk: PasswordLock): PasswordLock {
  if (!sameDataKey(local, disk)) return local;
  const merged: PasswordLock = { ...disk, ...local };
  const recovery = local.recovery ?? disk.recovery;
  if (recovery) merged.recovery = recovery;
  else delete merged.recovery;
  return merged;
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
