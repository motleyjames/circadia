# Circadia — encrypted sync, spec v3.0 (design, not yet built)

Status: **for review.** No code written. Decisions James needs to make are marked ▶.
Companion to `key-wrapping-0.12.0.md`, which built the crypto this depends on.

## What this is

Log in on a new device, enter your password, your diary is there. The server holds
ciphertext it cannot read and never could.

**What this is not:** a clinician portal. That is a separate service reading a separate
store, and every decision below is shaped so building it later does not mean rewriting
this.

## The four decisions that are expensive to change

Everything else in this document can be swapped in an afternoon. These cannot.

### 1. Opaque account id

A UUID minted at account creation. Email, if collected, is a mutable attribute pointing
at the id — never the identity itself.

[WHY: change the identity later and every stored blob is orphaned. An email-keyed account
also means the server knows *who* has a diary even though it cannot read one; an opaque
id leaks less and costs nothing.]

### 2. Schema version on every blob

```
{ v: 1, accountId, rev, ciphertext }
```

`v` is ignored today. It exists so a future client can tell an old blob from a new one.

[WHY: this is the `kdf: 2` trap from 0.12.0 with a third party added. Mac and phone
already update at different times, and bumping a marker wrong sends old code down a
branch where the correct password reads as *wrong* — a silent lockout on whichever
device updated second. A server makes that three-way. One field now, or a migration
nobody can run later.]

### 3. The server stays dumb

Two routes, and it never learns what a diary is:

```
PUT  /vault/{accountId}   body: bytes    auth: auth key    If-Match: <etag>
GET  /vault/{accountId}                  auth: auth key
```

No business logic, no diary awareness, no decryption, no keys.

[WHY: this is what keeps release B from being a rewrite. A clinician portal later reads a
*different* store; this one stays opaque forever. It also keeps the compliance story at
"we hold ciphertext," which is the one genuine advantage Circadia has over Sleepio and
Stellar Sleep.]

### 4. Recovery codes ship with sync, not after

There is no password reset. A forgotten password means the diary is gone — permanently,
and neither James nor any support process can help.

That is acceptable for James. It is not acceptable for a stranger on night 9 of a
shakedown, **especially once sync makes the diary feel backed up while leaving it exactly
as unrecoverable as before.**

Design: at account creation, generate a high-entropy recovery code. Wrap the data key a
second time under a KEK derived from it. Two independent wraps of one key; either opens
the vault. The user must confirm they have saved it before the first night is filed.

[WHY it cannot wait: adding recovery later works for anyone who still knows their
password — you just add a second wrap. Anyone who forgot before you shipped it is gone.
The population you would lose is exactly the population you are trying to keep.]

## Authentication

Already built. `authKeyFor()` shipped in 0.12.0, exported and unused, on purpose.

HKDF splits the KEK into a wrap key (`circadia/wrap/v1`) and an auth key
(`circadia/auth/v1`). The client proves possession of the auth key; the server never sees
the password, the KEK, or the data key. The auth key cannot unwrap anything.

▶ **Proof mechanism.** Simplest is sending the auth key as a bearer token over TLS — the
server stores its hash and compares. Stronger is a challenge-response so the key itself
never crosses the wire. My lean: bearer token for v1, since TLS already protects it and
the key opens nothing; note the upgrade path.

## Hosting

**Cloudflare Workers + R2.**

| | |
|---|---|
| Free tier | 10 GB R2 storage, 10M reads/month, 100k Worker requests/day |
| Egress | $0 |
| At 20 users | free, and still free at a thousand |
| Ops | none |

Rejected, with reasons:

- **Supabase** — free projects pause after a week of inactivity. A tester opening the app
  on day 8 finds sync down. $25/month to avoid it.
- **Vercel** — natural given Next.js, but the hobby tier prohibits commercial use, and
  this is intended to become a business. Building on a plan you must leave.
- **Cloudflare KV** — eventually consistent. A read straight after a write can return the
  previous blob. Silent data loss in a sync store.

Use **R2 conditional writes** (`If-Match` on etag). A device syncing from a stale blob is
rejected rather than overwriting, which turns the concurrency problem into a retry.

## Conflict resolution

`rev` is already a monotonic write counter on `VaultEnvelope` from 0.12.0.

1. Client GETs, notes the etag.
2. Client PUTs with `If-Match`.
3. On 412, the client re-fetches, folds locally with `mergeDiaryStates`, and retries.

The fold already exists and already handles episodes, reports and sessions. The server
never merges anything — it only refuses a stale write.

**The loser is never discarded.** On a fold that cannot reconcile, keep the rejected blob
as a conflict copy rather than dropping it. A lost night is worse than a duplicate.

[WHY not server-side merge: the server cannot read the blob. This is the constraint
paying for itself — it forces the merge to stay in the one place that already has tested
logic for it.]

## What syncs, and what does not

| | Syncs |
|---|---|
| Reports, episodes, sessions, consult history | yes, inside the blob |
| Morning and intake drafts | **no** — local only, per §3 of the shakedown spec |
| Study packs | no — separate pipeline, already de-identified |
| Anything a clinician would read | no — that is a different store that does not exist yet |

## Migration

1. Sync is **opt-in**. An existing local-only user is untouched until they create an account.
2. Creating an account mints the id, generates the recovery code, and uploads the current
   blob as `rev` n.
3. A client that has never synced continues to work exactly as today.
4. **Never auto-enroll.** A user who has not chosen sync has not chosen to put their
   diary on someone else's computer.
5. The blob format is versioned from the first byte written (§2).

## Invariants to pin

Each becomes a test and a row in `scripts/mutations.json`.

1. The server never receives a password, a KEK, or a data key.
2. The auth key cannot unwrap the vault — prove it by attempting and failing.
3. A stale write is refused, never applied.
4. A rejected blob is preserved as a conflict copy, never discarded.
5. Drafts never leave the device.
6. An account cannot be created without a recovery code being generated and confirmed.
7. Every blob carries a schema version.

## Anti-goals

- **No server-side decryption. Ever.** This is the line that makes everything else safe.
- No password reset — recovery codes only.
- No auto-enrollment into sync.
- No diary awareness in the Worker.
- No merging on the server.

## Build order

1. Recovery code — the second wrap, UI, and forced confirmation. **Before any sync.**
2. Account creation — opaque id, auth key registration.
3. The Worker — two routes, R2, conditional writes. About 100 lines.
4. Client sync — GET on unlock, PUT on save, 412 retry through `mergeDiaryStates`.
5. Conflict copies.

Stage 1 ships alone and is useful alone: recovery codes make the *local* diary
recoverable, which is worth having whether or not sync ever exists.

## Open

▶ Auth proof: bearer token or challenge-response for v1.
▶ Is email collected at all? Recovery codes make it optional, and not collecting it means
the server knows nothing about who anyone is.
▶ What happens to a synced blob when a shakedown tester withdraws. Belongs in the consent
copy either way.
