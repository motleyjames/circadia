import os from "node:os";
import path from "node:path";
import { LOCKED_DIARY_FILENAME } from "@/lib/diary-pack";

/** Mac Circadia.app writes here so AirDrop can pick the file up from Downloads. */
export function lockedDiaryDestPath(): string {
  const fromEnv = process.env.CIRCADIA_LOCKED_DIARY_FILE?.trim();
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), "Downloads", LOCKED_DIARY_FILENAME);
}
