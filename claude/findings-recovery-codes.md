# Findings - 20260919_133954

**Task:** Circadia is local-first: no server, no database; the vault is an encrypted blob and all guards are client-side. PasswordLock gained an optional recovery wrap: the same data key wrapped a second time under a Crockford base32 recovery code. A prior gate run found that an old client drops the field on write. Fixed: mergeDiskVault now merges locks field-wise when both sides wrap the same data key, ins

**Confidence:** 92%  
**Evidence:** 3 probe(s) established something conclusive against the source.

2 need a person - 3 settled by evidence - 8 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_2  (code_reading - loop 1)
> Byte-for-byte preservation of the recovery wrap blob during merge assumes the serialization format is stable; if a new client normalizes or re-encodes the blob (e.g., different padding, field ordering), the preserved wrap may not decrypt with the original recovery code.

Reading the source CONFIRMS this concern. Read src/app/api/vault/route.ts. The incoming data is passed through `parseDiskVault` (parsing/re-encoding) before being written back with `writeDiskVault`, meaning the recovery wrap blob is not taken byte-for-byte from the stored value but is instead parsed and re-seriali Cited src/app/api/vault/route.ts:31: `const vault = parseDiskVault(raw);`

`probe: read_code__recovery_wrap_blob_handling_2618`

### d_2_1  (code_reading - loop 2)
> Old clients performing a plain vault write (not just rewrapLock) may still serialize the lock object without the recovery wrap field, meaning even non-password-change writes from stale clients can destroy recovery wraps if the write path does not preserve unknown fields

Reading the source CONFIRMS this concern. Read src/app/api/vault/route.ts. The PUT handler parses only the client-provided JSON into `vault` and writes it directly to disk without reading or merging the existing stored object, so any unknown fields not included by the client are lost. Cited src/app/api/vault/route.ts:32: `await writeDiskVault(vault);`

`probe: read_code__vault_write_merge_7096`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> If the old client strips unknown fields on write, the `lockSchemaVersion` field itself will be dropped, making old-client-write detection fail silently and leaving the same data-loss window unmitigated.

No resolution strategy could handle this dissent

### d_1_1  (none - loop 1)
> The same-data-key comparison may require the user's password to be in memory at merge time (if done by unwrap-and-compare); if `mergeDiskVault` runs at a point where the password is unavailable (e.g., background sync), the merge will either fail or fall back to an unsafe default.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> `rewrapLock` on an un-updated client after a password change produces a lock whose recovery wrap is absent but whose data key is new, so the new client's merge will see different data keys, keep local, and never attempt recovery-wrap restoration—the user's recovery code is permanently orphaned with no warning if `lockSchemaVersion` was also stripped.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> The "different wraps stay local" heuristic could misfire if both sides independently re-wrap the same data key with different password salts/parameters, treating a benign re-encryption as a password change and suppressing field-wise merge when it should apply.

No resolution strategy could handle this dissent

### d_2_2  (none - loop 2)
> The blanket field-union merge strategy will incorrectly merge a future lock field that carries revocation or exclusion semantics (e.g., a "recovery_revoked" flag), since union would re-add a field that was intentionally removed

No resolution strategy could handle this dissent

### d_3_0  (none - loop 3)
> If PasswordLock wrapping is non-deterministic (e.g., random IV/nonce per wrap), comparing wrapped ciphertext blobs to determine "same data key" will fail; mergeDiskVault must use a stable key fingerprint or stored key identifier, and the current implementation may not do this.

No resolution strategy could handle this dissent

### d_3_1  (none - loop 3)
> Recovery code regeneration on a new client may cycle the data key (generate a new one and re-wrap), which would cause mergeDiskVault to treat it as a password change and discard the prior recovery wrap from disk, silently losing the old recovery path.

No resolution strategy could handle this dissent

### d_3_2  (none - loop 3)
> Two new clients that independently generate different recovery codes for the same data key will produce different recovery wrap ciphertexts; field-wise merge under last-writer-wins will silently discard one recovery code with no user notification, potentially invalidating a code the user wrote down.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_2_0  (code_probe_evidence - loop 2)
> mergeDiskVault's same-data-key comparison may use wrapped ciphertext bytes rather than unwrapped plaintext key comparison, which would cause false negatives due to nonce/IV differences and silently route same-key locks into the "different wraps → keep local" path, defeating the fix entirely

Probe 'check_exists__mergediskvault_function_existence_4840' settles this against the repository: 'mergeDiskVault' does not appear anywhere in src/app/api/vault/route.ts, which was read in full.

`probe: check_exists__mergediskvault_function_existence_4840`

### d_3_3  (no_resolver - loop 3)
> The test documenting the rewrapLock gap may only assert the drop behavior without asserting that mergeDiskVault does NOT restore recovery after a legacy rewrap, leaving the end-to-end data-loss scenario uncovered.

No resolution strategy could handle this dissent

### d_3_3  (semantic_bridge_weak - loop 3)
> The test documenting the rewrapLock gap may only assert the drop behavior without asserting that mergeDiskVault does NOT restore recovery after a legacy rewrap, leaving the end-to-end data-loss scenario uncovered.


`probe: hypothesis_L2_H2`

---

## Declined, with reasons (James, 2026-09-19)

Both CONFIRMED findings cite `src/app/api/vault/route.ts`. That route stores an
opaque encrypted blob and never touches lock serialization — it cannot drop a
field it does not parse. The real write paths were traced directly before this
run: `setLock`, `writeLocks`, `pushVaultToDisk`, `installLockedVault`,
`mergeDiskVault`, `rewrapLock`, `writePhoneVault`. Two dropped the recovery wrap.
One is fixed, one is documented and cannot be.

**d_1_2 — "byte-for-byte preservation assumes a stable serialization format."**
Cites the vault route, which passes bytes through. Locks round-trip as parsed
objects; TypeScript does not strip keys at runtime. Declined.

**d_2_1 — "old clients on a plain vault write may drop the field."**
Traced and false for plain writes: every path that stringifies a parsed lock
preserves unknown fields. It is true only for paths that *reconstruct* a lock,
which is `rewrapLock` — covered below, not by this dissent. Declined as stated.

## Taken

**d_3_0 — wrap comparison is sufficient, not necessary.** Correct. `sameDataKey`
compares the whole wrap object (salt, iterations, iv, ct), and `wrapDataKey`
draws a fresh salt and IV every time, so two wraps of the same key never match.
The behaviour is intended — a different wrap is a password change, and recovery
is not transplanted onto a door we cannot prove is the same. The name was the
defect and has been corrected.

## Release one of two

`rewrapLock` on the un-updated phone drops the recovery wrap. That code already
ships, so it cannot be fixed in this release.

**The consequence is worse than a temporary gap: an old-client password change is
unrecoverable.** Same data key, new wrap, recovery already gone — and the merge
correctly refuses to restore it from disk, because it cannot prove the door
matches. The user must generate a new code.

Do not tell testers recovery is reliable until both Mac and phone pass
`previous` into `rewrapLock`. Same staggered window as key-wrapping 0.12.0.
