import { bytesFromBase64 } from "@/lib/password";
import { fingerprintPublicKey } from "@/lib/operator-fingerprint";

let override: string | null | undefined;

/** Built into the phone pack by put-on-phone. Missing at runtime means this install cannot send. */
export function operatorPublicB64(): string | null {
  const raw = override !== undefined ? override : process.env.NEXT_PUBLIC_OPERATOR_PUBLIC_B64;
  const trimmed = typeof raw === "string" ? raw.replace(/\s/g, "") : "";
  return trimmed || null;
}

export function operatorPublicRaw(): Uint8Array | null {
  const b64 = operatorPublicB64();
  if (!b64) return null;
  try {
    const bytes = bytesFromBase64(b64);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

export async function operatorPublicFingerprint(): Promise<string | null> {
  const raw = operatorPublicRaw();
  if (!raw) return null;
  return fingerprintPublicKey(raw);
}

export function setOperatorPublicB64ForTests(value: string | null | undefined): void {
  override = value;
}
