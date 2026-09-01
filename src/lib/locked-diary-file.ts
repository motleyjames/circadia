import os from "node:os";
import path from "node:path";
import { LOCKED_DIARY_FILENAME } from "@/lib/diary-pack";
import { vaultFilePath } from "@/lib/vault-file";

/** Mac Circadia.app writes here so AirDrop can pick the file up from Downloads. */
export function lockedDiaryDestPath(): string {
  const fromEnv = process.env.CIRCADIA_LOCKED_DIARY_FILE?.trim();
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), "Downloads", LOCKED_DIARY_FILENAME);
}

/**
 * Drop box for a phone vault pulled at `put-on-phone`. Circadia.app folds it
 * into the open diary. Ciphertext only — the password never leaves the app.
 */
export function foldInboxFilePath(): string {
  const fromEnv = process.env.CIRCADIA_FOLD_INBOX_FILE?.trim();
  if (fromEnv) return fromEnv;
  return path.join(path.dirname(vaultFilePath()), "fold-inbox.circadia");
}
