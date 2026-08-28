import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyDiskVault, parseDiskVault, type DiskVault } from "@/lib/vault";

/** Darwin: Application Support so the diary survives a clone move and a WKWebView wipe. */
export function vaultFilePath(): string {
  const fromEnv = process.env.CIRCADIA_VAULT_FILE?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Circadia", "vault.json");
  }
  return path.join(process.cwd(), "data", "vault.json");
}

export async function readDiskVault(): Promise<DiskVault> {
  const file = vaultFilePath();
  try {
    const raw = await readFile(file, "utf8");
    return parseDiskVault(JSON.parse(raw) as unknown);
  } catch {
    return emptyDiskVault();
  }
}

export async function writeDiskVault(vault: DiskVault): Promise<void> {
  const file = vaultFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(vault), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, file);
}
