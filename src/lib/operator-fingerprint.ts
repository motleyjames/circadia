import { sha256 } from "@/lib/password";

/** First 8 hex of SHA-256 of the raw P-256 public key, shown XXXX-XXXX. */
export async function fingerprintPublicKey(publicRaw: Uint8Array): Promise<string> {
  const digest = await sha256(publicRaw);
  const hex = [...digest.subarray(0, 4)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
