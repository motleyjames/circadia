import { parseDiskVault, type DiskVault } from "@/lib/vault";

/** Packed ciphertext. The password is typed again on the destination — never stored in this file. */
export const LOCKED_DIARY_KIND = "circadia.locked-diary";
export const LOCKED_DIARY_VERSION = 1;
export const LOCKED_DIARY_FILENAME = "circadia-locked.circadia";

export type LockedDiaryPack = {
  kind: typeof LOCKED_DIARY_KIND;
  v: typeof LOCKED_DIARY_VERSION;
  vault: DiskVault;
};

export const DIARY_PACK_ERRORS = {
  notDiary: "That file is not a Circadia diary.",
  empty: "That file has no diary in it.",
} as const;

function hasFiles(vault: DiskVault): boolean {
  return Object.keys(vault.files).length > 0;
}

/** Ciphertext plus password locks. Stay-signed-in never travels. */
export function serializeLockedDiary(vault: DiskVault): LockedDiaryPack {
  const parsed = parseDiskVault(vault);
  return {
    kind: LOCKED_DIARY_KIND,
    v: LOCKED_DIARY_VERSION,
    vault: {
      v: parsed.v,
      files: { ...parsed.files },
      locks: { ...parsed.locks },
      session: null,
    },
  };
}

/**
 * Accepts a Circadia locked-diary pack, or a raw `vault.json` (`v` + `files`).
 * Anything else fails closed. Session from the file is dropped.
 */
export function parseLockedDiary(raw: unknown): DiskVault | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.kind === LOCKED_DIARY_KIND) {
    if (o.v !== LOCKED_DIARY_VERSION) return null;
    const vault = parseDiskVault(o.vault);
    if (!hasFiles(vault)) return null;
    vault.session = null;
    return vault;
  }

  if (o.kind !== undefined) return null;
  if (typeof o.v !== "number" || !("files" in o)) return null;
  const vault = parseDiskVault(o);
  if (!hasFiles(vault)) return null;
  vault.session = null;
  return vault;
}

export async function readLockedDiaryFile(file: File): Promise<DiskVault> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error(DIARY_PACK_ERRORS.notDiary);
  }
  const vault = parseLockedDiary(json);
  if (!vault) throw new Error(DIARY_PACK_ERRORS.notDiary);
  return vault;
}
