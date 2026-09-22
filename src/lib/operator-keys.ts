import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { bytesFromBase64, bytesToBase64, sha256 } from "@/lib/password";
import {
  generateOperatorKeyPair,
  importOperatorPrivateJwk,
} from "@/lib/pack-seal";
import {
  ensureOperatorDir,
  operatorPrivatePath,
  operatorPublicPath,
} from "@/lib/operator-store";
import { studyInboxDir } from "@/lib/study-inbox";

export type OperatorKeys = {
  privateKey: CryptoKey;
  publicRaw: Uint8Array;
  fingerprint: string;
};

export async function fingerprintPublicKey(publicRaw: Uint8Array): Promise<string> {
  const digest = await sha256(publicRaw);
  const hex = [...digest.subarray(0, 4)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export async function ensureOperatorKeys(inbox = studyInboxDir()): Promise<OperatorKeys> {
  const privateFile = operatorPrivatePath(inbox);
  const publicFile = operatorPublicPath(inbox);
  if (existsSync(privateFile) && existsSync(publicFile)) {
    const jwk = JSON.parse(readFileSync(privateFile, "utf8")) as JsonWebKey;
    const publicRaw = bytesFromBase64(readFileSync(publicFile, "utf8").trim());
    const privateKey = await importOperatorPrivateJwk(jwk);
    return { privateKey, publicRaw, fingerprint: await fingerprintPublicKey(publicRaw) };
  }
  const minted = await generateOperatorKeyPair();
  ensureOperatorDir(inbox);
  writeFileSync(privateFile, JSON.stringify(minted.privateJwk), { encoding: "utf8", mode: 0o600 });
  writeFileSync(publicFile, bytesToBase64(minted.publicRaw), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(privateFile, 0o600);
    chmodSync(publicFile, 0o600);
  } catch {
    /* mode is best-effort on some filesystems */
  }
  return {
    privateKey: minted.privateKey,
    publicRaw: minted.publicRaw,
    fingerprint: await fingerprintPublicKey(minted.publicRaw),
  };
}
