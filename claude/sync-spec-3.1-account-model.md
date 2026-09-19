# Circadia — sync account model, spec v3.1 (design, not yet built)

Status: **for review.** Supersedes §"The four decisions that are expensive to change" §1
and §"Authentication" of `sync-spec-3.0.md`. Everything else in 3.0 stands. The Worker
contract stands except the id alphabet: 3.0 said UUID; both object kinds now use
`^[0-9a-f]{64}$`. That is a spec correction, not a second format.

## What broke

3.0 said: opaque UUID, not derived from anything; auth key proves possession. Then I
proposed deriving the account id from the auth key to close a registration race. Tracing
it against the real code found two failures, both fatal.

**The circularity.** `authKeyFor` needs `lock.wrap.salt`. The salt lives in the lock. The
lock lives in the vault file. So a blank device holding only a password cannot derive the
auth key, cannot compute the id, and cannot fetch the vault that contains the salt it
needed. It mints a new salt instead and creates a **second account**.

Login-anywhere was the entire point of sync, and the design could not do it.

**No rebind path.** A password change produces a new auth key. The Worker binds the hash
on first write and only accepts a bearer matching it. An authenticated PUT writes the hash
from the presented key, so you cannot install a new hash while proving the old one. Change
your password and sync dies on that device.

## The three things I conflated

Sync needs three separable properties. 3.0 tried to make one value carry all three.

| | Must be | 3.0 |
|---|---|---|
| **Lookup handle** | derivable from what a user types on a blank device | absent |
| **Account identity** | stable across password changes forever | tied to the auth key |
| **Ownership proof** | unforgeable, rotatable | tied to the password |

The dependency runs backwards from what I designed: you need the id to fetch the lock that
contains the salt that produces the auth key. So the id cannot come from the auth key.

## The design: two hops

**Hop 1 — find the account.** From what the user types.

```
lookupSalt = SHA-256("circadia/lookup/v1" || normalize(identifier))
lookupKey  = PBKDF2(password, lookupSalt, 600k, SHA-256)
lookupId   = SHA-256(HKDF(lookupKey, "circadia/lookup-id/v1"))
lookupAuth = HKDF(lookupKey, "circadia/lookup-auth/v1")
```

`lookupId` is 32 bytes as 64 lowercase hex. Do not UUID-shape it.

`GET /vault/{lookupId}` `Authorization: Bearer lookupAuth` returns a small **account
record**: a few hundred bytes of ciphertext, encrypted under `lookupKey`, containing

```
{ v: 1, accountId, vaultSalt, authKey }
```

A blank device has no vault `authKey` yet — that value lives inside this record. Hop 1
presents `lookupAuth` instead. Same Worker path as hop 2: a 32-byte bearer, compared by
hash. The two HKDF info strings are the 0.12.0 wrap/auth split applied to `lookupKey`;
neither derived value can produce the other.

**Hop 2 — open the vault.** Everything from here uses values from the record, none of
which are derived from the password.

```
GET /vault/{accountId}   Authorization: Bearer authKey
```

Then the existing `unlockMaster` path unwraps the data key from the blob's lock as it does
today.

`accountId` is 32 random bytes as 64 lowercase hex. `vaultSalt` and `authKey` are random
at account creation. All three are **never recomputed**.

[WHY two hops: the first is reproducible from memory, which is what login-anywhere
requires. The second is stable, which is what identity and ownership require. One value
cannot be both — that is exactly the contradiction 3.0 walked into.]

## What this fixes, for free

**Password change is trivial.** Re-encrypt the account record under the new `lookupKey`,
write it at the new `lookupId`, delete the old one. The vault never moves. `accountId` and
`authKey` never change, so **the server binding is untouched and no rebind protocol is
needed.** The problem that killed the previous design stops existing.

**The registration race stops mattering.** Two devices restoring the same account compute
the same `lookupId` and write the same record. If R2 lets both creates succeed, they agree.
Contention is reduced to last-write-wins on a blob, which is the etag and merge problem
already solved in `mergeDiaryStates` — not a wrong-key-forever problem.

**The Worker stays one path.** It stores bytes for a 64-hex id and checks a bearer hash.
That it now serves two kinds of object is invisible to it, which is the point of keeping
it dumb. The id alphabet is the one thing 3.0 got wrong for this model.

