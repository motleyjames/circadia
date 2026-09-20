# Findings - 20260919_165410

**Task:** Circadia is local-first: no server for diary data; the Worker stores opaque ciphertext and cannot read it. Review src/lib/sync-account.ts: hop-1 derivation and the account record. lookupId and lookupAuth come from lookupKey via different HKDF info strings. The record is encrypted under lookupKey and wrapped a second time under the recovery code. Both doors are proven in memory before return. looku

**Confidence:** 95%  
**Evidence:** 4 probe(s) established something conclusive against the source.

1 need a person - 7 settled by evidence - 5 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_1  (code_reading - loop 1)
> If the recovery code is short or human-readable (e.g., a 16-character alphanumeric code), deriving the wrapping key via plain HKDF rather than a password-based KDF like Argon2 would leave the recovery-wrapped CEK vulnerable to offline brute-force by the Worker.

Reading the source CONFIRMS this concern. Read src/lib/sync-account.ts. The recovery code key derivation uses PBKDF2-SHA256, which is not a memory-hard KDF like Argon2, scrypt, or bcrypt. Cited src/lib/sync-account.ts:161: `algo: "pbkdf2-sha256",`

`probe: read_code__recovery_key_derivation_7527`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> If `lookupKey` is used directly as HKDF input keying material without a salt (or with a static salt), the derivation may not meet HKDF's extraction requirements when `lookupKey` is not uniformly random (e.g., if hop-0 is a weak KDF); the code should verify that HKDF-Extract is applied with a proper salt before HKDF-Expand.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> If `lookupAuth` is stored or compared as raw bytes without constant-time equality, a timing side channel could allow an attacker to incrementally guess the auth token.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> If the AEAD nonce for the record encryption is deterministic rather than random, and the CEK is ever reused across record updates, nonce reuse would break AES-GCM confidentiality and authenticity.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> The code may fail to include `lookupId` or a version tag in the AEAD's associated authenticated data (AAD), which would allow an attacker to swap ciphertext blobs between different account records without detection.

No resolution strategy could handle this dissent

### d_2_4  (none - loop 2)
> Email normalization using `trim().toLowerCase()` without restricting input to ASCII or applying NFKC means that Unicode homoglyphs (e.g., Cyrillic 'а' vs Latin 'a') will produce different `lookupId` values for visually identical email addresses.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_2_0  (code_reading - loop 2)
> The HKDF info strings used for `lookupId` and `lookupAuth` derivation may lack version prefixes or domain tags (e.g., `"circadia:v1:..."`) making them vulnerable to cross-protocol or cross-version collisions if the strings are short or generic.

Reading the source settles this. Read src/lib/sync-account.ts. The exact HKDF info strings are explicitly defined as constants: 'circadia/lookup-id/v1' for lookupId derivation and 'circadia/lookup-auth/v1' for lookupAuth derivation, both visible in the source. Cited src/lib/sync-account.ts:17: `const LOOKUP_ID_INFO = "circadia/lookup-id/v1";`

`probe: read_code__hkdf_info_strings_2979`

### d_2_1  (code_reading - loop 2)
> The "both doors proven in memory before return" may only verify encryption success (ciphertext is non-empty) rather than performing an actual round-trip decrypt-and-compare, meaning a corrupted ciphertext could be persisted without detection.

Reading the source settles this. Read src/lib/sync-account.ts. The verification performs a full round-trip decrypt-and-compare: it decrypts via both lookup key and recovery code, then uses `plainsEqual` to compare every field of the decrypted result against the original plaintext, not merely checking f Cited src/lib/sync-account.ts:184: `if (!viaLookup || !viaRecovery || !plainsEqual(viaLookup, plain) || !plainsEqual(viaRecovery, plain)`

`probe: read_code__encryption_verification_logic_5670`

### d_2_2  (code_reading - loop 2)
> The recovery code wraps the already-encrypted ciphertext (nested encryption) rather than independently encrypting the plaintext or the `lookupKey`, so a bug in the inner `lookupKey` encryption silently corrupts both recovery paths.

Reading the source settles this. Read src/lib/sync-account.ts. The plaintext `plain` (not any ciphertext) is encrypted with `lookupKey`, while the recovery wrap independently wraps `lookupKey` itself via `attachRecoveryWrap`, so there is no nested encryption of ciphertext. Cited src/lib/sync-account.ts:174: `const envelope = await encryptPayload(plain, lookupKey);`

`probe: read_code__recovery_encryption_nesting_7791`

### d_2_3  (code_reading - loop 2)
> There are likely no branded or opaque types distinguishing `LookupAuthKey` from `LookupKey` in TypeScript, meaning a developer could accidentally pass `lookupAuth` to a decrypt function without a compile-time error.

Reading the source settles this. Read src/lib/sync-account.ts. The plaintext `plain` (not any ciphertext) is encrypted with `lookupKey`, while the recovery wrap independently wraps `lookupKey` itself via `attachRecoveryWrap`, so there is no nested encryption of ciphertext. Cited src/lib/sync-account.ts:174: `const envelope = await encryptPayload(plain, lookupKey);`

`probe: read_code__recovery_encryption_nesting_7791`

### d_2_3  (semantic_bridge_weak - loop 2)
> There are likely no branded or opaque types distinguishing `LookupAuthKey` from `LookupKey` in TypeScript, meaning a developer could accidentally pass `lookupAuth` to a decrypt function without a compile-time error.


`probe: hypothesis_L2_H1`

### d_2_5  (no_resolver - loop 2)
> AEAD nonce generation for re-encryption of updated account records may reuse or deterministically derive nonces rather than generating fresh random nonces, risking nonce reuse under the same key.

No resolution strategy could handle this dissent

### d_2_5  (semantic_bridge_weak - loop 2)
> AEAD nonce generation for re-encryption of updated account records may reuse or deterministically derive nonces rather than generating fresh random nonces, risking nonce reuse under the same key.


`probe: hypothesis_L2_H2`

---

## Declined, with reasons (James, 2026-09-19)

**d_1_1 — recovery code derivation may be weak.** Traced to the KDF. The record's
recovery wrap goes through `attachRecoveryWrap` → `wrapDataKey`, which mints a
fresh 16-byte salt and stretches at PBKDF2_ITERATIONS_V3 (600k) — the identical
path the vault's second door uses. The recovery code is never used as a key. The
zeroed salt on the dummy PasswordLock passed to `attachRecoveryWrap` is never the
KDF salt; it exists only so the function has a lock to spread. Declined.

**d_1_0 — HKDF with an empty extract salt.** Accurate and intended. The IKM is
already 256 bits of PBKDF2 output, so extract has nothing to add. Same choice
`password.ts` makes for the wrap and auth split. RFC 5869 permits it when the IKM
is already uniform. Declined.

**d_2_4 — no NFKC normalization on the email.** Real and deliberate. Unicode
normalization is another format that can never change once it feeds a KDF, and
adding it means committing to a form permanently. v1 is lowercase and trim only,
frozen and pinned by test. Declined for v1; revisit only with a versioned
derivation.

## Noted, not fixed

**d_1_4 — the AEAD does not bind `lookupId` as associated data.** A record moved
to a different id would still decrypt. Low impact, since only the holder of
`lookupKey` can produce a valid record at all. Legitimate hardening; recorded for
a future version rather than retrofitted into v1, because changing the AEAD input
is a format change.

**The dummy PasswordLock** at the `attachRecoveryWrap` call site reads alarming —
a zeroed salt that is never used as one. Worth a comment at that call site.
