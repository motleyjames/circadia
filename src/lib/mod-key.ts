import { timingSafeEqual } from "node:crypto";
import { DEFAULT_MOD_KEY } from "@/lib/mod-key-shared";

export { DEFAULT_MOD_KEY };

export function moderatorKey(): string {
  return process.env.CIRCADIA_MOD_KEY?.trim() || DEFAULT_MOD_KEY;
}

export function moderatorKeyOk(provided: string | null | undefined): boolean {
  const expected = moderatorKey();
  const got = typeof provided === "string" ? provided : "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
