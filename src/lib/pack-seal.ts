import { bytesFromBase64, bytesToBase64, hkdf, hasWebCrypto } from "@/lib/password";

export const PACK_SEAL_VERSION = 2;
export const PACK_SEAL_LABEL = "circadia/pack/v2";

export type PackEnvelope = {
  v: typeof PACK_SEAL_VERSION;
  epk: string;
  iv: string;
  ct: string;
};

export type OpenedPack =
  | { ok: true; kind: "pack"; value: unknown }
  | { ok: true; kind: "withdrawal" }
  | { ok: false; error: string };

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function packAssociatedData(participantId: string): Uint8Array {
  return new TextEncoder().encode(`${PACK_SEAL_LABEL}${participantId}`);
}

export function isPackEnvelope(value: unknown): value is PackEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Partial<PackEnvelope>;
  return (
    o.v === PACK_SEAL_VERSION &&
    typeof o.epk === "string" &&
    o.epk.length > 0 &&
    typeof o.iv === "string" &&
    o.iv.length > 0 &&
    typeof o.ct === "string" &&
    o.ct.length > 0
  );
}

export function isWithdrawal(value: unknown): value is { withdrawn: true } {
  return Boolean(value && typeof value === "object" && (value as { withdrawn?: unknown }).withdrawn === true);
}

async function importPublicRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", asBufferSource(raw), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function deriveAesKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const ikm = new Uint8Array(bits);
  const raw = await hkdf(ikm, PACK_SEAL_LABEL);
  ikm.fill(0);
  const key = await crypto.subtle.importKey("raw", asBufferSource(raw), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  raw.fill(0);
  return key;
}

export async function generateOperatorKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicRaw: Uint8Array;
  privateJwk: JsonWebKey;
}> {
  if (!hasWebCrypto()) throw new Error("WEB_CRYPTO_UNAVAILABLE");
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicRaw, privateJwk };
}

export async function importOperatorPrivateJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

export async function sealPayload(
  payload: unknown,
  operatorPublicRaw: Uint8Array,
  participantId: string,
): Promise<PackEnvelope> {
  if (!hasWebCrypto()) throw new Error("WEB_CRYPTO_UNAVAILABLE");
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const operatorPub = await importPublicRaw(operatorPublicRaw);
  const aes = await deriveAesKey(ephemeral.privateKey, operatorPub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv), additionalData: asBufferSource(packAssociatedData(participantId)) },
    aes,
    pt,
  );
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  return {
    v: PACK_SEAL_VERSION,
    epk: bytesToBase64(epk),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function openEnvelope(
  envelope: unknown,
  operatorPrivateKey: CryptoKey,
  participantId: string,
): Promise<OpenedPack> {
  if (!isPackEnvelope(envelope)) return { ok: false, error: "Not a sealed pack." };
  try {
    const epk = await importPublicRaw(bytesFromBase64(envelope.epk));
    const aes = await deriveAesKey(operatorPrivateKey, epk);
    const pt = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(bytesFromBase64(envelope.iv)),
        additionalData: asBufferSource(packAssociatedData(participantId)),
      },
      aes,
      asBufferSource(bytesFromBase64(envelope.ct)),
    );
    const value: unknown = JSON.parse(new TextDecoder().decode(pt));
    if (isWithdrawal(value)) return { ok: true, kind: "withdrawal" };
    return { ok: true, kind: "pack", value };
  } catch {
    return { ok: false, error: "Could not open the sealed pack." };
  }
}