## The cost, stated plainly

**`lookupSalt` is deterministic.** Derived from the identifier, not random. An attacker who
knows the identifier can begin precomputing a password dictionary before any breach —
where a random salt forces them to wait for one.

It is still unique per user, so there is no cross-user rainbow table. The exposure is a
targeted offline attack on one known identifier, gated by 600k PBKDF2 and a 10-character
minimum. Standard Notes and similar have shipped this trade knowingly.

The alternative is a server-side salt lookup keyed by the identifier — stronger KDF anchor,
but the server then holds a table of who has an account, and identifier space is
enumerable. For a sleep diary, "the server knows nothing about who you are" is worth more
than a marginal KDF improvement.

▶ **The strong fix, if you want it: fold the recovery code into hop 1.**

```
lookupKey = HKDF(PBKDF2(password, lookupSalt), recoveryCode)
```

Precomputation becomes impossible — the attacker does not have the code. This is what
1Password's Secret Key does.

The cost is honest and product-shaped: login-anywhere becomes *password **and** your
code*, not password alone. You already generate and store a recovery code, so the
machinery exists.

My lean: ship without it, and revisit before strangers at scale. A tester who must find a
piece of paper to use a second device will not use a second device, and the shakedown is
measuring completion.

## The identifier

▶ **Email, username, or something else?**

Whatever it is, it is **never sent to the server** — only `SHA-256` of a derivation that
also includes the password. So the server cannot enumerate accounts by identifier, and a
bucket listing is a list of opaque ids.

Normalization must be exact and frozen at v1: lowercase, trim, and for email strip nothing
else (do not drop dots or `+` tags — those change which address it is). A normalization
change is a silent lockout for everyone whose identifier normalized differently before.

[WHY frozen: this is the `kdf: 2` lesson applied to a string function. Anything feeding a
KDF is a format that can never quietly change.]

## Interaction with recovery codes

Recovery opens the **vault**, not the account record. `unlockWithRecovery` produces the
data key without producing a `lookupKey`, so a user recovering on a blank device can open a
local vault but cannot find their synced one.

▶ **Decision needed.** Either the account record is also wrapped under the recovery code —
a second wrap, exactly as the vault already has — or recovery is explicitly local-only and
the UI says so.

My lean: wrap it. A recovery code that cannot recover the synced copy is a recovery code
that fails in the case people will actually hit.

## What the server sees, end to end

| Stored | Content |
|---|---|
| `{lookupId}` | ciphertext, a few hundred bytes, plus an auth hash |
| `{accountId}` | ciphertext, the diary, plus an auth hash |

No identifier, no email, no password, no salt it can attribute, no relationship between the
two ids that it can compute. A full bucket breach yields opaque blobs keyed by opaque
hashes.

## Invariants to pin

1. `lookupId` is reproducible from identifier and password alone, with no stored state.
2. `accountId` is 32 random bytes as 64 lowercase hex. `vaultSalt` and `authKey` are
   random at creation. All three are never recomputed. Not a UUID — that was 3.0 prose.
3. A password change moves the account record and leaves `accountId` and `authKey` unchanged.
4. Identifier normalization is frozen and covered by a test asserting exact byte output for
   a fixed input set.
5. The identifier never leaves the device in any form the server can reverse.
6. Two devices restoring the same account compute the same `lookupId` and the same
   `authKey`.
7. The Worker remains unaware that two kinds of object exist.
8. Both object kinds use one anchored id alphabet: `^[0-9a-f]{64}$`. A UUID is malformed.

## Open

▶ Recovery code folded into hop 1, or not.
▶ Identifier: email, username, or other.
▶ Account record wrapped under the recovery code, or recovery declared local-only.
▶ What deletes the old account record if a password change is interrupted between write and
delete. An orphan is harmless but accumulates; a missed delete on a shared device is not.

## Build order

Unchanged from 3.0 except that the account model now precedes the client work:

1. The Worker — one path, one 64-hex alphabet, can ship first and be curl-tested.
2. This account model: derivation, the record format, normalization, and its tests.
3. Account creation and the first sync.
4. Password change moving the record.
5. Conflict copies.
