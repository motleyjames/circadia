import { bytesToBase64, hkdf } from "@/lib/password";

export const PACK_ID_INFO = "circadia/pack-id/v2";
export const PACK_AUTH_INFO = "circadia/pack-auth/v2";

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Worker object id and bearer from the normalized invite alone.
 * Never takes a participant id — that id must not derive either value.
 */
export async function derivePackLocation(normalizedInvite: string): Promise<{ workerId: string; bearer: string }> {
  const secret = utf8(normalizedInvite);
  const [idBits, authBits] = await Promise.all([hkdf(secret, PACK_ID_INFO), hkdf(secret, PACK_AUTH_INFO)]);
  return { workerId: bytesToHex(idBits), bearer: bytesToBase64(authBits) };
}
