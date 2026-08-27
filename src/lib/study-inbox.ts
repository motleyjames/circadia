import path from "node:path";

/** Writable inbox. Packaged Mac app sets CIRCADIA_DATA_DIR to Application Support. */
export function studyInboxDir(): string {
  const fromEnv = process.env.CIRCADIA_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data", "study-inbox");
}
