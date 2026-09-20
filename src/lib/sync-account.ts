import {
  attachRecoveryWrap,
  bytesToBase64,
  decryptPayload,
  derive,
  encryptPayload,
  hkdf,
  sha256,
  PBKDF2_ITERATIONS_V3,
  unlockWithRecovery,
  type KeyWrap,
  type PasswordLock,
  type VaultEnvelope,
} from "@/lib/password";

const LOOKUP_PREFIX = "circadia/lookup/v1";
const LOOKUP_ID_INFO = "circadia/lookup-id/v1";
const LOOKUP_AUTH_INFO = "circadia/lookup-auth/v1";

/** Same alphabet the Worker enforces. One format for both object kinds. */
export const OBJECT_ID = /^[0-9a-f]{64}$/;

export type AccountRecordPlain = {
  v: 1;
  accountId: string;
  vaultSalt: string;
  authKey: string;
};

export type SealedAccountRecord = {
  v: 1;
  iv: string;
  ct: string;
  recovery: KeyWrap;
};

export type LookupMaterial = {
  lookupId: string;
  lookupKey: Uint8Array;
  lookupAuth: Uint8Array;
};

export type MintedAccountRecord = {
  lookupId: string;
  lookupAuth: Uint8Array;
  sealed: SealedAccountRecord;
  plain: AccountRecordPlain;
};

/**
 * Email as a KDF input. Lowercase and trim. Nothing else.
 * Not `normalizeEmail` in contact.ts — that one slices to 120 and must never
 * feed this derivation.
 */
export function normalizeEmailForKdf(raw: string): string {
  return raw.trim().toLowerCase();
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function randomHex32(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function envelopeOf(sealed: SealedAccountRecord): VaultEnvelope {
  return { enc: true, v: 1, iv: sealed.iv, ct: sealed.ct };
}

function recoveryHolder(recovery: KeyWrap): PasswordLock {
  return {
    algo: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS_V3,
    salt: bytesToBase64(new Uint8Array(16)),
    kdf: 3,
    recovery,
  };
}

function plainsEqual(a: AccountRecordPlain, b: AccountRecordPlain): boolean {
  return a.v === 1 && b.v === 1 && a.accountId === b.accountId && a.vaultSalt === b.vaultSalt && a.authKey === b.authKey;
}

function parsePlain(value: unknown): AccountRecordPlain | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Partial<AccountRecordPlain>;
  if (o.v !== 1) return null;
  if (typeof o.accountId !== "string" || !OBJECT_ID.test(o.accountId)) return null;
  if (typeof o.vaultSalt !== "string" || !OBJECT_ID.test(o.vaultSalt)) return null;
  if (typeof o.authKey !== "string" || !OBJECT_ID.test(o.authKey)) return null;
  return { v: 1, accountId: o.accountId, vaultSalt: o.vaultSalt, authKey: o.authKey };
}

/**
 * Hop 1. Reproducible from email and password alone. No stored state.
 *
 * lookupSalt = SHA-256("circadia/lookup/v1" || normalizeEmailForKdf(email))
 * lookupKey  = PBKDF2(password, lookupSalt, 600k, SHA-256)
 * lookupId   = SHA-256(HKDF(lookupKey, "circadia/lookup-id/v1"))
 * lookupAuth = HKDF(lookupKey, "circadia/lookup-auth/v1")
 */
export async function deriveLookup(email: string, password: string): Promise<LookupMaterial> {
  const lookupSalt = await sha256(utf8(LOOKUP_PREFIX + normalizeEmailForKdf(email)));
  const lookupKey = await derive(password, lookupSalt, PBKDF2_ITERATIONS_V3);
  const idKey = await hkdf(lookupKey, LOOKUP_ID_INFO);
  const lookupId = bytesToHex(await sha256(idKey));
  idKey.fill(0);
  const lookupAuth = await hkdf(lookupKey, LOOKUP_AUTH_INFO);
  return { lookupId, lookupKey, lookupAuth };
}

export async function openAccountRecord(
  sealed: SealedAccountRecord,
  lookupKey: Uint8Array,
): Promise<AccountRecordPlain | null> {
  try {
    return parsePlain(await decryptPayload(envelopeOf(sealed), lookupKey));
  } catch {
    return null;
  }
}

export async function openAccountRecordWithRecovery(
  sealed: SealedAccountRecord,
  recoveryCode: string,
): Promise<AccountRecordPlain | null> {
  const lookupKey = await unlockWithRecovery(recoveryCode, recoveryHolder(sealed.recovery));
  if (!lookupKey) return null;
  const plain = await openAccountRecord(sealed, lookupKey);
  lookupKey.fill(0);
  return plain;
}

/**
 * Mint the stable identity and seal it under lookupKey, with a second wrap
 * under the recovery code. Both doors are proven in memory before return.
 */
export async function mintAccountRecord(
  email: string,
  password: string,
  recoveryCode: string,
  confirm: string,
): Promise<MintedAccountRecord | null> {
  const { lookupId, lookupKey, lookupAuth } = await deriveLookup(email, password);
  const plain: AccountRecordPlain = {
    v: 1,
    accountId: randomHex32(),
    vaultSalt: randomHex32(),
    authKey: randomHex32(),
  };
  const holder = await attachRecoveryWrap(
    {
      algo: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS_V3,
      salt: bytesToBase64(new Uint8Array(16)),
      kdf: 3,
    },
    lookupKey,
    recoveryCode,
    confirm,
  );
  if (!holder?.recovery) {
    lookupKey.fill(0);
    lookupAuth.fill(0);
    return null;
  }
  const envelope = await encryptPayload(plain, lookupKey);
  const sealed: SealedAccountRecord = {
    v: 1,
    iv: envelope.iv,
    ct: envelope.ct,
    recovery: holder.recovery,
  };
  const viaLookup = await openAccountRecord(sealed, lookupKey);
  const viaRecovery = await openAccountRecordWithRecovery(sealed, recoveryCode);
  lookupKey.fill(0);
  if (!viaLookup || !viaRecovery || !plainsEqual(viaLookup, plain) || !plainsEqual(viaRecovery, plain)) {
    lookupAuth.fill(0);
    return null;
  }
  return { lookupId, lookupAuth, sealed, plain };
}
